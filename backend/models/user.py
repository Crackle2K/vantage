"""User domain models for the Vantage API.

Defines Pydantic models for user data, authentication tokens, and
user preference settings. Also provides enums for user roles, price
preferences, and discovery modes.
"""
from pydantic import BaseModel, EmailStr, Field, field_validator
from typing import List, Optional
from enum import Enum

from backend.utils.security import validate_password_strength

class UserRole(str, Enum):
    """User role levels controlling access permissions."""

    CUSTOMER = "customer"
    BUSINESS_OWNER = "business_owner"
    ADMIN = "admin"

class PricePreference(str, Enum):
    """Price-tier preference for discovery ranking."""

    BUDGET = "$"
    MODERATE = "$$"
    PREMIUM = "$$$"

class DiscoveryMode(str, Enum):
    """Controls how discovery results are weighted."""

    NEW_PLACES = "new_places"
    TRENDING = "trending"
    TRUSTED = "trusted"

def default_user_preferences() -> dict:
    """Return a dictionary of default preference values for a new user.

    Returns:
        dict: Default preference settings with empty categories/vibes,
            neutral independence slider, and ``trusted`` discovery mode.
    """
    return {
        "preferred_categories": [],
        "preferred_vibes": [],
        "prefer_independent": 0.5,
        "price_pref": None,
        "discovery_mode": DiscoveryMode.TRUSTED,
        "preferences_completed": False,
    }

class UserBase(BaseModel):
    """Base user fields shared across request/response models.

    Attributes:
        name (str): Display name (2-100 characters).
        email (EmailStr): User email address.
        role (UserRole): User role, defaults to CUSTOMER.
    """
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    role: UserRole = UserRole.CUSTOMER

class UserCreate(BaseModel):
    """Request body for creating a new user with password validation.

    Attributes:
        name (str): Display name (2-100 characters).
        email (EmailStr): User email address.
        password (str): Password (minimum 8 characters, must pass strength validation).
        role (UserRole): Requested user role.
    """
    name: str = Field(..., min_length=2, max_length=100)
    email: EmailStr
    password: str = Field(..., min_length=8)
    role: UserRole = UserRole.CUSTOMER

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        is_valid, error_msg = validate_password_strength(v)
        if not is_valid:
            raise ValueError(error_msg)
        return v

class User(UserBase):
    """Full user model returned in API responses.

    Attributes:
        id (str): Unique user identifier.
        favorites (List[str]): List of favorited business IDs.
        google_id (Optional[str]): Google OAuth subject ID if linked.
        auth_provider (Optional[str]): Authentication method (``password`` or ``google``).
        profile_picture (Optional[str]): URL to profile avatar.
        about_me (Optional[str]): User bio text.
        created_at (Optional[str]): ISO timestamp of account creation.
        preferred_categories (List[str]): User's preferred business categories.
        preferred_vibes (List[str]): User's preferred atmosphere tags.
        prefer_independent (float): Preference for independent businesses (0.0-1.0).
        price_pref (Optional[PricePreference]): Price tier preference.
        discovery_mode (DiscoveryMode): Discovery ranking mode.
        preferences_completed (bool): Whether the user has completed onboarding preferences.
    """
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
    """Extended user model including the hashed password for internal use."""
    hashed_password: Optional[str] = None

class UserUpdate(BaseModel):
    """Request body for updating a user's public profile fields.

    Attributes:
        name (Optional[str]): Display name (2-100 characters).
        profile_picture (Optional[str]): Avatar URL (max 500 characters).
        about_me (Optional[str]): Bio text (max 500 characters).
    """
    name: Optional[str] = Field(None, min_length=2, max_length=100)
    profile_picture: Optional[str] = Field(None, max_length=500)
    about_me: Optional[str] = Field(None, max_length=500)

class UserPreferencesUpdate(BaseModel):
    """Request body for updating user discovery preferences.

    Attributes:
        preferred_categories (List[str]): Business category preferences.
        preferred_vibes (List[str]): Atmosphere/vibe tag preferences.
        prefer_independent (float): Independent-business preference (0.0-1.0).
        price_pref (Optional[PricePreference]): Price tier preference.
        discovery_mode (DiscoveryMode): Discovery ranking mode.
        preferences_completed (bool): Marks onboarding preferences as complete.
    """
    preferred_categories: List[str] = Field(default_factory=list)
    preferred_vibes: List[str] = Field(default_factory=list)
    prefer_independent: float = Field(default=0.5, ge=0.0, le=1.0)
    price_pref: Optional[PricePreference] = None
    discovery_mode: DiscoveryMode = DiscoveryMode.TRUSTED
    preferences_completed: bool = True

class PasswordChange(BaseModel):
    """Request body for changing a user's password.

    Attributes:
        current_password (str): The user's current password.
        new_password (str): The desired new password (minimum 8 characters, validated for strength).
    """
    current_password: str = Field(..., min_length=1)
    new_password: str = Field(..., min_length=8)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        is_valid, error_msg = validate_password_strength(v)
        if not is_valid:
            raise ValueError(error_msg)
        return v

class UserLogin(BaseModel):
    """Request body for email/password login.

    Attributes:
        email (EmailStr): User email address.
        password (str): User password.
    """
    email: EmailStr
    password: str

class Token(BaseModel):
    """JWT access token response model.

    Attributes:
        access_token (str): The encoded JWT string.
        token_type (str): Token type (always ``bearer``).
    """
    access_token: str
    token_type: str = "bearer"

class TokenData(BaseModel):
    """Decoded JWT payload data used for user resolution.

    Attributes:
        email (Optional[str]): User email from the ``sub`` claim.
        user_id (Optional[str]): User ID from the ``user_id`` claim.
    """
    email: Optional[str] = None
    user_id: Optional[str] = None
