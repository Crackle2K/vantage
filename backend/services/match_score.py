from datetime import datetime, timezone
from typing import Optional

def _parse_created_at(value: object) -> Optional[datetime]:
    if isinstance(value, datetime):
        dt = value
    elif isinstance(value, str):
        try:
            dt = datetime.fromisoformat(value.replace('Z', '+00:00'))
        except ValueError:
            return None
    else:
        return None

    if dt.tzinfo is not None:
        return dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt

def calculate_match_score(
    business: dict,
    user_category_preference: Optional[str] = None,
    max_reviews: int = 500
) -> float:
    rating = float(business.get("rating_average", 0.0)) * 0.4
    reviews = int(business.get("total_reviews", 0) or 0)
    popularity = min(reviews / max(max_reviews, 1), 1.0) * 5.0 * 0.3

    category = business.get("category", "")
    category_score = 5.0 if user_category_preference and category == user_category_preference else 2.5
    category_part = category_score * 0.2

    created_at = _parse_created_at(business.get("created_at"))
    recency_score = calculate_recency_score(created_at) if created_at else 2.5
    recency_part = recency_score * 0.1

    return round(rating + popularity + category_part + recency_part, 2)

def calculate_popularity_score(total_reviews: int, max_reviews: int = 500) -> float:
    return round(min(total_reviews / max(max_reviews, 1), 1.0) * 5.0, 2)

def calculate_recency_score(created_at: datetime) -> float:
    days_old = (datetime.utcnow() - created_at).days
    if days_old <= 30:
        return 5.0
    if days_old <= 90:
        return 4.0
    if days_old <= 180:
        return 3.0
    if days_old <= 365:
        return 2.0
    return 1.0

def rank_businesses(businesses: list, user_category_preference: Optional[str] = None) -> list:
    for business in businesses:
        business["match_score"] = calculate_match_score(business, user_category_preference)
    businesses.sort(key=lambda item: item.get("match_score", 0), reverse=True)
    return businesses
