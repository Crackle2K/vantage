from datetime import datetime

from bson import ObjectId
from fastapi import APIRouter, Depends, HTTPException, status
from pymongo.errors import DuplicateKeyError

from models.auth import get_current_user
from models.saved import SavedMutationResult
from models.user import User
from database.mongodb import get_businesses_collection, get_saved_collection
from routes.discovery import _build_ranking_components, _build_reason_codes, business_helper

router = APIRouter()

def _oid(raw_id: str) -> ObjectId:
    if not ObjectId.is_valid(raw_id):
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid business ID")
    return ObjectId(raw_id)

def _prepare_saved_business(doc: dict) -> dict:
    business = business_helper(doc)
    ranking_components = business.get("ranking_components") or _build_ranking_components(business)
    business["ranking_components"] = ranking_components
    business["canonical_rank_score"] = ranking_components["final_score"]
    business["reason_codes"] = _build_reason_codes(
        business,
        ranking_components,
        business.get("preference_match"),
    )
    return business

@router.post("/saved/{business_id}", response_model=SavedMutationResult)
async def save_business(
    business_id: str,
    current_user: User = Depends(get_current_user),
):
    businesses = get_businesses_collection()
    saved_collection = get_saved_collection()
    existing_business = await businesses.find_one({"_id": _oid(business_id)}, {"_id": 1})
    if not existing_business:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    try:
        await saved_collection.insert_one(
            {
                "user_id": current_user.id,
                "business_id": business_id,
                "created_at": datetime.utcnow(),
            }
        )
    except DuplicateKeyError:
        pass

    return SavedMutationResult(business_id=business_id, saved=True)

@router.delete("/saved/{business_id}", response_model=SavedMutationResult)
async def remove_saved_business(
    business_id: str,
    current_user: User = Depends(get_current_user),
):
    saved_collection = get_saved_collection()
    await saved_collection.delete_one(
        {
            "user_id": current_user.id,
            "business_id": business_id,
        }
    )
    return SavedMutationResult(business_id=business_id, saved=False)

@router.get("/saved")
async def get_saved_businesses(
    current_user: User = Depends(get_current_user),
):
    saved_collection = get_saved_collection()
    businesses = get_businesses_collection()

    saved_docs = await saved_collection.find(
        {"user_id": current_user.id}
    ).sort("created_at", -1).to_list(length=200)
    if not saved_docs:
        return {"items": []}

    business_ids = [doc["business_id"] for doc in saved_docs if ObjectId.is_valid(doc.get("business_id", ""))]
    business_docs = await businesses.find(
        {"_id": {"$in": [ObjectId(item) for item in business_ids]}}
    ).to_list(length=len(business_ids))
    business_map = {str(doc["_id"]): doc for doc in business_docs}

    ordered_items = []
    for saved_doc in saved_docs:
        business_doc = business_map.get(saved_doc["business_id"])
        if not business_doc:
            continue
        item = _prepare_saved_business(dict(business_doc))
        item["saved_at"] = saved_doc["created_at"].isoformat()
        ordered_items.append(item)

    return {"items": ordered_items}
