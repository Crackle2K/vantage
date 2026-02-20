"""
Activity Model Schema
Community-Powered Trust Layer for Vantage

This is what makes Vantage different from Google/TikTok/Instagram:
- Real-time visit verification (check-ins)
- Community credibility scoring
- "Active Today" signals
- Live local activity feed

Instead of optimizing for attention/ad revenue, we optimize for
LOCAL TRUST and SMALL BUSINESS GROWTH.
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


# ── Check-Ins & Visit Verification ──────────────────────────────────

class CheckInStatus(str, Enum):
    """Verification status of a check-in"""
    SELF_REPORTED = "self_reported"     # User says they visited
    GEO_VERIFIED = "geo_verified"      # GPS confirms within radius
    RECEIPT_VERIFIED = "receipt_verified"  # Receipt/photo proof
    COMMUNITY_CONFIRMED = "community_confirmed"  # Others confirmed


class CheckIn(BaseModel):
    """A user checking in at a business — visit verification"""
    id: str
    user_id: str
    business_id: str
    status: CheckInStatus = CheckInStatus.SELF_REPORTED
    
    # Location verification
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    distance_from_business: Optional[float] = None  # meters
    
    # Optional context
    note: Optional[str] = Field(None, max_length=200)
    photo_url: Optional[str] = None
    
    # Community confirmations
    confirmations: int = 0          # Other users confirming this visit
    confirmed_by: List[str] = Field(default_factory=list)  # user_ids
    
    created_at: datetime
    
    class Config:
        from_attributes = True


class CheckInCreate(BaseModel):
    """Schema for creating a check-in"""
    business_id: str
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    note: Optional[str] = Field(None, max_length=200)


# ── Community Credibility Score ─────────────────────────────────────

class CredibilityTier(str, Enum):
    """User credibility tiers based on community activity"""
    NEW = "new"               # < 5 activities
    REGULAR = "regular"       # 5-20 activities
    TRUSTED = "trusted"       # 20-50 activities + good standing
    LOCAL_GUIDE = "local_guide"  # 50+ activities, high confirmation rate
    AMBASSADOR = "ambassador"    # Top community contributors


class UserCredibility(BaseModel):
    """Community credibility score for a user"""
    user_id: str
    
    # Activity counts
    total_checkins: int = 0
    verified_checkins: int = 0
    total_reviews: int = 0
    helpful_votes: int = 0           # Others found their reviews helpful
    confirmations_given: int = 0     # Times they confirmed others
    confirmations_received: int = 0  # Times others confirmed them
    events_attended: int = 0
    
    # Computed scores
    credibility_score: float = Field(default=0.0, ge=0, le=100)
    tier: CredibilityTier = CredibilityTier.NEW
    
    # Trust signals
    is_verified_local: bool = False  # Lives in the area
    joined_at: Optional[datetime] = None
    last_active: Optional[datetime] = None
    
    class Config:
        from_attributes = True


def calculate_credibility_score(stats: dict) -> tuple[float, CredibilityTier]:
    """
    Calculate credibility score from user activity.
    Returns (score, tier) tuple.
    
    Scoring breakdown:
    - Check-ins: 2 pts each (verified: 5 pts)
    - Reviews: 3 pts each
    - Helpful votes: 1 pt each
    - Confirmations given: 1 pt each
    - Confirmations received: 2 pts each
    - Events attended: 3 pts each
    
    Max meaningful score ~100 for very active users.
    """
    score = 0.0
    score += stats.get("total_checkins", 0) * 2
    score += stats.get("verified_checkins", 0) * 3  # Bonus for verified
    score += stats.get("total_reviews", 0) * 3
    score += stats.get("helpful_votes", 0) * 1
    score += stats.get("confirmations_given", 0) * 1
    score += stats.get("confirmations_received", 0) * 2
    score += stats.get("events_attended", 0) * 3
    
    # Cap at 100
    score = min(score, 100.0)
    
    # Determine tier
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


# ── Activity Feed ───────────────────────────────────────────────────

class ActivityType(str, Enum):
    """Types of activities in the local feed"""
    CHECKIN = "checkin"           # Someone checked in
    REVIEW = "review"            # New review posted
    DEAL_POSTED = "deal_posted"  # Business posted a deal
    EVENT_CREATED = "event_created"  # Business created an event
    BUSINESS_CLAIMED = "business_claimed"  # Someone claimed a business
    MILESTONE = "milestone"      # Business hit a milestone (100 reviews, etc.)


class ActivityFeedItem(BaseModel):
    """An item in the local activity feed"""
    id: str
    activity_type: ActivityType
    
    # Who did it
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    user_credibility_tier: Optional[CredibilityTier] = None
    
    # What business
    business_id: str
    business_name: str
    business_category: Optional[str] = None
    
    # Activity details
    title: str                    # "Sarah checked in at Joe's Coffee"
    description: Optional[str] = None
    
    # Engagement
    likes: int = 0
    comments: int = 0
    
    created_at: datetime
    
    class Config:
        from_attributes = True


class ActivityFeedCreate(BaseModel):
    """Schema for creating an activity feed item (internal use)"""
    activity_type: ActivityType
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    business_id: str
    business_name: str
    business_category: Optional[str] = None
    title: str
    description: Optional[str] = None


# ── "Active Today" Business Signal ──────────────────────────────────

class BusinessActivityStatus(BaseModel):
    """Real-time activity status for a business"""
    business_id: str
    is_active_today: bool = False
    checkins_today: int = 0
    checkins_this_week: int = 0
    last_checkin_at: Optional[datetime] = None
    recent_activity_count: int = 0      # Activities in last 24h
    trending_score: float = 0.0         # How "hot" the business is right now
    
    class Config:
        from_attributes = True
