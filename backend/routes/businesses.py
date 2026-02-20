"""
Business Routes for Vantage
Handles business CRUD operations and location-based search
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId

from models.business import (
    Business,
    BusinessCreate,
    BusinessUpdate,
    CategoryEnum,
)
from models.user import User
from models.auth import get_current_user
from database.mongodb import get_businesses_collection

router = APIRouter()


def business_helper(business) -> dict:
    """Convert MongoDB document to Business dict with frontend-compatible field names"""
    if business:
        business["id"] = str(business["_id"])
        del business["_id"]
        # Map MongoDB field names to frontend-expected names
        if "rating_average" in business:
            business["rating"] = business.pop("rating_average")
        if "total_reviews" in business:
            business["review_count"] = business.pop("total_reviews")
        # Ensure defaults
        business.setdefault("rating", 0.0)
        business.setdefault("review_count", 0)
        business.setdefault("has_deals", False)
        # Convert owner_id to string if present
        if "owner_id" in business:
            business["owner_id"] = str(business["owner_id"])
    return business


@router.get("/businesses", response_model=List[Business])
async def get_businesses(
    category: Optional[CategoryEnum] = None,
    city: Optional[str] = None,
    search: Optional[str] = None,
    min_rating: Optional[float] = Query(None, ge=0, le=5),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    """
    Get all businesses with optional filtering
    - Filter by category
    - Filter by city
    - Search by name or description
    - Filter by minimum rating
    - Pagination with skip and limit
    """
    businesses_collection = get_businesses_collection()
    
    # Build query filter
    query = {}
    
    if category:
        query["category"] = category
    
    if city:
        query["city"] = {"$regex": city, "$options": "i"}
    
    if min_rating is not None:
        query["rating_average"] = {"$gte": min_rating}
    
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]
    
    # Execute query
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
    """
    Get paginated businesses for infinite scroll feed
    Returns businesses with pagination metadata
    """
    businesses_collection = get_businesses_collection()

    query = {}
    if category:
        query["category"] = category
    if search:
        query["$or"] = [
            {"name": {"$regex": search, "$options": "i"}},
            {"description": {"$regex": search, "$options": "i"}}
        ]

    # Determine sort order
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
    """
    Get nearby businesses using geospatial query
    - Searches businesses within specified radius from coordinates
    - Returns results sorted by distance (nearest first)
    - Optional category and rating filters
    
    Parameters:
    - lat: Latitude coordinate
    - lng: Longitude coordinate
    - radius: Search radius in kilometers (default: 10km)
    - category: Filter by business category
    - min_rating: Minimum rating filter
    - limit: Maximum number of results
    """
    businesses_collection = get_businesses_collection()
    
    # Convert radius from kilometers to meters (MongoDB uses meters)
    radius_meters = radius * 1000
    
    # Build geospatial query
    geo_query = {
        "location": {
            "$near": {
                "$geometry": {
                    "type": "Point",
                    "coordinates": [lng, lat]  # [longitude, latitude]
                },
                "$maxDistance": radius_meters
            }
        }
    }
    
    # Add additional filters
    if category:
        geo_query["category"] = category
    
    if min_rating is not None:
        geo_query["rating_average"] = {"$gte": min_rating}
    
    # Execute geospatial query
    # $near automatically sorts by distance (nearest first)
    cursor = businesses_collection.find(geo_query).limit(limit)
    businesses = await cursor.to_list(length=limit)
    
    return [business_helper(business) for business in businesses]


@router.get("/businesses/{business_id}", response_model=Business)
async def get_business(business_id: str):
    """
    Get a specific business by ID
    Returns 404 if business not found
    """
    businesses_collection = get_businesses_collection()
    
    # Validate ObjectId
    if not ObjectId.is_valid(business_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid business ID format"
        )
    
    business = await businesses_collection.find_one({"_id": ObjectId(business_id)})
    
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )
    
    return business_helper(business)


@router.post("/businesses", response_model=Business, status_code=status.HTTP_201_CREATED)
async def create_business(
    business_data: BusinessCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new business
    Requires authentication
    Only business role users can create businesses
    """
    # Check if user has business role
    if current_user.role != "business_owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only business accounts can create businesses"
        )
    
    businesses_collection = get_businesses_collection()
    
    # Create business document
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
        "created_at": datetime.utcnow()
    }
    
    # Insert into database
    result = await businesses_collection.insert_one(business_dict)
    
    # Retrieve the created business
    created_business = await businesses_collection.find_one({"_id": result.inserted_id})
    
    return business_helper(created_business)


@router.put("/businesses/{business_id}", response_model=Business)
async def update_business(
    business_id: str,
    business_data: BusinessUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Update a business
    Only the business owner can update their business
    """
    businesses_collection = get_businesses_collection()
    
    # Validate ObjectId
    if not ObjectId.is_valid(business_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid business ID format"
        )
    
    # Find business
    business = await businesses_collection.find_one({"_id": ObjectId(business_id)})
    
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )
    
    # Check ownership
    if str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this business"
        )
    
    # Prepare update data (exclude None values)
    update_data = {k: v for k, v in business_data.dict(exclude_unset=True).items() if v is not None}
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update"
        )
    
    # Convert location to dict if present
    if "location" in update_data:
        update_data["location"] = update_data["location"].dict()
    
    # Update business
    await businesses_collection.update_one(
        {"_id": ObjectId(business_id)},
        {"$set": update_data}
    )
    
    # Return updated business
    updated_business = await businesses_collection.find_one({"_id": ObjectId(business_id)})
    
    return business_helper(updated_business)


@router.delete("/businesses/{business_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_business(
    business_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete a business
    Only the business owner can delete their business
    """
    businesses_collection = get_businesses_collection()
    
    # Validate ObjectId
    if not ObjectId.is_valid(business_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid business ID format"
        )
    
    # Find business
    business = await businesses_collection.find_one({"_id": ObjectId(business_id)})
    
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )
    
    # Check ownership
    if str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this business"
        )
    
    # Delete business
    await businesses_collection.delete_one({"_id": ObjectId(business_id)})
    
    return None
