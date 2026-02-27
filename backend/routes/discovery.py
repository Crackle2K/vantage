"""
Discovery Routes for Vantage
Smart business search + verified visits + live visibility scoring

Key endpoint: GET /discover
  1. Query MongoDB (2dsphere) for businesses near lat/lng
  2. If >= threshold results → return sorted by requested sort mode
  3. If below threshold and area wasn't fetched recently (geo_cache TTL)
     → call Google Places → bulk-insert new businesses → re-query
  4. Return results sorted by requested sort mode

COST-SAVING RULES:
  • geo_cache stores which lat/lng cells have been fetched and when.
  • If a cell was fetched within the last 24 hours we NEVER call Google again.
  • All businesses from Google are persisted with a unique place_id index
    so they're available forever without re-fetching.
  • Every Google API call is logged in api_usage_log.

POST /visits — verified visit submission (Haversine ≤ 100 m)
"""

import math
from typing import Optional
from datetime import datetime, timedelta
from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId
from pymongo import UpdateOne

from models.user import User
from models.auth import get_current_user
from database.mongodb import (
    get_businesses_collection,
    get_visits_collection,
    get_reviews_collection,
    get_checkins_collection,
    get_credibility_collection,
    get_geo_cache_collection,
)
from services.google_places import (
    search_google_places,
    geo_cell_key,
    enrich_business_photo_urls,
)
from services.visibility_score import (
    calculate_live_visibility_score,
    reviewer_credibility_weight,
)
from services.local_business_classifier import classify_local_business

router = APIRouter()

MIN_RESULTS = 80         # Threshold before considering a Google backfill
CACHE_TTL_HOURS = 24     # Don't re-fetch the same area within this window


def _strategic_rank_score(business: dict) -> float:
    """
    Blend trust and discovery so the feed feels credible but still welcoming.
    - Credibility-weighted LVS is the core signal.
    - Local confidence remains strong.
    - A small freshness boost gives newer/under-reviewed businesses visibility.
    """
    lvs = float(business.get("live_visibility_score", 0.0))
    local_conf = max(0.0, min(float(business.get("local_confidence", 0.0)), 1.0))
    review_count = int(business.get("review_count", business.get("total_reviews", 0)) or 0)

    freshness = max(0.0, 1.0 - min(review_count, 40) / 40.0)
    return (
        0.60 * lvs
        + 0.25 * (local_conf * 100.0)
        + 0.15 * (freshness * 100.0)
    )


def _sort_businesses(results: list, sort_by: Optional[str]) -> None:
    """Sort a list of business dicts in-place based on sort_by value."""
    if sort_by == "local_confidence":
        results.sort(
            key=lambda b: (_strategic_rank_score(b), b.get("local_confidence", 0)),
            reverse=True,
        )
    elif sort_by == "rating":
        results.sort(key=lambda b: b.get("rating_average", 0), reverse=True)
    elif sort_by == "newest":
        results.sort(key=lambda b: b.get("created_at", datetime.min), reverse=True)
    else:  # "score" or default — live_visibility_score, with local_confidence as tiebreaker
        results.sort(
            key=lambda b: (_strategic_rank_score(b), b.get("live_visibility_score", 0)),
            reverse=True,
        )


def _dedupe_discovery_results(results: list[dict], limit: int) -> list[dict]:
    """
    Remove repeated businesses in API output.
    Primary key: place_id
    Fallback key: normalized name+address for legacy docs without place_id.
    """
    deduped: list[dict] = []
    seen_place_ids: set[str] = set()
    seen_fallback_keys: set[tuple[str, str]] = set()

    for doc in results:
        place_id = (doc.get("place_id") or "").strip()
        if place_id:
            if place_id in seen_place_ids:
                continue
            seen_place_ids.add(place_id)
        else:
            name_key = (doc.get("name") or "").strip().lower()
            addr_key = (
                (doc.get("address") or doc.get("description") or "")
                .strip()
                .lower()
            )
            fallback_key = (name_key, addr_key)
            if fallback_key in seen_fallback_keys:
                continue
            seen_fallback_keys.add(fallback_key)

        deduped.append(doc)
        if len(deduped) >= limit:
            break

    return deduped


async def _enrich_missing_result_images(
    businesses_collection,
    results: list[dict],
    max_updates: int = 24,
) -> None:
    """
    Opportunistically enrich missing/low-quality images for Google Places docs.
    Updates MongoDB and in-memory result docs so response reflects improvements immediately.
    """
    updates = await enrich_business_photo_urls(results, max_to_enrich=max_updates)
    if not updates:
        return

    ops = []
    now = datetime.utcnow()
    for doc in results:
        place_id = doc.get("place_id")
        if not place_id or place_id not in updates:
            continue
        doc["image_url"] = updates[place_id]
        if doc.get("_id"):
            ops.append(
                UpdateOne(
                    {"_id": doc["_id"]},
                    {"$set": {"image_url": updates[place_id], "updated_at": now}},
                )
            )

    if ops:
        await businesses_collection.bulk_write(ops, ordered=False)


def _finalize_discovery_results(results: list[dict], sort_by: Optional[str], limit: int) -> list[dict]:
    """Sort, de-duplicate, and shape discovery response payload."""
    _sort_businesses(results, sort_by)
    unique_results = _dedupe_discovery_results(results, limit)
    return [business_helper(b) for b in unique_results]


def business_helper(doc: dict) -> dict:
    """Convert a MongoDB business document for the API response."""
    if doc is None:
        return doc
    doc["id"] = str(doc["_id"])
    del doc["_id"]
    # Handle both old (rating_average/total_reviews) and new (rating/review_count) field names
    if "rating_average" in doc:
        doc.setdefault("rating", doc.pop("rating_average", 0.0))
    doc.setdefault("rating", 0.0)
    if "total_reviews" in doc:
        doc.setdefault("review_count", doc.pop("total_reviews", 0))
    doc.setdefault("review_count", 0)
    doc.setdefault("has_deals", False)
    doc.setdefault("image_url", doc.pop("image", "") if "image" in doc else "")
    if "owner_id" in doc and doc["owner_id"]:
        doc["owner_id"] = str(doc["owner_id"])
    return doc


# ── Smart Search ────────────────────────────────────────────────────

@router.get("/discover")
async def discover_businesses(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(5, ge=0.1, le=50, description="Radius in km"),
    category: Optional[str] = None,
    limit: int = Query(200, ge=1, le=300),
    sort_by: Optional[str] = Query(None, description="Sort: score | local_confidence | rating | newest"),
    refresh: bool = Query(False, description="Force bypass geo cache and refetch Places data"),
):
    """
    Smart business discovery with aggressive caching.

      1. Search MongoDB via 2dsphere index.
      2. If >= threshold results, return immediately (no API call).
      3. If below threshold, check geo_cache:
         a. If this area was fetched within the last 24 hours → skip Google,
            return whatever we have from MongoDB.
         b. If NOT cached → call Google Places, bulk-insert new businesses,
            mark the cell as cached, then re-query MongoDB.
      4. Always sorted by live_visibility_score descending.
    """
    businesses = get_businesses_collection()
    geo_cache = get_geo_cache_collection()
    radius_meters = radius * 1000
    candidate_limit = min(max(limit * 2, limit), 300)

    # ── Step 1: MongoDB geo query ───────────────────────────────────
    geo_filter = {
        "location": {
            "$near": {
                "$geometry": {"type": "Point", "coordinates": [lng, lat]},
                "$maxDistance": radius_meters,
            }
        }
    }
    if category:
        geo_filter["category"] = category

    cursor = businesses.find(geo_filter).limit(candidate_limit)
    results = await cursor.to_list(length=candidate_limit)

    # ── Step 2: Enough results? Return immediately ──────────────────
    if len(results) >= MIN_RESULTS:
        await _enrich_missing_result_images(businesses, results)
        return _finalize_discovery_results(results, sort_by, limit)

    # ── Step 3: Check geo cache before calling Google ───────────────
    cell = geo_cell_key(lat, lng, int(radius_meters))
    cache_cutoff = datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS)

    cached = await geo_cache.find_one({
        **cell,
        "fetched_at": {"$gte": cache_cutoff},
    })

    if cached and not refresh:
        # Already fetched this area recently — return what MongoDB has
        await _enrich_missing_result_images(businesses, results)
        return _finalize_discovery_results(results, sort_by, limit)

    # ── Step 4: Call Google Places (cache miss) ─────────────────────
    new_places = await search_google_places(
        lat,
        lng,
        int(radius_meters),
        max_results=candidate_limit,
    )

    if new_places:
        # Bulk dedup: collect all incoming place_ids, query MongoDB once
        incoming_place_ids = [p["place_id"] for p in new_places]
        existing_cursor = businesses.find(
            {"place_id": {"$in": incoming_place_ids}},
            {"place_id": 1},
        )
        existing_ids = {doc["place_id"] async for doc in existing_cursor}

        to_insert = [p for p in new_places if p["place_id"] not in existing_ids]
        if to_insert:
            await businesses.insert_many(to_insert, ordered=False)
            print(f"Backfilled {len(to_insert)} businesses from Google Places")

    # Mark this cell as cached so we don't call Google again for 24 h
    await geo_cache.update_one(
        cell,
        {"$set": {**cell, "fetched_at": datetime.utcnow(), "result_count": len(new_places)}},
        upsert=True,
    )

    # ── Step 5: Re-query and return ─────────────────────────────────
    cursor = businesses.find(geo_filter).limit(candidate_limit)
    results = await cursor.to_list(length=candidate_limit)
    await _enrich_missing_result_images(businesses, results)
    return _finalize_discovery_results(results, sort_by, limit)


# ── Verified Visits ─────────────────────────────────────────────────


@router.post("/discover/enrich-photos")
async def enrich_google_place_photos(
    limit: int = Query(1200, ge=1, le=5000, description="Max businesses to scan"),
    batch_size: int = Query(120, ge=10, le=300, description="Batch size per enrichment pass"),
):
    """
    Bulk-enrich existing Google Places business images.
    Useful when many cards still have missing/legacy low-res images.
    """
    businesses = get_businesses_collection()
    candidate_query = {
        "source": "google_places",
        "place_id": {"$exists": True, "$nin": [None, ""]},
        "$or": [
            {"image_url": {"$exists": False}},
            {"image_url": ""},
            {"image_url": {"$regex": "maxwidth=400"}},
        ],
    }
    candidates = await businesses.find(candidate_query).limit(limit).to_list(length=limit)

    if not candidates:
        return {
            "scanned": 0,
            "updated": 0,
            "message": "No candidate businesses need image enrichment.",
        }

    updated = 0
    scanned = 0

    for idx in range(0, len(candidates), batch_size):
        batch = candidates[idx: idx + batch_size]
        scanned += len(batch)
        photo_updates = await enrich_business_photo_urls(batch, max_to_enrich=batch_size)
        if not photo_updates:
            continue

        now = datetime.utcnow()
        ops = [
            UpdateOne(
                {"_id": doc["_id"]},
                {"$set": {"image_url": photo_updates[doc["place_id"]], "updated_at": now}},
            )
            for doc in batch
            if doc.get("place_id") in photo_updates and doc.get("_id")
        ]
        if not ops:
            continue

        await businesses.bulk_write(ops, ordered=False)
        updated += len(ops)

    return {
        "scanned": scanned,
        "updated": updated,
        "message": "Bulk photo enrichment completed.",
    }

VISIT_MAX_DISTANCE_METERS = 100  # Must be within 100 m


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Great-circle distance in meters between two lat/lng pairs."""
    R = 6_371_000  # Earth radius in meters
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp = math.radians(lat2 - lat1)
    dl = math.radians(lng2 - lng1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


@router.post("/visits", status_code=status.HTTP_201_CREATED)
async def submit_visit(
    business_id: str = Query(...),
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    current_user: User = Depends(get_current_user),
):
    """
    Submit a verified visit.
    - User location must be within 100 m of the business.
    - On success the business's live_visibility_score is recalculated.
    """
    businesses = get_businesses_collection()
    visits = get_visits_collection()

    if not ObjectId.is_valid(business_id):
        raise HTTPException(status_code=400, detail="Invalid business ID")

    business = await businesses.find_one({"_id": ObjectId(business_id)})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

    # Check distance
    biz_loc = business.get("location", {})
    coords = biz_loc.get("coordinates")
    if not coords or len(coords) < 2:
        raise HTTPException(status_code=400, detail="Business has no location data")

    biz_lng, biz_lat = coords
    distance = _haversine_meters(lat, lng, biz_lat, biz_lng)

    if distance > VISIT_MAX_DISTANCE_METERS:
        raise HTTPException(
            status_code=400,
            detail=f"You are {round(distance)}m away. Must be within {VISIT_MAX_DISTANCE_METERS}m.",
        )

    # Rate-limit: 1 verified visit per business per user per 4 hours
    cutoff = datetime.utcnow() - timedelta(hours=4)
    recent = await visits.find_one({
        "user_id": current_user.id,
        "business_id": business_id,
        "created_at": {"$gte": cutoff},
    })
    if recent:
        raise HTTPException(status_code=400, detail="Already visited recently. Try again later.")

    visit_doc = {
        "user_id": current_user.id,
        "business_id": business_id,
        "latitude": lat,
        "longitude": lng,
        "distance_meters": round(distance, 1),
        "verified": True,
        "created_at": datetime.utcnow(),
    }
    await visits.insert_one(visit_doc)

    # Recalculate live visibility score
    await _recalculate_visibility(business_id)

    return {"status": "verified", "distance_meters": round(distance, 1)}


# ── Score Recalculation ─────────────────────────────────────────────

async def _recalculate_visibility(business_id: str):
    """Recompute and persist the live_visibility_score for a business."""
    businesses = get_businesses_collection()
    visits = get_visits_collection()
    reviews = get_reviews_collection()
    checkins = get_checkins_collection()
    credibility = get_credibility_collection()

    verified_visit_count = await visits.count_documents({"business_id": business_id, "verified": True})
    review_docs = await reviews.find({"business_id": business_id}, {"user_id": 1, "created_at": 1}).to_list(length=None)
    review_count = len(review_docs)

    reviewer_ids = sorted({doc.get("user_id") for doc in review_docs if doc.get("user_id")})
    credibility_by_user = {}
    if reviewer_ids:
        credibility_cursor = credibility.find(
            {"user_id": {"$in": reviewer_ids}},
            {"user_id": 1, "credibility_score": 1},
        )
        credibility_docs = await credibility_cursor.to_list(length=None)
        credibility_by_user = {
            doc.get("user_id"): doc.get("credibility_score")
            for doc in credibility_docs
        }

    weighted_review_count = 0.0
    for review in review_docs:
        reviewer_score = credibility_by_user.get(review.get("user_id"))
        weighted_review_count += reviewer_credibility_weight(reviewer_score)

    # Last activity timestamp (most recent of visit or review)
    last_visit = await visits.find_one({"business_id": business_id}, sort=[("created_at", -1)])
    last_review = await reviews.find_one({"business_id": business_id}, sort=[("created_at", -1)])

    timestamps = []
    if last_visit:
        timestamps.append(last_visit["created_at"])
    if last_review:
        timestamps.append(last_review["created_at"])
    last_activity_at = max(timestamps) if timestamps else None

    # Engagement: confirmations on checkins for this business
    pipeline = [
        {"$match": {"business_id": business_id}},
        {"$group": {"_id": None, "total": {"$sum": "$confirmations"}}},
    ]
    agg = await checkins.aggregate(pipeline).to_list(1)
    engagement_actions = agg[0]["total"] if agg else 0
    total_potential = max(verified_visit_count + review_count, 1)

    score = calculate_live_visibility_score(
        verified_visit_count=verified_visit_count,
        review_count=review_count,
        credibility_weighted_review_count=weighted_review_count,
        last_activity_at=last_activity_at,
        engagement_actions=engagement_actions,
        total_potential_engagements=total_potential,
    )

    await businesses.update_one(
        {"_id": ObjectId(business_id)},
        {
            "$set": {
                "live_visibility_score": score,
                "ranking_components": {
                    "verified_visits": verified_visit_count,
                    "credibility_weighted_reviews": round(weighted_review_count, 2),
                    "raw_review_count": review_count,
                    "engagement_actions": engagement_actions,
                },
            }
        },
    )


# ── Chain Purge ─────────────────────────────────────────────────────────────

@router.delete("/purge-chains")
async def purge_chain_businesses():
    """
    Re-classify all Google Places-seeded, unclaimed businesses and remove
    those that fail the local-independent test (confidence < 0.75).
    Also back-fills local_confidence on survivors that don't have it yet.

    Call this once after deploying the classifier to clean up existing data.
    """
    businesses = get_businesses_collection()

    cursor = businesses.find({"source": "google_places", "is_claimed": {"$ne": True}})
    docs = await cursor.to_list(length=None)

    to_delete_ids = []
    confidence_updates = 0

    for doc in docs:
        # Build a synthetic place dict for re-classification.
        # Use stored google_types if available (set on docs inserted after the classifier was added).
        # For legacy docs without google_types, rely only on name/address/status detection; only
        # delete on hard failures (confidence==0.0 means a name or disqualifying-type match).
        has_stored_types = bool(doc.get("google_types"))
        test_place = {
            "business_status": "OPERATIONAL",
            "name": doc.get("name", ""),
            "types": doc.get("google_types", []),
            "vicinity": doc.get("address") or doc.get("description") or "",
            "websiteUri": doc.get("website") or "",
        }
        is_local, confidence = classify_local_business(test_place)

        if not is_local:
            # With stored types: full re-classification — delete anything that fails
            # Without stored types: only delete hard chain-name / disqualifying-type hits
            if has_stored_types or confidence == 0.0:
                to_delete_ids.append(doc["_id"])
        elif doc.get("local_confidence") != confidence:
            await businesses.update_one(
                {"_id": doc["_id"]},
                {"$set": {"local_confidence": confidence}},
            )
            confidence_updates += 1

    deleted = 0
    if to_delete_ids:
        result = await businesses.delete_many({"_id": {"$in": to_delete_ids}})
        deleted = result.deleted_count
        print(f"purge-chains: removed {deleted} chain/non-local businesses")

    return {
        "deleted": deleted,
        "confidence_updated": confidence_updates,
        "total_scanned": len(docs),
    }

