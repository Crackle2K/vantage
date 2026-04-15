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

@router.get("/deals/business/{business_id}", response_model=List[Deal])
async def get_business_deals(
    business_id: str,
    active_only: bool = Query(True, description="Return only active deals"),
    include_expired: bool = Query(False, description="Include expired deals")
):
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
    cursor = deals_collection.find(query).sort("created_at", -1)
    deals = await cursor.to_list(length=None)
    return [deal_helper(deal) for deal in deals]

@router.get("/deals", response_model=List[DealWithBusiness])
async def get_all_deals(
    active_only: bool = Query(True, description="Return only active deals"),
    include_expired: bool = Query(False, description="Include expired deals"),
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100)
):
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    query = {}
    if active_only:
        query["active"] = True
    if not include_expired:
        query["expires_at"] = {"$gt": datetime.utcnow()}
    cursor = deals_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
    deals = await cursor.to_list(length=limit)
    enriched_deals = []
    for deal in deals:
        deal_dict = deal_helper(deal)
        business = await businesses_collection.find_one({"_id": ObjectId(deal["business_id"])})
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
