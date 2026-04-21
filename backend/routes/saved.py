"""Saved/bookmarked business routes.

Provides endpoints for saving and unsaving businesses, and listing
the current user's saved businesses with full ranking metadata.
"""
from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, status

from backend.models.auth import get_current_user
from backend.models.saved import SavedMutationResult
from backend.models.user import User
from backend.routes.discovery import _build_ranking_components, _build_reason_codes, business_helper
from backend.repositories.factory import get_saved_read_repository, get_saved_write_repositories

router = APIRouter()

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
    """Save/bookmark a business (POST /api/saved/{business_id}).

    Returns:
        SavedMutationResult: ``{"business_id": str, "saved": True}``

    Raises:
        HTTPException: 404 if the business does not exist.
    """
    business_id: str,
    current_user: User = Depends(get_current_user),
):
    read_repo = get_saved_read_repository()
    write_repos = get_saved_write_repositories()

    if not await read_repo.business_exists(business_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Business not found")

    now = datetime.utcnow()
    for repo in write_repos:
        await repo.save(current_user.id, business_id, now)

    return SavedMutationResult(business_id=business_id, saved=True)

@router.delete("/saved/{business_id}", response_model=SavedMutationResult)
async def remove_saved_business(
    business_id: str,
    current_user: User = Depends(get_current_user),
):
    """Remove a saved/bookmarked business (DELETE /api/saved/{business_id}).

    Returns:
        SavedMutationResult: ``{"business_id": str, "saved": False}``
    """
    business_id: str,
    current_user: User = Depends(get_current_user),
):
    write_repos = get_saved_write_repositories()
    for repo in write_repos:
        await repo.remove(current_user.id, business_id)
    return SavedMutationResult(business_id=business_id, saved=False)

@router.get("/saved")
async def get_saved_businesses(
    current_user: User = Depends(get_current_user),
):
    """List the current user's saved businesses with ranking data (GET /api/saved).

    Returns businesses in save-order (newest first) with computed
    ranking components and reason codes.

    Returns:
        dict: ``{"items": [...]}`` with enriched business listings.
    """
    current_user: User = Depends(get_current_user),
):
    read_repo = get_saved_read_repository()

    saved_docs = await read_repo.list_saved_records(current_user.id, limit=200)
    if not saved_docs:
        return {"items": []}

    business_ids = [doc["business_id"] for doc in saved_docs if doc.get("business_id")]
    business_docs = await read_repo.list_businesses_by_ids(business_ids)
    business_map = {str(doc.get("_id") or doc.get("id")): doc for doc in business_docs}

    ordered_items = []
    for saved_doc in saved_docs:
        business_doc = business_map.get(saved_doc["business_id"])
        if not business_doc:
            continue
        normalized = dict(business_doc)
        if "_id" not in normalized and "id" in normalized:
            normalized["_id"] = normalized["id"]
        item = _prepare_saved_business(normalized)
        saved_at = saved_doc.get("created_at")
        item["saved_at"] = saved_at.isoformat() if hasattr(saved_at, "isoformat") else str(saved_at)
        ordered_items.append(item)

    return {"items": ordered_items}
