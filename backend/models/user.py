from pydantic import BaseModel, EmailStr, Field
from typing import List, Optional
from enum import Enum

class UserRole(str, Enum):
    CUSTOMER = "customer"
    BUSINESS_OWNER = "business_owner"

class PricePreference(str, Enum):
    BUDGET = "$"
    MODERATE = "$$"
    PREMIUM = "$$$"

class DiscoveryMode(str, Enum):
    NEW_PLACES = "new_places"
    TRENDING = "trending"
    TRUSTED = "trusted"

def default_user_preferences() -> dict:
    return {
        "preferred_categories": [],
        "preferred_vibes": [],
        "prefer_independent": 0.5,
        "price_pref": None,
        "discovery_mode": DiscoveryMode.TRUSTED,
        "preferences_completed": False,
    }

class UserBase(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    role: UserRole = UserRole.CUSTOMER

class UserCreate(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=6)
    role: UserRole = UserRole.CUSTOMER

class User(UserBase):
    id: str
    favorites: List[str] = Field(default_factory=list)
    google_id: Optional[str] = None
    auth_provider: Optional[str] = None
    profile_picture: Optional[str] = None
    about_me: Optional[str] = None
    created_at: Optional[str] = None
    preferred_categories: List[str] = Field(default_factory=list)
    preferred_vibes: List[str] = Field(default_factory=list)
    prefer_independent: float = Field(default=0.5, ge=0.0, le=1.0)
    price_pref: Optional[PricePreference] = None
    discovery_mode: DiscoveryMode = DiscoveryMode.TRUSTED
    preferences_completed: bool = False
    class Config:
        from_attributes = True

class UserInDB(User):
    hashed_password: Optional[str] = None

class UserUpdate(BaseModel):
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    profile_picture: Optional[str] = Field(None, max_length=500)
    about_me: Optional[str] = Field(None, max_length=500)

class UserPreferencesUpdate(BaseModel):
    preferred_categories: List[str] = Field(default_factory=list)
    preferred_vibes: List[str] = Field(default_factory=list)
    prefer_independent: float = Field(default=0.5, ge=0.0, le=1.0)
    price_pref: Optional[PricePreference] = None
    discovery_mode: DiscoveryMode = DiscoveryMode.TRUSTED
    preferences_completed: bool = True

class PasswordChange(BaseModel):
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=6)

class UserLogin(BaseModel):
    email: EmailStr
    password: str

class Token(BaseModel):
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    email: Optional[str] = None
    user_id: Optional[str] = None
