"""Deal domain models for the Vantage API.

Defines Pydantic models for business promotional deals including creation,
updates, the full deal response, and a variant that includes the parent
business's name and category.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime

class DealBase(BaseModel):
    """Base deal fields shared across models.

    Attributes:
        title (str): Deal title (3-200 characters).
        description (str): Deal description (10-500 characters).
        discount_percent (float): Discount percentage (0-100).
        expires_at (datetime): Expiration timestamp.
    """
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=500)
    discount_percent: float = Field(..., ge=0, le=100, description="Discount percentage (0-100)")
    expires_at: datetime

class DealCreate(BaseModel):
    """Request body for creating a new deal.

    Attributes:
        business_id (str): ID of the business offering the deal.
        title (str): Deal title (3-200 characters).
        description (str): Deal description (10-500 characters).
        discount_percent (float): Discount percentage (0-100).
        expires_at (datetime): Expiration timestamp.
        active (bool): Whether the deal is immediately active.
    """
    business_id: str
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=500)
    discount_percent: float = Field(..., ge=0, le=100, description="Discount percentage (0-100)")
    expires_at: datetime
    active: bool = True

class DealUpdate(BaseModel):
    """Request body for updating a deal (all fields optional)."""
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, min_length=10, max_length=500)
    discount_percent: Optional[float] = Field(None, ge=0, le=100)
    expires_at: Optional[datetime] = None
    active: Optional[bool] = None

class Deal(DealBase):
    """Full deal model returned in API responses.

    Attributes:
        id (str): Unique deal identifier.
        business_id (str): ID of the business offering the deal.
        active (bool): Whether the deal is currently active.
        created_at (datetime): Timestamp when the deal was created.
    """
    id: str
    business_id: str
    active: bool = True
    created_at: datetime
    class Config:
        from_attributes = True
        json_schema_extra = {
            "example": {
                "id": "507f1f77bcf86cd799439011",
                "business_id": "507f1f77bcf86cd799439012",
                "title": "Happy Hour Special",
                "description": "Get 20% off all drinks from 4-6 PM every weekday",
                "discount_percent": 20.0,
                "expires_at": "2026-03-31T23:59:59Z",
                "active": True,
                "created_at": "2026-02-01T10:00:00Z"
            }
        }

class DealWithBusiness(Deal):
    """Deal response variant that includes the parent business's name and category.

    Attributes:
        business_name (str): Name of the business.
        business_category (str): Category of the business.
    """
    business_name: str
    business_category: str
