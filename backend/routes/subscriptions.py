"""
Subscription Routes for Vantage
Business owners pay for premium features — users are always free.

Tiers:
  FREE     — Claim listing, basic profile, respond to reviews, 1 deal
  STARTER  — $9/mo — analytics, 5 deals, "Active Business" badge
  PRO      — $29/mo — events, visibility boosts, 20 deals, priority support
  PREMIUM  — $59/mo — featured placement, unlimited deals, advanced insights
"""

from typing import List
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId

from models.subscription import (
    Subscription,
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionTier,
    BillingCycle,
    TIER_FEATURES,
    TIER_DISPLAY,
)
from models.user import User
from models.auth import get_current_user
from database.mongodb import (
    get_subscriptions_collection,
    get_businesses_collection,
)

router = APIRouter()


def sub_helper(doc) -> dict:
    if doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc


# ── Public: Pricing Info ────────────────────────────────────────────

@router.get("/subscriptions/tiers")
async def get_tier_info():
    """
    Public endpoint — returns pricing tiers for the pricing page.
    No auth required.
    """
    return [tier.dict() for tier in TIER_DISPLAY]


@router.get("/subscriptions/features/{tier}")
async def get_tier_features(tier: SubscriptionTier):
    """Get feature flags for a specific tier"""
    features = TIER_FEATURES.get(tier)
    if not features:
        raise HTTPException(status_code=404, detail="Tier not found")
    return {"tier": tier, "features": features}


# ── Subscription Management ────────────────────────────────────────

@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
async def create_subscription(
    data: SubscriptionCreate,
    current_user: User = Depends(get_current_user),
):
    """
    Create or upgrade a subscription for a claimed business.
    - Business must be claimed by the current user
    - Replaces any existing subscription for that business
    """
    subs = get_subscriptions_collection()
    businesses = get_businesses_collection()

    # Must be business_owner
    if current_user.role != "business_owner":
        raise HTTPException(status_code=403, detail="Only business owners can subscribe")

    # Validate business
    if not ObjectId.is_valid(data.business_id):
        raise HTTPException(status_code=400, detail="Invalid business ID")

    business = await businesses.find_one({"_id": ObjectId(data.business_id)})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    # Must own the business
    if str(business.get("owner_id")) != current_user.id:
        raise HTTPException(
            status_code=403,
            detail="You can only subscribe for businesses you own",
        )

    # Check if business is claimed
    if not business.get("is_claimed"):
        raise HTTPException(
            status_code=400,
            detail="Business must be claimed before subscribing. Submit a claim first.",
        )

    # Calculate billing period
    now = datetime.utcnow()
    if data.billing_cycle == BillingCycle.YEARLY:
        period_end = now + timedelta(days=365)
    else:
        period_end = now + timedelta(days=30)

    # Upsert subscription (replace if exists)
    sub_doc = {
        "user_id": current_user.id,
        "business_id": data.business_id,
        "tier": data.tier,
        "billing_cycle": data.billing_cycle,
        "status": "active",
        "current_period_start": now,
        "current_period_end": period_end,
        "cancel_at_period_end": False,
        "created_at": now,
        "updated_at": now,
    }

    # Remove old subscription for this business if any
    await subs.delete_many({"business_id": data.business_id, "user_id": current_user.id})

    result = await subs.insert_one(sub_doc)
    created = await subs.find_one({"_id": result.inserted_id})
    return sub_helper(created)


@router.get("/subscriptions/my")
async def get_my_subscriptions(current_user: User = Depends(get_current_user)):
    """Get all subscriptions for the current user's businesses"""
    subs = get_subscriptions_collection()
    cursor = subs.find({"user_id": current_user.id}).sort("created_at", -1)
    results = await cursor.to_list(length=50)
    return [sub_helper(s) for s in results]


@router.get("/subscriptions/business/{business_id}")
async def get_business_subscription(
    business_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get active subscription for a specific business"""
    subs = get_subscriptions_collection()

    sub = await subs.find_one(
        {
            "business_id": business_id,
            "user_id": current_user.id,
            "status": "active",
        }
    )

    if not sub:
        # Return free tier defaults
        return {
            "tier": SubscriptionTier.FREE,
            "features": TIER_FEATURES[SubscriptionTier.FREE],
            "status": "none",
        }

    features = TIER_FEATURES.get(sub["tier"], TIER_FEATURES[SubscriptionTier.FREE])
    result = sub_helper(sub)
    result["features"] = features
    return result


@router.patch("/subscriptions/{sub_id}")
async def update_subscription(
    sub_id: str,
    data: SubscriptionUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update subscription (change tier, billing cycle, or cancel)"""
    subs = get_subscriptions_collection()

    if not ObjectId.is_valid(sub_id):
        raise HTTPException(status_code=400, detail="Invalid subscription ID")

    sub = await subs.find_one({"_id": ObjectId(sub_id)})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    if sub["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your subscription")

    update = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.utcnow()

    await subs.update_one({"_id": ObjectId(sub_id)}, {"$set": update})

    updated = await subs.find_one({"_id": ObjectId(sub_id)})
    return sub_helper(updated)


@router.post("/subscriptions/{sub_id}/cancel")
async def cancel_subscription(
    sub_id: str,
    current_user: User = Depends(get_current_user),
):
    """Cancel subscription at end of current billing period"""
    subs = get_subscriptions_collection()

    if not ObjectId.is_valid(sub_id):
        raise HTTPException(status_code=400, detail="Invalid subscription ID")

    sub = await subs.find_one({"_id": ObjectId(sub_id)})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    if sub["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your subscription")

    await subs.update_one(
        {"_id": ObjectId(sub_id)},
        {
            "$set": {
                "cancel_at_period_end": True,
                "updated_at": datetime.utcnow(),
            }
        },
    )

    return {
        "status": "cancelling",
        "message": f"Subscription will end on {sub['current_period_end'].isoformat()}",
    }
