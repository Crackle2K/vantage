"""Live visibility score calculation for business ranking.

Computes a 0-100 visibility score from verified visits, credibility-weighted
reviews, recency of last activity, and engagement rate. This score is the
primary ranking signal in Vantage's discovery engine, weighted at 60% of
the canonical rank score.
"""
from datetime import datetime
from typing import Optional

def reviewer_credibility_weight(credibility_score: Optional[float]) -> float:
    """Map a credibility score (0-100) to a review weight multiplier.

    Returns a value between 0.6 (no credibility) and 1.4 (max credibility).
    Users with no credibility record default to 0.85.

    Args:
        credibility_score (Optional[float]): The reviewer's credibility score.

    Returns:
        float: Weight multiplier between 0.6 and 1.4.
    """
    if credibility_score is None:
        return 0.85
    score = max(0.0, min(float(credibility_score), 100.0))
    return round(0.6 + (score / 100.0) * 0.8, 3)

def calculate_live_visibility_score(
    verified_visit_count: int = 0,
    review_count: int = 0,
    credibility_weighted_review_count: Optional[float] = None,
    last_activity_at: Optional[datetime] = None,
    engagement_actions: int = 0,
    total_potential_engagements: int = 1,
) -> float:
    """Compute a business's live visibility score (0-100).

    Weights: verified visits (35%), credibility-weighted reviews (30%),
    recency (20%), engagement rate (15%). Recency decays linearly from
    1.0 (within 7 days) to 0.0 (older than 90 days).

    Args:
        verified_visit_count (int): Number of geo-verified visits.
        review_count (int): Total number of reviews.
        credibility_weighted_review_count (Optional[float]): Sum of reviews
            weighted by reviewer credibility. Falls back to raw review_count.
        last_activity_at (Optional[datetime]): Timestamp of the most recent
            visit or review.
        engagement_actions (int): Total check-in confirmations and likes.
        total_potential_engagements (int): Denominator for engagement rate.

    Returns:
        float: Visibility score between 0 and 100, rounded to 2 decimal places.
    """
    verified_visit_count: int = 0,
    review_count: int = 0,
    credibility_weighted_review_count: Optional[float] = None,
    last_activity_at: Optional[datetime] = None,
    engagement_actions: int = 0,
    total_potential_engagements: int = 1,
) -> float:
    visit_score = min(max(verified_visit_count, 0) / 50, 1.0)

    weighted_reviews = (
        float(credibility_weighted_review_count)
        if credibility_weighted_review_count is not None
        else float(review_count)
    )
    review_score = min(max(weighted_reviews, 0.0) / 30, 1.0)

    if last_activity_at is None:
        recency = 0.0
    else:
        days_ago = (datetime.utcnow() - last_activity_at).total_seconds() / 86400
        if days_ago <= 7:
            recency = 1.0
        elif days_ago >= 90:
            recency = 0.0
        else:
            recency = 1.0 - (days_ago - 7) / (90 - 7)

    engagement = min(max(engagement_actions, 0) / max(total_potential_engagements, 1), 1.0)

    raw = (
        0.35 * visit_score
        + 0.30 * review_score
        + 0.20 * recency
        + 0.15 * engagement
    )
    return round(raw * 100, 2)
