import bcrypt
import asyncio
import json
import math
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

from config import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
    ENVIRONMENT,
    GOOGLE_CLIENT_ID,
    RECAPTCHA_ENTERPRISE_PROJECT_ID,
    RECAPTCHA_ENTERPRISE_API_KEY,
    RECAPTCHA_ENTERPRISE_SITE_KEY,
    RECAPTCHA_SIGNUP_ACTION,
    RECAPTCHA_MIN_SCORE,
    RECAPTCHA_VERIFY_TIMEOUT_SECONDS,
)
from models.user import UserLogin, User, Token, TokenData, UserRole, default_user_preferences
from database.mongodb import get_users_collection
from utils.security import validate_password_strength
from utils.audit import log_login, log_failed_auth, log_registration


# In-memory store for account lockout (use Redis in production)
# Structure: {email: {"count": int, "locked_until": datetime, "first_attempt": datetime}}
_failed_attempts: Dict[str, Dict] = {}
LOCKOUT_THRESHOLD = 5
LOCKOUT_DURATION_MINUTES = 15
LOCKOUT_WINDOW_MINUTES = 30  # Reset failed-attempt counter after this many minutes

optional_security = HTTPBearer(auto_error=False)

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

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
    """Set JWT token in httpOnly cookie with environment-aware security attributes.

    In production (same-origin Vercel deployment) use Secure + SameSite=Strict.
    In development (cross-origin localhost) use SameSite=Lax without Secure so
    the browser actually stores the cookie over plain HTTP.
    """
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


def is_account_locked(email: str) -> tuple[bool, Optional[int]]:
    """
    Check if account is locked due to too many failed attempts.
    Returns (is_locked, minutes_remaining).
    """
    email_lower = email.lower()
    if email_lower not in _failed_attempts:
        return False, None

    attempts = _failed_attempts[email_lower]
    if "locked_until" in attempts:
        lockout_end = attempts["locked_until"]
        if datetime.utcnow() < lockout_end:
            remaining_seconds = (lockout_end - datetime.utcnow()).total_seconds()
            # Use ceil and clamp to at least 1 to avoid confusing "0 minutes" messages
            remaining = max(1, math.ceil(remaining_seconds / 60))
            return True, remaining
        else:
            # Lockout expired, clear the record
            del _failed_attempts[email_lower]

    return False, None


def record_failed_attempt(email: str) -> None:
    """Record a failed login attempt.

    Uses a rolling window: if the first recorded attempt falls outside
    LOCKOUT_WINDOW_MINUTES, the counter resets before incrementing so that
    a small number of failures spread over a long period never permanently
    accumulates toward a lockout.

    Also prunes fully-expired entries to keep the in-memory store bounded.
    """
    email_lower = email.lower()
    now = datetime.utcnow()

    # Prune entries whose lockout has expired AND whose window has elapsed,
    # so the dict doesn't grow without bound under a distributed-email attack.
    expired_keys = [
        k for k, v in _failed_attempts.items()
        if ("locked_until" in v and v["locked_until"] < now)
        or ("first_attempt" in v and "locked_until" not in v
            and (now - v["first_attempt"]).total_seconds() / 60 > LOCKOUT_WINDOW_MINUTES)
    ]
    for k in expired_keys:
        del _failed_attempts[k]

    if email_lower not in _failed_attempts:
        _failed_attempts[email_lower] = {
            "count": 1,
            "first_attempt": now
        }
    else:
        attempts = _failed_attempts[email_lower]
        first_attempt = attempts.get("first_attempt", now)
        window_elapsed_minutes = (now - first_attempt).total_seconds() / 60

        # Reset counter when we're outside the rolling window
        if window_elapsed_minutes > LOCKOUT_WINDOW_MINUTES:
            _failed_attempts[email_lower] = {
                "count": 1,
                "first_attempt": now
            }
        else:
            _failed_attempts[email_lower]["count"] += 1

            # Lock the account once the threshold is reached
            if _failed_attempts[email_lower]["count"] >= LOCKOUT_THRESHOLD:
                _failed_attempts[email_lower]["locked_until"] = (
                    now + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
                )


def clear_failed_attempts(email: str) -> None:
    """Clear failed attempts after successful login."""
    email_lower = email.lower()
    if email_lower in _failed_attempts:
        del _failed_attempts[email_lower]

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
    try:
        users_collection = get_users_collection()
    except Exception:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Database unavailable"
        )
    user = await users_collection.find_one({"email": token_data.email})
    if user is None:
        raise credentials_exception
    user["id"] = str(user["_id"])
    if "created_at" in user and user["created_at"]:
        user["created_at"] = user["created_at"].isoformat()
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
    if (
        not RECAPTCHA_ENTERPRISE_PROJECT_ID
        or not RECAPTCHA_ENTERPRISE_API_KEY
        or not RECAPTCHA_ENTERPRISE_SITE_KEY
    ):
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
    try:
        users_collection = get_users_collection()
    except Exception as db_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {str(db_error)}"
        )
    existing_user = await users_collection.find_one({"email": user_data.email})
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
        "role": user_data.role,
        "favorites": [],
        "created_at": datetime.utcnow(),
        **default_user_preferences(),
    }
    result = await users_collection.insert_one(user_dict)
    user_id = str(result.inserted_id)
    access_token = create_access_token(
        data={"sub": user_data.email, "user_id": user_id}
    )

    # Set httpOnly cookie
    set_auth_cookie(response, access_token)

    # Log successful registration
    log_registration(user_id=user_id, ip_address=request.client.host if request.client else "unknown")

    return {"message": "Registration successful"}

@router.post("/login")
@limiter.limit("10/minute")
async def login(request: Request, response: Response, user_credentials: UserLogin):
    # Check if account is locked
    is_locked, minutes_remaining = is_account_locked(user_credentials.email)
    if is_locked:
        log_failed_auth(
            ip_address=request.client.host if request.client else "unknown",
            reason="account_locked"
        )
        raise HTTPException(
            status_code=status.HTTP_423_LOCKED,
            detail=f"Account temporarily locked due to too many failed attempts. Try again in {minutes_remaining} minutes.",
        )

    try:
        users_collection = get_users_collection()
    except Exception as db_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {str(db_error)}"
        )
    user = await users_collection.find_one({"email": user_credentials.email})
    if not user:
        # Record failed attempt
        record_failed_attempt(user_credentials.email)

        # Log failed login attempt
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
        # Record failed attempt
        record_failed_attempt(user_credentials.email)

        # Log failed login attempt
        log_failed_auth(
            ip_address=request.client.host if request.client else "unknown",
            reason="invalid_password"
        )
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )

    # Clear failed attempts on successful login
    clear_failed_attempts(user_credentials.email)

    user_id = str(user["_id"])
    access_token = create_access_token(
        data={"sub": user["email"], "user_id": user_id}
    )

    # Set httpOnly cookie
    set_auth_cookie(response, access_token)

    # Log successful login
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
        users_collection = get_users_collection()
    except Exception as db_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {str(db_error)}"
        )
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
    user = await users_collection.find_one({"email": email})
    if user:
        if "google_id" not in user or user["google_id"] != google_id:
            await users_collection.update_one(
                {"email": email},
                {"$set": {"google_id": google_id, "updated_at": datetime.utcnow()}}
            )
        user_id = str(user["_id"])
    else:
        user_dict = {
            "name": name,
            "email": email,
            "google_id": google_id,
            "role": "customer",
            "favorites": [],
            "created_at": datetime.utcnow(),
            "auth_provider": "google",
            **default_user_preferences(),
        }
        result = await users_collection.insert_one(user_dict)
        user_id = str(result.inserted_id)
    access_token = create_access_token(
        data={"sub": email, "user_id": user_id}
    )

    # Set httpOnly cookie
    set_auth_cookie(response, access_token)

    # Log successful login
    log_login(
        user_id=user_id,
        ip_address=request.client.host if request.client else "unknown",
        success=True,
        method="google"
    )

    return {"message": "Login successful"}
