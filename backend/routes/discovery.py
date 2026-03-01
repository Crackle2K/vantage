import asyncio
import math
import time
from copy import deepcopy
from typing import Optional
from datetime import datetime, timedelta, timezone
from fastapi import APIRouter, HTTPException, status, Depends, Query
from bson import ObjectId
from pymongo import UpdateOne

from models.user import User
from models.auth import get_current_user, get_current_user_optional
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
from services.business_metadata import normalize_business_metadata

router = APIRouter()

MIN_RESULTS = 80
CACHE_TTL_HOURS = 24
ALLOWED_SORT_MODES = {"canonical", "distance", "newest", "most_reviewed"}
DECIDE_INTENTS = {
    "DINNER",
    "COFFEE",
    "STUDY",
    "DATE_NIGHT",
    "QUICK_BITE",
    "DESSERT",
    "WALKABLE",
    "OPEN_NOW",
    "CHEAP",
    "TRENDING",
    "HIDDEN_GEM",
    "MOST_TRUSTED",
}
LANE_ITEM_LIMIT = 12
LANE_CACHE_TTL_SECONDS = 60
LANE_CACHE_MAX_ENTRIES = 48
_lanes_cache: dict[str, tuple[float, dict]] = {}

def _lanes_cache_key(
    lat: float,
    lng: float,
    radius: float,
    limit: int,
    current_user: Optional[User],
) -> str:
    user_bits = ["anon"]
    if current_user:
        categories = ",".join(sorted(current_user.preferred_categories or []))
        vibes = ",".join(sorted(current_user.preferred_vibes or []))
        independent = _safe_float(current_user.prefer_independent, default=0.5)
        price_pref = current_user.price_pref or "any"
        discovery_mode = current_user.discovery_mode or "trusted"
        user_bits = [
            str(current_user.id),
            categories,
            vibes,
            f"{independent:.2f}",
            price_pref,
            discovery_mode,
        ]
    return "|".join([
        f"{lat:.3f}",
        f"{lng:.3f}",
        f"{radius:.1f}",
        str(limit),
        *user_bits,
    ])

def _get_lanes_cache(cache_key: str) -> Optional[dict]:
    cached = _lanes_cache.get(cache_key)
    if not cached:
        return None

    expires_at, payload = cached
    if expires_at <= time.time():
        _lanes_cache.pop(cache_key, None)
        return None

    return deepcopy(payload)

def _set_lanes_cache(cache_key: str, payload: dict) -> None:
    _lanes_cache[cache_key] = (time.time() + LANE_CACHE_TTL_SECONDS, deepcopy(payload))
    if len(_lanes_cache) > LANE_CACHE_MAX_ENTRIES:
        oldest_key = min(_lanes_cache.items(), key=lambda item: item[1][0])[0]
        _lanes_cache.pop(oldest_key, None)

def _normalize_sort_mode(sort_mode: str) -> str:
    mode = (sort_mode or "canonical").strip().lower()
    if mode not in ALLOWED_SORT_MODES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid sort_mode. Expected one of: {', '.join(sorted(ALLOWED_SORT_MODES))}",
        )
    return mode

def _as_object_id(raw_id: str, label: str) -> ObjectId:
    if not ObjectId.is_valid(raw_id):
        raise HTTPException(status_code=400, detail=f"Invalid {label}")
    return ObjectId(raw_id)

async def _load_discovery_candidates(businesses_collection, geo_filter: dict, limit: int) -> list[dict]:
    cursor = businesses_collection.find(geo_filter).limit(limit)
    return await cursor.to_list(length=limit)

async def _finalize_discovery_payload(
    businesses_collection,
    results: list[dict],
    sort_mode: str,
    limit: int,
    lat: float,
    lng: float,
) -> list[dict]:
    await _enrich_missing_result_images(businesses_collection, results)
    return _finalize_discovery_results(results, sort_mode, limit, lat, lng)

def _last_activity(business: dict) -> Optional[datetime]:
    return _coerce_datetime(business.get("last_verified_at") or business.get("last_activity_at"))

def _is_recently_active(business: dict, window_seconds: int = 86400) -> bool:
    if _safe_int(business.get("checkins_today")) > 0:
        return True
    activity_at = _last_activity(business)
    if activity_at is None:
        return False
    return (datetime.utcnow() - activity_at).total_seconds() <= window_seconds

def _with_primary_image(item: dict) -> dict:
    item["primary_image_url"] = (
        item.get("primary_image_url")
        or item.get("image_url")
        or (item.get("image_urls") or [None])[0]
        or item.get("image")
        or ""
    )
    return item

def _latest_created_at(*docs: Optional[dict]) -> Optional[datetime]:
    timestamps = [doc["created_at"] for doc in docs if doc and doc.get("created_at")]
    return max(timestamps) if timestamps else None

def _legacy_strategic_rank_score(business: dict) -> float:
    lvs = float(business.get("live_visibility_score", 0.0))
    local_conf = max(0.0, min(float(business.get("local_confidence", 0.0)), 1.0))
    review_count = int(business.get("review_count", business.get("total_reviews", 0)) or 0)

    freshness = max(0.0, 1.0 - min(review_count, 40) / 40.0)
    return (
        0.60 * lvs
        + 0.25 * (local_conf * 100.0)
        + 0.15 * (freshness * 100.0)
    )

def _legacy_sort_businesses(results: list, sort_by: Optional[str]) -> None:
    if sort_by == "local_confidence":
        results.sort(
            key=lambda b: (_legacy_strategic_rank_score(b), b.get("local_confidence", 0)),
            reverse=True,
        )
    elif sort_by == "rating":
        results.sort(key=lambda b: b.get("rating_average", 0), reverse=True)
    elif sort_by == "newest":
        results.sort(key=lambda b: b.get("created_at", datetime.min), reverse=True)
    else:
        results.sort(
            key=lambda b: (_legacy_strategic_rank_score(b), b.get("live_visibility_score", 0)),
            reverse=True,
        )

def _safe_float(*values, default: float = 0.0) -> float:
    for value in values:
        if value is None:
            continue
        try:
            return float(value)
        except (TypeError, ValueError):
            continue
    return default

def _safe_int(*values, default: int = 0) -> int:
    for value in values:
        if value is None:
            continue
        try:
            return int(value)
        except (TypeError, ValueError):
            continue
    return default

def _coerce_datetime(value) -> Optional[datetime]:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None

    if dt.tzinfo is not None:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

def _recency_days(business: dict) -> float:
    activity_at = _coerce_datetime(
        business.get("last_activity_at") or business.get("last_verified_at") or business.get("created_at")
    )
    if activity_at is None:
        return 365.0
    delta_days = (datetime.utcnow() - activity_at).total_seconds() / 86400
    return round(max(0.0, delta_days), 2)

def _strategic_rank_score(business: dict) -> float:
    lvs = _safe_float(business.get("live_visibility_score"))
    local_conf = max(0.0, min(_safe_float(business.get("local_confidence")), 1.0))
    review_count = _safe_int(
        business.get("review_count"),
        business.get("total_reviews"),
        (business.get("ranking_components") or {}).get("raw_review_count"),
    )

    freshness = max(0.0, 1.0 - min(review_count, 40) / 40.0)
    return round(
        0.60 * lvs
        + 0.25 * (local_conf * 100.0)
        + 0.15 * (freshness * 100.0),
        2,
    )

def _build_ranking_components(business: dict) -> dict:
    stored_components = business.get("ranking_components") or {}
    verified_visits = max(
        0,
        _safe_int(
            stored_components.get("verified_visits"),
            business.get("verified_visits_today"),
            business.get("checkins_today"),
        ),
    )
    raw_review_count = max(
        0,
        _safe_int(
            stored_components.get("raw_review_count"),
            business.get("review_count"),
            business.get("total_reviews"),
        ),
    )
    weighted_reviews = round(
        max(
            0.0,
            _safe_float(
                stored_components.get("credibility_weighted_reviews"),
                raw_review_count,
            ),
        ),
        2,
    )
    engagement_actions = max(0, _safe_int(stored_components.get("engagement_actions")))
    engagement_denominator = max(verified_visits + raw_review_count, 1)
    engagement_rate = round(min(engagement_actions / engagement_denominator, 1.0), 4)
    local_confidence = round(max(0.0, min(_safe_float(business.get("local_confidence")), 1.0)), 4)
    freshness_boost = round(max(0.0, 1.0 - min(raw_review_count, 40) / 40.0), 4)
    final_score = _strategic_rank_score(business)

    return {
        "verified_visits": verified_visits,
        "weighted_reviews": weighted_reviews,
        "recency_days": _recency_days(business),
        "engagement_rate": engagement_rate,
        "local_confidence": local_confidence,
        "freshness_boost": freshness_boost,
        "final_score": final_score,
    }

def _build_reason_codes(
    business: dict,
    ranking_components: dict,
    preference_match: Optional[dict] = None,
) -> list[str]:
    reason_codes: list[str] = []
    verified_visits = _safe_int(ranking_components.get("verified_visits"))
    weighted_reviews = _safe_float(ranking_components.get("weighted_reviews"))
    recency_days = _safe_float(ranking_components.get("recency_days"), default=365.0)
    engagement_rate = _safe_float(ranking_components.get("engagement_rate"))
    review_count = _safe_int(
        business.get("review_count"),
        business.get("total_reviews"),
    )
    trending_score = _safe_float(business.get("trending_score"))

    if verified_visits > 0 or business.get("is_active_today") or _safe_int(business.get("checkins_today")) > 0:
        reason_codes.append("VERIFIED_TODAY")
    if weighted_reviews >= 5:
        reason_codes.append("HIGH_TRUST")
    if recency_days <= 7 or (recency_days <= 14 and trending_score >= 8):
        reason_codes.append("RECENT_MOMENTUM")
    if engagement_rate >= 0.25 or trending_score >= 10:
        reason_codes.append("HIGH_ENGAGEMENT")
    if business.get("is_claimed"):
        reason_codes.append("CLAIMED")
    if (
        str(business.get("business_type", "")).lower() == "independent"
        or ranking_components["local_confidence"] >= 0.75
    ):
        reason_codes.append("INDEPENDENT")
    if review_count <= 10 and (
        engagement_rate >= 0.2
        or recency_days <= 10
        or trending_score >= 6
    ):
        reason_codes.append("HIDDEN_GEM")

    if not reason_codes and ranking_components["freshness_boost"] >= 0.5:
        reason_codes.append("RECENT_MOMENTUM")

    for match_code in (preference_match or {}).get("reason_codes", []):
        if match_code not in reason_codes:
            reason_codes.append(match_code)

    return reason_codes

def _apply_ranking_metadata(results: list[dict], lat: float, lng: float) -> None:
    for business in results:
        business["live_visibility_score"] = round(
            max(0.0, min(_safe_float(business.get("live_visibility_score")), 100.0)),
            2,
        )
        coords = (business.get("location") or {}).get("coordinates") or []
        if len(coords) >= 2:
            business["distance"] = round(
                _haversine_meters(lat, lng, coords[1], coords[0]) / 1000,
                2,
            )

        ranking_components = _build_ranking_components(business)
        business["ranking_components"] = ranking_components
        business["canonical_rank_score"] = ranking_components["final_score"]
        business["reason_codes"] = _build_reason_codes(
            business,
            ranking_components,
            business.get("preference_match"),
        )

def _canonical_score(business: dict) -> float:
    return _safe_float(
        (business.get("ranking_components") or {}).get("final_score"),
        business.get("canonical_rank_score"),
        business.get("live_visibility_score"),
    )

def _sort_businesses(results: list[dict], sort_mode: str) -> None:
    if sort_mode == "distance":
        results.sort(
            key=lambda b: (
                _safe_float(b.get("distance"), default=float("inf")),
                -_canonical_score(b),
            )
        )
    elif sort_mode == "newest":
        results.sort(
            key=lambda b: (
                _coerce_datetime(b.get("created_at")) or datetime.min,
                _canonical_score(b),
            ),
            reverse=True,
        )
    elif sort_mode == "most_reviewed":
        results.sort(
            key=lambda b: (
                _safe_int(b.get("review_count"), b.get("total_reviews")),
                _canonical_score(b),
            ),
            reverse=True,
        )
    else:
        results.sort(
            key=lambda b: (
                _canonical_score(b),
                _safe_float(b.get("live_visibility_score")),
            ),
            reverse=True,
        )

async def _derive_user_preferences(
    current_user: Optional[User],
    businesses_collection,
) -> dict:
    preferences = {
        "categories": set(),
        "tags": set(),
        "prefer_independent": 0.5,
        "price_pref": None,
        "discovery_mode": "trusted",
    }
    if current_user is None:
        return preferences

    preferences["categories"] = {
        str(category).strip()
        for category in (getattr(current_user, "preferred_categories", []) or [])
        if str(category).strip()
    }
    preferences["tags"] = {
        str(tag).strip()
        for tag in (getattr(current_user, "preferred_vibes", []) or [])
        if str(tag).strip()
    }
    preferences["prefer_independent"] = _safe_float(getattr(current_user, "prefer_independent", 0.5) or 0.5)
    preferences["price_pref"] = getattr(current_user, "price_pref", None)
    preferences["discovery_mode"] = str(getattr(current_user, "discovery_mode", "trusted") or "trusted")

    if (
        getattr(current_user, "preferences_completed", False)
        or preferences["categories"]
        or preferences["tags"]
        or preferences["price_pref"] is not None
    ):
        return preferences

    if not getattr(current_user, "favorites", None):
        return preferences

    favorite_ids = [fav for fav in current_user.favorites if ObjectId.is_valid(fav)]
    if not favorite_ids:
        return preferences

    docs = await businesses_collection.find(
        {"_id": {"$in": [ObjectId(fav) for fav in favorite_ids]}},
        {"category": 1, "known_for": 1, "local_confidence": 1, "business_type": 1},
    ).to_list(length=20)

    category_counts: dict[str, int] = {}
    tag_counts: dict[str, int] = {}
    independent_hits = 0

    for doc in docs:
        category = str(doc.get("category") or "").strip()
        if category:
            category_counts[category] = category_counts.get(category, 0) + 1

        for tag in doc.get("known_for") or []:
            normalized_tag = str(tag).strip()
            if not normalized_tag:
                continue
            tag_counts[normalized_tag] = tag_counts.get(normalized_tag, 0) + 1

        if (
            str(doc.get("business_type", "")).lower() == "independent"
            or _safe_float(doc.get("local_confidence")) >= 0.75
        ):
            independent_hits += 1

    preferences["categories"] = {
        category for category, _ in sorted(category_counts.items(), key=lambda item: item[1], reverse=True)[:3]
    }
    preferences["tags"] = {
        tag for tag, _ in sorted(tag_counts.items(), key=lambda item: item[1], reverse=True)[:6]
    }
    preferences["prefer_independent"] = 0.8 if bool(docs) and independent_hits >= max(1, len(docs) // 2) else 0.5
    return preferences

def _preference_match_score(business: dict, preferences: dict) -> float:
    related_categories = {
        "Restaurants": {"Cafes & Coffee", "Bars & Nightlife"},
        "Cafes & Coffee": {"Restaurants", "Bars & Nightlife"},
        "Bars & Nightlife": {"Restaurants", "Entertainment"},
        "Fitness & Wellness": {"Beauty & Spas", "Active Life"},
        "Beauty & Spas": {"Fitness & Wellness", "Health & Medical"},
        "Shopping": {"Local Services", "Grocery"},
        "Entertainment": {"Bars & Nightlife", "Active Life"},
    }

    preferred_categories = {str(category).strip() for category in preferences.get("categories", set()) if str(category).strip()}
    preferred_tags = {str(tag).strip().lower() for tag in preferences.get("tags", set()) if str(tag).strip()}
    business_category = str(business.get("category") or "").strip()
    business_tags = {str(tag).strip() for tag in business.get("known_for") or [] if str(tag).strip()}
    business_tag_keys = {tag.lower() for tag in business_tags}

    category_score = 0.0
    matched_categories: list[str] = []
    if business_category and business_category in preferred_categories:
        category_score = 1.0
        matched_categories = [business_category]
    else:
        for preferred_category in preferred_categories:
            if business_category in related_categories.get(preferred_category, set()):
                category_score = max(category_score, 0.6)
                matched_categories.append(preferred_category)

    matched_vibes = [tag for tag in business_tags if tag.lower() in preferred_tags]
    vibe_score = min(len(matched_vibes), 3) / 3 if preferred_tags else 0.0

    prefers_independent = _safe_float(preferences.get("prefer_independent", 0.5))
    is_independent = (
        str(business.get("business_type", "")).lower() == "independent"
        or _safe_float((business.get("ranking_components") or {}).get("local_confidence")) >= 0.75
    )
    if prefers_independent >= 0.5:
        independent_score = prefers_independent if is_independent else max(0.0, 1.0 - prefers_independent)
    else:
        independent_score = (1.0 - prefers_independent) if not is_independent else max(0.0, prefers_independent)
    independent_score = max(0.0, min(independent_score, 1.0))

    price_pref = str(preferences.get("price_pref") or "")
    budget_tags = {"budget-friendly", "casual", "quick bites"}
    premium_tags = {"premium", "fine dining", "luxury", "date night"}
    moderate_tags = {"brunch", "neighborhood favorite", "cozy", "craft"}
    if not price_pref:
        price_score = 0.5
    elif price_pref == "$":
        price_score = 1.0 if business_tag_keys.intersection(budget_tags) else 0.2
    elif price_pref == "$$$":
        price_score = 1.0 if business_tag_keys.intersection(premium_tags) else 0.2
    else:
        price_score = 1.0 if business_tag_keys.intersection(moderate_tags.union({"budget-friendly", "premium"})) else 0.35

    weighted_score = (
        category_score * 0.4
        + vibe_score * 0.3
        + independent_score * 0.2
        + price_score * 0.1
    )

    if not preferred_categories and not preferred_tags and not price_pref:
        weighted_score = max(weighted_score, min(_safe_float((business.get("ranking_components") or {}).get("local_confidence")), 1.0))

    reason_codes: list[str] = []
    if matched_categories:
        reason_codes.append("MATCHED_CATEGORIES")
    if matched_vibes:
        reason_codes.append("MATCHED_VIBES")
    if (
        (prefers_independent >= 0.6 and is_independent)
        or (prefers_independent <= 0.4 and not is_independent)
    ):
        reason_codes.append("INDEPENDENT_MATCH")
    if price_pref and price_score >= 0.75:
        reason_codes.append("PRICE_MATCH")

    business["preference_match"] = {
        "score": round(max(0.0, min(weighted_score, 1.0)), 3),
        "matched_categories": matched_categories[:2],
        "matched_vibes": matched_vibes[:3],
        "reason_codes": reason_codes,
    }
    return business["preference_match"]["score"]

def _build_lane_payload(
    lane_id: str,
    title: str,
    subtitle: str,
    items: list[dict],
) -> dict:
    return {
        "id": lane_id,
        "title": title,
        "subtitle": subtitle,
        "items": items[:LANE_ITEM_LIMIT],
    }

def _normalize_decide_intents(raw_values: list[str]) -> list[str]:
    normalized: list[str] = []
    seen: set[str] = set()
    for value in raw_values:
        normalized_value = str(value or "").strip().upper()
        if not normalized_value or normalized_value in seen:
            continue
        if normalized_value not in DECIDE_INTENTS:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid intent. Expected one of: {', '.join(sorted(DECIDE_INTENTS))}",
            )
        seen.add(normalized_value)
        normalized.append(normalized_value)
    return normalized

def _category_affinity_score(business: dict, intent: str) -> float:
    category = str(business.get("category") or "").strip().lower()
    google_types = {str(item).strip().lower() for item in business.get("google_types") or [] if str(item).strip()}
    known_for = {str(item).strip().lower() for item in business.get("known_for") or [] if str(item).strip()}

    def has_any(*values: str) -> bool:
        return any(value in google_types or value in known_for or value == category for value in values)

    if intent in {"DINNER", "QUICK_BITE"}:
        if category in {"restaurants", "food"} or has_any("restaurant", "meal_takeaway", "meal_delivery", "food"):
            return 1.0
        if category in {"cafes & coffee", "bars & nightlife"} or has_any("cafe", "bakery", "bar"):
            return 0.45
        return 0.0

    if intent == "DATE_NIGHT":
        if category in {"restaurants", "bars & nightlife"} or has_any("restaurant", "bar"):
            return 1.0
        if "date night" in known_for or "cocktails" in known_for or "cozy" in known_for:
            return 0.85
        return 0.15 if category in {"cafes & coffee", "entertainment"} else 0.0

    if intent in {"COFFEE", "STUDY"}:
        if category == "cafes & coffee" or has_any("cafe", "bakery"):
            return 1.0
        if category == "restaurants":
            return 0.25
        return 0.0

    if intent == "DESSERT":
        if has_any("bakery", "dessert", "ice_cream", "bubble_tea") or "dessert" in known_for or "sweet treats" in known_for:
            return 1.0
        if category == "cafes & coffee":
            return 0.45
        return 0.0

    return 0.0

def _walkable_score(distance_km: float, radius_km: float) -> float:
    target = min(max(radius_km * 0.25, 0.8), min(1.2, max(radius_km, 0.8)))
    if distance_km <= target:
        return round(max(0.0, 1.0 - (distance_km / max(target, 0.1))), 4)
    if distance_km <= target * 1.5:
        overshoot = distance_km - target
        return round(max(0.0, 0.4 - (overshoot / max(target, 0.1)) * 0.4), 4)
    return 0.0

def _intent_fit_score(
    business: dict,
    ranking_intent: str,
    constraints: list[str],
    radius_km: float,
) -> float:
    all_intents = [ranking_intent, *constraints]
    ranking = business.get("ranking_components") or {}
    review_count = _safe_int(business.get("review_count"), business.get("total_reviews"))
    weighted_reviews = _safe_float(ranking.get("weighted_reviews"))
    recency_days = _safe_float(ranking.get("recency_days"), default=365.0)
    engagement_rate = _safe_float(ranking.get("engagement_rate"))
    freshness_boost = _safe_float(ranking.get("freshness_boost"))
    checkins_today = _safe_int(ranking.get("verified_visits"), business.get("checkins_today"))
    distance_km = _safe_float(business.get("distance"), default=max(radius_km, 1.0))
    open_now = business.get("open_now")
    price_level = business.get("price_level")
    known_for = {str(item).strip().lower() for item in business.get("known_for") or [] if str(item).strip()}

    score = 0.0
    for intent in all_intents:
        if intent in {"DINNER", "COFFEE", "STUDY", "DATE_NIGHT", "QUICK_BITE", "DESSERT"}:
            score += 1.15 * _category_affinity_score(business, intent)
            if intent == "STUDY":
                if {"quiet", "cozy", "study spot"}.intersection(known_for):
                    score += 0.45
                else:
                    score += 0.15 * _category_affinity_score(business, "COFFEE")
        elif intent == "WALKABLE":
            score += 1.1 * _walkable_score(distance_km, radius_km)
        elif intent == "OPEN_NOW":
            if open_now is True:
                score += 1.0
            elif open_now is False:
                score -= 0.2
        elif intent == "CHEAP":
            if isinstance(price_level, (int, float)):
                score += max(0.0, min((3.0 - float(price_level)) / 2.0, 1.0))
        elif intent == "TRENDING":
            score += (
                min(checkins_today / 5.0, 1.0) * 0.45
                + engagement_rate * 0.35
                + max(0.0, 1.0 - min(recency_days, 14.0) / 14.0) * 0.2
            )
        elif intent == "MOST_TRUSTED":
            score += (
                min(weighted_reviews / 12.0, 1.0) * 0.6
                + min(_safe_float(business.get("live_visibility_score")) / 100.0, 1.0) * 0.4
            )
        elif intent == "HIDDEN_GEM":
            score += (
                max(0.0, 1.0 - min(review_count, 20) / 20.0) * 0.5
                + max(engagement_rate, freshness_boost, min(checkins_today / 4.0, 1.0)) * 0.5
            )

    return round(score, 4)

def _apply_decide_constraints(
    items: list[dict],
    ranking_intent: str,
    constraints: list[str],
) -> tuple[list[dict], list[str]]:
    explanations: list[str] = []
    requested = {ranking_intent, *constraints}
    constrained_items = list(items)

    if any(intent in requested for intent in {"DINNER", "QUICK_BITE", "DATE_NIGHT"}):
        explanations.append("Prioritized food-forward picks first.")
    elif any(intent in requested for intent in {"COFFEE", "STUDY"}):
        explanations.append("Leaned toward cafes and bakery-style spots.")
    elif "DESSERT" in requested:
        explanations.append("Favored dessert, bakery, and treat-focused spots.")

    if "OPEN_NOW" in requested:
        open_now_items = [item for item in constrained_items if item.get("open_now") is True]
        known_open_data = any(item.get("open_now") is not None for item in constrained_items)
        if open_now_items:
            constrained_items = open_now_items
            explanations.append("Filtered to places marked open now.")
        elif known_open_data:
            constrained_items = []
            explanations.append("No nearby places are marked open now.")
        else:
            explanations.append("Hours data unavailable for some places.")

    if "WALKABLE" in requested:
        explanations.append("Boosted close-by options that feel walkable.")
    if "CHEAP" in requested:
        explanations.append("Preferred lower-price options when price data exists.")
    if ranking_intent == "TRENDING":
        explanations.append("Started from businesses with strong recent momentum.")
    elif ranking_intent == "HIDDEN_GEM":
        explanations.append("Started from lower-review businesses with fresh momentum.")
    elif ranking_intent == "MOST_TRUSTED":
        explanations.append("Started from the strongest credibility-weighted businesses.")

    explanations.append("Final order still follows Live Visibility.")
    return constrained_items, explanations[:4]

def _dedupe_discovery_results(results: list[dict], limit: int) -> list[dict]:
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
        existing_images = doc.get("image_urls") or []
        doc["image_urls"] = [updates[place_id], *[url for url in existing_images if url != updates[place_id]]]
        if doc.get("_id"):
            ops.append(
                UpdateOne(
                    {"_id": doc["_id"]},
                    {
                        "$set": {
                            "image_url": updates[place_id],
                            "image_urls": doc["image_urls"][:8],
                            "updated_at": now,
                        }
                    },
                )
            )

    if ops:
        await businesses_collection.bulk_write(ops, ordered=False)

def _finalize_discovery_results(
    results: list[dict],
    sort_mode: str,
    limit: int,
    lat: float,
    lng: float,
) -> list[dict]:
    _apply_ranking_metadata(results, lat, lng)
    _sort_businesses(results, sort_mode)
    return [business_helper(item) for item in _dedupe_discovery_results(results, limit)]

def business_helper(doc: dict) -> dict:
    if doc is None:
        return doc
    doc["id"] = str(doc.pop("_id"))
    if "rating_average" in doc:
        doc.setdefault("rating", doc.pop("rating_average", 0.0))
    doc.setdefault("rating", 0.0)
    if "total_reviews" in doc:
        doc.setdefault("review_count", doc.pop("total_reviews", 0))
    doc.setdefault("review_count", 0)
    doc.setdefault("has_deals", False)
    doc.setdefault("image_url", doc.pop("image", ""))
    _with_primary_image(doc)
    normalize_business_metadata(doc)
    if "owner_id" in doc and doc["owner_id"]:
        doc["owner_id"] = str(doc["owner_id"])
    return doc

@router.get("/decide")
async def decide_for_me(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius_km: float = Query(..., ge=0.1, le=50),
    intent: str = Query(..., description="Primary decide intent"),
    category: Optional[str] = None,
    limit: int = Query(3, ge=1, le=12),
    constraints: Optional[str] = Query(None, description="Optional comma-separated fit constraints"),
):
    ranking_intents = {"TRENDING", "HIDDEN_GEM", "MOST_TRUSTED"}
    normalized_intent = _normalize_decide_intents([intent])[0]
    normalized_constraints = _normalize_decide_intents((constraints or "").split(","))
    effective_constraints = [value for value in normalized_constraints if value != normalized_intent]

    candidate_limit = min(max(limit * 20, 90), 240)
    base_items = await discover_businesses(
        lat=lat,
        lng=lng,
        radius=radius_km,
        category=category,
        limit=candidate_limit,
        sort_mode="canonical",
        refresh=False,
    )

    constrained_items, intent_explanation = _apply_decide_constraints(
        base_items,
        normalized_intent,
        effective_constraints,
    )
    if not constrained_items:
        return {
            "items": [],
            "intent_explanation": intent_explanation,
        }

    scored_items: list[dict] = []
    for item in constrained_items:
        item_copy = dict(item)
        item_copy["intent_fit_score"] = _intent_fit_score(
            item_copy,
            normalized_intent,
            effective_constraints,
            radius_km,
        )
        scored_items.append(item_copy)

    scored_items.sort(
        key=lambda item: (
            _safe_float(item.get("intent_fit_score")),
            _canonical_score(item),
            -_safe_float(item.get("distance"), default=9999.0),
        ),
        reverse=True,
    )
    candidate_pool = scored_items[: min(max(limit * 8, 50), len(scored_items))]

    if normalized_intent not in ranking_intents and any(intent in ranking_intents for intent in effective_constraints):
        ranking_lens = next(intent for intent in effective_constraints if intent in ranking_intents)
        candidate_pool.sort(
            key=lambda item: (
                _intent_fit_score(item, ranking_lens, [], radius_km),
                _safe_float(item.get("intent_fit_score")),
                _canonical_score(item),
            ),
            reverse=True,
        )
        candidate_pool = candidate_pool[: min(max(limit * 6, 30), len(candidate_pool))]

    candidate_pool.sort(
        key=lambda item: (
            _canonical_score(item),
            _safe_float(item.get("intent_fit_score")),
            -_safe_float(item.get("distance"), default=9999.0),
        ),
        reverse=True,
    )

    items = [_with_primary_image(item) for item in candidate_pool[:limit]]

    return {
        "items": items,
        "intent_explanation": intent_explanation,
    }

@router.get("/discover")
async def discover_businesses(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(5, ge=0.1, le=50, description="Radius in km"),
    category: Optional[str] = None,
    limit: int = Query(200, ge=1, le=300),
    sort_mode: str = Query(
        "canonical",
        description="Sort: canonical | distance | newest | most_reviewed",
    ),
    refresh: bool = Query(False, description="Force bypass geo cache and refetch Places data"),
):
    businesses = get_businesses_collection()
    geo_cache = get_geo_cache_collection()
    radius_meters = radius * 1000
    candidate_limit = min(max(limit * 2, limit), 300)
    normalized_sort_mode = _normalize_sort_mode(sort_mode)

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

    results = await _load_discovery_candidates(businesses, geo_filter, candidate_limit)

    if len(results) >= MIN_RESULTS:
        return await _finalize_discovery_payload(businesses, results, normalized_sort_mode, limit, lat, lng)

    cell = geo_cell_key(lat, lng, int(radius_meters))
    cache_cutoff = datetime.utcnow() - timedelta(hours=CACHE_TTL_HOURS)

    cached = await geo_cache.find_one({
        **cell,
        "fetched_at": {"$gte": cache_cutoff},
    })

    if cached and not refresh:
        return await _finalize_discovery_payload(businesses, results, normalized_sort_mode, limit, lat, lng)

    new_places = await search_google_places(
        lat,
        lng,
        int(radius_meters),
        max_results=candidate_limit,
    )

    if new_places:
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

    await geo_cache.update_one(
        cell,
        {"$set": {**cell, "fetched_at": datetime.utcnow(), "result_count": len(new_places)}},
        upsert=True,
    )

    results = await _load_discovery_candidates(businesses, geo_filter, candidate_limit)
    return await _finalize_discovery_payload(businesses, results, normalized_sort_mode, limit, lat, lng)

@router.get("/explore/lanes")
async def get_explore_lanes(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
    radius: float = Query(5, ge=0.1, le=50, description="Radius in km"),
    limit: int = Query(120, ge=24, le=240),
    current_user: Optional[User] = Depends(get_current_user_optional),
):
    lane_cache_key = _lanes_cache_key(lat, lng, radius, limit, current_user)
    cached_payload = _get_lanes_cache(lane_cache_key)
    if cached_payload:
        return cached_payload

    businesses_collection = get_businesses_collection()
    try:
        base_items = await asyncio.wait_for(
            discover_businesses(
                lat=lat,
                lng=lng,
                radius=radius,
                category=None,
                limit=limit,
                sort_mode="canonical",
                refresh=False,
            ),
            timeout=8.0,
        )
    except asyncio.TimeoutError as exc:
        raise HTTPException(
            status_code=status.HTTP_504_GATEWAY_TIMEOUT,
            detail="Explore lanes took too long to load. Please try again.",
        ) from exc

    preferences = await _derive_user_preferences(current_user, businesses_collection)

    scored_for_you = []
    for item in base_items:
        preference_score = _preference_match_score(item, preferences)
        if preference_score > 0:
            enriched = dict(item)
            enriched["preference_score"] = preference_score
            enriched["reason_codes"] = _build_reason_codes(
                enriched,
                enriched.get("ranking_components") or _build_ranking_components(enriched),
                enriched.get("preference_match"),
            )
            scored_for_you.append(enriched)

    scored_for_you.sort(
        key=lambda item: (
            _safe_float(item.get("preference_score")),
            _canonical_score(item),
        ),
        reverse=True,
    )
    for_you_pool = scored_for_you[: max(LANE_ITEM_LIMIT * 2, 18)] if scored_for_you else base_items[:LANE_ITEM_LIMIT]
    for_you_items = sorted(for_you_pool, key=_canonical_score, reverse=True)[:LANE_ITEM_LIMIT]

    active_items = [item for item in base_items if _is_recently_active(item)][:LANE_ITEM_LIMIT]

    hidden_gems_items = [
        item for item in base_items
        if _safe_int(item.get("review_count")) <= 10
        and (
            _safe_float((item.get("ranking_components") or {}).get("freshness_boost")) >= 0.55
            or _safe_float(item.get("trending_score")) >= 6
        )
    ][:LANE_ITEM_LIMIT]

    trusted_items = [
        item for item in base_items
        if _safe_float((item.get("ranking_components") or {}).get("weighted_reviews")) >= 5
        and _safe_float((item.get("ranking_components") or {}).get("recency_days")) <= 45
    ][:LANE_ITEM_LIMIT]

    if not active_items:
        active_items = [item for item in base_items if _safe_int(item.get("checkins_today")) > 0][:LANE_ITEM_LIMIT]
    if not hidden_gems_items:
        hidden_gems_items = [
            item for item in base_items
            if _safe_float((item.get("ranking_components") or {}).get("freshness_boost")) >= 0.6
        ][:LANE_ITEM_LIMIT]
    if not trusted_items:
        trusted_items = [
            item for item in base_items
            if _safe_float(item.get("live_visibility_score")) >= 50
        ][:LANE_ITEM_LIMIT]

    lanes = [
        _build_lane_payload("for_you", "For You", "Based on your interests", for_you_items),
        _build_lane_payload("active", "Active Near You", "Verified activity today", active_items),
        _build_lane_payload("hidden_gems", "Hidden Gems", "New & rising momentum", hidden_gems_items),
        _build_lane_payload("trusted", "Trusted Staples", "Consistent credibility", trusted_items),
    ]

    payload = {"lanes": lanes}
    _set_lanes_cache(lane_cache_key, payload)
    return payload

@router.post("/discover/enrich-photos")
async def enrich_google_place_photos(
    limit: int = Query(1200, ge=1, le=5000, description="Max businesses to scan"),
    batch_size: int = Query(120, ge=10, le=300, description="Batch size per enrichment pass"),
):
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
                {
                    "$set": {
                        "image_url": photo_updates[doc["place_id"]],
                        "image_urls": [
                            photo_updates[doc["place_id"]],
                            *[
                                url
                                for url in (doc.get("image_urls") or [])
                                if url != photo_updates[doc["place_id"]]
                            ],
                        ][:8],
                        "updated_at": now,
                    }
                },
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

VISIT_MAX_DISTANCE_METERS = 100

def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    R = 6_371_000
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
    businesses = get_businesses_collection()
    visits = get_visits_collection()

    business_key = _as_object_id(business_id, "business ID")
    business = await businesses.find_one({"_id": business_key})
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")

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

    await _recalculate_visibility(business_id)

    return {"status": "verified", "distance_meters": round(distance, 1)}

async def _recalculate_visibility(business_id: str):
    businesses = get_businesses_collection()
    visits = get_visits_collection()
    reviews = get_reviews_collection()
    checkins = get_checkins_collection()
    credibility = get_credibility_collection()
    business_key = _as_object_id(business_id, "business ID")

    verified_visit_count = await visits.count_documents({"business_id": business_id, "verified": True})
    review_docs = await reviews.find({"business_id": business_id}, {"user_id": 1, "created_at": 1}).to_list(length=None)
    review_count = len(review_docs)

    reviewer_ids = sorted({doc.get("user_id") for doc in review_docs if doc.get("user_id")})
    credibility_by_user: dict[str, float] = {}
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

    weighted_review_count = sum(
        reviewer_credibility_weight(credibility_by_user.get(review.get("user_id")))
        for review in review_docs
    )

    last_visit = await visits.find_one({"business_id": business_id}, sort=[("created_at", -1)])
    last_review = await reviews.find_one({"business_id": business_id}, sort=[("created_at", -1)])
    last_activity_at = _latest_created_at(last_visit, last_review)

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
        {"_id": business_key},
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

@router.delete("/purge-chains")
async def purge_chain_businesses():
    businesses = get_businesses_collection()

    cursor = businesses.find({"source": "google_places", "is_claimed": {"$ne": True}})
    docs = await cursor.to_list(length=None)

    to_delete_ids = []
    confidence_updates = 0

    for doc in docs:
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
