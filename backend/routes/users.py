"""User profile and account management routes.

Provides endpoints for viewing profiles, updating profile fields and
preferences, changing passwords, exporting user data (GDPR portability),
and deleting accounts (GDPR erasure).
"""
from datetime import datetime
from fastapi import APIRouter, HTTPException, status, Depends, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address
from backend.models.user import User, UserUpdate, UserPreferencesUpdate, PasswordChange
from backend.models.auth import (
    get_current_user,
    get_password_hash_async,
    invalidate_cached_user,
    verify_password_async,
)
from backend.database.document_store import (
    get_reviews_collection,
    get_checkins_collection,
    get_saved_collection,
    get_activity_feed_collection,
)
from backend.repositories.users import SupabaseUsersRepository
from backend.utils.audit import log_data_export, log_account_deletion, log_password_change

router = APIRouter()
limiter = Limiter(key_func=get_remote_address)
users_repository = SupabaseUsersRepository()

def _serialize_user(user: dict) -> User:
    return User(**user)

def _normalize_text_list(values: list[str], limit: int) -> list[str]:
    """Deduplicate, trim, and truncate a list of text values.

    Args:
        values (list[str]): Raw input values.
        limit (int): Maximum number of items to return.

    Returns:
        list[str]: Normalized, deduplicated, case-insensitive-unique list.
    """
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
    """Retrieve a user's public profile by ID (GET /api/users/{user_id}).

    Args:
        user_id (str): The user's unique identifier.

    Returns:
        User: The user profile.

    Raises:
        HTTPException: 404 if the user does not exist.
    """
    user = await users_repository.get_by_id(user_id)
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
    """Update the authenticated user's profile fields (PUT /api/users/me).

    Accepts optional ``name``, ``profile_picture``, and ``about_me`` fields.

    Returns:
        User: The updated user profile.

    Raises:
        HTTPException: 400 if no fields are provided.
        HTTPException: 404 if the user is not found after update.
    """
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
    update_data["updated_at"] = datetime.utcnow().isoformat()
    updated_user = await users_repository.update_by_id(current_user.id, update_data)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )
    invalidate_cached_user(current_user.id)
    return _serialize_user(updated_user)

@router.put("/me/password", status_code=200)
@limiter.limit("3/minute")
async def change_password(
    request: Request,
    password_change: PasswordChange,
    current_user: User = Depends(get_current_user)
):
    """Change the authenticated user's password (PUT /api/users/me/password).

    Verifies the current password, then hashes and stores the new one.
    Google-only accounts cannot change passwords. Rate-limited to 3 per minute.

    Returns:
        dict: ``{"message": "Password updated successfully"}``

    Raises:
        HTTPException: 400 if the current password is wrong or account is Google-only.
    """
    ip_address = request.client.host if request.client else "unknown"
    user_in_db = await users_repository.get_by_id(current_user.id)
    if not user_in_db:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    if not user_in_db.get("hashed_password"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Password change is not available for accounts signed in with Google"
        )

    if not await verify_password_async(password_change.current_password, user_in_db["hashed_password"]):
        log_password_change(current_user.id, ip_address, success=False)
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Current password is incorrect"
        )

    hashed = await get_password_hash_async(password_change.new_password)
    await users_repository.update_by_id(current_user.id, {"hashed_password": hashed, "updated_at": datetime.utcnow().isoformat()})
    invalidate_cached_user(current_user.id)
    log_password_change(current_user.id, ip_address, success=True)
    return {"message": "Password updated successfully"}

@router.put("/preferences", response_model=User)
async def update_user_preferences(
    preferences_update: UserPreferencesUpdate,
    current_user: User = Depends(get_current_user)
):
    """Update the authenticated user's discovery preferences (PUT /api/users/preferences).

    Normalizes and deduplicates category/vibe lists, then persists the
    preferences and marks ``preferences_completed`` as True.

    Returns:
        User: The updated user profile with new preferences.
    """
    update_data = {
        "preferred_categories": _normalize_text_list(preferences_update.preferred_categories, 8),
        "preferred_vibes": _normalize_text_list(preferences_update.preferred_vibes, 10),
        "prefer_independent": round(float(preferences_update.prefer_independent), 3),
        "price_pref": preferences_update.price_pref.value if preferences_update.price_pref else None,
        "discovery_mode": preferences_update.discovery_mode.value,
        "preferences_completed": bool(preferences_update.preferences_completed),
        "updated_at": datetime.utcnow().isoformat(),
    }

    updated_user = await users_repository.update_by_id(current_user.id, update_data)
    if not updated_user:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="User not found"
        )

    invalidate_cached_user(current_user.id)
    return _serialize_user(updated_user)

@router.get("/me/export")
async def export_user_data(request: Request, current_user: User = Depends(get_current_user)):
    """Export all user data for GDPR right to portability (GET /api/users/me/export).

    Aggregates the user's profile, reviews, check-ins, saved businesses,
    and activity feed into a single JSON response.

    Returns:
        JSONResponse: All user data keyed by data type.
    """
    ip_address = request.client.host if request.client else "unknown"
    reviews_collection = get_reviews_collection()
    checkins_collection = get_checkins_collection()
    saved_collection = get_saved_collection()
    activity_collection = get_activity_feed_collection()

    # Get user profile
    user = await users_repository.get_by_id(current_user.id)
    if not user:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")

    # Remove sensitive data
    user.pop("hashed_password", None)

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

    log_data_export(current_user.id, ip_address, data_types=["user", "reviews", "checkins", "saved", "activity"])
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
async def delete_account(request: Request, current_user: User = Depends(get_current_user)):
    """Delete the authenticated user's account and all associated data (DELETE /api/users/me).

    Implements the GDPR right to erasure by removing the user's reviews,
    check-ins, saved businesses, activity feed entries, and the user record.

    Returns:
        dict: ``{"message": "Account deleted successfully"}``
    """
    ip_address = request.client.host if request.client else "unknown"
    reviews_collection = get_reviews_collection()
    checkins_collection = get_checkins_collection()
    saved_collection = get_saved_collection()
    activity_collection = get_activity_feed_collection()

    # Delete user data from all collections
    await reviews_collection.delete_many({"user_id": current_user.id})
    await checkins_collection.delete_many({"user_id": current_user.id})
    await saved_collection.delete_many({"user_id": current_user.id})
    await activity_collection.delete_many({"user_id": current_user.id})

    # Finally delete the user
    await users_repository.delete_by_id(current_user.id)

    log_account_deletion(current_user.id, ip_address)
    return {"message": "Account deleted successfully"}
