"""
Google Places Nearby Search integration for Vantage.

- Maps Google place types to rich Vantage categories.
- Returns MongoDB-ready dicts with place_id, GeoJSON location, etc.
- Uses multi-query nearby fetches with pagination for broader local coverage.
- Every API call is logged to the api_usage_log collection.
- Contains geo_cell_key() helper for geo-cache cell computation.
"""

import math
import asyncio
from datetime import datetime
from typing import List, Dict, Optional

import httpx

from config import GOOGLE_API_KEY
from database.mongodb import get_api_usage_log_collection
from services.local_business_classifier import classify_local_business


# ── Google type → Vantage category mapping ──────────────────────────
_TYPE_MAP: Dict[str, str] = {
    # Food & Drink
    "restaurant": "Restaurants",
    "food": "Restaurants",
    "meal_delivery": "Restaurants",
    "meal_takeaway": "Restaurants",
    "cafe": "Cafes & Coffee",
    "bakery": "Cafes & Coffee",
    "bar": "Bars & Nightlife",
    "night_club": "Bars & Nightlife",
    # Shopping
    "clothing_store": "Shopping",
    "shoe_store": "Shopping",
    "shopping_mall": "Shopping",
    "store": "Shopping",
    "department_store": "Shopping",
    "home_goods_store": "Shopping",
    "furniture_store": "Shopping",
    "electronics_store": "Shopping",
    "book_store": "Shopping",
    "jewelry_store": "Shopping",
    "hardware_store": "Shopping",
    # Fitness & Wellness
    "gym": "Fitness & Wellness",
    "spa": "Beauty & Spas",
    "beauty_salon": "Beauty & Spas",
    "hair_care": "Beauty & Spas",
    # Health
    "doctor": "Health & Medical",
    "dentist": "Health & Medical",
    "hospital": "Health & Medical",
    "pharmacy": "Health & Medical",
    "veterinary_care": "Health & Medical",
    "physiotherapist": "Health & Medical",
    # Financial
    "bank": "Financial Services",
    "accounting": "Financial Services",
    "insurance_agency": "Financial Services",
    # Automotive
    "car_dealer": "Automotive",
    "car_repair": "Automotive",
    "car_wash": "Automotive",
    "gas_station": "Automotive",
    # Entertainment
    "movie_theater": "Entertainment",
    "amusement_park": "Entertainment",
    "bowling_alley": "Entertainment",
    "museum": "Entertainment",
    "art_gallery": "Entertainment",
    "tourist_attraction": "Entertainment",
    "stadium": "Entertainment",
    # Travel
    "lodging": "Hotels & Travel",
    "travel_agency": "Hotels & Travel",
    "airport": "Hotels & Travel",
    # Professional
    "real_estate_agency": "Professional Services",
    "lawyer": "Professional Services",
    # Home
    "plumber": "Home Services",
    "electrician": "Home Services",
    "locksmith": "Home Services",
    "painter": "Home Services",
    "roofing_contractor": "Home Services",
    "moving_company": "Home Services",
    # Pets
    "pet_store": "Pets",
    # Education
    "school": "Education",
    "university": "Education",
    "library": "Education",
    # Grocery
    "supermarket": "Grocery",
    "grocery_or_supermarket": "Grocery",
    "convenience_store": "Grocery",
    # Local Services
    "laundry": "Local Services",
    "post_office": "Local Services",
    "parking": "Local Services",
    # Active Life
    "park": "Active Life",
}


def _map_category(types: list[str]) -> str:
    """Return the first matching Vantage category or 'Other'."""
    for t in types:
        if t in _TYPE_MAP:
            return _TYPE_MAP[t]
    return "Other"


# ── Geo-cell helpers ────────────────────────────────────────────────

def _radius_bucket(radius_m: int) -> int:
    """Round a radius (meters) to standard buckets for cache keys."""
    for bucket in (1000, 3000, 5000, 10000, 25000, 50000):
        if radius_m <= bucket:
            return bucket
    return 50000


def geo_cell_key(lat: float, lng: float, radius_m: int) -> dict:
    """
    Return a dict that uniquely identifies a ~1 km grid cell + radius tier.
    Used as a filter when querying / upserting the geo_cache collection.
    """
    return {
        "cell_lat": round(lat, 2),   # ~1.1 km resolution
        "cell_lng": round(lng, 2),
        "radius_bucket": _radius_bucket(radius_m),
    }


# ── Main search function ───────────────────────────────────────────

GOOGLE_NEARBY_URL = "https://maps.googleapis.com/maps/api/place/nearbysearch/json"
GOOGLE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
GOOGLE_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo"
MAX_RETURN_RESULTS = 250
PHOTO_MAX_WIDTH = 1200
PHOTO_ENRICHMENT_CONCURRENCY = 6


def _build_photo_url(photo_reference: str, max_width: int = PHOTO_MAX_WIDTH) -> str:
    """Build a Google Places Photo URL for a place photo_reference."""
    if not photo_reference or not GOOGLE_API_KEY:
        return ""
    return (
        f"{GOOGLE_PHOTO_URL}"
        f"?maxwidth={max_width}&photo_reference={photo_reference}&key={GOOGLE_API_KEY}"
    )


def _choose_photo_reference(photos: list[dict]) -> str:
    """
    Pick the best available photo reference.
    Prefer larger resolution photos when width/height metadata exists.
    """
    if not photos:
        return ""

    best_ref = ""
    best_score = -1
    for photo in photos:
        ref = photo.get("photo_reference", "")
        if not ref:
            continue
        width = int(photo.get("width") or 0)
        height = int(photo.get("height") or 0)
        score = width * max(height, 1)
        if score > best_score:
            best_score = score
            best_ref = ref

    if best_ref:
        return best_ref

    return photos[0].get("photo_reference", "") if photos else ""


async def _fetch_place_photo_reference(client: httpx.AsyncClient, place_id: str) -> str:
    """Fetch best photo_reference for a place via Place Details API."""
    try:
        params = {
            "place_id": place_id,
            "fields": "photos",
            "key": GOOGLE_API_KEY,
        }
        resp = await client.get(GOOGLE_DETAILS_URL, params=params)
        data = resp.json()
        status = data.get("status")
        result = data.get("result", {})
        photos = result.get("photos", []) if isinstance(result, dict) else []
        await _log_api_call("place_details:photos", {"place_id": place_id}, status, len(photos))

        if status != "OK":
            return ""
        return _choose_photo_reference(photos)
    except Exception as e:
        print(f"Google Details photo lookup failed for {place_id}: {e}")
        return ""


def _needs_photo_enrichment(doc: dict) -> bool:
    """
    Identify Google-seeded docs that should get a better image.
    - Missing image
    - Non-Google fallback image
    - Legacy low-res Google photo URL (maxwidth=400)
    """
    if not doc.get("place_id"):
        return False
    if doc.get("source") not in (None, "google_places"):
        return False

    image_url = (doc.get("image_url") or "").strip()
    if not image_url:
        return True
    if "maps.googleapis.com/maps/api/place/photo" not in image_url:
        return True
    return "maxwidth=400" in image_url


async def enrich_business_photo_urls(
    business_docs: List[Dict],
    max_to_enrich: int = 24,
) -> Dict[str, str]:
    """
    Resolve better Google photo URLs for businesses that have missing/low-quality images.
    Returns a mapping of place_id -> image_url for successful enrichments.
    """
    if not GOOGLE_API_KEY:
        return {}

    place_ids: list[str] = []
    seen: set[str] = set()
    for doc in business_docs:
        place_id = (doc.get("place_id") or "").strip()
        if not place_id or place_id in seen:
            continue
        if not _needs_photo_enrichment(doc):
            continue
        seen.add(place_id)
        place_ids.append(place_id)

    if not place_ids:
        return {}

    place_ids = place_ids[:max_to_enrich]
    updates: Dict[str, str] = {}
    semaphore = asyncio.Semaphore(PHOTO_ENRICHMENT_CONCURRENCY)

    async with httpx.AsyncClient(timeout=15) as client:
        async def enrich_one(place_id: str):
            async with semaphore:
                photo_ref = await _fetch_place_photo_reference(client, place_id)
                if photo_ref:
                    updates[place_id] = _build_photo_url(photo_ref)

        await asyncio.gather(*(enrich_one(pid) for pid in place_ids))

    return updates


async def _fetch_nearby_pages(client: httpx.AsyncClient, base_params: dict, label: str) -> list[dict]:
    """Fetch first page + up to 2 token pages for one Nearby Search query."""
    resp = await client.get(GOOGLE_NEARBY_URL, params=base_params)
    data = resp.json()
    status = data.get("status")
    results = data.get("results", [])
    await _log_api_call(label, base_params, status, len(results))

    if status not in ("OK", "ZERO_RESULTS"):
        print(f"Google Places error: {status} - {data.get('error_message', '')}")
        return []

    all_results = list(results)

    for _ in range(2):
        token = data.get("next_page_token")
        if not token:
            break

        page_data = None
        for __ in range(3):
            await asyncio.sleep(2)
            page_resp = await client.get(
                GOOGLE_NEARBY_URL,
                params={"pagetoken": token, "key": GOOGLE_API_KEY},
            )
            page_data = page_resp.json()
            if page_data.get("status") != "INVALID_REQUEST":
                break

        if not page_data:
            break

        await _log_api_call(
            f"{label}:page",
            {"pagetoken": token[:20]},
            page_data.get("status"),
            len(page_data.get("results", [])),
        )

        if page_data.get("status") not in ("OK", "ZERO_RESULTS"):
            break

        all_results.extend(page_data.get("results", []))
        data = page_data

    return all_results


async def search_google_places(
    lat: float,
    lng: float,
    radius_m: int = 5000,
    keyword: Optional[str] = None,
    max_results: int = MAX_RETURN_RESULTS,
) -> List[Dict]:
    """
    Call Google Places Nearby Search and return MongoDB-ready dicts.
    Uses one broad query plus several type-specific queries and de-dupes by place_id.
    Every call is logged to api_usage_log.
    """
    if not GOOGLE_API_KEY:
        print("GOOGLE_API_KEY not set - skipping Places lookup")
        return []

    base_params = {
        "location": f"{lat},{lng}",
        "radius": radius_m,
        "key": GOOGLE_API_KEY,
    }
    if keyword:
        base_params["keyword"] = keyword

    async with httpx.AsyncClient(timeout=15) as client:
        all_results: list[dict] = []
        all_results.extend(await _fetch_nearby_pages(client, dict(base_params), "nearbysearch"))

        typed_queries = ["restaurant", "cafe", "bar", "store", "beauty_salon"]
        for place_type in typed_queries:
            query_params = dict(base_params)
            query_params["type"] = place_type
            all_results.extend(
                await _fetch_nearby_pages(client, query_params, f"nearbysearch:{place_type}")
            )
            if len(all_results) >= max_results * 2:
                break

    # Convert to MongoDB-ready documents
    documents = []
    skipped_non_local = 0
    seen_place_ids: set[str] = set()

    for place in all_results:
        place_id = place.get("place_id")
        if not place_id or place_id in seen_place_ids:
            continue
        seen_place_ids.add(place_id)

        loc = place.get("geometry", {}).get("location", {})
        p_lat = loc.get("lat")
        p_lng = loc.get("lng")
        if p_lat is None or p_lng is None:
            continue

        is_local, confidence = classify_local_business(place)
        if not is_local:
            skipped_non_local += 1
            continue

        photos = place.get("photos", [])
        photo_ref = _choose_photo_reference(photos)
        image_url = _build_photo_url(photo_ref) if photo_ref else ""

        doc = {
            "name": place.get("name", "Unknown"),
            "place_id": place_id,
            "category": _map_category(place.get("types", [])),
            "google_types": place.get("types", []),
            "description": place.get("vicinity", ""),
            "address": place.get("vicinity", ""),
            "local_confidence": confidence,
            "location": {
                "type": "Point",
                "coordinates": [p_lng, p_lat],
            },
            # Platform-native reviews only: never ingest Google stars/counts.
            "rating_average": 0.0,
            "total_reviews": 0,
            "image_url": image_url,
            "phone": "",
            "email": "",
            "website": "",
            "hours": [],
            "is_seed": False,
            "is_claimed": False,
            "owner_id": None,
            "credibility_score": 0.0,
            "live_visibility_score": 0.0,
            "is_active_today": False,
            "checkins_today": 0,
            "trending_score": 0.0,
            "has_deals": False,
            "source": "google_places",
            "created_at": datetime.utcnow(),
            "updated_at": datetime.utcnow(),
        }
        documents.append(doc)
        if len(documents) >= max_results:
            break

    if skipped_non_local:
        print(f"Local classifier: kept {len(documents)}, skipped {skipped_non_local} non-local/chain results")

    return documents

async def _log_api_call(endpoint: str, params: dict, status: str, result_count: int):
    """Log every Google API call for auditing and cost tracking."""
    try:
        log_coll = get_api_usage_log_collection()
        await log_coll.insert_one({
            "service": "google_places",
            "endpoint": endpoint,
            "params": {k: v for k, v in params.items() if k != "key"},
            "status": status,
            "result_count": result_count,
            "called_at": datetime.utcnow(),
        })
    except Exception as e:
        print(f"Failed to log API call: {e}")

