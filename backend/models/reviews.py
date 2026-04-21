"""Review domain models for the Vantage API.

Defines Pydantic models for business reviews including creation, updates,
the full review response, and a variant that includes the reviewer's name.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class ReviewBase(BaseModel):
    """Base review fields shared across models.

    Attributes:
        rating (float): Star rating from 1 to 5.
        comment (str): Review text (10-1000 characters).
    """
    rating: float = Field(..., ge=1, le=5, description="Rating from 1 to 5")
    comment: str = Field(..., min_length=10, max_length=1000)

class ReviewCreate(BaseModel):
    """Request body for creating a new review.

    Attributes:
        business_id (str): ID of the business being reviewed.
        rating (float): Star rating from 1 to 5.
        comment (str): Review text (10-1000 characters).
    """
    business_id: str
    rating: float = Field(..., ge=1, le=5, description="Rating from 1 to 5")
    comment: str = Field(..., min_length=10, max_length=1000)

class ReviewUpdate(BaseModel):
    """Request body for updating an existing review (all fields optional).

    Attributes:
        rating (Optional[float]): Updated star rating (1-5).
        comment (Optional[str]): Updated review text (10-1000 characters).
    """
    rating: Optional[float] = Field(None, ge=1, le=5, description="Rating from 1 to 5")
    comment: Optional[str] = Field(None, min_length=10, max_length=1000)

class Review(ReviewBase):
    """Full review model returned in API responses.

    Attributes:
        id (str): Unique review identifier.
        business_id (str): ID of the reviewed business.
        user_id (str): ID of the reviewer.
        created_at (datetime): Timestamp when the review was created.
    """
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
    """Review response variant that includes the reviewer's display name.

    Attributes:
        user_name (str): Display name of the reviewer.
        user_email (Optional[str]): Email of the reviewer (may be omitted).
    """
    user_name: str
    user_email: Optional[str] = None
