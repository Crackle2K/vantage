from typing import List, Optional
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId

from models.claim import BusinessClaim, ClaimCreate, ClaimReview, ClaimStatus
from models.user import User
from models.auth import get_current_user, get_current_admin_user
from database.mongodb import (
    get_claims_collection,
    get_businesses_collection,
    get_activity_feed_collection,
)

router = APIRouter()

def claim_helper(claim) -> dict:
    if claim:
        claim["id"] = str(claim["_id"])
        del claim["_id"]
    return claim

@router.post("/claims", response_model=BusinessClaim, status_code=status.HTTP_201_CREATED)
async def submit_claim(
    claim_data: ClaimCreate,
    current_user: User = Depends(get_current_user),
):
    claims_collection = get_claims_collection()
    businesses_collection = get_businesses_collection()

    if current_user.role != "business_owner":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Only business owner accounts can claim businesses",
        )

    if not ObjectId.is_valid(claim_data.business_id):
        raise HTTPException(status_code=400, detail="Invalid business ID format")

    business = await businesses_collection.find_one(
        {"_id": ObjectId(claim_data.business_id)}
    )
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    existing = await claims_collection.find_one(
        {
            "business_id": claim_data.business_id,
            "status": {"$in": ["pending", "verified"]},
        }
    )
    if existing:
        raise HTTPException(
            status_code=400,
            detail="This business already has an active or pending claim",
        )

    claim_dict = {
        "business_id": claim_data.business_id,
        "user_id": current_user.id,
        "status": ClaimStatus.PENDING,
        "owner_name": claim_data.owner_name,
        "owner_role": claim_data.owner_role,
        "owner_phone": claim_data.owner_phone,
        "owner_email": claim_data.owner_email,
        "proof_description": claim_data.proof_description,
        "verification_method": None,
        "verification_notes": None,
        "created_at": datetime.utcnow(),
        "reviewed_at": None,
        "reviewed_by": None,
    }

    result = await claims_collection.insert_one(claim_dict)

    await businesses_collection.update_one(
        {"_id": ObjectId(claim_data.business_id)},
        {"$set": {"claim_status": "pending"}},
    )

    created = await claims_collection.find_one({"_id": result.inserted_id})
    return claim_helper(created)

@router.get("/claims/my", response_model=List[BusinessClaim])
async def get_my_claims(current_user: User = Depends(get_current_user)):
    claims_collection = get_claims_collection()
    cursor = claims_collection.find({"user_id": current_user.id}).sort("created_at", -1)
    claims = await cursor.to_list(length=50)
    return [claim_helper(c) for c in claims]

@router.get("/claims/business/{business_id}")
async def get_business_claim_status(business_id: str):
    claims_collection = get_claims_collection()

    if not ObjectId.is_valid(business_id):
        raise HTTPException(status_code=400, detail="Invalid business ID")

    claim = await claims_collection.find_one(
        {"business_id": business_id, "status": {"$in": ["pending", "verified"]}}
    )

    if not claim:
        return {"business_id": business_id, "is_claimed": False, "status": None}

    return {
        "business_id": business_id,
        "is_claimed": claim["status"] == "verified",
        "status": claim["status"],
    }

@router.post("/claims/{claim_id}/review")
async def review_claim(
    claim_id: str,
    review_data: ClaimReview,
    current_user: User = Depends(get_current_admin_user),
):
    claims_collection = get_claims_collection()
    businesses_collection = get_businesses_collection()
    activity_collection = get_activity_feed_collection()

    if not ObjectId.is_valid(claim_id):
        raise HTTPException(status_code=400, detail="Invalid claim ID")

    claim = await claims_collection.find_one({"_id": ObjectId(claim_id)})
    if not claim:
        raise HTTPException(status_code=404, detail="Claim not found")

    if claim["status"] != "pending":
        raise HTTPException(status_code=400, detail="Claim already reviewed")

    update = {
        "status": review_data.status,
        "verification_method": review_data.verification_method,
        "verification_notes": review_data.verification_notes,
        "reviewed_at": datetime.utcnow(),
        "reviewed_by": current_user.id,
    }
    await claims_collection.update_one({"_id": ObjectId(claim_id)}, {"$set": update})

    if review_data.status == ClaimStatus.VERIFIED:
        business = await businesses_collection.find_one(
            {"_id": ObjectId(claim["business_id"])}
        )

        await businesses_collection.update_one(
            {"_id": ObjectId(claim["business_id"])},
            {
                "$set": {
                    "owner_id": claim["user_id"],
                    "is_claimed": True,
                    "is_seed": False,
                    "claim_status": "verified",
                }
            },
        )

        if business:
            await activity_collection.insert_one(
                {
                    "activity_type": "business_claimed",
                    "user_id": claim["user_id"],
                    "business_id": claim["business_id"],
                    "business_name": business.get("name", "Unknown"),
                    "business_category": business.get("category"),
                    "title": f"{claim['owner_name']} claimed {business.get('name', 'a business')}",
                    "description": "This business is now owner-verified!",
                    "likes": 0,
                    "comments": 0,
                    "created_at": datetime.utcnow(),
                }
            )
    else:
        await businesses_collection.update_one(
            {"_id": ObjectId(claim["business_id"])},
            {"$set": {"claim_status": review_data.status}},
        )

    return {"status": "ok", "claim_status": review_data.status}
