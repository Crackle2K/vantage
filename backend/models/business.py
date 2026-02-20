"""
Business Model Schema
Defines business data structures with geospatial support for Vantage
"""

from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum


class CategoryEnum(str, Enum):
    """Business category enumeration"""
    FOOD = "food"
    RETAIL = "retail"
    SERVICES = "services"
    ENTERTAINMENT = "entertainment"
    HEALTH = "health"
    EDUCATION = "education"
    AUTOMOTIVE = "automotive"
    HOME = "home"
    BEAUTY = "beauty"
    OTHER = "other"


class GeoLocation(BaseModel):
    """GeoJSON Point for MongoDB geospatial queries"""
    type: str = "Point"
    coordinates: List[float] = Field(..., min_length=2, max_length=2)
    # coordinates format: [longitude, latitude]
    
    class Config:
        json_schema_extra = {
            "example": {
                "type": "Point",
                "coordinates": [-79.3832, 43.6532]  # Toronto example
            }
        }


class BusinessBase(BaseModel):
    """Base business fields"""
    name: str = Field(..., min_length=2, max_length=200)
    category: CategoryEnum
    description: str = Field(..., max_length=1000)
    address: str = Field(..., max_length=300)
    city: str = Field(..., max_length=100)


class BusinessCreate(BaseModel):
    """Schema for creating a new business"""
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


class BusinessUpdate(BaseModel):
    """Schema for updating business information"""
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


class Business(BusinessBase):
    """Business schema returned to client"""
    id: str
    owner_id: Optional[str] = None
    location: Optional[GeoLocation] = None
    rating: float = Field(default=0.0, ge=0, le=5)
    review_count: int = Field(default=0, ge=0)
    has_deals: bool = False
    created_at: Optional[datetime] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    website: Optional[str] = None
    image_url: Optional[str] = None

    # ── Hybrid Model: Seed vs Claimed ───────────────────────────────
    is_claimed: bool = False                  # Has an owner claimed this?
    claim_status: Optional[str] = None        # pending, verified, rejected
    is_seed: bool = True                      # From our seed database?

    # ── Community Trust Layer ───────────────────────────────────────
    is_active_today: bool = False             # Had check-ins today?
    checkins_today: int = 0
    trending_score: float = 0.0              # Activity-based ranking boost
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


# MongoDB Geo Index Creation
"""
To enable geospatial queries, create a 2dsphere index on the location field:

In MongoDB shell or startup script:
```python
db.businesses.create_index([("location", "2dsphere")])
```

Or in your database initialization:
```python
async def create_indexes():
    businesses_collection = get_businesses_collection()
    await businesses_collection.create_index([("location", "2dsphere")])
    await businesses_collection.create_index("owner_id")
    await businesses_collection.create_index("category")
    await businesses_collection.create_index("city")
```

Example geospatial query:
```python
businesses = await businesses_collection.find({
    "location": {
        "$near": {
            "$geometry": {
                "type": "Point",
                "coordinates": [longitude, latitude]
            },
            "$maxDistance": radius_meters
        }
    }
})
```
"""
