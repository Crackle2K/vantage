"""Business listing CRUD and photo proxy routes.

Provides endpoints for listing, searching, creating, updating, and deleting
businesses, plus a photo proxy that serves Google Place images with
category-based SVG fallbacks.
"""
import io
import logging
from typing import List, Optional
from datetime import datetime
import re
from fastapi import APIRouter, HTTPException, status, Depends, Query
from fastapi.responses import StreamingResponse
from bson import ObjectId

from backend.models.business import (
    Business,
    BusinessCreate,
    BusinessProfileUpdate,
    BusinessUpdate,
    CategoryEnum,
)
from backend.models.user import User
from backend.models.auth import get_current_user
from backend.database.document_store import get_businesses_collection, DatabaseUnavailableError
from backend.services.business_metadata import (
    derive_known_for,
    generate_short_description,
    normalize_business_metadata,
    normalize_image_urls,
)
from backend.services.photo_proxy import build_category_placeholder_bytes, build_stream, get_photo_payload
from backend.routes.discovery import discover_businesses
from backend.utils.security import normalize_optional_url, normalize_text_list, sanitize_text

router = APIRouter()

logger = logging.getLogger(__name__)

BUSINESS_LIST_PROJECTION = {
    "name": 1,
    "category": 1,
    "description": 1,
    "address": 1,
    "city": 1,
    "location": 1,
    "rating_average": 1,
    "total_reviews": 1,
    "has_deals": 1,
    "owner_id": 1,
    "place_id": 1,
    "image": 1,
    "image_url": 1,
    "image_urls": 1,
    "primary_image_url": 1,
    "short_description": 1,
    "known_for": 1,
    "is_claimed": 1,
    "claim_status": 1,
    "credibility_score": 1,
    "live_visibility_score": 1,
    "local_confidence": 1,
    "is_active_today": 1,
    "checkins_today": 1,
    "trending_score": 1,
    "last_activity_at": 1,
    "created_at": 1,
    "phone": 1,
    "email": 1,
    "website": 1,
}

def _oid(raw_id: str) -> ObjectId:
    if not ObjectId.is_valid(raw_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid business ID format"
        )
    return ObjectId(raw_id)

async def _business_or_404(business_id: str) -> dict:
    businesses_collection = get_businesses_collection()
    business = await businesses_collection.find_one({"_id": _oid(business_id)})
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )
    return business

def business_helper(business) -> dict:
    if business:
        business.setdefault("image_url", business.pop("image", ""))
        business.setdefault(
            "primary_image_url",
            business.get("image_url") or ((business.get("image_urls") or [""])[0] if business.get("image_urls") else ""),
        )
        if not business.get("short_description") or not business.get("known_for") or not business.get("image_urls"):
            normalize_business_metadata(business)
        business["id"] = str(business.pop("_id"))
        if "rating_average" in business:
            business["rating"] = business.pop("rating_average")
        if "total_reviews" in business:
            business["review_count"] = business.pop("total_reviews")
        business.setdefault("rating", 0.0)
        business.setdefault("review_count", 0)
        business.setdefault("has_deals", False)
        if "owner_id" in business:
            business["owner_id"] = str(business["owner_id"])
    return business

def _normalize_business_url(value: Optional[str], label: str) -> Optional[str]:
    try:
        return normalize_optional_url(value)
    except ValueError as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Invalid {label}: {exc}",
        ) from exc

def _normalize_business_image_urls(values: Optional[list[str]], primary_image: Optional[str] = None) -> list[str]:
    cleaned: list[str] = []
    for value in values or []:
        normalized = _normalize_business_url(value, "image URL")
        if normalized:
            cleaned.append(normalized)
    return normalize_image_urls(cleaned, primary_image=primary_image or "")

def _sanitize_business_update(data: dict) -> dict:
    """Sanitize business-owner controlled fields before persistence."""
    text_limits = {
        "name": 200,
        "description": 1000,
        "address": 300,
        "city": 100,
        "phone": 50,
        "email": 254,
        "short_description": 160,
    }
    for key, limit in text_limits.items():
        if key in data and data[key] is not None:
            data[key] = sanitize_text(data[key], max_length=limit)
    if "website" in data:
        data["website"] = _normalize_business_url(data.get("website"), "website URL")
    if "image_url" in data:
        data["image_url"] = _normalize_business_url(data.get("image_url"), "image URL")
    if "image_urls" in data and data["image_urls"] is not None:
        data["image_urls"] = _normalize_business_image_urls(
            data.get("image_urls"),
            primary_image=data.get("image_url", ""),
        )
    if "known_for" in data and data["known_for"] is not None:
        data["known_for"] = normalize_text_list(data.get("known_for"), limit=6, max_item_length=24)
    return data

@router.get("/photos")
async def get_business_photo(
    place_id: str = Query(..., min_length=3, max_length=256),
    maxwidth: int = Query(800, ge=120, le=1600),
):
    """Proxy a business photo by Google Place ID (GET /api/photos).

    Resolves the image from Google's photo API, an OG image on the
    business website, or returns an SVG placeholder. Responses are
    cached in memory and on disk.

    Args:
        place_id (str): Google Places place ID.
        maxwidth (int): Desired image width in pixels (120-1600).

    Returns:
        StreamingResponse: The image payload with cache headers.
    """
    try:
        businesses_collection = get_businesses_collection()
        content_type, payload = await get_photo_payload(businesses_collection, place_id.strip(), maxwidth)
        stream, headers = build_stream(content_type, payload)
    except DatabaseUnavailableError:
        logger.exception("DB error serving photo for place_id=%s", place_id)
        content_type, payload = build_category_placeholder_bytes(label="V")
        stream = io.BytesIO(payload)
        headers = {"Cache-Control": "no-store", "Content-Length": str(len(payload))}
    return StreamingResponse(stream, media_type=content_type, headers=headers)

@router.get("/businesses", response_model=List[Business])
async def get_businesses(
    category: Optional[CategoryEnum] = None,
    city: Optional[str] = Query(None, max_length=100),
    search: Optional[str] = Query(None, max_length=120),
    owner_id: Optional[str] = Query(None, max_length=128),
    min_rating: Optional[float] = Query(None, ge=0, le=5),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    """List businesses with optional filtering (GET /api/businesses).

    Supports filtering by category, city (case-insensitive regex), minimum
    rating, and full-text search across name and description.

    Returns:
        List[Business]: Filtered and paginated business listings.
    """
    businesses_collection = get_businesses_collection()
    query = {}
    if category:
        query["category"] = category
    if owner_id:
        query["owner_id"] = owner_id
    if city:
        query["city"] = {"$regex": re.escape(city), "$options": "i"}
    if min_rating is not None:
        query["rating_average"] = {"$gte": min_rating}
    if search:
        escaped_search = re.escape(search)
        query["$or"] = [
            {"name": {"$regex": escaped_search, "$options": "i"}},
            {"description": {"$regex": escaped_search, "$options": "i"}}
        ]
    cursor = businesses_collection.find(query, BUSINESS_LIST_PROJECTION).skip(skip).limit(limit)
    businesses = await cursor.to_list(length=limit)
    return [business_helper(business) for business in businesses]

@router.get("/businesses/feed")
async def get_businesses_feed(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    category: Optional[CategoryEnum] = None,
    search: Optional[str] = Query(None, max_length=120),
    sort_by: Optional[str] = Query(None, description="Sort by: rating, reviews, newest"),
):
    """Paginated business feed with sorting (GET /api/businesses/feed).

    Returns a page of businesses along with total count and pagination metadata.

    Returns:
        dict: ``{"businesses": [...], "total": int, "page": int, "page_size": int, "has_more": bool}``
    """
    businesses_collection = get_businesses_collection()

    query = {}
    if category:
        query["category"] = category
    if search:
        escaped_search = re.escape(search)
        query["$or"] = [
            {"name": {"$regex": escaped_search, "$options": "i"}},
            {"description": {"$regex": escaped_search, "$options": "i"}}
        ]

    sort_field = "created_at"
    sort_dir = -1
    if sort_by == "rating":
        sort_field = "rating_average"
        sort_dir = -1
    elif sort_by == "reviews":
        sort_field = "total_reviews"
        sort_dir = -1
    elif sort_by == "newest":
        sort_field = "created_at"
        sort_dir = -1

    skip = (page - 1) * page_size
    cursor = businesses_collection.find(query, BUSINESS_LIST_PROJECTION).sort(sort_field, sort_dir).skip(skip).limit(page_size + 1)
    page_items = await cursor.to_list(length=page_size + 1)
    has_more = len(page_items) > page_size
    businesses = page_items[:page_size]

    return {
        "businesses": [business_helper(b) for b in businesses],
        "total": skip + len(businesses) + (1 if has_more else 0),
        "page": page,
        "page_size": page_size,
        "has_more": has_more,
    }

@router.get("/businesses/nearby", response_model=List[Business])
async def get_nearby_businesses(
    lat: float = Query(..., ge=-90, le=90, description="Latitude"),
    lng: float = Query(..., ge=-180, le=180, description="Longitude"),
    radius: float = Query(10, ge=1, le=100, description="Search radius in kilometers"),
    category: Optional[CategoryEnum] = None,
    min_rating: Optional[float] = Query(None, ge=0, le=5),
    limit: int = Query(50, ge=1, le=100)
):
    """Find businesses near a given location (GET /api/businesses/nearby).

    Delegates to the discovery engine and optionally filters by minimum
    rating after retrieval.

    Returns:
        List[Business]: Businesses sorted by canonical ranking within the radius.
    """
    businesses = await discover_businesses(
        lat=lat,
        lng=lng,
        radius=radius,
        category=category.value if category else None,
        limit=limit,
        sort_mode="canonical",
        refresh=False,
    )
    if min_rating is not None:
        businesses = [business for business in businesses if (business.get("rating") or 0) >= min_rating]
    return businesses[:limit]

@router.get("/businesses/{business_id}", response_model=Business)
async def get_business(business_id: str):
    """Retrieve a single business by ID (GET /api/businesses/{business_id}).

    Returns:
        Business: The requested business.

    Raises:
        HTTPException: 404 if the business does not exist.
    """
    return business_helper(await _business_or_404(business_id))

@router.post("/businesses", response_model=Business, status_code=status.HTTP_201_CREATED)
async def create_business(
    business_data: BusinessCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a new business listing (POST /api/businesses).

    Only users with the ``business_owner`` role may create businesses.
    Auto-generates ``short_description`` and ``known_for`` tags from the
    category and address.

    Returns:
        Business: The newly created business.

    Raises:
        HTTPException: 403 if the user is not a business owner.
    """
    if current_user.role != "business_owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only business accounts can create businesses"
        )
    businesses_collection = get_businesses_collection()
    business_dict = {
        "owner_id": current_user.id,
        "name": business_data.name,
        "category": business_data.category,
        "description": business_data.description,
        "address": business_data.address,
        "city": business_data.city,
        "location": business_data.location.model_dump(),
        "rating_average": 0.0,
        "total_reviews": 0,
        "phone": business_data.phone,
        "email": business_data.email,
        "website": business_data.website,
        "image_url": business_data.image_url,
        "image_urls": normalize_image_urls(business_data.image_urls, primary_image=business_data.image_url or ""),
        "short_description": generate_short_description(
            category=business_data.category,
            address=business_data.address,
            city=business_data.city,
            existing=business_data.short_description or business_data.description,
        ),
        "known_for": derive_known_for(
            category=business_data.category,
            existing=business_data.known_for,
        ),
        "created_at": datetime.utcnow()
    }
    _sanitize_business_update(business_dict)
    normalize_business_metadata(business_dict)
    result = await businesses_collection.insert_one(business_dict)
    created_business = await businesses_collection.find_one({"_id": result.inserted_id})
    return business_helper(created_business)

@router.put("/businesses/{business_id}", response_model=Business)
async def update_business(
    business_id: str,
    business_data: BusinessUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a business listing (PUT /api/businesses/{business_id}).

    Only the business owner may update their listing. Re-derives
    ``short_description`` and ``known_for`` when relevant fields change.

    Returns:
        Business: The updated business.

    Raises:
        HTTPException: 403 if the user is not the business owner.
        HTTPException: 404 if the business does not exist.
    """
    businesses_collection = get_businesses_collection()
    business_key = _oid(business_id)
    business = await businesses_collection.find_one({"_id": business_key})
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    if str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this business"
        )
    update_data = {k: v for k, v in business_data.model_dump(exclude_unset=True).items() if v is not None}
    _sanitize_business_update(update_data)
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update"
        )
    if "location" in update_data and hasattr(update_data["location"], "model_dump"):
        update_data["location"] = update_data["location"].model_dump()
    if "image_urls" in update_data or "image_url" in update_data:
        existing_images = update_data.get("image_urls") if "image_urls" in update_data else business.get("image_urls", [])
        primary_image = update_data.get("image_url", business.get("image_url", ""))
        update_data["image_urls"] = normalize_image_urls(existing_images, primary_image=primary_image)
    if "known_for" in update_data:
        update_data["known_for"] = derive_known_for(
            category=update_data.get("category", business.get("category", "")),
            google_types=business.get("google_types", []),
            existing=update_data["known_for"],
        )
    if "short_description" in update_data or "description" in update_data:
        update_data["short_description"] = generate_short_description(
            category=update_data.get("category", business.get("category", "")),
            address=update_data.get("address", business.get("address", "")),
            city=update_data.get("city", business.get("city", "")),
            existing=update_data.get(
                "short_description",
                update_data.get("description", business.get("short_description") or business.get("description", "")),
            ),
        )
    normalized_business = {**business, **update_data}
    normalize_business_metadata(normalized_business)
    for key in ("description", "short_description", "known_for", "image_url", "image_urls", "primary_image_url"):
        if key in normalized_business:
            update_data[key] = normalized_business[key]
    await businesses_collection.update_one(
        {"_id": business_key},
        {"$set": update_data}
    )
    updated_business = await businesses_collection.find_one({"_id": business_key})
    return business_helper(updated_business)

@router.put("/businesses/{business_id}/profile", response_model=Business)
async def update_business_profile(
    business_id: str,
    profile_data: BusinessProfileUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update owner-editable profile fields (PUT /api/businesses/{business_id}/profile).

    Restricted to the claimed business owner. Only ``short_description``
    and ``known_for`` tags may be updated through this endpoint.

    Returns:
        Business: The updated business.

    Raises:
        HTTPException: 403 if the user is not the claimed owner.
    """
    businesses_collection = get_businesses_collection()
    business_key = _oid(business_id)
    business = await businesses_collection.find_one({"_id": business_key})
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    if not business.get("is_claimed") or str(business.get("owner_id") or "") != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only the claimed owner can edit business profile details"
        )

    payload = profile_data.model_dump(exclude_unset=True)
    _sanitize_business_update(payload)
    update_data = {}

    if "short_description" in payload:
        update_data["short_description"] = generate_short_description(
            category=business.get("category", ""),
            address=business.get("address", ""),
            city=business.get("city", ""),
            existing=payload.get("short_description", ""),
        )

    if "known_for" in payload:
        update_data["known_for"] = derive_known_for(
            category=business.get("category", ""),
            google_types=business.get("google_types", []),
            existing=payload.get("known_for", []),
        )

    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid profile fields to update"
        )

    update_data["updated_at"] = datetime.utcnow()
    normalized_business = {**business, **update_data}
    normalize_business_metadata(normalized_business)
    update_data["short_description"] = normalized_business.get("short_description")
    update_data["known_for"] = normalized_business.get("known_for", [])
    update_data["description"] = normalized_business.get("description", business.get("description", ""))

    await businesses_collection.update_one(
        {"_id": business_key},
        {"$set": update_data}
    )

    updated_business = await businesses_collection.find_one({"_id": business_key})
    return business_helper(updated_business)

@router.delete("/businesses/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_business(
    business_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a business listing (DELETE /api/businesses/{business_id}).

    Only the business owner may delete their listing.

    Raises:
        HTTPException: 403 if the user is not the business owner.
        HTTPException: 404 if the business does not exist.
    """
    businesses_collection = get_businesses_collection()
    business_key = _oid(business_id)
    business = await businesses_collection.find_one({"_id": business_key})
    if not business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")
    if str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this business"
        )
    await businesses_collection.delete_one({"_id": business_key})
    return None
