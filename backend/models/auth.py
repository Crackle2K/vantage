import bcrypt
import asyncio
import json
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
from google.oauth2 import id_token
from google.auth.transport import requests
from pydantic import BaseModel, EmailStr, Field
from urllib import request as urllib_request, error as urllib_error

from config import (
    SECRET_KEY,
    ALGORITHM,
    ACCESS_TOKEN_EXPIRE_MINUTES,
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

security = HTTPBearer()
optional_security = HTTPBearer(auto_error=False)

router = APIRouter()

class GoogleAuthRequest(BaseModel):
    credential: str

class RegisterRequest(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.CUSTOMER
    recaptcha_token: str = Field(..., min_length=1)
    recaptcha_action: Optional[str] = None

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

async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )
    try:
        token = credentials.credentials
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

async def get_current_user_optional(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(optional_security)
) -> Optional[User]:
    if credentials is None:
        return None

    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None

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

@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: RegisterRequest):
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
    return Token(access_token=access_token, token_type="bearer")

@router.post("/login", response_model=Token)
async def login(user_credentials: UserLogin):
    try:
        users_collection = get_users_collection()
    except Exception as db_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {str(db_error)}"
        )
    user = await users_collection.find_one({"email": user_credentials.email})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    if not verify_password(user_credentials.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    user_id = str(user["_id"])
    access_token = create_access_token(
        data={"sub": user["email"], "user_id": user_id}
    )
    return Token(access_token=access_token, token_type="bearer")

@router.get("/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    return current_user

@router.post("/google", response_model=Token)
async def google_auth(auth_request: GoogleAuthRequest):
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
    return Token(access_token=access_token, token_type="bearer")
