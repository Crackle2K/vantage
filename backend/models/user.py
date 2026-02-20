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
    
    class Config:
        from_attributes = True


class UserInDB(User):
    """User schema as stored in database (includes password hash)"""
    hashed_password: str


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
