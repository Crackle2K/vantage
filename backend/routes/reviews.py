"""
Review Routes for Vantage
Handles review creation and retrieval with duplicate prevention
"""

from typing import List
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends
from bson import ObjectId
from pymongo.errors import DuplicateKeyError

from models.reviews import Review, ReviewCreate, ReviewUpdate, ReviewWithUser
from models.user import User
from models.auth import get_current_user
from database.mongodb import get_reviews_collection, get_businesses_collection, get_users_collection

router = APIRouter()


def review_helper(review) -> dict:
    """Convert MongoDB document to Review dict"""
    if review:
        review["id"] = str(review["_id"])
        del review["_id"]
    return review


@router.post("/reviews", response_model=Review, status_code=status.HTTP_201_CREATED)
async def create_review(
    review_data: ReviewCreate,
    current_user: User = Depends(get_current_user)
):
    """
    Create a new review for a business
    - Requires authentication
    - Prevents duplicate reviews (one review per user per business)
    - Automatically updates business rating average
    """
    reviews_collection = get_reviews_collection()
    businesses_collection = get_businesses_collection()
    
    # Validate business exists
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
    
    # Check if user already reviewed this business
    existing_review = await reviews_collection.find_one({
        "user_id": current_user.id,
        "business_id": review_data.business_id
    })
    
    if existing_review:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already reviewed this business. Use PUT to update your review."
        )
    
    # Create review document
    review_dict = {
        "business_id": review_data.business_id,
        "user_id": current_user.id,
        "rating": review_data.rating,
        "comment": review_data.comment,
        "created_at": datetime.utcnow()
    }
    
    # Insert review with duplicate key handling
    try:
        result = await reviews_collection.insert_one(review_dict)
    except DuplicateKeyError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="You have already reviewed this business"
        )
    
    # Update business rating average
    await update_business_rating(review_data.business_id)
    
    # Retrieve created review
    created_review = await reviews_collection.find_one({"_id": result.inserted_id})
    
    return review_helper(created_review)


@router.get("/reviews/business/{business_id}", response_model=List[ReviewWithUser])
async def get_business_reviews(
    business_id: str,
    skip: int = 0,
    limit: int = 50
):
    """
    Get all reviews for a specific business
    Returns reviews with user information
    - Sorted by newest first
    - Includes pagination
    """
    reviews_collection = get_reviews_collection()
    users_collection = get_users_collection()
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
    
    # Get reviews for business
    cursor = reviews_collection.find(
        {"business_id": business_id}
    ).sort("created_at", -1).skip(skip).limit(limit)
    
    reviews = await cursor.to_list(length=limit)
    
    # Enrich reviews with user information
    enriched_reviews = []
    for review in reviews:
        review_dict = review_helper(review)
        
        # Get user info
        user = await users_collection.find_one({"_id": ObjectId(review["user_id"])})
        if user:
            review_dict["user_name"] = user.get("name", "Anonymous")
            review_dict["user_email"] = user.get("email")
        else:
            review_dict["user_name"] = "Anonymous"
            review_dict["user_email"] = None
        
        enriched_reviews.append(review_dict)
    
    return enriched_reviews


@router.put("/reviews/{review_id}", response_model=Review)
async def update_review(
    review_id: str,
    review_data: ReviewUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Update an existing review
    - Only the review author can update their review
    - Updates business rating average
    """
    reviews_collection = get_reviews_collection()
    
    # Validate ObjectId
    if not ObjectId.is_valid(review_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid review ID format"
        )
    
    # Find review
    review = await reviews_collection.find_one({"_id": ObjectId(review_id)})
    
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found"
        )
    
    # Check if user is the author
    if review["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to update this review"
        )
    
    # Prepare update data
    update_data = {k: v for k, v in review_data.dict(exclude_unset=True).items() if v is not None}
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No valid fields to update"
        )
    
    # Update review
    await reviews_collection.update_one(
        {"_id": ObjectId(review_id)},
        {"$set": update_data}
    )
    
    # Update business rating if rating changed
    if "rating" in update_data:
        await update_business_rating(review["business_id"])
    
    # Return updated review
    updated_review = await reviews_collection.find_one({"_id": ObjectId(review_id)})
    
    return review_helper(updated_review)


@router.delete("/reviews/{review_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_review(
    review_id: str,
    current_user: User = Depends(get_current_user)
):
    """
    Delete a review
    - Only the review author can delete their review
    - Updates business rating average
    """
    reviews_collection = get_reviews_collection()
    
    # Validate ObjectId
    if not ObjectId.is_valid(review_id):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid review ID format"
        )
    
    # Find review
    review = await reviews_collection.find_one({"_id": ObjectId(review_id)})
    
    if not review:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Review not found"
        )
    
    # Check if user is the author
    if review["user_id"] != current_user.id:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Not authorized to delete this review"
        )
    
    business_id = review["business_id"]
    
    # Delete review
    await reviews_collection.delete_one({"_id": ObjectId(review_id)})
    
    # Update business rating
    await update_business_rating(business_id)
    
    return None


@router.get("/reviews/user/me", response_model=List[Review])
async def get_my_reviews(
    current_user: User = Depends(get_current_user),
    skip: int = 0,
    limit: int = 50
):
    """
    Get all reviews by the current authenticated user
    - Sorted by newest first
    """
    reviews_collection = get_reviews_collection()
    
    cursor = reviews_collection.find(
        {"user_id": current_user.id}
    ).sort("created_at", -1).skip(skip).limit(limit)
    
    reviews = await cursor.to_list(length=limit)
    
    return [review_helper(review) for review in reviews]


# Helper function to update business rating
async def update_business_rating(business_id: str):
    """
    Recalculate and update business rating average and total reviews count
    """
    reviews_collection = get_reviews_collection()
    businesses_collection = get_businesses_collection()
    
    # Get all reviews for the business
    reviews = await reviews_collection.find({"business_id": business_id}).to_list(length=None)
    
    if reviews:
        # Calculate average rating
        total_rating = sum(review["rating"] for review in reviews)
        average_rating = round(total_rating / len(reviews), 2)
        total_reviews = len(reviews)
    else:
        average_rating = 0.0
        total_reviews = 0
    
    # Update business
    await businesses_collection.update_one(
        {"_id": ObjectId(business_id)},
        {
            "$set": {
                "rating_average": average_rating,
                "total_reviews": total_reviews
            }
        }
    )
