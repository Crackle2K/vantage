"""Business match-score calculation and ranking.

Computes a weighted match score for businesses based on rating,
popularity (review count), category preference alignment, and recency.
Used by the discovery engine to rank and sort businesses.
"""
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
    """Calculate a match score for a business based on multiple signals.

    Weights: rating (40%), popularity (30%), category match (20%),
    recency (10%).

    Args:
        business (dict): Business document with ``rating_average``,
            ``total_reviews``, ``category``, ``created_at``.
        user_category_preference (Optional[str]): User's preferred category.
        max_reviews (int): Review count ceiling for normalization.

    Returns:
        float: Match score between 0 and 5, rounded to 2 decimal places.
    """
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
    """Normalize a review count into a 0-5 popularity score.

    Args:
        total_reviews (int): Number of reviews.
        max_reviews (int): Review count at which popularity maxes out.

    Returns:
        float: Popularity score between 0 and 5.
    """
    return round(min(total_reviews / max(max_reviews, 1), 1.0) * 5.0, 2)

def calculate_recency_score(created_at: datetime) -> float:
    """Score business freshness based on creation date.

    Args:
        created_at (datetime): When the business was created.

    Returns:
        float: Recency score from 1.0 (older than 1 year) to 5.0 (within 30 days).
    """
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
    """Compute match scores for a list of businesses and sort by score descending.

    Args:
        businesses (list): Business documents to rank.
        user_category_preference (Optional[str]): User's preferred category.

    Returns:
        list: Businesses sorted by match score, highest first.
    """
    for business in businesses:
        business["match_score"] = calculate_match_score(business, user_category_preference)
    businesses.sort(key=lambda item: item.get("match_score", 0), reverse=True)
    return businesses
