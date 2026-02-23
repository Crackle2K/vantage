"""
Authentication Routes for Vantage
Handles user registration and login with JWT tokens
"""

import bcrypt
from datetime import datetime, timedelta
from typing import Optional
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from google.oauth2 import id_token
from google.auth.transport import requests
from pydantic import BaseModel

from config import SECRET_KEY, ALGORITHM, ACCESS_TOKEN_EXPIRE_MINUTES, GOOGLE_CLIENT_ID
from models.user import UserCreate, UserLogin, User, Token, TokenData
from database.mongodb import get_users_collection

# Security scheme
security = HTTPBearer()

# Router
router = APIRouter()


# Request Models
class GoogleAuthRequest(BaseModel):
    """Request model for Google authentication"""
    credential: str  # Google ID token


# Helper Functions
def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verify a password against its hash"""
    return bcrypt.checkpw(
        plain_password.encode('utf-8'),
        hashed_password.encode('utf-8')
    )


def get_password_hash(password: str) -> str:
    """Hash a password using bcrypt"""
    return bcrypt.hashpw(
        password.encode('utf-8'),
        bcrypt.gensalt()
    ).decode('utf-8')


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Create a JWT access token"""
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.utcnow() + expires_delta
    else:
        expire = datetime.utcnow() + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    
    to_encode.update({"exp": expire})
    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> User:
    """
    Dependency to get the current authenticated user from JWT token
    """
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
    except JWTError:
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
    return User(**user)


# Routes
@router.post("/register", response_model=Token, status_code=status.HTTP_201_CREATED)
async def register(user_data: UserCreate):
    """
    Register a new user
    - Creates user account with hashed password
    - Returns JWT access token
    """
    try:
        users_collection = get_users_collection()
    except Exception as db_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {str(db_error)}"
        )
    
    # Check if user already exists
    existing_user = await users_collection.find_one({"email": user_data.email})
    if existing_user:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email already registered"
        )
    
    # Hash the password
    hashed_password = get_password_hash(user_data.password)
    
    # Create user document
    user_dict = {
        "name": user_data.name,
        "email": user_data.email,
        "hashed_password": hashed_password,
        "role": user_data.role,
        "favorites": [],
        "created_at": datetime.utcnow()
    }
    
    # Insert into database
    result = await users_collection.insert_one(user_dict)
    user_id = str(result.inserted_id)
    
    # Create access token
    access_token = create_access_token(
        data={"sub": user_data.email, "user_id": user_id}
    )
    
    return Token(access_token=access_token, token_type="bearer")


@router.post("/login", response_model=Token)
async def login(user_credentials: UserLogin):
    """
    Login user
    - Validates email and password
    - Returns JWT access token
    """
    try:
        users_collection = get_users_collection()
    except Exception as db_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {str(db_error)}"
        )
    
    # Find user by email
    user = await users_collection.find_one({"email": user_credentials.email})
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Verify password
    if not verify_password(user_credentials.password, user["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Incorrect email or password",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    # Create access token
    user_id = str(user["_id"])
    access_token = create_access_token(
        data={"sub": user["email"], "user_id": user_id}
    )
    
    return Token(access_token=access_token, token_type="bearer")


@router.get("/me", response_model=User)
async def get_current_user_info(current_user: User = Depends(get_current_user)):
    """
    Get current authenticated user information
    Requires valid JWT token
    """
    return current_user


@router.post("/google", response_model=Token)
async def google_auth(auth_request: GoogleAuthRequest):
    """
    Authenticate user with Google OAuth
    - Verifies Google ID token
    - Creates or updates user account
    - Returns JWT access token
    """
    try:
        users_collection = get_users_collection()
    except Exception as db_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {str(db_error)}"
        )
    
    # Verify the Google token
    try:
        idinfo = id_token.verify_oauth2_token(
            auth_request.credential, 
            requests.Request(), 
            GOOGLE_CLIENT_ID
        )
        
        # Extract user information from Google token
        google_id = idinfo['sub']
        email = idinfo['email']
        name = idinfo.get('name', email.split('@')[0])
        
    except ValueError as e:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail=f"Invalid Google token: {str(e)}"
        )
    
    # Check if user already exists
    user = await users_collection.find_one({"email": email})
    
    if user:
        # Update existing user's Google ID if not set
        if "google_id" not in user or user["google_id"] != google_id:
            await users_collection.update_one(
                {"email": email},
                {"$set": {"google_id": google_id, "updated_at": datetime.utcnow()}}
            )
        user_id = str(user["_id"])
    else:
        # Create new user
        user_dict = {
            "name": name,
            "email": email,
            "google_id": google_id,
            "role": "customer",
            "favorites": [],
            "created_at": datetime.utcnow(),
            "auth_provider": "google"
        }
        
        result = await users_collection.insert_one(user_dict)
        user_id = str(result.inserted_id)
    
    # Create access token
    access_token = create_access_token(
        data={"sub": email, "user_id": user_id}
    )
    
    return Token(access_token=access_token, token_type="bearer")
