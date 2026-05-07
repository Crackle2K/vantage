"""Business domain models for the Vantage API.

Defines Pydantic models for business listings including creation, updates,
profile updates, and the full business response. Also provides the
``CategoryEnum`` for business categorization and ``GeoLocation`` for
storing point coordinates.
"""
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum

class CategoryEnum(str, Enum):
    """Business category values supporting both lower-case internal and display forms."""
    FOOD = "food"
    RETAIL = "retail"
    SERVICES = "services"
    ENTERTAINMENT_LOWER = "entertainment"
    HEALTH = "health"
    EDUCATION_LOWER = "education"
    AUTOMOTIVE_LOWER = "automotive"
    HOME = "home"
    BEAUTY_LOWER = "beauty"
    OTHER_LOWER = "other"
    RESTAURANTS = "Restaurants"
    CAFES = "Cafes & Coffee"
    BARS = "Bars & Nightlife"
    SHOPPING = "Shopping"
    FITNESS = "Fitness & Wellness"
    BEAUTY = "Beauty & Spas"
    HEALTH_MEDICAL = "Health & Medical"
    FINANCIAL = "Financial Services"
    AUTOMOTIVE = "Automotive"
    ENTERTAINMENT = "Entertainment"
    HOTELS = "Hotels & Travel"
    PROFESSIONAL = "Professional Services"
    HOME_SERVICES = "Home Services"
    PETS = "Pets"
    EDUCATION = "Education"
    GROCERY = "Grocery"
    LOCAL_SERVICES = "Local Services"
    ACTIVE_LIFE = "Active Life"
    PUBLIC_SERVICES = "Public Services"
    RELIGIOUS = "Religious Organizations"
    OTHER = "Other"

class GeoLocation(BaseModel):
    """GeoJSON Point geometry for storing business coordinates.

    Attributes:
        type (str): Always ``Point``.
        coordinates (List[float]): ``[longitude, latitude]`` pair.
    """
    type: str = "Point"
    coordinates: List[float] = Field(..., min_length=2, max_length=2)
    class Config:
        json_schema_extra = {
            "example": {
                "type": "Point",
                "coordinates": [-79.3832, 43.6532]
            }
        }

class BusinessBase(BaseModel):
    """Core business fields shared across request/response models.

    Attributes:
        name (str): Business name (2-200 characters).
        category (CategoryEnum): Business category.
        description (str): Business description (max 1000 characters).
        address (str): Street address (max 300 characters).
        city (str): City name (max 100 characters).
    """
    name: str = Field(..., min_length=2, max_length=200)
    category: CategoryEnum
    description: str = Field(..., max_length=1000)
    address: str = Field(..., max_length=300)
    city: str = Field(..., max_length=100)

class BusinessCreate(BaseModel):
    """Request body for creating a new business listing.

    Attributes:
        name (str): Business name (2-200 characters).
        category (CategoryEnum): Business category.
        description (str): Description (max 1000 characters).
        address (str): Street address (max 300 characters).
        city (str): City name (max 100 characters).
        location (GeoLocation): GeoJSON point coordinates.
        phone (Optional[str]): Phone number.
        email (Optional[str]): Contact email.
        website (Optional[str]): Business website URL.
        image_url (Optional[str]): Primary image URL.
        image_urls (List[str]): Additional image URLs (max 8).
        short_description (Optional[str]): Tagline (max 160 characters).
        known_for (List[str]): Feature tags (max 6).
    """
    name: str = Field(..., min_length=2, max_length=200)
    category: CategoryEnum
    description: str = Field(..., max_length=1000)
    address: str = Field(..., max_length=300)
    city: str = Field(..., max_length=100)
    location: GeoLocation
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    image_url: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list, min_length=0, max_length=8)
    short_description: Optional[str] = Field(None, max_length=160)
    known_for: List[str] = Field(default_factory=list, min_length=0, max_length=6)

class BusinessUpdate(BaseModel):
    """Request body for updating an existing business (all fields optional)."""
    name: Optional[str] = Field(None, min_length=2, max_length=200)
    category: Optional[CategoryEnum] = None
    description: Optional[str] = Field(None, max_length=1000)
    address: Optional[str] = Field(None, max_length=300)
    city: Optional[str] = Field(None, max_length=100)
    location: Optional[GeoLocation] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    image_url: Optional[str] = None
    image_urls: Optional[List[str]] = Field(None, min_length=0, max_length=8)
    short_description: Optional[str] = Field(None, max_length=160)
    known_for: Optional[List[str]] = Field(None, min_length=0, max_length=6)

class BusinessProfileUpdate(BaseModel):
    """Request body for owner-only profile field updates.

    Restricted to fields that the claimed business owner can edit
    (short_description and known_for tags).

    Attributes:
        short_description (Optional[str]): Tagline (max 160 characters).
        known_for (Optional[List[str]]): Feature tags (max 6).
    """
    short_description: Optional[str] = Field(None, max_length=160)
    known_for: Optional[List[str]] = Field(None, min_length=0, max_length=6)

class Business(BusinessBase):
    """Full business model returned in API responses.

    Includes computed fields like rating, review count, credibility score,
    visibility score, trending score, and claim status.

    Attributes:
        id (str): Unique business identifier.
        owner_id (Optional[str]): ID of the claimed business owner.
        place_id (Optional[str]): Google Places place ID.
        location (Optional[GeoLocation]): GeoJSON coordinates.
        rating (float): Average rating (0-5).
        review_count (int): Total number of reviews.
        has_deals (bool): Whether the business has active deals.
        phone/email/website: Contact information.
        image_url/image_urls: Photo URLs.
        short_description (Optional[str]): Tagline.
        known_for (List[str]): Feature tags.
        is_claimed (bool): Whether the business has been claimed by an owner.
        claim_status (Optional[str]): Current claim status.
        credibility_score (float): Computed credibility score.
        live_visibility_score (float): Computed live visibility score.
        local_confidence (float): Confidence that this is a local business.
        is_active_today (bool): Whether there was activity today.
        checkins_today (int): Number of check-ins today.
        trending_score (float): Computed trending score.
        last_activity_at (Optional[datetime]): Timestamp of last activity.
    """
    id: str
    owner_id: Optional[str] = None
    place_id: Optional[str] = None
    location: Optional[GeoLocation] = None
    rating: float = Field(default=0.0, ge=0, le=5)
    review_count: int = Field(default=0, ge=0)
    has_deals: bool = False
    created_at: Optional[datetime] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    image_url: Optional[str] = None
    image_urls: List[str] = Field(default_factory=list)
    short_description: Optional[str] = Field(default=None, max_length=160)
    known_for: List[str] = Field(default_factory=list, min_length=0, max_length=6)

    is_claimed: bool = False
    claim_status: Optional[str] = None

    credibility_score: float = 0.0
    live_visibility_score: float = 0.0
    local_confidence: float = 0.0

    is_active_today: bool = False
    checkins_today: int = 0
    trending_score: float = 0.0
    last_activity_at: Optional[datetime] = None
    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "507f1f77bcf86cd799439011",
                "owner_id": "507f1f77bcf86cd799439012",
                "name": "Joe's Coffee Shop",
                "category": "food",
                "description": "Best coffee in town",
                "address": "123 Main Street",
                "city": "Toronto",
                "location": {
                    "type": "Point",
                    "coordinates": [-79.3832, 43.6532]
                },
                "rating_average": 4.5,
                "total_reviews": 42,
                "created_at": "2026-01-15T10:30:00Z"
            }
        }
