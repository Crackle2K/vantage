"""
Deal Model Schema
Defines deal/coupon data structures for Vantage
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime


class DealBase(BaseModel):
    """Base deal fields"""
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=500)
    discount_percent: float = Field(..., ge=0, le=100, description="Discount percentage (0-100)")
    expires_at: datetime


class DealCreate(BaseModel):
    """Schema for creating a new deal"""
    business_id: str
    title: str = Field(..., min_length=3, max_length=200)
    description: str = Field(..., min_length=10, max_length=500)
    discount_percent: float = Field(..., ge=0, le=100, description="Discount percentage (0-100)")
    expires_at: datetime
    active: bool = True


class DealUpdate(BaseModel):
    """Schema for updating an existing deal"""
    title: Optional[str] = Field(None, min_length=3, max_length=200)
    description: Optional[str] = Field(None, min_length=10, max_length=500)
    discount_percent: Optional[float] = Field(None, ge=0, le=100)
    expires_at: Optional[datetime] = None
    active: Optional[bool] = None


class Deal(DealBase):
    """Deal schema returned to client"""
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
    """Deal with business information for display"""
    business_name: str
    business_category: str


# MongoDB Index Creation
"""
Create indexes for optimal query performance:

```python
async def create_indexes():
    deals_collection = get_deals_collection()
    
    # Index for finding deals by business
    await deals_collection.create_index("business_id")
    
    # Index for active deals
    await deals_collection.create_index("active")
    
    # Compound index for active deals expiration queries
    await deals_collection.create_index([
        ("active", 1),
        ("expires_at", 1)
    ])
    
    # Index for expiration date (for cleanup jobs)
    await deals_collection.create_index("expires_at")
```

Example query for active non-expired deals:
```python
from datetime import datetime

active_deals = await deals_collection.find({
    "business_id": business_id,
    "active": True,
    "expires_at": {"$gt": datetime.utcnow()}
}).to_list(length=None)
```

Automatic cleanup of expired deals (optional background task):
```python
async def deactivate_expired_deals():
    deals_collection = get_deals_collection()
    result = await deals_collection.update_many(
        {
            "active": True,
            "expires_at": {"$lt": datetime.utcnow()}
        },
        {"$set": {"active": False}}
    )
    return result.modified_count
```
"""

