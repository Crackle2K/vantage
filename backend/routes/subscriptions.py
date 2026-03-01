from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId

from models.subscription import (
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

def _oid(raw_id: str, label: str) -> ObjectId:
    if not ObjectId.is_valid(raw_id):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return ObjectId(raw_id)

def _sub(doc: dict | None) -> dict | None:
    if doc:
        doc["id"] = str(doc.pop("_id"))
    return doc

def _period_end(now: datetime, cycle: BillingCycle) -> datetime:
    return now + (timedelta(days=365) if cycle == BillingCycle.YEARLY else timedelta(days=30))

async def _owned_business_or_404(business_id: str, current_user: User) -> dict:
    businesses = get_businesses_collection()
    business = await businesses.find_one({"_id": _oid(business_id, "business ID")})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    if str(business.get("owner_id")) != current_user.id:
        raise HTTPException(status_code=403, detail="You can only subscribe for businesses you own")
    return business

@router.get("/subscriptions/tiers")
async def get_tier_info():
    return [tier.dict() for tier in TIER_DISPLAY]

@router.get("/subscriptions/features/{tier}")
async def get_tier_features(tier: SubscriptionTier):
    features = TIER_FEATURES.get(tier)
    if not features:
        raise HTTPException(status_code=404, detail="Tier not found")
    return {"tier": tier, "features": features}

@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
async def create_subscription(
    data: SubscriptionCreate,
    current_user: User = Depends(get_current_user),
):
    subs = get_subscriptions_collection()

    if current_user.role != "business_owner":
        raise HTTPException(status_code=403, detail="Only business owners can subscribe")

    business = await _owned_business_or_404(data.business_id, current_user)

    if not business.get("is_claimed"):
        raise HTTPException(
            status_code=400,
            detail="Business must be claimed before subscribing. Submit a claim first.",
        )

    now = datetime.utcnow()
    sub_doc = {
        "user_id": current_user.id,
        "business_id": data.business_id,
        "tier": data.tier,
        "billing_cycle": data.billing_cycle,
        "status": "active",
        "current_period_start": now,
        "current_period_end": _period_end(now, data.billing_cycle),
        "cancel_at_period_end": False,
        "created_at": now,
        "updated_at": now,
    }

    await subs.delete_many({"business_id": data.business_id, "user_id": current_user.id})

    result = await subs.insert_one(sub_doc)
    created = await subs.find_one({"_id": result.inserted_id})
    return _sub(created)

@router.get("/subscriptions/my")
async def get_my_subscriptions(current_user: User = Depends(get_current_user)):
    subs = get_subscriptions_collection()
    cursor = subs.find({"user_id": current_user.id}).sort("created_at", -1)
    results = await cursor.to_list(length=50)
    return [_sub(item) for item in results]

@router.get("/subscriptions/business/{business_id}")
async def get_business_subscription(
    business_id: str,
    current_user: User = Depends(get_current_user),
):
    subs = get_subscriptions_collection()

    sub = await subs.find_one(
        {
            "business_id": business_id,
            "user_id": current_user.id,
            "status": "active",
        }
    )

    if not sub:
        return {
            "tier": SubscriptionTier.FREE,
            "features": TIER_FEATURES[SubscriptionTier.FREE],
            "status": "none",
        }

    features = TIER_FEATURES.get(sub["tier"], TIER_FEATURES[SubscriptionTier.FREE])
    result = _sub(sub)
    result["features"] = features
    return result

@router.patch("/subscriptions/{sub_id}")
async def update_subscription(
    sub_id: str,
    data: SubscriptionUpdate,
    current_user: User = Depends(get_current_user),
):
    subs = get_subscriptions_collection()
    sub_key = _oid(sub_id, "subscription ID")
    sub = await subs.find_one({"_id": sub_key})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    if sub["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your subscription")

    update = {k: v for k, v in data.dict(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.utcnow()

    await subs.update_one({"_id": sub_key}, {"$set": update})

    updated = await subs.find_one({"_id": sub_key})
    return _sub(updated)

@router.post("/subscriptions/{sub_id}/cancel")
async def cancel_subscription(
    sub_id: str,
    current_user: User = Depends(get_current_user),
):
    subs = get_subscriptions_collection()
    sub_key = _oid(sub_id, "subscription ID")
    sub = await subs.find_one({"_id": sub_key})
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    if sub["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your subscription")

    await subs.update_one(
        {"_id": sub_key},
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
