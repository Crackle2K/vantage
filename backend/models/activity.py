"""Activity, check-in, credibility, and event domain models.

Defines models for user check-ins, credibility scoring, the activity feed,
owner-posted events, and business activity status. Also contains the
``calculate_credibility_score`` function that maps user activity statistics
to a numeric score and tier.
"""
from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class CheckInStatus(str, Enum):
    """Verification level for a user check-in."""
    SELF_REPORTED = "self_reported"
    GEO_VERIFIED = "geo_verified"
    RECEIPT_VERIFIED = "receipt_verified"
    COMMUNITY_CONFIRMED = "community_confirmed"

class CheckIn(BaseModel):
    """Full check-in model returned in API responses.

    Attributes:
        id (str): Unique check-in identifier.
        user_id (str): ID of the user who checked in.
        business_id (str): ID of the business.
        status (CheckInStatus): Verification status.
        latitude/longitude (Optional[float]): User's location at check-in.
        distance_from_business (Optional[float]): Meters from the business.
        note (Optional[str]): User note (max 200 characters).
        photo_url (Optional[str]): Photo attachment URL.
        confirmations (int): Number of community confirmations.
        confirmed_by (List[str]): IDs of users who confirmed this check-in.
        created_at (datetime): Check-in timestamp.
    """
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
    """Request body for submitting a check-in.

    Attributes:
        business_id (str): ID of the business to check in to.
        latitude (Optional[float]): User's latitude (-90 to 90).
        longitude (Optional[float]): User's longitude (-180 to 180).
        note (Optional[str]): Optional note (max 200 characters).
    """
    business_id: str
    latitude: Optional[float] = Field(None, ge=-90, le=90)
    longitude: Optional[float] = Field(None, ge=-180, le=180)
    note: Optional[str] = Field(None, max_length=200)

class CredibilityTier(str, Enum):
    """Credibility tier levels based on accumulated user activity."""
    NEW = "new"
    REGULAR = "regular"
    TRUSTED = "trusted"
    LOCAL_GUIDE = "local_guide"
    AMBASSADOR = "ambassador"

class UserCredibility(BaseModel):
    """User credibility statistics and tier returned in API responses.

    Attributes:
        user_id (str): ID of the user.
        total_checkins (int): Total check-in count.
        verified_checkins (int): Verified check-in count.
        total_reviews (int): Total review count.
        helpful_votes (int): Helpful vote count.
        confirmations_given/received (int): Community confirmation counts.
        events_attended (int): Event attendance count.
        credibility_score (float): Computed score (0-100).
        tier (CredibilityTier): Current credibility tier.
        is_verified_local (bool): Whether the user is a verified local.
        joined_at/last_active (Optional[datetime]): Activity timestamps.
    """
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
    """Compute a credibility score (0-100) and tier from user activity statistics.

    Each activity type contributes a weighted amount: check-ins (2 pts),
    verified check-ins (3 pts), reviews (3 pts), helpful votes (1 pt),
    confirmations given (1 pt), confirmations received (2 pts), and
    events attended (3 pts). The score is capped at 100.

    Args:
        stats (dict): Activity counts with keys ``total_checkins``,
            ``verified_checkins``, ``total_reviews``, ``helpful_votes``,
            ``confirmations_given``, ``confirmations_received``,
            ``events_attended``.

    Returns:
        tuple[float, CredibilityTier]: The numeric score and corresponding tier.
    """
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
    """Types of activities that appear in the activity feed."""
    CHECKIN = "checkin"
    REVIEW = "review"
    DEAL_POSTED = "deal_posted"
    EVENT_CREATED = "event_created"
    BUSINESS_CLAIMED = "business_claimed"
    MILESTONE = "milestone"
    USER_POST = "user_post"

class ActivityFeedItem(BaseModel):
    """An item in the community activity feed.

    Attributes:
        id (str): Unique activity item identifier.
        activity_type (ActivityType): Type of activity.
        user_id/user_name (Optional[str]): The acting user.
        user_credibility_tier (Optional[CredibilityTier]): User's credibility tier.
        business_id (str): Associated business ID.
        business_name (str): Business display name.
        business_category (Optional[str]): Business category.
        title (str): Activity headline.
        description (Optional[str]): Activity detail text.
        likes (int): Number of likes.
        comments (int): Number of comments.
        created_at (datetime): Activity timestamp.
    """
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
    """Request body for creating a new activity feed entry.

    Attributes:
        activity_type (ActivityType): Type of activity.
        user_id (Optional[str]): ID of the acting user.
        business_id (str): Associated business ID.
        business_name (str): Business display name.
        business_category (Optional[str]): Business category.
        title (str): Activity headline.
        description (Optional[str]): Activity detail text.
    """
    activity_type: ActivityType
    user_id: Optional[str] = None
    user_name: Optional[str] = None
    business_id: str
    business_name: str
    business_category: Optional[str] = None
    title: str
    description: Optional[str] = None

class OwnerEventCreate(BaseModel):
    """Request body for a business owner to create an event.

    Attributes:
        business_id (str): ID of the business posting the event.
        title (str): Event title (3-120 characters).
        description (str): Event description (8-600 characters).
        start_time (datetime): Event start time.
        end_time (datetime): Event end time.
        image_url (Optional[str]): Event image URL (max 500 characters).
    """
    business_id: str
    title: str = Field(..., min_length=3, max_length=120)
    description: str = Field(..., min_length=8, max_length=600)
    start_time: datetime
    end_time: datetime
    image_url: Optional[str] = Field(None, max_length=500)

class OwnerEvent(BaseModel):
    """Full event model returned in API responses.

    Attributes:
        id (str): Unique event identifier.
        business_id (str): ID of the hosting business.
        title (str): Event title.
        description (str): Event description.
        start_time (datetime): Event start time.
        end_time (datetime): Event end time.
        created_at (datetime): When the event was posted.
        image_url (Optional[str]): Event image URL.
        business_name/category/image_url: Enriched business details.
    """
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
    """Summary of a business's recent activity levels.

    Attributes:
        business_id (str): Business ID.
        is_active_today (bool): Whether there were check-ins today.
        checkins_today (int): Today's check-in count.
        checkins_this_week (int): This week's check-in count.
        last_checkin_at (Optional[datetime]): Timestamp of the most recent check-in.
        recent_activity_count (int): Recent activity count.
        trending_score (float): Computed trending score.
    """
    business_id: str
    is_active_today: bool = False
    checkins_today: int = 0
    checkins_this_week: int = 0
    last_checkin_at: Optional[datetime] = None
    recent_activity_count: int = 0
    trending_score: float = 0.0
    class Config:
        from_attributes = True
