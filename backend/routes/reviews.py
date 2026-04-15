from typing import List
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends, Request
from bson import ObjectId
from slowapi import Limiter
from slowapi.util import get_remote_address

from backend.models.reviews import Review, ReviewCreate, ReviewUpdate, ReviewWithUser
from backend.models.user import User
from backend.models.auth import get_current_user
from backend.database.document_store import get_reviews_collection, get_businesses_collection, get_users_collection
from backend.utils.security import sanitize_text

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)

def review_helper(review) -> dict:
    if review:
        review["id"] = str(review["_id"])
        del review["_id"]
    return review

@router.post("/reviews", response_model=Review, status_code=status.HTTP_201_CREATED)
@limiter.limit("10/minute")
async def create_review(
    request: Request,
    review_data: ReviewCreate,
    current_user: User = Depends(get_current_user)
):
    reviews_collection = get_reviews_collection()
    businesses_collection = get_businesses_collection()
    if not ObjectId.is_valid(review_data.business_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid business ID format"
        )
    business = await businesses_collection.find_one({"_id": ObjectId(review_data.business_id)})
    if not business:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Business not found"
        )
    existing_review = await reviews_collection.find_one({
        "user_id": current_user.id,
        "business_id": review_data.business_id
    })
    if existing_review:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already reviewed this business. Use PUT to update your review."
        )
    review_dict = {
        "business_id": review_data.business_id,
        "user_id": current_user.id,
        "rating": review_data.rating,
        "comment": sanitize_text(review_data.comment, max_length=1000) if review_data.comment else None,
        "created_at": datetime.utcnow()
    }
    result = await reviews_collection.insert_one(review_dict)
    await update_business_rating(review_data.business_id)
    created_review = await reviews_collection.find_one({"_id": result.inserted_id})
    return review_helper(created_review)

@router.get("/reviews/business/{business_id}", response_model=List[ReviewWithUser])
async def get_business_reviews(
    business_id: str,
    skip: int = 0,
    limit: int = 50
):
    reviews_collection = get_reviews_collection()
    users_collection = get_users_collection()
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
    cursor = reviews_collection.find(
        {"business_id": business_id}
    ).sort("created_at", -1).skip(skip).limit(limit)
    reviews = await cursor.to_list(length=limit)
    enriched_reviews = []
    for review in reviews:
        review_dict = review_helper(review)
        user = await users_collection.find_one({"_id": ObjectId(review["user_id"])})
        if user:
            review_dict["user_name"] = user.get("name", "Anonymous")
        else:
            review_dict["user_name"] = "Anonymous"
        enriched_reviews.append(review_dict)
    return enriched_reviews

@router.put("/reviews/{review_id}", response_model=Review)
async def update_review(
    review_id: str,
    review_data: ReviewUpdate,
    current_user: User = Depends(get_current_user)
):
    reviews_collection = get_reviews_collection()
    if not ObjectId.is_valid(review_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid review ID format"
        )
    review = await reviews_collection.find_one({"_id": ObjectId(review_id)})
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found"
        )
    if review["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this review"
        )
    update_data = {k: v for k, v in review_data.dict(exclude_unset=True).items() if v is not None}
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update"
        )
    await reviews_collection.update_one(
        {"_id": ObjectId(review_id)},
        {"$set": update_data}
    )
    if "rating" in update_data:
        await update_business_rating(review["business_id"])
    updated_review = await reviews_collection.find_one({"_id": ObjectId(review_id)})
    return review_helper(updated_review)

@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: str,
    current_user: User = Depends(get_current_user)
):
    reviews_collection = get_reviews_collection()
    if not ObjectId.is_valid(review_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid review ID format"
        )
    review = await reviews_collection.find_one({"_id": ObjectId(review_id)})
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found"
        )
    if review["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this review"
        )
    business_id = review["business_id"]
    await reviews_collection.delete_one({"_id": ObjectId(review_id)})
    await update_business_rating(business_id)
    return None

@router.get("/reviews/user/me", response_model=List[Review])
async def get_my_reviews(
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 50
):
    reviews_collection = get_reviews_collection()
    cursor = reviews_collection.find(
        {"user_id": current_user.id}
    ).sort("created_at", -1).skip(skip).limit(limit)
    reviews = await cursor.to_list(length=limit)
    return [review_helper(review) for review in reviews]

async def update_business_rating(business_id: str):
    reviews_collection = get_reviews_collection()
    businesses_collection = get_businesses_collection()
    reviews = await reviews_collection.find({"business_id": business_id}).to_list(length=None)
    if reviews:
        total_rating = sum(review["rating"] for review in reviews)
        average_rating = round(total_rating / len(reviews), 2)
        total_reviews = len(reviews)
    else:
        average_rating = 0.0
        total_reviews = 0
    await businesses_collection.update_one(
        {"_id": ObjectId(business_id)},
        {
            "$set": {
                "rating_average": average_rating,
                "total_reviews": total_reviews
            }
        }
    )
