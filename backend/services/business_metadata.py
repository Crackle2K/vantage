"""Business metadata normalization and enrichment.

Generates and normalizes business ``short_description``, long ``description``,
``known_for`` tags, and ``image_urls``. Uses category-to-singular mapping,
Google Place type-to-tag mapping, and category fallback tags to produce
consistent, well-formatted metadata even when source data is sparse.
"""
from __future__ import annotations

from typing import Iterable, Optional

from backend.services.photo_proxy import build_photo_proxy_url
from backend.utils.security import normalize_optional_url

_CATEGORY_TO_SINGULAR: dict[str, str] = {
    "Restaurants": "restaurant",
    "Cafes & Coffee": "cafe",
    "Bars & Nightlife": "bar",
    "Shopping": "shop",
    "Fitness & Wellness": "wellness studio",
    "Beauty & Spas": "beauty spot",
    "Health & Medical": "health practice",
    "Financial Services": "financial service",
    "Automotive": "auto service",
    "Entertainment": "entertainment spot",
    "Hotels & Travel": "travel stay",
    "Professional Services": "professional service",
    "Home Services": "home service",
    "Pets": "pet spot",
    "Education": "education hub",
    "Grocery": "grocery",
    "Local Services": "local service",
    "Active Life": "active life spot",
    "food": "restaurant",
    "retail": "shop",
    "services": "local service",
    "entertainment": "entertainment spot",
    "health": "health practice",
}

_TYPE_TO_TAG: dict[str, str] = {
    "restaurant": "Dining",
    "food": "Local Eats",
    "meal_delivery": "Delivery",
    "meal_takeaway": "Takeout",
    "cafe": "Coffee",
    "bakery": "Fresh Bakes",
    "bar": "Cocktails",
    "night_club": "Nightlife",
    "clothing_store": "Style",
    "shoe_store": "Footwear",
    "store": "Shopping",
    "department_store": "Selection",
    "home_goods_store": "Home Finds",
    "furniture_store": "Home Decor",
    "electronics_store": "Tech",
    "book_store": "Books",
    "jewelry_store": "Accessories",
    "hardware_store": "Essentials",
    "gym": "Fitness",
    "spa": "Relaxation",
    "beauty_salon": "Beauty",
    "hair_care": "Haircare",
    "doctor": "Primary Care",
    "dentist": "Dental Care",
    "hospital": "Medical Care",
    "pharmacy": "Pharmacy",
    "veterinary_care": "Pet Care",
    "physiotherapist": "Recovery",
    "bank": "Banking",
    "accounting": "Accounting",
    "insurance_agency": "Insurance",
    "car_dealer": "Vehicle Sales",
    "car_repair": "Repairs",
    "car_wash": "Car Wash",
    "gas_station": "Fuel Stop",
    "movie_theater": "Movies",
    "amusement_park": "Family Fun",
    "bowling_alley": "Bowling",
    "museum": "Culture",
    "art_gallery": "Art",
    "tourist_attraction": "Sightseeing",
    "stadium": "Events",
    "lodging": "Stay",
    "travel_agency": "Travel Planning",
    "airport": "Transit",
    "real_estate_agency": "Real Estate",
    "lawyer": "Legal Help",
    "plumber": "Plumbing",
    "electrician": "Electrical",
    "locksmith": "Security",
    "painter": "Painting",
    "roofing_contractor": "Roofing",
    "moving_company": "Moving",
    "pet_store": "Pet Supplies",
    "school": "Learning",
    "university": "Campus",
    "library": "Study Space",
    "supermarket": "Fresh Groceries",
    "grocery_or_supermarket": "Fresh Groceries",
    "convenience_store": "Quick Stops",
    "laundry": "Laundry",
    "post_office": "Shipping",
    "parking": "Parking",
    "park": "Outdoor Time",
}

_CATEGORY_FALLBACK_TAGS: dict[str, list[str]] = {
    "Restaurants": ["Dining", "Neighborhood Favorite", "Casual Bites"],
    "Cafes & Coffee": ["Coffee", "Cafe Hangout", "Neighborhood Favorite"],
    "Bars & Nightlife": ["Nightlife", "Cocktails", "After Hours"],
    "Shopping": ["Shopping", "Local Finds", "Browse Worthy"],
    "Fitness & Wellness": ["Fitness", "Wellness", "Routine Ready"],
    "Beauty & Spas": ["Beauty", "Self Care", "Appointments"],
    "Health & Medical": ["Care", "Appointments", "Professional"],
    "Financial Services": ["Finance", "Professional", "Local Service"],
    "Automotive": ["Auto Care", "Repairs", "Essentials"],
    "Entertainment": ["Fun", "Events", "Group Friendly"],
    "Hotels & Travel": ["Travel", "Stay", "Trip Ready"],
    "Professional Services": ["Professional", "Appointments", "Trusted Service"],
    "Home Services": ["Home Care", "Trusted Service", "Appointments"],
    "Pets": ["Pet Friendly", "Supplies", "Care"],
    "Education": ["Learning", "Classes", "Community Resource"],
    "Grocery": ["Groceries", "Everyday Essentials", "Fresh Picks"],
    "Local Services": ["Local Service", "Errands", "Essentials"],
    "Active Life": ["Outdoor Time", "Activity", "Community Spot"],
    "food": ["Dining", "Neighborhood Favorite", "Local Eats"],
    "retail": ["Shopping", "Local Finds", "Browse Worthy"],
    "services": ["Trusted Service", "Appointments", "Local Service"],
    "entertainment": ["Fun", "Events", "Group Friendly"],
    "health": ["Care", "Professional", "Appointments"],
}

_DEFAULT_TAGS = ["Neighborhood Favorite", "Community Pick", "Local Spot"]

def _normalize_tag(tag: str) -> str:
    normalized = " ".join((tag or "").strip().split())
    return normalized[:24]

def _titleize_category(category: str) -> str:
    if not category:
        return "business"
    singular = _CATEGORY_TO_SINGULAR.get(category, category)
    return singular.lower()

def _extract_area(address: str = "", city: str = "") -> str:
    if city:
        return city.strip()

    parts = [part.strip() for part in (address or "").split(",") if part.strip()]
    if len(parts) >= 2:
        return parts[-1]
    if parts:
        return parts[0]
    return "your area"

def generate_short_description(
    category: str = "",
    address: str = "",
    city: str = "",
    existing: str = "",
) -> str:
    """Generate a short description (tagline) for a business.

    Uses an existing description if provided and non-empty, otherwise
    generates one from the category and area (e.g. "Popular local cafe
    near Toronto").

    Args:
        category (str): Business category label.
        address (str): Street address.
        city (str): City name.
        existing (str): Existing short description to prefer.

    Returns:
        str: A tagline of up to 160 characters.
    """
    candidate = " ".join((existing or "").split()).strip()
    if candidate:
        return candidate[:160]

    category_label = _titleize_category(category)
    area_label = _extract_area(address=address, city=city)
    generated = f"Popular local {category_label} near {area_label}."
    return generated[:160]

def _join_tags(tags: Iterable[str]) -> str:
    cleaned = [str(tag).strip() for tag in tags if str(tag).strip()]
    if not cleaned:
        return ""
    if len(cleaned) == 1:
        return cleaned[0]
    if len(cleaned) == 2:
        return f"{cleaned[0]} and {cleaned[1]}"
    return f"{', '.join(cleaned[:-1])}, and {cleaned[-1]}"

def generate_long_description(
    category: str = "",
    address: str = "",
    city: str = "",
    short_description: str = "",
    existing: str = "",
    known_for: Optional[Iterable[str]] = None,
    business_type: str = "",
    is_claimed: bool = False,
    has_deals: bool = False,
) -> str:
    """Generate a long description for a business listing.

    Combines the short description, known-for tags, and business status
    (independent, claimed, or deals) into a flowing paragraph. Prefers
    an existing description if it is at least 90 characters.

    Args:
        category (str): Business category.
        address (str): Street address.
        city (str): City name.
        short_description (str): The tagline to build from.
        existing (str): Existing long description to prefer if substantial.
        known_for (Optional[Iterable[str]]): Feature tags.
        business_type (str): ``independent`` or other.
        is_claimed (bool): Whether the business is claimed.
        has_deals (bool): Whether the business has active deals.

    Returns:
        str: A description of up to 360 characters.
    """
    normalized_existing = " ".join((existing or "").split()).strip()
    normalized_address = " ".join((address or "").split()).strip()
    if normalized_existing and normalized_existing != normalized_address and len(normalized_existing) >= 90:
        return normalized_existing[:360]

    category_label = _titleize_category(category)
    area_label = _extract_area(address=address, city=city)
    summary = " ".join((short_description or "").split()).strip() or f"Popular local {category_label} near {area_label}."
    summary = summary.rstrip(".") + "."

    known_for_summary = _join_tags(list(known_for or [])[:3])
    if known_for_summary:
        detail_line = f"Locals usually come here for {known_for_summary.lower()}."
    else:
        detail_line = f"It stands out as a dependable {category_label} option in {area_label}."

    if business_type == "independent":
        status_line = "It is independently run and closely tied to the neighborhood."
    elif is_claimed:
        status_line = "The business is claimed and actively maintained on Vantage."
    elif has_deals:
        status_line = "It often shows timely offers for nearby regulars."
    else:
        status_line = "It is worth keeping in your local rotation when you want something nearby."

    return " ".join([summary, detail_line, status_line])[:360]

def derive_known_for(
    category: str = "",
    google_types: Optional[Iterable[str]] = None,
    existing: Optional[Iterable[str]] = None,
) -> list[str]:
    """Derive ``known_for`` tags from existing tags, Google Place types, and category fallbacks.

    Priority order: existing tags, then Google type-to-tag mappings, then
    category-specific fallback tags. Deduplicates case-insensitively and
    caps at 6 tags.

    Args:
        category (str): Business category label.
        google_types (Optional[Iterable[str]]): Google Place type strings.
        existing (Optional[Iterable[str]]): Already-assigned tags.

    Returns:
        list[str]: Up to 6 unique, normalized tags.
    """
    tags: list[str] = []
    seen: set[str] = set()

    for raw_tag in existing or []:
        tag = _normalize_tag(str(raw_tag))
        if not tag or tag.lower() in seen:
            continue
        seen.add(tag.lower())
        tags.append(tag)
        if len(tags) >= 6:
            return tags

    for place_type in google_types or []:
        mapped = _TYPE_TO_TAG.get(str(place_type).strip().lower())
        if not mapped:
            continue
        tag = _normalize_tag(mapped)
        if not tag or tag.lower() in seen:
            continue
        seen.add(tag.lower())
        tags.append(tag)
        if len(tags) >= 6:
            return tags

    for fallback in _CATEGORY_FALLBACK_TAGS.get(category, _DEFAULT_TAGS):
        tag = _normalize_tag(fallback)
        if not tag or tag.lower() in seen:
            continue
        seen.add(tag.lower())
        tags.append(tag)
        if len(tags) >= 6:
            break

    while len(tags) < 3:
        fallback = _DEFAULT_TAGS[len(tags) % len(_DEFAULT_TAGS)]
        tag = _normalize_tag(fallback)
        if tag.lower() in seen:
            break
        seen.add(tag.lower())
        tags.append(tag)

    return tags[:6]

def normalize_image_urls(image_urls: Optional[Iterable[str]], primary_image: str = "") -> list[str]:
    """Deduplicate and order image URLs, placing the primary image first.

    Args:
        image_urls (Optional[Iterable[str]]): Existing image URL list.
        primary_image (str): URL of the primary/hero image.

    Returns:
        list[str]: Deduplicated list with the primary image first.
    """
    normalized: list[str] = []
    seen: set[str] = set()

    for value in [primary_image, *(image_urls or [])]:
        candidate = (value or "").strip()
        if candidate.startswith(("/api/photos?", "/Images/")):
            normalized_candidate = candidate
        else:
            try:
                normalized_candidate = normalize_optional_url(candidate) or ""
            except ValueError:
                normalized_candidate = ""
        candidate = normalized_candidate
        if not candidate or candidate in seen:
            continue
        seen.add(candidate)
        normalized.append(candidate)

    return normalized

def normalize_business_metadata(doc: dict) -> dict:
    """Normalize all metadata fields on a business document in place.

    Regenerates ``known_for``, ``short_description``, ``description``,
    and ``image_urls`` from the document's current fields. Also injects
    a photo proxy URL when a ``place_id`` is present.

    Args:
        doc (dict): The business document to normalize.

    Returns:
        dict: The same document with updated metadata fields.
    """
    if doc is None:
        return doc

    category = doc.get("category", "")
    address = doc.get("address", "") or doc.get("description", "")
    city = doc.get("city", "")
    description_fallback = ""
    if doc.get("source") != "google_places":
        description_fallback = doc.get("description", "")
    elif (doc.get("description") or "").strip() and (doc.get("description") or "").strip() != (doc.get("address") or "").strip():
        description_fallback = doc.get("description", "")

    doc["known_for"] = derive_known_for(
        category=category,
        google_types=doc.get("google_types") or [],
        existing=doc.get("known_for") or [],
    )
    doc["short_description"] = generate_short_description(
        category=category,
        address=address,
        city=city,
        existing=doc.get("short_description") or doc.get("editorial_summary") or description_fallback,
    )
    doc["description"] = generate_long_description(
        category=category,
        address=address,
        city=city,
        short_description=doc["short_description"],
        existing=doc.get("description", ""),
        known_for=doc["known_for"],
        business_type=doc.get("business_type", ""),
        is_claimed=bool(doc.get("is_claimed")),
        has_deals=bool(doc.get("has_deals")),
    )
    doc["image_urls"] = normalize_image_urls(
        doc.get("image_urls") or [],
        primary_image=doc.get("image_url") or doc.get("image") or "",
    )
    if doc.get("place_id"):
        proxy_url = build_photo_proxy_url(str(doc["place_id"]))
        if proxy_url:
            existing_images = doc.get("image_urls") or []
            doc["image_url"] = proxy_url
            doc["primary_image_url"] = proxy_url
            doc["image_urls"] = normalize_image_urls(existing_images, primary_image=proxy_url)

    return doc
