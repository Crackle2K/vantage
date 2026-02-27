"""
User Model Schema
Defines user data structures for Vantage
"""

from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from enum import Enum


class UserRole(str, Enum):
    """User role enumeration"""
    CUSTOMER = "customer"
    BUSINESS_OWNER = "business_owner"


class UserBase(BaseModel):
    """Base user fields"""
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    role: UserRole = UserRole.CUSTOMER


class UserCreate(BaseModel):
    """Schema for creating a new user"""
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.CUSTOMER


class User(UserBase):
    """User schema returned to client (without sensitive data)"""
    id: str
    favorites: List[str] = Field(default_factory=list)
    google_id: Optional[str] = None
    auth_provider: Optional[str] = None
    profile_picture: Optional[str] = None
    about_me: Optional[str] = None
    created_at: Optional[str] = None
    
    class Config:
        from_attributes = True


class UserInDB(User):
    """User schema as stored in database (includes password hash)"""
    hashed_password: Optional[str] = None  # Optional for OAuth users


class UserUpdate(BaseModel):
    """Schema for updating user profile"""
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    profile_picture: Optional[str] = Field(None, max_length=500)
    about_me: Optional[str] = Field(None, max_length=500)


class UserLogin(BaseModel):
    """Schema for user login"""
    email: EmailStr
    password: str


class Token(BaseModel):
    """JWT token response"""
    access_token: str
    token_type: str = "bearer"


class TokenData(BaseModel):
    """Data extracted from JWT token"""
    email: Optional[str] = None
    user_id: Optional[str] = None
