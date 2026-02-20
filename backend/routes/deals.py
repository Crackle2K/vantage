"""
Deal Routes for Vantage
Handles deal/coupon creation and retrieval for businesses
"""

from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId

from models.deal import Deal, DealCreate, DealUpdate, DealWithBusiness
from models.user import User
from models.auth import get_current_user
from database.mongodb import get_deals_collection, get_businesses_collection

router = APIRouter()


def deal_helper(deal) -> dict:
    """Convert MongoDB document to Deal dict"""
    if deal:
        deal["id"] = str(deal["_id"])
        del deal["_id"]
    return deal


@router.post("/deals", response_model=Deal, status_code=status.HTTP_201_CREATED)
async def create_deal(
    deal_data: DealCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new deal for a business
    - Requires authentication
    - Only business owners can create deals for their businesses
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    
    # Validate business exists
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
    
    # Check if user is the business owner
    if str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to create deals for this business"
        )
    
    # Validate expiration date is in the future
    if deal_data.expires_at <= datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expiration date must be in the future"
        )
    
    # Create deal document
    deal_dict = {
        "business_id": deal_data.business_id,
        "title": deal_data.title,
        "description": deal_data.description,
        "discount_percent": deal_data.discount_percent,
        "expires_at": deal_data.expires_at,
        "active": deal_data.active,
        "created_at": datetime.utcnow()
    }
    
    # Insert deal
    result = await deals_collection.insert_one(deal_dict)
    
    # Retrieve created deal
    created_deal = await deals_collection.find_one({"_id": result.inserted_id})
    
    return deal_helper(created_deal)


@router.get("/deals/business/{business_id}", response_model=List[Deal])
async def get_business_deals(
    business_id: str,
    active_only: bool = Query(True, description="Return only active deals"),
    include_expired: bool = Query(False, description="Include expired deals")
):
    """
    Get all deals for a specific business
    - By default returns only active, non-expired deals
    - Optional: include inactive or expired deals
    - Sorted by creation date (newest first)
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    
    # Validate business exists
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
    
    # Build query
    query = {"business_id": business_id}
    
    if active_only:
        query["active"] = True
    
    if not include_expired:
        query["expires_at"] = {"$gt": datetime.utcnow()}
    
    # Get deals for business
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
    """
    Get all deals from all businesses
    - Returns deals with business information
    - Default: active and non-expired deals only
    - Sorted by creation date (newest first)
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    
    # Build query
    query = {}
    
    if active_only:
        query["active"] = True
    
    if not include_expired:
        query["expires_at"] = {"$gt": datetime.utcnow()}
    
    # Get deals
    cursor = deals_collection.find(query).sort("created_at", -1).skip(skip).limit(limit)
    deals = await cursor.to_list(length=limit)
    
    # Enrich deals with business information
    enriched_deals = []
    for deal in deals:
        deal_dict = deal_helper(deal)
        
        # Get business info
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
    """
    Update an existing deal
    - Only the business owner can update their deals
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    
    # Validate ObjectId
    if not ObjectId.is_valid(deal_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid deal ID format"
        )
    
    # Find deal
    deal = await deals_collection.find_one({"_id": ObjectId(deal_id)})
    
    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )
    
    # Check if user is the business owner
    business = await businesses_collection.find_one({"_id": ObjectId(deal["business_id"])})
    if not business or str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this deal"
        )
    
    # Prepare update data
    update_data = {k: v for k, v in deal_data.dict(exclude_unset=True).items() if v is not None}
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update"
        )
    
    # Validate expiration date if provided
    if "expires_at" in update_data and update_data["expires_at"] <= datetime.utcnow():
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Expiration date must be in the future"
        )
    
    # Update deal
    await deals_collection.update_one(
        {"_id": ObjectId(deal_id)},
        {"$set": update_data}
    )
    
    # Return updated deal
    updated_deal = await deals_collection.find_one({"_id": ObjectId(deal_id)})
    
    return deal_helper(updated_deal)


@router.delete("/deals/{deal_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_deal(
    deal_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete a deal
    - Only the business owner can delete their deals
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    
    # Validate ObjectId
    if not ObjectId.is_valid(deal_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid deal ID format"
        )
    
    # Find deal
    deal = await deals_collection.find_one({"_id": ObjectId(deal_id)})
    
    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )
    
    # Check if user is the business owner
    business = await businesses_collection.find_one({"_id": ObjectId(deal["business_id"])})
    if not business or str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this deal"
        )
    
    # Delete deal
    await deals_collection.delete_one({"_id": ObjectId(deal_id)})
    
    return None


@router.patch("/deals/{deal_id}/toggle", response_model=Deal)
async def toggle_deal_active(
    deal_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Toggle deal active status (activate/deactivate)
    - Only the business owner can toggle their deals
    - Quick way to enable/disable deals without deleting
    """
    deals_collection = get_deals_collection()
    businesses_collection = get_businesses_collection()
    
    # Validate ObjectId
    if not ObjectId.is_valid(deal_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid deal ID format"
        )
    
    # Find deal
    deal = await deals_collection.find_one({"_id": ObjectId(deal_id)})
    
    if not deal:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Deal not found"
        )
    
    # Check if user is the business owner
    business = await businesses_collection.find_one({"_id": ObjectId(deal["business_id"])})
    if not business or str(business["owner_id"]) != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to modify this deal"
        )
    
    # Toggle active status
    new_active_status = not deal.get("active", True)
    
    await deals_collection.update_one(
        {"_id": ObjectId(deal_id)},
        {"$set": {"active": new_active_status}}
    )
    
    # Return updated deal
    updated_deal = await deals_collection.find_one({"_id": ObjectId(deal_id)})
    
    return deal_helper(updated_deal)
