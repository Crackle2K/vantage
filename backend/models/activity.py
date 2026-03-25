from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class CheckInStatus(str, Enum):
    SELF_REPORTED = "self_reported"
    GEO_VERIFIED = "geo_verified"
    RECEIPT_VERIFIED = "receipt_verified"
    COMMUNITY_CONFIRMED = "community_confirmed"

class CheckIn(BaseModel):
    id: str
    user_id: str
    business_id: str
    status: CheckInStatus = CheckInStatus.SELF_REPORTED
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_from_business: Optional[float] = None
    note: Optional[str] = Field(None, max_length=200)
    photo_url: Optional[str] = None
    confirmations: int = 0
    confirmed_by: List[str] = Field(default_factory=list)
    created_at: datetime
    class Config:
        from_attributes = True

class CheckInCreate(BaseModel):
    business_id: str
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    note: Optional[str] = Field(None, max_length=200)

class CredibilityTier(str, Enum):
    NEW = "new"
    REGULAR = "regular"
    TRUSTED = "trusted"
    LOCAL_GUIDE = "local_guide"
    AMBASSADOR = "ambassador"

class UserCredibility(BaseModel):
    user_id: str
    total_checkins: int = 0
    verified_checkins: int = 0
    total_reviews: int = 0
    helpful_votes: int = 0
    confirmations_given: int = 0
    confirmations_received: int = 0
    events_attended: int = 0
    credibility_score: float = Field(default=0.0, ge=0, le=100)
    tier: CredibilityTier = CredibilityTier.NEW
    is_verified_local: bool = False
    joined_at: Optional[datetime] = None
    last_active: Optional[datetime] = None
    class Config:
        from_attributes = True

def calculate_credibility_score(stats: dict) -> tuple[float, CredibilityTier]:
    score = 0.0
    score += stats.get("total_checkins", 0) * 2
    score += stats.get("verified_checkins", 0) * 3
    score += stats.get("total_reviews", 0) * 3
    score += stats.get("helpful_votes", 0) * 1
    score += stats.get("confirmations_given", 0) * 1
    score += stats.get("confirmations_received", 0) * 2
    score += stats.get("events_attended", 0) * 3
    score = min(score, 100.0)
    total_activity = (
        stats.get("total_checkins", 0) +
        stats.get("total_reviews", 0) +
        stats.get("events_attended", 0)
    )
    if total_activity >= 50 and score >= 70:
        tier = CredibilityTier.AMBASSADOR
    elif total_activity >= 30 and score >= 45:
        tier = CredibilityTier.LOCAL_GUIDE
    elif total_activity >= 15 and score >= 25:
        tier = CredibilityTier.TRUSTED
    elif total_activity >= 5:
        tier = CredibilityTier.REGULAR
    else:
        tier = CredibilityTier.NEW
    return score, tier

class ActivityType(str, Enum):
    CHECKIN = "checkin"
    REVIEW = "review"
    DEAL_POSTED = "deal_posted"
    EVENT_CREATED = "event_created"
    BUSINESS_CLAIMED = "business_claimed"
    MILESTONE = "milestone"
    USER_POST = "user_post"

class ActivityFeedItem(BaseModel):
    id: str
    activity_type: ActivityType
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_credibility_tier: Optional[CredibilityTier] = None
    business_id: str
    business_name: str
    business_category: Optional[str] = None
    title: str
    description: Optional[str] = None
    likes: int = 0
    comments: int = 0
    created_at: datetime
    class Config:
        from_attributes = True

class ActivityFeedCreate(BaseModel):
    activity_type: ActivityType
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    business_id: str
    business_name: str
    business_category: Optional[str] = None
    title: str
    description: Optional[str] = None

class OwnerEventCreate(BaseModel):
    business_id: str
    title: str = Field(..., min_length=3, max_length=120)
    description: str = Field(..., min_length=8, max_length=600)
    start_time: datetime
    end_time: datetime
    image_url: Optional[str] = Field(None, max_length=500)

class OwnerEvent(BaseModel):
    id: str
    business_id: str
    title: str
    description: str
    start_time: datetime
    end_time: datetime
    created_at: datetime
    image_url: Optional[str] = None
    business_name: Optional[str] = None
    business_category: Optional[str] = None
    business_image_url: Optional[str] = None

    class Config:
        from_attributes = True

class BusinessActivityStatus(BaseModel):
    business_id: str
    is_active_today: bool = False
    checkins_today: int = 0
    checkins_this_week: int = 0
    last_checkin_at: Optional[datetime] = None
    recent_activity_count: int = 0
    trending_score: float = 0.0
    class Config:
        from_attributes = True
