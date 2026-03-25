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
    OwnerEvent,
    OwnerEventCreate,
    calculate_credibility_score,
)
from models.user import User
from models.auth import get_current_user
from database.mongodb import (
    get_checkins_collection,
    get_activity_feed_collection,
    get_businesses_collection,
    get_credibility_collection,
    get_owner_posts_collection,
    get_reviews_collection,
)

router = APIRouter()

PULSE_VERIFIED_STATUSES = {
    CheckInStatus.GEO_VERIFIED.value,
    CheckInStatus.RECEIPT_VERIFIED.value,
    CheckInStatus.COMMUNITY_CONFIRMED.value,
}

def _oid(raw_id: str, label: str) -> ObjectId:
    if not ObjectId.is_valid(raw_id):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return ObjectId(raw_id)

async def _business_or_404(business_id: str, projection: Optional[dict] = None) -> dict:
    businesses = get_businesses_collection()
    business = await businesses.find_one({"_id": _oid(business_id, "business ID")}, projection)
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business

def _parse_datetime(value) -> datetime:
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00")).replace(tzinfo=None)
        except ValueError:
            return datetime.min
    return datetime.min

def _pulse_business_snapshot(business: dict) -> dict:
    return {
        "business_id": str(business.get("_id")),
        "name": business.get("name", "Local business"),
        "category": business.get("category") or "Other",
        "image_url": business.get("image_url") or business.get("image"),
        "short_description": business.get("short_description") or business.get("description"),
        "address": business.get("address"),
    }

class ActivityCommentCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)

class UserPostCreate(BaseModel):
    content: str = Field(..., min_length=1, max_length=500)
    business_id: Optional[str] = None

class ActivityComment(BaseModel):
    id: str
    user_id: str
    user_name: str
    profile_picture: Optional[str] = None
    content: str
    created_at: datetime

def checkin_helper(doc) -> dict:
    if doc:
        doc["id"] = str(doc.pop("_id"))
    return doc

def activity_helper(doc) -> dict:
    if doc:
        doc["id"] = str(doc.pop("_id"))
        doc.pop("comments_list", None)
        # Keep liked_by so the frontend can determine if the current user liked this item
    return doc

def owner_event_helper(doc, business: Optional[dict] = None) -> dict:
    if doc:
        doc["id"] = str(doc.pop("_id"))
        if business:
            doc["business_name"] = business.get("name", "Local business")
            doc["business_category"] = business.get("category", "Other")
            doc["business_image_url"] = business.get("image_url") or business.get("image")
    return doc

CHECKIN_RADIUS_METERS = 200

def haversine_distance(lat1, lon1, lat2, lon2):
    R = 6371000
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
    checkins = get_checkins_collection()
    businesses = get_businesses_collection()
    activity_feed = get_activity_feed_collection()
    business_key = _oid(data.business_id, "business ID")
    business = await businesses.find_one({"_id": business_key})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

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

    today_start = datetime.utcnow().replace(hour=0, minute=0, second=0, microsecond=0)
    today_checkins = await checkins.count_documents(
        {"business_id": data.business_id, "created_at": {"$gte": today_start}}
    )

    await businesses.update_one(
        {"_id": business_key},
        {
            "$set": {
                "is_active_today": True,
                "checkins_today": today_checkins,
                "last_activity_at": datetime.utcnow(),
            }
        },
    )

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

    await _update_user_credibility(current_user.id)

    created = await checkins.find_one({"_id": result.inserted_id})
    return checkin_helper(created)

@router.post("/checkins/{checkin_id}/confirm")
async def confirm_checkin(
    checkin_id: str,
    current_user: User = Depends(get_current_user),
):
    checkins = get_checkins_collection()
    checkin_key = _oid(checkin_id, "checkin ID")
    checkin = await checkins.find_one({"_id": checkin_key})
    if not checkin:
        raise HTTPException(status_code=404, detail="Check-in not found")

    if checkin["user_id"] == current_user.id:
        raise HTTPException(status_code=400, detail="Can't confirm your own check-in")

    if current_user.id in checkin.get("confirmed_by", []):
        raise HTTPException(status_code=400, detail="Already confirmed")

    await checkins.update_one(
        {"_id": checkin_key},
        {
            "$inc": {"confirmations": 1},
            "$push": {"confirmed_by": current_user.id},
        },
    )

    if checkin.get("confirmations", 0) + 1 >= 3:
        await checkins.update_one(
            {"_id": checkin_key},
            {"$set": {"status": CheckInStatus.COMMUNITY_CONFIRMED}},
        )

    await _update_user_credibility(checkin["user_id"])
    await _update_user_credibility(current_user.id)

    return {"status": "confirmed"}

@router.post("/feed/posts", status_code=status.HTTP_201_CREATED)
async def create_user_post(
    data: UserPostCreate,
    current_user: User = Depends(get_current_user),
):
    activity_feed = get_activity_feed_collection()
    businesses = get_businesses_collection()

    business_id = "community"
    business_name = "Community"
    business_category = None

    if data.business_id:
        try:
            business = await businesses.find_one({"_id": _oid(data.business_id, "business ID")})
            if business:
                business_id = data.business_id
                business_name = business.get("name", "Local Business")
                business_category = business.get("category")
        except HTTPException:
            pass

    post_doc = {
        "activity_type": ActivityType.USER_POST,
        "user_id": current_user.id,
        "user_name": current_user.name,
        "business_id": business_id,
        "business_name": business_name,
        "business_category": business_category,
        "title": f"{current_user.name} shared a post",
        "description": data.content.strip(),
        "likes": 0,
        "liked_by": [],
        "comments": 0,
        "comments_list": [],
        "created_at": datetime.utcnow(),
    }

    result = await activity_feed.insert_one(post_doc)
    created = await activity_feed.find_one({"_id": result.inserted_id})
    return activity_helper(created)


@router.get("/feed")
async def get_activity_feed(
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=50),
    city: Optional[str] = None,
    activity_type: Optional[str] = None,
):
    activity_feed = get_activity_feed_collection()

    query: dict = {}
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

@router.get("/activity/pulse")
async def get_activity_pulse(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(5, ge=0.1, le=50, description="Radius in km"),
    limit: int = Query(12, ge=3, le=24),
):
    businesses = get_businesses_collection()
    checkins = get_checkins_collection()
    reviews = get_reviews_collection()
    activity_feed = get_activity_feed_collection()

    nearby = await businesses.find(
        {
            "location": {
                "$near": {
                    "$geometry": {"type": "Point", "coordinates": [lng, lat]},
                    "$maxDistance": radius * 1000,
                }
            }
        },
        {
            "name": 1,
            "category": 1,
            "image_url": 1,
            "image": 1,
            "short_description": 1,
            "description": 1,
            "address": 1,
            "is_claimed": 1,
        },
    ).limit(120).to_list(length=120)

    if not nearby:
        return {"items": []}

    business_by_id = {str(doc["_id"]): doc for doc in nearby if doc.get("_id")}
    business_ids = list(business_by_id.keys())
    window_start = datetime.utcnow() - timedelta(hours=48)

    verified_checkins = await checkins.find(
        {
            "business_id": {"$in": business_ids},
            "status": {"$in": list(PULSE_VERIFIED_STATUSES)},
            "created_at": {"$gte": window_start},
        },
        {"business_id": 1, "status": 1, "created_at": 1},
    ).sort("created_at", -1).limit(limit * 2).to_list(length=limit * 2)

    recent_reviews = await reviews.find(
        {
            "business_id": {"$in": business_ids},
            "created_at": {"$gte": window_start},
        },
        {"business_id": 1, "created_at": 1, "rating": 1},
    ).sort("created_at", -1).limit(limit * 2).to_list(length=limit * 2)

    owner_activity = await activity_feed.find(
        {
            "business_id": {"$in": business_ids},
            "activity_type": {"$in": [ActivityType.DEAL_POSTED.value, ActivityType.EVENT_CREATED.value]},
            "created_at": {"$gte": window_start},
        },
        {"business_id": 1, "activity_type": 1, "created_at": 1, "title": 1, "description": 1},
    ).sort("created_at", -1).limit(limit * 2).to_list(length=limit * 2)

    items: list[dict] = []

    for doc in verified_checkins:
        business = business_by_id.get(str(doc.get("business_id")))
        if not business:
            continue
        timestamp = doc.get("created_at") or datetime.utcnow()
        items.append(
            {
                "id": f"visit:{doc.get('_id', ObjectId())}",
                "type": "verified_visit",
                "summary": f"Someone verified a visit at {business.get('name', 'a business')}",
                "detail": "Geo or community confirmed",
                "timestamp": timestamp.isoformat(),
                "business": _pulse_business_snapshot(business),
            }
        )

    for doc in recent_reviews:
        business = business_by_id.get(str(doc.get("business_id")))
        if not business:
            continue
        timestamp = doc.get("created_at") or datetime.utcnow()
        rating = int(doc.get("rating", 0) or 0)
        rating_label = f"{rating}/5" if rating else "New feedback"
        items.append(
            {
                "id": f"review:{doc.get('_id', ObjectId())}",
                "type": "review",
                "summary": f"New review at {business.get('name', 'a business')}",
                "detail": rating_label,
                "timestamp": timestamp.isoformat(),
                "business": _pulse_business_snapshot(business),
            }
        )

    for doc in owner_activity:
        business = business_by_id.get(str(doc.get("business_id")))
        if not business or not business.get("is_claimed"):
            continue
        timestamp = doc.get("created_at") or datetime.utcnow()
        activity_type = str(doc.get("activity_type") or "")
        detail = "Event posted" if activity_type == ActivityType.EVENT_CREATED.value else "Owner update"
        items.append(
            {
                "id": f"owner:{doc.get('_id', ObjectId())}",
                "type": "owner_post",
                "summary": f"{detail} by {business.get('name', 'a business')}",
                "detail": (doc.get("description") or doc.get("title") or "Fresh from the owner")[:80],
                "timestamp": timestamp.isoformat(),
                "business": _pulse_business_snapshot(business),
            }
        )

    items.sort(key=lambda item: _parse_datetime(item.get("timestamp")), reverse=True)
    return {"items": items[:limit]}

@router.post("/events", response_model=OwnerEvent, status_code=status.HTTP_201_CREATED)
async def create_owner_event(
    event_data: OwnerEventCreate,
    current_user: User = Depends(get_current_user),
):
    owner_posts = get_owner_posts_collection()
    activity_feed = get_activity_feed_collection()
    business = await _business_or_404(event_data.business_id)

    if not business.get("is_claimed") or str(business.get("owner_id")) != current_user.id:
        raise HTTPException(status_code=403, detail="Only the claimed business owner can post events")

    if event_data.end_time <= event_data.start_time:
        raise HTTPException(status_code=400, detail="End time must be after start time")

    event_doc = {
        "business_id": event_data.business_id,
        "title": event_data.title.strip(),
        "description": event_data.description.strip(),
        "start_time": event_data.start_time,
        "end_time": event_data.end_time,
        "image_url": event_data.image_url,
        "created_at": datetime.utcnow(),
    }

    result = await owner_posts.insert_one(event_doc)

    await activity_feed.insert_one(
        {
            "activity_type": ActivityType.EVENT_CREATED,
            "user_id": current_user.id,
            "user_name": current_user.name,
            "business_id": event_data.business_id,
            "business_name": business.get("name", "Local business"),
            "business_category": business.get("category"),
            "title": f"New event from {business.get('name', 'a local business')}",
            "description": event_data.title.strip(),
            "likes": 0,
            "comments": 0,
            "created_at": datetime.utcnow(),
        }
    )

    created = await owner_posts.find_one({"_id": result.inserted_id})
    return owner_event_helper(created, business)

@router.get("/events", response_model=List[OwnerEvent])
async def get_owner_events(
    business_id: Optional[str] = None,
    lat: Optional[float] = Query(None, ge=-90, le=90),
    lng: Optional[float] = Query(None, ge=-180, le=180),
    radius: float = Query(5, ge=0.1, le=50, description="Radius in km"),
    include_past: bool = Query(False, description="Include ended events"),
    limit: int = Query(20, ge=1, le=60),
):
    owner_posts = get_owner_posts_collection()
    businesses = get_businesses_collection()

    query: dict = {}
    if business_id:
        query["business_id"] = business_id
        business_docs = await businesses.find(
            {"_id": _oid(business_id, "business ID")},
            {"name": 1, "category": 1, "image_url": 1, "image": 1},
        ).to_list(length=1)
    else:
        if lat is None or lng is None:
            raise HTTPException(status_code=400, detail="lat and lng are required when business_id is not provided")
        business_docs = await businesses.find(
            {
                "location": {
                    "$near": {
                        "$geometry": {"type": "Point", "coordinates": [lng, lat]},
                        "$maxDistance": radius * 1000,
                    }
                },
                "is_claimed": True,
            },
            {"name": 1, "category": 1, "image_url": 1, "image": 1},
        ).limit(120).to_list(length=120)
        business_ids = [str(doc["_id"]) for doc in business_docs if doc.get("_id")]
        if not business_ids:
            return []
        query["business_id"] = {"$in": business_ids}

    if not include_past:
        query["end_time"] = {"$gte": datetime.utcnow()}

    business_by_id = {str(doc["_id"]): doc for doc in business_docs if doc.get("_id")}
    events = await owner_posts.find(query).sort("start_time", 1).limit(limit).to_list(length=limit)

    return [owner_event_helper(event, business_by_id.get(str(event.get("business_id")))) for event in events]

@router.post("/feed/{activity_id}/like")
async def toggle_activity_like(
    activity_id: str,
    current_user: User = Depends(get_current_user),
):
    activity_feed = get_activity_feed_collection()
    target_id = _oid(activity_id, "activity ID")

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
    activity_feed = get_activity_feed_collection()

    item = await activity_feed.find_one(
        {"_id": _oid(activity_id, "activity ID")},
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
            profile_picture=comment.get("profile_picture"),
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
    activity_feed = get_activity_feed_collection()
    target_id = _oid(activity_id, "activity ID")
    comment_doc = {
        "id": str(ObjectId()),
        "user_id": current_user.id,
        "user_name": current_user.name,
        "profile_picture": current_user.profile_picture,
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

@router.get("/businesses/{business_id}/activity")
async def get_business_activity(business_id: str):
    checkins = get_checkins_collection()
    await _business_or_404(business_id, {"_id": 1})

    now = datetime.utcnow()
    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)
    week_start = today_start - timedelta(days=7)

    checkins_today = await checkins.count_documents(
        {"business_id": business_id, "created_at": {"$gte": today_start}}
    )
    checkins_week = await checkins.count_documents(
        {"business_id": business_id, "created_at": {"$gte": week_start}}
    )

    trending = (checkins_today * 3) + (checkins_week * 0.5)

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

@router.get("/users/{user_id}/credibility")
async def get_user_credibility(user_id: str):
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
    return await get_user_credibility(current_user.id)

async def _update_user_credibility(user_id: str):
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

    confirmations_given = await checkins.count_documents(
        {"confirmed_by": user_id}
    )
    confirmations_received_cursor = checkins.find({"user_id": user_id, "confirmations": {"$gt": 0}})
    confirmations_received = 0
    async for doc in confirmations_received_cursor:
        confirmations_received += doc.get("confirmations", 0)

    stats = {
        "total_checkins": total_checkins,
        "verified_checkins": verified_checkins,
        "total_reviews": total_reviews,
        "helpful_votes": 0,
        "confirmations_given": confirmations_given,
        "confirmations_received": confirmations_received,
        "events_attended": 0,
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
