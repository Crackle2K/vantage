"""Subscription and billing routes.

Provides endpoints for retrieving tier information, creating subscriptions
(with optional Stripe checkout sessions), viewing and updating active
subscriptions, and scheduling cancellations.
"""
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, status, Depends

from backend.models.subscription import (
    SubscriptionCreate,
    SubscriptionUpdate,
    SubscriptionTier,
    BillingCycle,
    TIER_FEATURES,
    TIER_DISPLAY,
)
from backend.models.user import User
from backend.models.auth import get_current_user
from backend.repositories.factory import (
    get_subscriptions_read_repository,
    get_subscriptions_write_repositories,
)
from backend.services.stripe_service import create_checkout_session, stripe_is_configured
from backend.config import FRONTEND_URL

router = APIRouter()

def _period_end(now: datetime, cycle: BillingCycle) -> datetime:
    return now + (timedelta(days=365) if cycle == BillingCycle.YEARLY else timedelta(days=30))

async def _owned_business_or_404(business_id: str, current_user: User) -> dict:
    read_repo = get_subscriptions_read_repository()
    business = await read_repo.get_business(business_id)
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    if str(business.get("owner_id")) != current_user.id:
        raise HTTPException(status_code=403, detail="You can only subscribe for businesses you own")
    return business

@router.get("/subscriptions/tiers")
async def get_tier_info():
    """Return display-ready tier information for the pricing page (GET /api/subscriptions/tiers).

    Returns:
        list[dict]: Serialized ``TierInfo`` objects for each plan tier.
    """
    return [tier.model_dump() for tier in TIER_DISPLAY]

@router.get("/subscriptions/features/{tier}")
async def get_tier_features(tier: SubscriptionTier):
    """Return the feature matrix for a specific tier (GET /api/subscriptions/features/{tier}).

    Returns:
        dict: ``{"tier": str, "features": dict}``
    """
    features = TIER_FEATURES.get(tier)
    if not features:
        raise HTTPException(status_code=404, detail="Tier not found")
    return {"tier": tier, "features": features}

@router.post("/subscriptions", status_code=status.HTTP_201_CREATED)
async def create_subscription(
    data: SubscriptionCreate,
    current_user: User = Depends(get_current_user),
):
    """Subscribe a business to a plan tier (POST /api/subscriptions).

    For paid tiers with Stripe configured, creates a Stripe Checkout
    session and returns the checkout URL. Otherwise, creates the
    subscription record directly.

    Returns:
        dict: Subscription details or ``{"checkout_url": str, "status": "checkout_required"}``.
    """
    write_repos = get_subscriptions_write_repositories()

    if current_user.role != "business_owner":
        raise HTTPException(status_code=403, detail="Only business owners can subscribe")

    business = await _owned_business_or_404(data.business_id, current_user)

    if not business.get("is_claimed"):
        raise HTTPException(
            status_code=400,
            detail="Business must be claimed before subscribing. Submit a claim first.",
        )

    if stripe_is_configured():
        price_map = {
            SubscriptionTier.FREE: 0,
            SubscriptionTier.STARTER: 9.99,
            SubscriptionTier.PRO: 19.99,
            SubscriptionTier.PREMIUM: 49.99,
        }
        amount = price_map.get(data.tier, 0)
        if amount <= 0:
            return {
                "status": "no_payment_required",
                "tier": data.tier,
            }

        recurring_interval = "year" if data.billing_cycle == BillingCycle.YEARLY else "month"
        session = create_checkout_session(
            mode="subscription",
            success_url=f"{FRONTEND_URL.rstrip('/')}/pricing?checkout=success",
            cancel_url=f"{FRONTEND_URL.rstrip('/')}/pricing?checkout=cancel",
            client_reference_id=current_user.id,
            customer_email=current_user.email,
            line_items=[
                {
                    "quantity": 1,
                    "price_data": {
                        "currency": "usd",
                        "unit_amount": int(amount * 100),
                        "recurring": {"interval": recurring_interval},
                        "product_data": {
                            "name": f"Vantage {data.tier.value.title()}",
                            "description": f"{data.tier.value.title()} plan for {business.get('name', 'your business')}",
                        },
                    },
                }
            ],
        )
        return {
            "checkout_url": session.url,
            "checkout_session_id": session.id,
            "status": "checkout_required",
        }

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

    created = None
    for index, repo in enumerate(write_repos):
        result = await repo.create_or_replace(sub_doc)
        if index == 0:
            created = result

    return created

@router.get("/subscriptions/my")
async def get_my_subscriptions(current_user: User = Depends(get_current_user)):
    """List the current user's subscriptions (GET /api/subscriptions/my).

    Returns:
        list[dict]: Subscription records for the authenticated user.
    """
    read_repo = get_subscriptions_read_repository()
    return await read_repo.list_for_user(current_user.id, limit=50)

@router.get("/subscriptions/business/{business_id}")
async def get_business_subscription(
    business_id: str,
    current_user: User = Depends(get_current_user),
):
    """Get the active subscription for a specific business (GET /api/subscriptions/business/{business_id}).

    Returns the FREE tier with feature details if no active subscription exists.

    Returns:
        dict: Subscription record with ``features`` key, or the FREE tier default.
    """
    read_repo = get_subscriptions_read_repository()

    sub = await read_repo.get_active_for_business_user(business_id, current_user.id)

    if not sub:
        return {
            "tier": SubscriptionTier.FREE,
            "features": TIER_FEATURES[SubscriptionTier.FREE],
            "status": "none",
        }

    features = TIER_FEATURES.get(sub["tier"], TIER_FEATURES[SubscriptionTier.FREE])
    result = dict(sub)
    result["features"] = features
    return result

@router.patch("/subscriptions/{sub_id}")
async def update_subscription(
    sub_id: str,
    data: SubscriptionUpdate,
    current_user: User = Depends(get_current_user),
):
    """Update a subscription's tier or billing cycle (PATCH /api/subscriptions/{sub_id}).

    Only the subscription owner may update it.

    Returns:
        dict: The updated subscription record.
    """
    read_repo = get_subscriptions_read_repository()
    write_repos = get_subscriptions_write_repositories()

    sub = await read_repo.get_by_id(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    if sub["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your subscription")

    update = {k: v for k, v in data.model_dump(exclude_unset=True).items() if v is not None}
    if not update:
        raise HTTPException(status_code=400, detail="No fields to update")

    update["updated_at"] = datetime.utcnow()

    updated = None
    for index, repo in enumerate(write_repos):
        result = await repo.update_by_id(sub_id, update)
        if index == 0:
            updated = result

    return updated

@router.post("/subscriptions/{sub_id}/cancel")
async def cancel_subscription(
    sub_id: str,
    current_user: User = Depends(get_current_user),
):
    """Schedule a subscription for cancellation at period end (POST /api/subscriptions/{sub_id}/cancel).

    Sets ``cancel_at_period_end`` to True. The subscription remains active
    until ``current_period_end``.

    Returns:
        dict: ``{"status": "cancelling", "message": str}``
    """
    read_repo = get_subscriptions_read_repository()
    write_repos = get_subscriptions_write_repositories()

    sub = await read_repo.get_by_id(sub_id)
    if not sub:
        raise HTTPException(status_code=404, detail="Subscription not found")

    if sub["user_id"] != current_user.id:
        raise HTTPException(status_code=403, detail="Not your subscription")

    update = {
        "cancel_at_period_end": True,
        "updated_at": datetime.utcnow(),
    }

    for repo in write_repos:
        await repo.update_by_id(sub_id, update)

    return {
        "status": "cancelling",
        "message": f"Subscription will end on {sub['current_period_end'].isoformat()}",
    }
