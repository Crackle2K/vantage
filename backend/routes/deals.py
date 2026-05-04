"""Deal CRUD and toggle routes for business promotional deals.

Provides endpoints for creating, listing, updating, deleting, and
toggling the active status of deals. Only the business owner may
modify deals for their business.
"""
from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId

from backend.models.deal import Deal, DealCreate, DealUpdate, DealWithBusiness
from backend.models.user import User
from backend.models.auth import get_current_user
from backend.database.document_store import get_deals_collection, get_businesses_collection

router = APIRouter()

def deal_helper(deal) -> dict:
    if deal:
        deal["id"] = str(deal["_id"])
        del deal["_id"]
    return deal

@router.post("/deals", response_model=Deal, status_code=status.HTTP_201_CREATED)
async def create_deal(
    deal_data: DealCreate,
    current_user: User = Depends(get_current_user)
):
    """Create a deal for a business (POST /api/deals).

    Only the business owner may create deals. Expiration must be in the future.

    Returns:
        Deal: The newly created deal.

    Raises:
        HTTPException: 403 if the user is not the business owner.
        HTTPException: 400 if the expiration date has already passed.
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    if not ObjectId.is_valid(deal_data.business_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid business ID format"
        )
    business = await businesses_collection.find_one({"_id": ObjectId(deal_data.business_id)})
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )
    if str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to create deals for this business"
        )
    if deal_data.expires_at <= datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expiration date must be in the future"
        )
    deal_dict = {
        "business_id": deal_data.business_id,
        "title": deal_data.title,
        "description": deal_data.description,
        "discount_percent": deal_data.discount_percent,
        "expires_at": deal_data.expires_at,
        "active": deal_data.active,
        "created_at": datetime.utcnow()
    }
    result = await deals_collection.insert_one(deal_dict)
    created_deal = await deals_collection.find_one({"_id": result.inserted_id})
    return deal_helper(created_deal)

@router.get("/deals/business/{business_id}")
async def get_business_deals(
    business_id: str,
    active_only: bool = Query(True, description="Return only active deals"),
    include_expired: bool = Query(False, description="Include expired deals"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
):
    """List deals for a specific business (GET /api/deals/business/{business_id}).

    By default returns only active, non-expired deals.

    Returns:
        dict: Paginated deals payload for the specified business.
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
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
    query = {"business_id": business_id}
    if active_only:
        query["active"] = True
    if not include_expired:
        query["expires_at"] = {"$gt": datetime.utcnow()}
    total = await deals_collection.count_documents(query)
    cursor = deals_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
    deals = await cursor.to_list(length=limit)
    return {
        "items": [deal_helper(deal) for deal in deals],
        "total": total,
        "skip": skip,
        "limit": limit,
        "has_more": skip + limit < total,
    }

@router.get("/deals", response_model=List[DealWithBusiness])
async def get_all_deals(
    active_only: bool = Query(True, description="Return only active deals"),
    include_expired: bool = Query(False, description="Include expired deals"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    """List all deals across businesses (GET /api/deals).

    Enriches each deal with the parent business's name and category.

    Returns:
        List[DealWithBusiness]: Deals enriched with business details.
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    query = {}
    if active_only:
        query["active"] = True
    if not include_expired:
        query["expires_at"] = {"$gt": datetime.utcnow()}
    cursor = deals_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
    deals = await cursor.to_list(length=limit)
    business_ids = [
        ObjectId(deal["business_id"])
        for deal in deals
        if ObjectId.is_valid(deal.get("business_id"))
    ]
    business_map = {}
    if business_ids:
        businesses = await businesses_collection.find(
            {"_id": {"$in": business_ids}},
            {"name": 1, "category": 1},
        ).to_list(length=len(business_ids))
        business_map = {str(business["_id"]): business for business in businesses}
    enriched_deals = []
    for deal in deals:
        deal_dict = deal_helper(deal)
        business = business_map.get(str(deal.get("business_id")))
        if business:
            deal_dict["business_name"] = business.get("name", "Unknown")
            deal_dict["business_category"] = business.get("category", "other")
        else:
            deal_dict["business_name"] = "Unknown"
            deal_dict["business_category"] = "other"
        enriched_deals.append(deal_dict)
    return enriched_deals

@router.put("/deals/{deal_id}", response_model=Deal)
async def update_deal(
    deal_id: str,
    deal_data: DealUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update a deal (PUT /api/deals/{deal_id}).

    Only the business owner may update deals.

    Returns:
        Deal: The updated deal.

    Raises:
        HTTPException: 403 if the user is not the business owner.
        HTTPException: 400 if the new expiration date is in the past.
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    if not ObjectId.is_valid(deal_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid deal ID format"
        )
    deal = await deals_collection.find_one({"_id": ObjectId(deal_id)})
    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )
    business = await businesses_collection.find_one({"_id": ObjectId(deal["business_id"])})
    if not business or str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this deal"
        )
    update_data = {k: v for k, v in deal_data.dict(exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update"
        )
    if "expires_at" in update_data and update_data["expires_at"] <= datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expiration date must be in the future"
        )
    await deals_collection.update_one(
        {"_id": ObjectId(deal_id)},
        {"$set": update_data}
    )
    updated_deal = await deals_collection.find_one({"_id": ObjectId(deal_id)})
    return deal_helper(updated_deal)

@router.delete("/deals/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(
    deal_id: str,
    current_user: User = Depends(get_current_user)
):
    """Delete a deal (DELETE /api/deals/{deal_id}).

    Only the business owner may delete deals.

    Raises:
        HTTPException: 403 if the user is not the business owner.
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    if not ObjectId.is_valid(deal_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid deal ID format"
        )
    deal = await deals_collection.find_one({"_id": ObjectId(deal_id)})
    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )
    business = await businesses_collection.find_one({"_id": ObjectId(deal["business_id"])})
    if not business or str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this deal"
        )
    await deals_collection.delete_one({"_id": ObjectId(deal_id)})
    return None

@router.patch("/deals/{deal_id}/toggle", response_model=Deal)
async def toggle_deal_active(
    deal_id: str,
    current_user: User = Depends(get_current_user)
):
    """Toggle a deal's active status (PATCH /api/deals/{deal_id}/toggle).

    Flips the ``active`` boolean. Only the business owner may toggle deals.

    Returns:
        Deal: The deal with its updated active status.
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    if not ObjectId.is_valid(deal_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid deal ID format"
        )
    deal = await deals_collection.find_one({"_id": ObjectId(deal_id)})
    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )
    business = await businesses_collection.find_one({"_id": ObjectId(deal["business_id"])})
    if not business or str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this deal"
        )
    new_active_status = not deal.get("active", True)
    await deals_collection.update_one(
        {"_id": ObjectId(deal_id)},
        {"$set": {"active": new_active_status}}
    )
    updated_deal = await deals_collection.find_one({"_id": ObjectId(deal_id)})
    return deal_helper(updated_deal)
