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

router = APIRouter()

logger = logging.getLogger(__name__)

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

@router.get("/photos")
async def get_business_photo(
    place_id: str = Query(..., min_length=3),
    maxwidth: int = Query(800, ge=120, le=1600),
):
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
    city: Optional[str] = None,
    search: Optional[str] = None,
    min_rating: Optional[float] = Query(None, ge=0, le=5),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    businesses_collection = get_businesses_collection()
    query = {}
    if category:
        query["category"] = category
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
    cursor = businesses_collection.find(query).skip(skip).limit(limit)
    businesses = await cursor.to_list(length=limit)
    return [business_helper(business) for business in businesses]

@router.get("/businesses/feed")
async def get_businesses_feed(
    page: int = Query(1, ge=1),
    page_size: int = Query(10, ge=1, le=50),
    category: Optional[CategoryEnum] = None,
    search: Optional[str] = None,
    sort_by: Optional[str] = Query(None, description="Sort by: rating, reviews, newest"),
):
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
    total = await businesses_collection.count_documents(query)
    cursor = businesses_collection.find(query).sort(sort_field, sort_dir).skip(skip).limit(page_size)
    businesses = await cursor.to_list(length=page_size)

    return {
        "businesses": [business_helper(b) for b in businesses],
        "total": total,
        "page": page,
        "page_size": page_size,
        "has_more": skip + page_size < total,
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
    return business_helper(await _business_or_404(business_id))

@router.post("/businesses", response_model=Business, status_code=status.HTTP_201_CREATED)
async def create_business(
    business_data: BusinessCreate,
    current_user: User = Depends(get_current_user)
):
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
        "location": business_data.location.dict(),
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
    result = await businesses_collection.insert_one(business_dict)
    created_business = await businesses_collection.find_one({"_id": result.inserted_id})
    return business_helper(created_business)

@router.put("/businesses/{business_id}", response_model=Business)
async def update_business(
    business_id: str,
    business_data: BusinessUpdate,
    current_user: User = Depends(get_current_user)
):
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
    update_data = {k: v for k, v in business_data.dict(exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update"
        )
    if "location" in update_data:
        update_data["location"] = update_data["location"].dict()
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

    payload = profile_data.dict(exclude_unset=True)
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
