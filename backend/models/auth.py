"""Authentication routes, utilities, and request models.

Handles user registration, login, logout, Google OAuth sign-in, and JWT
token management. Implements Redis-backed account lockout after repeated
failed login attempts (with in-memory fallback for local development) and
reCAPTCHA Enterprise verification for signup protection.
"""
import bcrypt
import asyncio
import json
import math
import time
import redis.asyncio as redis
from datetime import datetime, timedelta
from typing import Optional, Dict
from fastapi import APIRouter, HTTPException, status, Depends, Request, Response
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from google.oauth2 import id_token
from google.auth.transport import requests
from pydantic import BaseModel, EmailStr, Field, field_validator
from urllib import request as urllib_request, error as urllib_error
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.config import REDIS_URL, SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, ENVIRONMENT, GOOGLE_CLIENT_ID, RECAPTCHA_ENTERPRISE_PROJECT_ID, RECAPTCHA_ENTERPRISE_API_KEY, RECAPTCHA_ENTERPRISE_SITE_KEY, RECAPTCHA_SIGNUP_ACTION, RECAPTCHA_MIN_SCORE, RECAPTCHA_VERIFY_TIMEOUT_SECONDS
from backend.models.user import UserLogin, User, Token, TokenData, UserRole, default_user_preferences
from backend.utils.security import sanitize_text, validate_password_strength
from backend.utils.audit import log_login, log_failed_auth, log_registration
from backend.repositories.users import SupabaseUsersRepository


# Redis-backed rate limiting and account lockout
# Falls back to in-memory dict when Redis is unavailable (local dev without Redis).
_redis: Optional[redis.Redis] = None
LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_MINUTES = 15
LOCKOUT_WINDOW_MINUTES = 30
USER_CACHE_TTL_SECONDS = 60
_user_cache: Dict[str, tuple[float, dict]] = {}


async def _get_redis() -> Optional[redis.Redis]:
    """Lazily initialize and return the Redis connection, or None if unavailable."""
    global _redis
    if _redis is None:
        try:
            _redis = redis.from_url(REDIS_URL, decode_responses=True)
            await _redis.ping()
        except Exception:
            _redis = None
    return _redis


async def _redis_get(key: str) -> Optional[str]:
    """Read a key from Redis. Returns None if Redis is unavailable."""
    r = await _get_redis()
    if r is None:
        return None
    try:
        return await r.get(key)
    except Exception:
        return None


async def _redis_setex(key: str, ttl_seconds: int, value: str) -> bool:
    """Set a Redis key with a TTL. Returns False if Redis is unavailable."""
    r = await _get_redis()
    if r is None:
        return False
    try:
        await r.setex(key, ttl_seconds, value)
        return True
    except Exception:
        return False


# Fallback in-memory store (dev only, single-process only)
_inmem: Dict[str, Dict] = {}


async def is_account_locked(email: str) -> tuple[bool, Optional[int]]:
    """Check whether an account is currently locked due to too many failed logins.

    Args:
        email (str): The account email address.

    Returns:
        tuple[bool, Optional[int]]: (is_locked, minutes_remaining) where
            minutes_remaining is None when the account is not locked.
    """
    email_lower = email.lower()
    lock_key = f"lockout:{email_lower}"
    locked_until_str = await _redis_get(lock_key)
    if locked_until_str:
        try:
            lock_time = datetime.fromisoformat(locked_until_str)
            remaining_seconds = (lock_time - datetime.utcnow()).total_seconds()
            remaining = max(1, math.ceil(remaining_seconds / 60))
            return True, int(remaining)
        except Exception:
            pass

    # Fallback to in-memory
    if email_lower not in _inmem:
        return False, None
    attempts = _inmem[email_lower]
    if "locked_until" in attempts:
        lockout_end = attempts["locked_until"]
        if datetime.utcnow() < lockout_end:
            remaining_seconds = (lockout_end - datetime.utcnow()).total_seconds()
            remaining = max(1, math.ceil(remaining_seconds / 60))
            return True, int(remaining)
        else:
            del _inmem[email_lower]
    return False, None


async def record_failed_attempt(email: str) -> None:
    """Record a failed login attempt and lock the account if the threshold is reached.

    After ``LOCKOUT_THRESHOLD`` failures within ``LOCKOUT_WINDOW_MINUTES``,
    the account is locked for ``LOCKOUT_DURATION_MINUTES``.

    Args:
        email (str): The account email address.
    """
    email_lower = email.lower()
    now = datetime.utcnow()

    if await _get_redis():
        try:
            r = await _get_redis()
            lock_key = f"lockout:{email_lower}"
            count_key = f"failed:{email_lower}"
            pipe = r.pipeline()
            pipe.incr(count_key)
            pipe.expire(count_key, LOCKOUT_WINDOW_MINUTES * 60)
            results = await pipe.execute()
            count = int(results[0])
            if count >= LOCKOUT_THRESHOLD:
                lock_time = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
                await r.setex(lock_key, LOCKOUT_DURATION_MINUTES * 60, lock_time.isoformat())
            return
        except Exception:
            pass

    # Fallback in-memory
    expired_keys = [
        k for k, v in _inmem.items()
        if ("locked_until" in v and v["locked_until"] < now)
        or ("first_attempt" in v and "locked_until" not in v
            and (now - v["first_attempt"]).total_seconds() / 60 > LOCKOUT_WINDOW_MINUTES)
    ]
    for k in expired_keys:
        del _inmem[k]

    if email_lower not in _inmem:
        _inmem[email_lower] = {"count": 1, "first_attempt": now}
    else:
        first_attempt = _inmem[email_lower].get("first_attempt", now)
        if (now - first_attempt).total_seconds() / 60 > LOCKOUT_WINDOW_MINUTES:
            _inmem[email_lower] = {"count": 1, "first_attempt": now}
        else:
            _inmem[email_lower]["count"] += 1

        if _inmem[email_lower]["count"] >= LOCKOUT_THRESHOLD:
            _inmem[email_lower]["locked_until"] = now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)


async def clear_failed_attempts(email: str) -> None:
    """Clear all failed-attempt counters for an account (called after a successful login).

    Args:
        email (str): The account email address.
    """
    email_lower = email.lower()
    if await _get_redis():
        try:
            r = await _get_redis()
            await r.delete(f"failed:{email_lower}", f"lockout:{email_lower}")
            return
        except Exception:
            pass
    _inmem.pop(email_lower, None)


async def close_auth_connections() -> None:
    global _redis
    if _redis is not None:
        try:
            await _redis.close()
        except Exception:
            pass
        _redis = None


optional_security = HTTPBearer(auto_error=False)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
users_repository = SupabaseUsersRepository()

class GoogleAuthRequest(BaseModel):
    """Request body for Google OAuth sign-in, containing the ID token credential."""

    credential: str

class RegisterRequest(BaseModel):
    """Request body for user registration with reCAPTCHA protection.

    Attributes:
        name (str): Display name (2-100 characters).
        email (EmailStr): User email address.
        password (str): Password (minimum 8 characters, must pass strength validation).
        role (UserRole): Requested user role (cannot be ADMIN).
        recaptcha_token (str): reCAPTCHA Enterprise assessment token.
        recaptcha_action (Optional[str]): Expected reCAPTCHA action name.
    """
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.CUSTOMER
    recaptcha_token: str = Field(..., min_length=1)
    recaptcha_action: Optional[str] = None

    @field_validator("name")
    @classmethod
    def sanitize_name(cls, value: str) -> str:
        cleaned = sanitize_text(value, max_length=100)
        if len(cleaned) < 2:
            raise ValueError("Name must be at least 2 characters long")
        return cleaned

    @field_validator("role")
    @classmethod
    def role_must_not_be_admin(cls, v: UserRole) -> UserRole:
        if v == UserRole.ADMIN:
            raise ValueError("Cannot self-assign admin role during registration")
        return v

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        is_valid, error_msg = validate_password_strength(v)
        if not is_valid:
            raise ValueError(error_msg)
        return v

def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a plaintext password against a bcrypt hash.

    Args:
        plain_password (str): The user-supplied plaintext password.
        hashed_password (str): The stored bcrypt hash.

    Returns:
        bool: True if the password matches the hash.
    """
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )


async def verify_password_async(plain_password: str, hashed_password: str) -> bool:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, verify_password, plain_password, hashed_password)

def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt.

    Args:
        password (str): Plaintext password to hash.

    Returns:
        str: Bcrypt hash string.
    """
    return bcrypt.hashpw(
        password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')


async def get_password_hash_async(password: str) -> str:
    loop = asyncio.get_running_loop()
    return await loop.run_in_executor(None, get_password_hash, password)


def invalidate_cached_user(user_id: str | None = None) -> None:
    if user_id is None:
        _user_cache.clear()
        return
    _user_cache.pop(str(user_id), None)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a signed JWT access token.

    Args:
        data (dict): Payload to encode (typically ``sub`` and ``user_id``).
        expires_delta (Optional[timedelta]): Custom expiration duration.
            Defaults to ``ACCESS_TOKEN_EXPIRE_MINUTES``.

    Returns:
        str: Encoded JWT string.
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def set_auth_cookie(response: Response, access_token: str) -> None:
    """Set JWT token in httpOnly cookie with environment-aware security attributes."""
    is_production = ENVIRONMENT == "production"
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=is_production,
        samesite="strict" if is_production else "lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/"
    )

def clear_auth_cookie(response: Response) -> None:
    """Clear the authentication cookie."""
    response.delete_cookie(
        key="access_token",
        path="/"
    )

async def _get_user_from_token(token: str) -> User:
    """Decode a JWT and return the corresponding User from the database."""
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        email: str = payload.get("sub")
        user_id: str = payload.get("user_id")
        if email is None or user_id is None:
            raise credentials_exception
        token_data = TokenData(email=email, user_id=user_id)
    except jwt.PyJWTError:
        raise credentials_exception
    now = time.time()
    cached = _user_cache.get(token_data.user_id)
    if cached and cached[0] > now:
        return User(**cached[1])

    user = await users_repository.get_by_id(token_data.user_id)
    if user is None and token_data.email is not None:
        user = await users_repository.get_by_email(token_data.email)
    if user is None:
        raise credentials_exception
    _user_cache[token_data.user_id] = (now + USER_CACHE_TTL_SECONDS, user)
    return User(**user)

async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
) -> User:
    """FastAPI dependency that resolves the authenticated user.

    Reads the JWT from either an ``Authorization: Bearer`` header or the
    ``access_token`` httpOnly cookie.

    Returns:
        User: The authenticated user.

    Raises:
        HTTPException: 401 if no valid token is found.
    """
    token = credentials.credentials if credentials else request.cookies.get("access_token")
    if not token:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Could not validate credentials",
            headers={"WWW-Authenticate": "Bearer"},
        )
    return await _get_user_from_token(token)

async def get_current_user_optional(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
) -> Optional[User]:
    """FastAPI dependency that optionally resolves an authenticated user.

    Returns None (instead of raising 401) when no valid token is present,
    allowing unauthenticated access to endpoints that support both modes.

    Returns:
        Optional[User]: The authenticated user, or None.
    """
    token = credentials.credentials if credentials else request.cookies.get("access_token")
    if not token:
        return None

    try:
        return await _get_user_from_token(token)
    except HTTPException:
        return None

async def get_current_admin_user(current_user: User = Depends(get_current_user)) -> User:
    """Dependency that ensures the current user has admin role."""
    if current_user.role != UserRole.ADMIN:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

def _is_recaptcha_configured() -> bool:
    """Check if reCAPTCHA Enterprise is properly configured."""

    def _is_placeholder(value: str) -> bool:
        cleaned = (value or "").strip().lower()
        if not cleaned:
            return True
        placeholder_markers = (
            "your-",
            "example",
            "changeme",
            "replace",
            "placeholder",
        )
        return any(marker in cleaned for marker in placeholder_markers)

    return not (
        _is_placeholder(RECAPTCHA_ENTERPRISE_PROJECT_ID)
        or _is_placeholder(RECAPTCHA_ENTERPRISE_API_KEY)
        or _is_placeholder(RECAPTCHA_ENTERPRISE_SITE_KEY)
    )

def _build_recaptcha_assessment_url() -> str:
    return (
        "https://recaptchaenterprise.googleapis.com/v1/projects/"
        f"{RECAPTCHA_ENTERPRISE_PROJECT_ID}/assessments?key={RECAPTCHA_ENTERPRISE_API_KEY}"
    )

def _request_recaptcha_assessment(token: str, expected_action: str) -> dict:
    payload = {
        "event": {
            "token": token,
            "expectedAction": expected_action,
            "siteKey": RECAPTCHA_ENTERPRISE_SITE_KEY,
        }
    }
    req = urllib_request.Request(
        _build_recaptcha_assessment_url(),
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib_request.urlopen(req, timeout=RECAPTCHA_VERIFY_TIMEOUT_SECONDS) as response:
        body = response.read().decode("utf-8")
        return json.loads(body)

async def verify_signup_recaptcha(token: str, requested_action: Optional[str]) -> None:
    """Verify a reCAPTCHA Enterprise assessment token for signup.

    Silently skips verification when reCAPTCHA is not configured.

    Args:
        token (str): The reCAPTCHA client-side token.
        requested_action (Optional[str]): Expected action name.

    Raises:
        HTTPException: 503 if the reCAPTCHA service is unreachable.
        HTTPException: 400 if the token is invalid or the score is below
            ``RECAPTCHA_MIN_SCORE``.
    """
    if not _is_recaptcha_configured():
        return  # reCAPTCHA not configured; skip server-side verification

    action = requested_action or RECAPTCHA_SIGNUP_ACTION
    try:
        result = await asyncio.get_event_loop().run_in_executor(
            None, _request_recaptcha_assessment, token, action
        )
    except (urllib_error.URLError, OSError):
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="CAPTCHA verification service unavailable"
        )

    token_properties = result.get("tokenProperties", {})
    if not token_properties.get("valid", False):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CAPTCHA verification failed: invalid token"
        )

    score = result.get("riskAnalysis", {}).get("score", 0.0)
    if score < RECAPTCHA_MIN_SCORE:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="CAPTCHA verification failed: suspicious activity detected"
        )

@router.post("/register", status_code=status.HTTP_201_CREATED)
@limiter.limit("5/minute")
async def register(request: Request, response: Response, user_data: RegisterRequest):
    """Register a new user account (POST /api/auth/register).

    Validates the reCAPTCHA token, hashes the password, creates the user,
    issues a JWT, and sets it as an httpOnly cookie. Rate-limited to
    5 requests per minute per IP.

    Returns:
        dict: ``{"message": "Registration successful"}``
    """
    existing_user = await users_repository.get_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    await verify_signup_recaptcha(user_data.recaptcha_token, user_data.recaptcha_action)
    hashed_password = await get_password_hash_async(user_data.password)
    user_dict = {
        "name": user_data.name,
        "email": user_data.email,
        "hashed_password": hashed_password,
        "role": user_data.role.value,
        "favorites": [],
        "created_at": datetime.utcnow().isoformat(),
        **default_user_preferences(),
    }
    created_user = await users_repository.create(user_dict)
    user_id = created_user["id"]
    access_token = create_access_token(
        data={"sub": user_data.email, "user_id": user_id}
    )

    set_auth_cookie(response, access_token)
    log_registration(user_id=user_id, ip_address=request.client.host if request.client else "unknown")

    return {"message": "Registration successful"}

@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, response: Response, user_credentials: UserLogin):
    """Authenticate a user with email and password (POST /api/auth/login).

    Checks account lockout status, verifies the password, clears failed
    attempt counters on success, and sets the JWT cookie. Rate-limited to
    10 requests per minute per IP.

    Returns:
        dict: ``{"message": "Login successful"}``

    Raises:
        HTTPException: 423 if the account is locked.
        HTTPException: 401 if credentials are invalid.
    """
    # Check if account is locked
    is_locked, minutes_remaining = await is_account_locked(user_credentials.email)
    if is_locked:
        log_failed_auth(
            ip_address=request.client.host if request.client else "unknown",
            reason="account_locked"
        )
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account temporarily locked due to too many failed attempts. Try again in {minutes_remaining} minutes.",
        )

    user = await users_repository.get_by_email(user_credentials.email)
    if not user:
        await record_failed_attempt(user_credentials.email)
        log_failed_auth(
            ip_address=request.client.host if request.client else "unknown",
            reason="user_not_found"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not user.get("hashed_password"):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="This account uses Google sign-in. Please sign in with Google.",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not await verify_password_async(user_credentials.password, user["hashed_password"]):
        await record_failed_attempt(user_credentials.email)
        log_failed_auth(
            ip_address=request.client.host if request.client else "unknown",
            reason="invalid_password"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    await clear_failed_attempts(user_credentials.email)
    invalidate_cached_user(user.get("id"))

    user_id = user["id"]
    access_token = create_access_token(
        data={"sub": user["email"], "user_id": user_id}
    )

    set_auth_cookie(response, access_token)
    log_login(
        user_id=user_id,
        ip_address=request.client.host if request.client else "unknown",
        success=True,
        method="password"
    )

    return {"message": "Login successful"}

@router.get("/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """Return the currently authenticated user's profile (GET /api/auth/me)."""
    return current_user

@router.post("/logout")
async def logout(response: Response):
    """Clear authentication cookie."""
    clear_auth_cookie(response)
    return {"message": "Successfully logged out"}

@router.post("/google")
@limiter.limit("10/minute")
async def google_auth(request: Request, response: Response, auth_request: GoogleAuthRequest):
    """Authenticate or register a user via Google OAuth (POST /api/auth/google).

    Verifies the Google ID token, creates the user if they don't exist,
    links the Google ID to existing accounts, and sets the JWT cookie.

    Returns:
        dict: ``{"message": "Login successful"}``
    """
    try:
        idinfo = id_token.verify_oauth2_token(
            auth_request.credential,
            requests.Request(),
            GOOGLE_CLIENT_ID
        )
        google_id = idinfo['sub']
        email = idinfo['email']
        name = sanitize_text(idinfo.get('name', email.split('@')[0]), max_length=100) or email.split('@')[0]
    except ValueError as e:
        log_failed_auth(
            ip_address=request.client.host if request.client else "unknown",
            reason="invalid_google_token"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}"
        )
    user = await users_repository.get_by_email(email)
    if user:
        if "google_id" not in user or user["google_id"] != google_id:
            await users_repository.update_by_email(
                email,
                {"google_id": google_id, "auth_provider": "google", "updated_at": datetime.utcnow().isoformat()},
            )
            invalidate_cached_user(user.get("id"))
        user_id = user["id"]
    else:
        user_dict = {
            "name": name,
            "email": email,
            "google_id": google_id,
            "role": "customer",
            "favorites": [],
            "created_at": datetime.utcnow().isoformat(),
            "auth_provider": "google",
            **default_user_preferences(),
        }
        created_user = await users_repository.create(user_dict)
        user_id = created_user["id"]
    access_token = create_access_token(
        data={"sub": email, "user_id": user_id}
    )

    set_auth_cookie(response, access_token)
    log_login(
        user_id=user_id,
        ip_address=request.client.host if request.client else "unknown",
        success=True,
        method="google"
    )

    return {"message": "Login successful"}
