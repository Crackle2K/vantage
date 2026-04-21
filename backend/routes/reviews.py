"""Review CRUD routes for business reviews.

Provides endpoints for creating, reading, updating, and deleting reviews.
After any write, the parent business's average rating and review count
are recalculated and persisted.
"""
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
    """Create a review for a business (POST /api/reviews).

    Each user may review a business only once. The business's average
    rating and review count are recalculated after creation.

    Returns:
        Review: The newly created review.

    Raises:
        HTTPException: 400 if the user has already reviewed this business.
        HTTPException: 404 if the business does not exist.
    """
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
    """List reviews for a business with reviewer names (GET /api/reviews/business/{business_id}).

    Fetches reviews sorted by creation date (newest first) and enriches
    each with the reviewer's display name using a batch user lookup
    to avoid N+1 queries.

    Returns:
        List[ReviewWithUser]: Reviews with reviewer names attached.
    """
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
    # Fetch reviews and all referenced user_ids in two queries instead of N+1
    cursor = reviews_collection.find(
        {"business_id": business_id}
    ).sort("created_at", -1).skip(skip).limit(limit)
    reviews = await cursor.to_list(length=limit)

    user_ids = list({review["user_id"] for review in reviews})
    user_map: dict[str, str] = {}
    if user_ids:
        # Fetch all users in one query using $in
        user_docs = await users_collection.find(
            {"_id": {"$in": user_ids}},
            projection={"_id": 1, "name": 1}
        ).to_list(length=None)
        user_map = {doc["_id"]: doc.get("name", "Anonymous") for doc in user_docs}

    enriched_reviews = []
    for review in reviews:
        review_dict = review_helper(review)
        review_dict["user_name"] = user_map.get(review["user_id"], "Anonymous")
        enriched_reviews.append(review_dict)
    return enriched_reviews

@router.put("/reviews/{review_id}", response_model=Review)
async def update_review(
    review_id: str,
    review_data: ReviewUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update an existing review (PUT /api/reviews/{review_id}).

    Only the review's author may update it. If the rating changes, the
    business's average rating is recalculated.

    Returns:
        Review: The updated review.

    Raises:
        HTTPException: 403 if the user is not the review author.
    """
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
    """Delete a review (DELETE /api/reviews/{review_id}).

    Only the review's author may delete it. The business's average
    rating is recalculated after deletion.

    Raises:
        HTTPException: 403 if the user is not the review author.
    """
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
    """List the authenticated user's own reviews (GET /api/reviews/user/me).

    Returns:
        List[Review]: The current user's reviews sorted newest first.
    """
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
    """Recalculate and persist a business's average rating and review count.

    Called after any review create, update, or delete to keep the
    business's ``rating_average`` and ``total_reviews`` in sync.

    Args:
        business_id (str): The business whose ratings should be recalculated.
    """
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
