"""
User Routes for Vantage
Handles viewing and updating user profiles
"""

from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends
from models.user import User, UserUpdate
from models.auth import get_current_user
from database.mongodb import get_users_collection

router = APIRouter()


@router.get("/{user_id}", response_model=User)
async def get_user_profile(user_id: str):
    """
    Get a user's public profile information by user ID
    - No authentication required
    - Returns public user data
    """
    try:
        users_collection = get_users_collection()
    except Exception as db_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {str(db_error)}"
        )
    
    from bson import ObjectId
    from bson.errors import InvalidId
    
    try:
        user = await users_collection.find_one({"_id": ObjectId(user_id)})
    except InvalidId:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        )
    
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    
    user["id"] = str(user["_id"])
    
    # Convert datetime to string for created_at field
    if "created_at" in user and user["created_at"]:
        user["created_at"] = user["created_at"].isoformat()
    
    return User(**user)


@router.put("/me", response_model=User)
async def update_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    """
    Update the current user's profile
    - Requires authentication
    - Updates name, profile_picture, and/or about_me
    """
    try:
        users_collection = get_users_collection()
    except Exception as db_error:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {str(db_error)}"
        )
    
    # Build update dict with only provided fields
    update_data = {}
    if user_update.name is not None:
        update_data["name"] = user_update.name
    if user_update.profile_picture is not None:
        update_data["profile_picture"] = user_update.profile_picture
    if user_update.about_me is not None:
        update_data["about_me"] = user_update.about_me
    
    if not update_data:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No fields to update"
        )
    
    update_data["updated_at"] = datetime.utcnow()
    
    from bson import ObjectId
    
    # Update user in database
    result = await users_collection.update_one(
        {"_id": ObjectId(current_user.id)},
        {"$set": update_data}
    )
    
    if result.modified_count == 0:
        # User might not exist or no changes were made
        user = await users_collection.find_one({"_id": ObjectId(current_user.id)})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
    
    # Fetch updated user
    updated_user = await users_collection.find_one({"_id": ObjectId(current_user.id)})
    updated_user["id"] = str(updated_user["_id"])
    
    # Convert datetime to string for created_at field
    if "created_at" in updated_user and updated_user["created_at"]:
        updated_user["created_at"] = updated_user["created_at"].isoformat()
    
    return User(**updated_user)
