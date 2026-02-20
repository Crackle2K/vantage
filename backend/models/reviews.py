"""
Review Model Schema
Defines review data structures for Vantage
Ensures one review per user per business
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class ReviewBase(BaseModel):
    """Base review fields"""
    rating: float = Field(..., ge=1, le=5, description="Rating from 1 to 5")
    comment: str = Field(..., min_length=10, max_length=1000)


class ReviewCreate(BaseModel):
    """Schema for creating a new review"""
    business_id: str
    rating: float = Field(..., ge=1, le=5, description="Rating from 1 to 5")
    comment: str = Field(..., min_length=10, max_length=1000)


class ReviewUpdate(BaseModel):
    """Schema for updating an existing review"""
    rating: Optional[float] = Field(None, ge=1, le=5, description="Rating from 1 to 5")
    comment: Optional[str] = Field(None, min_length=10, max_length=1000)


class Review(ReviewBase):
    """Review schema returned to client"""
    id: str
    business_id: str
    user_id: str
    created_at: datetime
    
    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "507f1f77bcf86cd799439011",
                "business_id": "507f1f77bcf86cd799439012",
                "user_id": "507f1f77bcf86cd799439013",
                "rating": 4.5,
                "comment": "Great service and friendly staff! Highly recommend.",
                "created_at": "2026-02-15T14:30:00Z"
            }
        }


class ReviewWithUser(Review):
    """Review with user information for display"""
    user_name: str
    user_email: Optional[str] = None


# MongoDB Index Creation for Unique Constraint
"""
To enforce one review per user per business, create a compound unique index:

In MongoDB shell or startup script:
```python
db.reviews.create_index(
    [("user_id", 1), ("business_id", 1)],
    unique=True
)
```

Or in your database initialization:
```python
async def create_indexes():
    reviews_collection = get_reviews_collection()
    
    # Compound unique index: one review per user per business
    await reviews_collection.create_index(
        [("user_id", 1), ("business_id", 1)],
        unique=True
    )
    
    # Additional indexes for common queries
    await reviews_collection.create_index("business_id")
    await reviews_collection.create_index("user_id")
    await reviews_collection.create_index("created_at")
```

This ensures that a user cannot create multiple reviews for the same business.
If they try, MongoDB will raise a DuplicateKeyError.

Example handling in your route:
```python
from pymongo.errors import DuplicateKeyError

try:
    result = await reviews_collection.insert_one(review_data)
except DuplicateKeyError:
    raise HTTPException(
        status_code=400,
        detail="You have already reviewed this business"
    )
```
"""
