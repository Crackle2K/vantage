from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends
from fastapi.responses import JSONResponse
from bson import ObjectId
from bson.errors import InvalidId
from models.user import User, UserUpdate, UserPreferencesUpdate, PasswordChange
from models.auth import verify_password, get_password_hash
from models.auth import get_current_user
from database.mongodb import (
    get_users_collection,
    get_reviews_collection,
    get_checkins_collection,
    get_saved_collection,
    get_activity_feed_collection,
)

router = APIRouter()

def _users():
    try:
        return get_users_collection()
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail=f"Database unavailable: {exc}"
        ) from exc

def _user_oid(user_id: str) -> ObjectId:
    try:
        return ObjectId(user_id)
    except InvalidId as exc:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid user ID format"
        ) from exc

def _serialize_user(user: dict) -> User:
    user["id"] = str(user.pop("_id"))
    if "created_at" in user and user["created_at"]:
        user["created_at"] = user["created_at"].isoformat()
    return User(**user)

def _normalize_text_list(values: list[str], limit: int) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in values:
        cleaned = str(value or "").strip()
        if not cleaned:
            continue
        key = cleaned.lower()
        if key in seen:
            continue
        seen.add(key)
        normalized.append(cleaned[:32])
        if len(normalized) >= limit:
            break
    return normalized

@router.get("/{user_id}", response_model=User)
async def get_user_profile(user_id: str):
    users_collection = _users()
    user = await users_collection.find_one({"_id": _user_oid(user_id)})
    if not user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    return _serialize_user(user)

@router.put("/me", response_model=User)
async def update_user_profile(
    user_update: UserUpdate,
    current_user: User = Depends(get_current_user)
):
    users_collection = _users()
    user_key = _user_oid(current_user.id)
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
    result = await users_collection.update_one(
        {"_id": user_key},
        {"$set": update_data}
    )
    if result.modified_count == 0:
        user = await users_collection.find_one({"_id": user_key})
        if not user:
            raise HTTPException(
                status_code=status.HTTP_404_NOT_FOUND,
                detail="User not found"
            )
    updated_user = await users_collection.find_one({"_id": user_key})
    return _serialize_user(updated_user)

@router.put("/me/password", status_code=200)
async def change_password(
    password_change: PasswordChange,
    current_user: User = Depends(get_current_user)
):
    users_collection = _users()
    user_key = _user_oid(current_user.id)

    user_in_db = await users_collection.find_one({"_id": user_key})
    if not user_in_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not user_in_db.get("hashed_password"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password change is not available for accounts signed in with Google"
        )

    if not verify_password(password_change.current_password, user_in_db["hashed_password"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    hashed = get_password_hash(password_change.new_password)
    await users_collection.update_one(
        {"_id": user_key},
        {"$set": {"hashed_password": hashed, "updated_at": datetime.utcnow()}}
    )
    return {"message": "Password updated successfully"}

@router.put("/preferences", response_model=User)
async def update_user_preferences(
    preferences_update: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user)
):
    users_collection = _users()
    user_key = _user_oid(current_user.id)

    update_data = {
        "preferred_categories": _normalize_text_list(preferences_update.preferred_categories, 8),
        "preferred_vibes": _normalize_text_list(preferences_update.preferred_vibes, 10),
        "prefer_independent": round(float(preferences_update.prefer_independent), 3),
        "price_pref": preferences_update.price_pref.value if preferences_update.price_pref else None,
        "discovery_mode": preferences_update.discovery_mode.value,
        "preferences_completed": bool(preferences_update.preferences_completed),
        "updated_at": datetime.utcnow(),
    }

    await users_collection.update_one(
        {"_id": user_key},
        {"$set": update_data}
    )

    updated_user = await users_collection.find_one({"_id": user_key})
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return _serialize_user(updated_user)

@router.get("/me/export")
async def export_user_data(current_user: User = Depends(get_current_user)):
    """Export all user data for GDPR compliance (right to portability)."""
    users_collection = _users()
    reviews_collection = get_reviews_collection()
    checkins_collection = get_checkins_collection()
    saved_collection = get_saved_collection()
    activity_collection = get_activity_feed_collection()

    user_key = _user_oid(current_user.id)

    # Get user profile
    user = await users_collection.find_one({"_id": user_key})
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Remove sensitive data
    user.pop("hashed_password", None)
    user["id"] = str(user.pop("_id"))
    if "created_at" in user and user["created_at"]:
        user["created_at"] = user["created_at"].isoformat()

    # Get user's reviews
    reviews = await reviews_collection.find({"user_id": current_user.id}).to_list(length=None)
    for review in reviews:
        review["_id"] = str(review["_id"])
        if "created_at" in review and review["created_at"]:
            review["created_at"] = review["created_at"].isoformat()

    # Get user's check-ins
    checkins = await checkins_collection.find({"user_id": current_user.id}).to_list(length=None)
    for checkin in checkins:
        checkin["_id"] = str(checkin["_id"])
        if "created_at" in checkin and checkin["created_at"]:
            checkin["created_at"] = checkin["created_at"].isoformat()

    # Get user's saved businesses
    saved = await saved_collection.find({"user_id": current_user.id}).to_list(length=None)
    for item in saved:
        item["_id"] = str(item["_id"])
        if "created_at" in item and item["created_at"]:
            item["created_at"] = item["created_at"].isoformat()

    # Get user's activity feed
    activity = await activity_collection.find({"user_id": current_user.id}).to_list(length=None)
    for item in activity:
        item["_id"] = str(item["_id"])
        if "created_at" in item and item["created_at"]:
            item["created_at"] = item["created_at"].isoformat()

    return JSONResponse(
        content={
            "user": user,
            "reviews": reviews,
            "checkins": checkins,
            "saved_businesses": saved,
            "activity": activity,
            "exported_at": datetime.utcnow().isoformat(),
        }
    )

@router.delete("/me", status_code=status.HTTP_200_OK)
async def delete_account(current_user: User = Depends(get_current_user)):
    """Delete user account for GDPR compliance (right to erasure)."""
    users_collection = _users()
    reviews_collection = get_reviews_collection()
    checkins_collection = get_checkins_collection()
    saved_collection = get_saved_collection()
    activity_collection = get_activity_feed_collection()

    user_key = _user_oid(current_user.id)

    # Delete user data from all collections
    await reviews_collection.delete_many({"user_id": current_user.id})
    await checkins_collection.delete_many({"user_id": current_user.id})
    await saved_collection.delete_many({"user_id": current_user.id})
    await activity_collection.delete_many({"user_id": current_user.id})

    # Finally delete the user
    result = await users_collection.delete_one({"_id": user_key})

    if result.deleted_count == 0:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    return {"message": "Account deleted successfully"}
