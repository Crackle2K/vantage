from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum

class SubscriptionTier(str, Enum):
    FREE = "free"
    STARTER = "starter"
    PRO = "pro"
    PREMIUM = "premium"

class BillingCycle(str, Enum):
    MONTHLY = "monthly"
    YEARLY = "yearly"

TIER_FEATURES = {
    SubscriptionTier.FREE: {
        "can_claim_business": True,
        "can_edit_profile": True,
        "can_respond_reviews": True,
        "max_deals": 1,
        "can_post_events": False,
        "can_boost_visibility": False,
        "analytics_access": False,
        "featured_placement": False,
        "priority_support": False,
        "activity_feed_badge": False,
        "monthly_price": 0,
        "yearly_price": 0,
    },
    SubscriptionTier.STARTER: {
        "can_claim_business": True,
        "can_edit_profile": True,
        "can_respond_reviews": True,
        "max_deals": 5,
        "can_post_events": False,
        "can_boost_visibility": False,
        "analytics_access": True,
        "featured_placement": False,
        "priority_support": False,
        "activity_feed_badge": True,
        "monthly_price": 9.99,
        "yearly_price": 95.90,
    },
    SubscriptionTier.PRO: {
        "can_claim_business": True,
        "can_edit_profile": True,
        "can_respond_reviews": True,
        "max_deals": 20,
        "can_post_events": True,
        "can_boost_visibility": True,
        "analytics_access": True,
        "featured_placement": False,
        "priority_support": True,
        "activity_feed_badge": True,
        "monthly_price": 19.99,
        "yearly_price": 191.90,
    },
    SubscriptionTier.PREMIUM: {
        "can_claim_business": True,
        "can_edit_profile": True,
        "can_respond_reviews": True,
        "max_deals": -1,
        "can_post_events": True,
        "can_boost_visibility": True,
        "analytics_access": True,
        "featured_placement": True,
        "priority_support": True,
        "activity_feed_badge": True,
        "monthly_price": 49.99,
        "yearly_price": 479.90,
    },
}

class Subscription(BaseModel):
    id: str
    user_id: str
    business_id: str
    tier: SubscriptionTier = SubscriptionTier.FREE
    billing_cycle: BillingCycle = BillingCycle.MONTHLY
    status: str = "active"
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None
    stripe_customer_id: Optional[str] = None
    stripe_subscription_id: Optional[str] = None
    stripe_price_id: Optional[str] = None
    billing_provider: str = "stripe"

    class Config:
        from_attributes = True

class SubscriptionCreate(BaseModel):
    business_id: str
    tier: SubscriptionTier
    billing_cycle: BillingCycle = BillingCycle.MONTHLY

class SubscriptionUpdate(BaseModel):
    tier: Optional[SubscriptionTier] = None
    billing_cycle: Optional[BillingCycle] = None
    cancel_at_period_end: Optional[bool] = None

class TierInfo(BaseModel):
    tier: SubscriptionTier
    name: str
    description: str
    monthly_price: float
    yearly_price: float
    features: List[str]
    highlighted: bool = False

TIER_DISPLAY = [
    TierInfo(
        tier=SubscriptionTier.FREE,
        name="Free",
        description="Get found by your community",
        monthly_price=0,
        yearly_price=0,
        features=[
            "Claim your business listing",
            "Edit business profile",
            "Respond to reviews",
            "1 active deal",
        ],
    ),
    TierInfo(
        tier=SubscriptionTier.STARTER,
        name="Basic",
        description="Understand your customers",
        monthly_price=9.99,
        yearly_price=95.90,
        features=[
            "Everything in Free",
            "Basic analytics dashboard",
            "Up to 5 active deals",
            "\"Active Business\" badge",
            "Weekly performance report",
        ],
    ),
    TierInfo(
        tier=SubscriptionTier.PRO,
        name="Standard",
        description="Grow your local presence",
        monthly_price=19.99,
        yearly_price=191.90,
        features=[
            "Everything in Basic",
            "Post community events",
            "Visibility boosts",
            "Full analytics & insights",
            "Up to 20 active deals",
            "Priority support",
        ],
        highlighted=True,
    ),
    TierInfo(
        tier=SubscriptionTier.PREMIUM,
        name="Premium",
        description="Dominate your neighborhood",
        monthly_price=49.99,
        yearly_price=479.90,
        features=[
            "Everything in Standard",
            "Featured placement in search",
            "Unlimited deals",
            "Advanced customer insights",
            "Dedicated account manager",
        ],
    ),
]
