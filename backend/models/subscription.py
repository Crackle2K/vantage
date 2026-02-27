"""
Subscription Model Schema
Defines subscription tiers for business owners on Vantage

Revenue Model:
- Users (community members) are FREE — always
- Business owners pay for premium features via subscription tiers
- Seed/public businesses are free listings from our database
- Claimed businesses unlock interaction, analytics, events, boosts
"""

from pydantic import BaseModel, Field
from typing import Optional, List
from datetime import datetime
from enum import Enum


class SubscriptionTier(str, Enum):
    """Subscription tiers for business owners"""
    FREE = "free"           # Claimed listing, basic profile
    STARTER = "starter"     # Basic: $9.99/mo — analytics, deal posting
    PRO = "pro"             # Standard: $19.99/mo — events, visibility boosts, priority support
    PREMIUM = "premium"     # Premium: $49.99/mo — everything + featured placement, ad-free


class BillingCycle(str, Enum):
    """Billing cycle options"""
    MONTHLY = "monthly"
    YEARLY = "yearly"       # 20% discount


# Feature flags per tier
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
        "analytics_access": True,         # Basic analytics
        "featured_placement": False,
        "priority_support": False,
        "activity_feed_badge": True,       # "Active Business" badge
        "monthly_price": 9.99,
        "yearly_price": 95.90,            # ~$7.99/mo
    },
    SubscriptionTier.PRO: {
        "can_claim_business": True,
        "can_edit_profile": True,
        "can_respond_reviews": True,
        "max_deals": 20,
        "can_post_events": True,           # Create events
        "can_boost_visibility": True,      # Visibility boosts
        "analytics_access": True,          # Full analytics
        "featured_placement": False,
        "priority_support": True,
        "activity_feed_badge": True,
        "monthly_price": 19.99,
        "yearly_price": 191.90,           # ~$15.99/mo
    },
    SubscriptionTier.PREMIUM: {
        "can_claim_business": True,
        "can_edit_profile": True,
        "can_respond_reviews": True,
        "max_deals": -1,                   # Unlimited
        "can_post_events": True,
        "can_boost_visibility": True,
        "analytics_access": True,          # Full analytics + insights
        "featured_placement": True,        # Top of search results
        "priority_support": True,
        "activity_feed_badge": True,
        "monthly_price": 49.99,
        "yearly_price": 479.90,           # ~$39.99/mo
    },
}


class Subscription(BaseModel):
    """Active subscription for a business owner"""
    id: str
    user_id: str
    business_id: str
    tier: SubscriptionTier = SubscriptionTier.FREE
    billing_cycle: BillingCycle = BillingCycle.MONTHLY
    status: str = "active"  # active, cancelled, past_due, trialing
    current_period_start: datetime
    current_period_end: datetime
    cancel_at_period_end: bool = False
    created_at: datetime
    updated_at: Optional[datetime] = None

    class Config:
        from_attributes = True


class SubscriptionCreate(BaseModel):
    """Schema for creating/upgrading a subscription"""
    business_id: str
    tier: SubscriptionTier
    billing_cycle: BillingCycle = BillingCycle.MONTHLY


class SubscriptionUpdate(BaseModel):
    """Schema for updating subscription"""
    tier: Optional[SubscriptionTier] = None
    billing_cycle: Optional[BillingCycle] = None
    cancel_at_period_end: Optional[bool] = None


class TierInfo(BaseModel):
    """Public-facing tier information for pricing page"""
    tier: SubscriptionTier
    name: str
    description: str
    monthly_price: float
    yearly_price: float
    features: List[str]
    highlighted: bool = False


# Pricing page data
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
