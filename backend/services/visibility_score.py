"""
Live Visibility Score for Vantage.
Calculates a 0-100 score based on verified visits, reviews, recency, and engagement.

Formula weights:
  0.35 * verified_visits (normalised: 50 visits → 100)
  0.30 * reviews         (normalised: 30 reviews → 100)
  0.20 * recency_factor  (1.0 if < 7 days, decays to 0 over 90 days)
  0.15 * engagement_rate (actions / potential, capped at 1.0)
"""

from datetime import datetime
from typing import Optional


def calculate_live_visibility_score(
    verified_visit_count: int = 0,
    review_count: int = 0,
    last_activity_at: Optional[datetime] = None,
    engagement_actions: int = 0,
    total_potential_engagements: int = 1,
) -> float:
    """Return a visibility score between 0 and 100."""

    # Normalise visits (cap at 50 for a perfect sub-score)
    visit_score = min(verified_visit_count / 50, 1.0)

    # Normalise reviews (cap at 30)
    review_score = min(review_count / 30, 1.0)

    # Recency: 1.0 if activity in last 7 days, linear decay to 0 at 90 days
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

    # Engagement rate
    engagement = min(engagement_actions / max(total_potential_engagements, 1), 1.0)

    raw = (
        0.35 * visit_score
        + 0.30 * review_score
        + 0.20 * recency
        + 0.15 * engagement
    )

    return round(raw * 100, 2)
