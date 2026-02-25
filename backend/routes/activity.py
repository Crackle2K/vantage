"""
Activity & Check-In Routes for Vantage
Community-Powered Trust Layer

This is the core differentiator from Google/TikTok/Instagram:
- Check-ins with optional geo-verification
- Community confirmations (others vouch you were there)
- Live activity feed (what's happening around you NOW)
- "Active Today" business signals
- User credibility scoring

We optimize for LOCAL TRUST, not attention or ad revenue.
"""

import math
from typing import List, Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId
from pydantic import BaseModel, Field

from models.activity import (
    CheckInCreate,
    CheckInStatus,
    ActivityType,
    CredibilityTier,
    calculate_credibility_score,
)
from models.user import User
from models.auth import get_current_user
from database.mongodb import (
    get_checkins_collection,
    get_activity_feed_collection,
    get_businesses_collection,
    get_credibility_collection,
    get_reviews_collection,
)

router = APIRouter()


class ActivityCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)


class ActivityComment(BaseModel):
    id: str
    user_id: str
    user_name: str
    content: str
    created_at: datetime


def checkin_helper(doc) -> dict:
    if doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc


def activity_helper(doc) -> dict:
    if doc:
        doc["id"] = str(doc["_id"])
        del doc["_id"]
    return doc


# ── Check-Ins ───────────────────────────────────────────────────────

CHECKIN_RADIUS_METERS = 200  # Max distance for geo-verification


def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two coordinates in meters"""
    R = 6371000  # Earth radius in meters
    phi1, phi2 = math.radians(lat1), math.radians(lat2)
    dphi = math.radians(lat2 - lat1)
    dlambda = math.radians(lon2 - lon1)
    a = (
        math.sin(dphi / 2) ** 2
        + math.cos(phi1) * math.cos(phi2) * math.sin(dlambda / 2) ** 2
    )
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.post("/checkins", status_code=status.HTTP_201_CREATED)
async def create_checkin(
    data: CheckInCreate,
    current_user: User = Depends(get_current_user),
):
    """
    Check in at a business.
    - Anyone can self-report
    - If lat/lng provided and business has location, we auto-verify distance
    - Feeds into activity feed + business "Active Today" signal
    """
    checkins = get_checkins_collection()
    businesses = get_businesses_collection()
    activity_feed = get_activity_feed_collection()
    credibility = get_credibility_collection()

    # Validate business
    if not ObjectId.is_valid(data.business_id):
        raise HTTPException(status_code=400, detail="Invalid business ID")

    business = await businesses.find_one({"_id": ObjectId(data.business_id)})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    # Rate limit: max 1 checkin per business per user per 4 hours
    four_hours_ago = datetime.utcnow() - timedelta(hours=4)
    recent = await checkins.find_one(
        {
            "user_id": current_user.id,
            "business_id": data.business_id,
            "created_at": {"$gte": four_hours_ago},
        }
    )
    if recent:
        raise HTTPException(
            status_code=400,
            detail="You already checked in here recently. Try again in a few hours.",
        )

    # Determine verification status
    check_status = CheckInStatus.SELF_REPORTED
    distance = None

    if data.latitude is not None and data.longitude is not None:
        biz_loc = business.get("location")
        if biz_loc and biz_loc.get("coordinates"):
            biz_lng, biz_lat = biz_loc["coordinates"]
            distance = haversine_distance(
                data.latitude, data.longitude, biz_lat, biz_lng
            )
            if distance <= CHECKIN_RADIUS_METERS:
                check_status = CheckInStatus.GEO_VERIFIED

    # Create checkin
    checkin_doc = {
        "user_id": current_user.id,
        "business_id": data.business_id,
        "status": check_status,
        "latitude": data.latitude,
        "longitude": data.longitude,
        "distance_from_business": round(distance, 1) if distance else None,
        "note": data.note,
        "photo_url": None,
        "confirmations": 0,
        "confirmed_by": [],
        "created_at": datetime.utcnow(),
    }

    result = await checkins.insert_one(checkin_doc)

    # Update business "Active Today" signal
    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_checkins = await checkins.count_documents(
        {"business_id": data.business_id, "created_at": {"$gte": today_start}}
    )

    await businesses.update_one(
        {"_id": ObjectId(data.business_id)},
        {
            "$set": {
                "is_active_today": True,
                "checkins_today": today_checkins,
                "last_activity_at": datetime.utcnow(),
            }
        },
    )

    # Post to activity feed
    await activity_feed.insert_one(
        {
            "activity_type": ActivityType.CHECKIN,
            "user_id": current_user.id,
            "user_name": current_user.name,
            "business_id": data.business_id,
            "business_name": business.get("name", "Unknown"),
            "business_category": business.get("category"),
            "title": f"{current_user.name} checked in at {business.get('name', 'a business')}",
            "description": data.note,
            "likes": 0,
            "comments": 0,
            "created_at": datetime.utcnow(),
        }
    )

    # Update user credibility
    await _update_user_credibility(current_user.id)

    created = await checkins.find_one({"_id": result.inserted_id})
    return checkin_helper(created)


@router.post("/checkins/{checkin_id}/confirm")
async def confirm_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user),
):
    """
    Community confirmation — vouch that someone was actually there.
    Can't confirm your own check-ins.
    """
    checkins = get_checkins_collection()

    if not ObjectId.is_valid(checkin_id):
        raise HTTPException(status_code=400, detail="Invalid checkin ID")

    checkin = await checkins.find_one({"_id": ObjectId(checkin_id)})
    if not checkin:
        raise HTTPException(status_code=404, detail="Check-in not found")

    if checkin["user_id"] == current_user.id:
        raise HTTPException(status_code=400, detail="Can't confirm your own check-in")

    if current_user.id in checkin.get("confirmed_by", []):
        raise HTTPException(status_code=400, detail="Already confirmed")

    # Add confirmation
    await checkins.update_one(
        {"_id": ObjectId(checkin_id)},
        {
            "$inc": {"confirmations": 1},
            "$push": {"confirmed_by": current_user.id},
        },
    )

    # If 3+ confirmations, upgrade to community_confirmed
    if checkin.get("confirmations", 0) + 1 >= 3:
        await checkins.update_one(
            {"_id": ObjectId(checkin_id)},
            {"$set": {"status": CheckInStatus.COMMUNITY_CONFIRMED}},
        )

    # Update credibility for both users
    await _update_user_credibility(checkin["user_id"])
    await _update_user_credibility(current_user.id)

    return {"status": "confirmed"}


# ── Activity Feed ───────────────────────────────────────────────────

@router.get("/feed")
async def get_activity_feed(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    city: Optional[str] = None,
    activity_type: Optional[str] = None,
):
    """
    Live local activity feed — what's happening around you.
    Shows check-ins, new reviews, deals, events, claims.
    Sorted by recency.
    """
    activity_feed = get_activity_feed_collection()

    query = {}
    if activity_type:
        query["activity_type"] = activity_type

    skip = (page - 1) * page_size
    total = await activity_feed.count_documents(query)
    cursor = (
        activity_feed.find(query)
        .sort("created_at", -1)
        .skip(skip)
        .limit(page_size)
    )
    items = await cursor.to_list(length=page_size)

    return {
        "items": [activity_helper(item) for item in items],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": skip + page_size < total,
    }


@router.post("/feed/{activity_id}/like")
async def toggle_activity_like(
    activity_id: str,
    current_user: User = Depends(get_current_user),
):
    """Toggle like on an activity feed item for the current user."""
    activity_feed = get_activity_feed_collection()

    if not ObjectId.is_valid(activity_id):
        raise HTTPException(status_code=400, detail="Invalid activity ID")

    target_id = ObjectId(activity_id)

    unlike_result = await activity_feed.update_one(
        {"_id": target_id, "liked_by": current_user.id},
        {
            "$pull": {"liked_by": current_user.id},
            "$inc": {"likes": -1},
        },
    )

    liked = False
    if unlike_result.matched_count == 0:
        like_result = await activity_feed.update_one(
            {"_id": target_id, "liked_by": {"$ne": current_user.id}},
            {
                "$addToSet": {"liked_by": current_user.id},
                "$inc": {"likes": 1},
            },
        )
        if like_result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Activity item not found")
        liked = True

    item = await activity_feed.find_one({"_id": target_id})
    if not item:
        raise HTTPException(status_code=404, detail="Activity item not found")

    likes_count = max(0, int(item.get("likes", 0)))
    if likes_count != item.get("likes", 0):
        await activity_feed.update_one({"_id": target_id}, {"$set": {"likes": likes_count}})

    return {
        "liked": liked,
        "likes": likes_count,
        "comments": int(item.get("comments", 0)),
    }


@router.get("/feed/{activity_id}/comments", response_model=List[ActivityComment])
async def get_activity_comments(activity_id: str):
    """Fetch comments for a specific activity feed item."""
    activity_feed = get_activity_feed_collection()

    if not ObjectId.is_valid(activity_id):
        raise HTTPException(status_code=400, detail="Invalid activity ID")

    item = await activity_feed.find_one(
        {"_id": ObjectId(activity_id)},
        {"comments_list": 1},
    )
    if not item:
        raise HTTPException(status_code=404, detail="Activity item not found")

    comments = item.get("comments_list", [])
    comments_sorted = sorted(comments, key=lambda c: c.get("created_at", datetime.min))
    return [
        ActivityComment(
            id=str(comment.get("id") or ""),
            user_id=comment.get("user_id", ""),
            user_name=comment.get("user_name", "Anonymous"),
            content=comment.get("content", ""),
            created_at=comment.get("created_at", datetime.utcnow()),
        )
        for comment in comments_sorted
    ]


@router.post("/feed/{activity_id}/comments", status_code=status.HTTP_201_CREATED)
async def add_activity_comment(
    activity_id: str,
    payload: ActivityCommentCreate,
    current_user: User = Depends(get_current_user),
):
    """Add a comment to an activity feed item."""
    activity_feed = get_activity_feed_collection()

    if not ObjectId.is_valid(activity_id):
        raise HTTPException(status_code=400, detail="Invalid activity ID")

    target_id = ObjectId(activity_id)
    comment_doc = {
        "id": str(ObjectId()),
        "user_id": current_user.id,
        "user_name": current_user.name,
        "content": payload.content.strip(),
        "created_at": datetime.utcnow(),
    }

    if not comment_doc["content"]:
        raise HTTPException(status_code=400, detail="Comment cannot be empty")

    result = await activity_feed.update_one(
        {"_id": target_id},
        {
            "$push": {"comments_list": comment_doc},
            "$inc": {"comments": 1},
        },
    )
    if result.matched_count == 0:
        raise HTTPException(status_code=404, detail="Activity item not found")

    item = await activity_feed.find_one({"_id": target_id}, {"comments": 1})
    return {
        "comment": comment_doc,
        "comments": int(item.get("comments", 0)) if item else 0,
    }


# ── Business Activity Status ───────────────────────────────────────

@router.get("/businesses/{business_id}/activity")
async def get_business_activity(business_id: str):
    """
    Get real-time activity status for a business.
    Shows: is_active_today, checkins_today/week, trending_score
    """
    checkins = get_checkins_collection()
    businesses = get_businesses_collection()

    if not ObjectId.is_valid(business_id):
        raise HTTPException(status_code=400, detail="Invalid business ID")

    business = await businesses.find_one({"_id": ObjectId(business_id)})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    checkins_today = await checkins.count_documents(
        {"business_id": business_id, "created_at": {"$gte": today_start}}
    )
    checkins_week = await checkins.count_documents(
        {"business_id": business_id, "created_at": {"$gte": week_start}}
    )

    # Simple trending score: today weight * 3 + week weight
    trending = (checkins_today * 3) + (checkins_week * 0.5)

    # Find last check-in
    last_checkin = await checkins.find_one(
        {"business_id": business_id}, sort=[("created_at", -1)]
    )

    return {
        "business_id": business_id,
        "is_active_today": checkins_today > 0,
        "checkins_today": checkins_today,
        "checkins_this_week": checkins_week,
        "last_checkin_at": last_checkin["created_at"] if last_checkin else None,
        "trending_score": round(trending, 1),
    }


# ── User Credibility ───────────────────────────────────────────────

@router.get("/users/{user_id}/credibility")
async def get_user_credibility(user_id: str):
    """Get a user's community credibility score and tier"""
    credibility = get_credibility_collection()

    doc = await credibility.find_one({"user_id": user_id})
    if not doc:
        return {
            "user_id": user_id,
            "credibility_score": 0,
            "tier": CredibilityTier.NEW,
            "total_checkins": 0,
            "verified_checkins": 0,
            "total_reviews": 0,
            "helpful_votes": 0,
            "confirmations_given": 0,
            "confirmations_received": 0,
        }

    doc.pop("_id", None)
    return doc


@router.get("/credibility/me")
async def get_my_credibility(current_user: User = Depends(get_current_user)):
    """Get current user's credibility"""
    return await get_user_credibility(current_user.id)


# ── Internal Helpers ────────────────────────────────────────────────

async def _update_user_credibility(user_id: str):
    """Recalculate and update a user's credibility score"""
    checkins = get_checkins_collection()
    reviews = get_reviews_collection()
    credibility = get_credibility_collection()

    total_checkins = await checkins.count_documents({"user_id": user_id})
    verified_checkins = await checkins.count_documents(
        {
            "user_id": user_id,
            "status": {"$in": ["geo_verified", "receipt_verified", "community_confirmed"]},
        }
    )
    total_reviews = await reviews.count_documents({"user_id": user_id})

    # Count confirmations this user gave to others
    confirmations_given = await checkins.count_documents(
        {"confirmed_by": user_id}
    )
    # Count confirmations this user received
    confirmations_received_cursor = checkins.find({"user_id": user_id, "confirmations": {"$gt": 0}})
    confirmations_received = 0
    async for doc in confirmations_received_cursor:
        confirmations_received += doc.get("confirmations", 0)

    stats = {
        "total_checkins": total_checkins,
        "verified_checkins": verified_checkins,
        "total_reviews": total_reviews,
        "helpful_votes": 0,  # Future: implement helpful votes on reviews
        "confirmations_given": confirmations_given,
        "confirmations_received": confirmations_received,
        "events_attended": 0,  # Future: implement events
    }

    score, tier = calculate_credibility_score(stats)

    cred_doc = {
        "user_id": user_id,
        **stats,
        "credibility_score": score,
        "tier": tier,
        "last_active": datetime.utcnow(),
    }

    await credibility.update_one(
        {"user_id": user_id},
        {"$set": cred_doc},
        upsert=True,
    )



