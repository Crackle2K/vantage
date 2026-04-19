import bcrypt
import asyncio
import json
import math
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
from backend.utils.security import validate_password_strength
from backend.utils.audit import log_login, log_failed_auth, log_registration
from backend.repositories.users import SupabaseUsersRepository


# Redis-backed rate limiting and account lockout
# Falls back to in-memory dict when Redis is unavailable (local dev without Redis).
_redis: Optional[redis.Redis] = None
LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_MINUTES = 15
LOCKOUT_WINDOW_MINUTES = 30


async def _get_redis() -> Optional[redis.Redis]:
    global _redis
    if _redis is None:
        try:
            _redis = redis.from_url(REDIS_URL, decode_responses=True)
            await _redis.ping()
        except Exception:
            _redis = None
    return _redis


async def _redis_get(key: str) -> Optional[str]:
    r = await _get_redis()
    if r is None:
        return None
    try:
        return await r.get(key)
    except Exception:
        return None


async def _redis_setex(key: str, ttl_seconds: int, value: str) -> bool:
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
    email_lower = email.lower()
    if await _get_redis():
        try:
            r = await _get_redis()
            await r.delete(f"failed:{email_lower}", f"lockout:{email_lower}")
            return
        except Exception:
            pass
    _inmem.pop(email_lower, None)


optional_security = HTTPBearer(auto_error=False)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
users_repository = SupabaseUsersRepository()

class GoogleAuthRequest(BaseModel):
    credential: str

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.CUSTOMER
    recaptcha_token: str = Field(..., min_length=1)
    recaptcha_action: Optional[str] = None

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
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )

def get_password_hash(password: str) -> str:
    return bcrypt.hashpw(
        password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
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
    user = await users_repository.get_by_email(token_data.email)
    if user is None:
        raise credentials_exception
    return User(**user)

async def get_current_user(
    request: Request,
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security),
) -> User:
    """Resolve the authenticated user from a Bearer token or httpOnly cookie."""
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
    existing_user = await users_repository.get_by_email(user_data.email)
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )

    await verify_signup_recaptcha(user_data.recaptcha_token, user_data.recaptcha_action)
    hashed_password = get_password_hash(user_data.password)
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
    if not verify_password(user_credentials.password, user["hashed_password"]):
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
    return current_user

@router.post("/logout")
async def logout(response: Response):
    """Clear authentication cookie."""
    clear_auth_cookie(response)
    return {"message": "Successfully logged out"}

@router.post("/google")
@limiter.limit("10/minute")
async def google_auth(request: Request, response: Response, auth_request: GoogleAuthRequest):
    try:
        idinfo = id_token.verify_oauth2_token(
            auth_request.credential,
            requests.Request(),
            GOOGLE_CLIENT_ID
        )
        google_id = idinfo['sub']
        email = idinfo['email']
        name = idinfo.get('name', email.split('@')[0])
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