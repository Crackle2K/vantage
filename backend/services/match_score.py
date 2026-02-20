"""
Match Score Service for Vantage
Calculates business relevance scores for user recommendations
"""

from datetime import datetime, timedelta
from typing import Optional


def calculate_match_score(
    business: dict,
    user_category_preference: Optional[str] = None,
    max_reviews: int = 500
) -> float:
    """
    Calculate a match score for a business based on multiple factors.
    
    Formula:
    - rating_average * 0.4 (40% weight)
    - popularity * 0.3 (30% weight)
    - category_match * 0.2 (20% weight)
    - recent_activity * 0.1 (10% weight)
    
    Args:
        business: Business dictionary with fields: rating_average, total_reviews, 
                 category, created_at
        user_category_preference: Optional user's preferred category for category matching
        max_reviews: Maximum review count for normalization (default: 500)
    
    Returns:
        Match score between 0 and 5
    
    Example:
        >>> business = {
        ...     "rating_average": 4.5,
        ...     "total_reviews": 120,
        ...     "category": "food",
        ...     "created_at": datetime.utcnow()
        ... }
        >>> calculate_match_score(business, user_category_preference="food")
        4.32
    """
    # Component 1: Rating Average (40% weight)
    # Normalized to 0-5 scale
    rating_score = float(business.get("rating_average", 0.0))
    rating_component = rating_score * 0.4
    
    # Component 2: Popularity (30% weight)
    # Based on review count, normalized to 0-5 scale
    total_reviews = business.get("total_reviews", 0)
    popularity_normalized = min(total_reviews / max_reviews, 1.0) * 5.0
    popularity_component = popularity_normalized * 0.3
    
    # Component 3: Category Match (20% weight)
    # 5 points if matches user preference, 2.5 points otherwise (neutral)
    business_category = business.get("category", "")
    if user_category_preference and business_category == user_category_preference:
        category_match_score = 5.0
    else:
        category_match_score = 2.5  # Neutral score for non-matching categories
    category_component = category_match_score * 0.2
    
    # Component 4: Recent Activity (10% weight)
    # Based on how recently the business was created/updated
    # More recent = higher score
    created_at = business.get("created_at")
    if created_at:
        if isinstance(created_at, str):
            # Parse string to datetime if needed
            try:
                created_at = datetime.fromisoformat(created_at.replace('Z', '+00:00'))
            except:
                created_at = datetime.utcnow()
        
        days_old = (datetime.utcnow() - created_at).days
        
        # Scoring logic:
        # 0-30 days: 5.0 points (very recent)
        # 31-90 days: 4.0 points (recent)
        # 91-180 days: 3.0 points (moderate)
        # 181-365 days: 2.0 points (established)
        # 365+ days: 1.0 points (older)
        if days_old <= 30:
            recent_activity_score = 5.0
        elif days_old <= 90:
            recent_activity_score = 4.0
        elif days_old <= 180:
            recent_activity_score = 3.0
        elif days_old <= 365:
            recent_activity_score = 2.0
        else:
            recent_activity_score = 1.0
    else:
        recent_activity_score = 2.5  # Neutral score if no date available
    
    recent_activity_component = recent_activity_score * 0.1
    
    # Calculate total match score
    total_score = (
        rating_component +
        popularity_component +
        category_component +
        recent_activity_component
    )
    
    # Round to 2 decimal places
    return round(total_score, 2)


def calculate_popularity_score(total_reviews: int, max_reviews: int = 500) -> float:
    """
    Calculate a normalized popularity score based on review count.
    
    Args:
        total_reviews: Number of reviews the business has
        max_reviews: Maximum review count for normalization
    
    Returns:
        Popularity score between 0 and 5
    """
    return round(min(total_reviews / max_reviews, 1.0) * 5.0, 2)


def calculate_recency_score(created_at: datetime) -> float:
    """
    Calculate a recency score based on business age.
    
    Args:
        created_at: When the business was created
    
    Returns:
        Recency score between 1 and 5
    """
    days_old = (datetime.utcnow() - created_at).days
    
    if days_old <= 30:
        return 5.0
    elif days_old <= 90:
        return 4.0
    elif days_old <= 180:
        return 3.0
    elif days_old <= 365:
        return 2.0
    else:
        return 1.0


def rank_businesses(businesses: list, user_category_preference: Optional[str] = None) -> list:
    """
    Rank a list of businesses by their match scores.
    
    Args:
        businesses: List of business dictionaries
        user_category_preference: Optional user's preferred category
    
    Returns:
        List of businesses sorted by match score (highest first), with added 'match_score' field
    """
    # Calculate match score for each business
    for business in businesses:
        business["match_score"] = calculate_match_score(business, user_category_preference)
    
    # Sort by match score (descending)
    ranked = sorted(businesses, key=lambda x: x.get("match_score", 0), reverse=True)
    
    return ranked
