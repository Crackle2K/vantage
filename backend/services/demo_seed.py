"""Demo dataset seeder for development and testing.

When ``DEMO_MODE`` is enabled, this module seeds the document store with a
curated cluster of six fictional Toronto businesses, complete with
pre-computed visibility scores, known-for tags, and associated activity
feed entries. Safe to call at startup; uses upserts so repeated calls
are idempotent.
"""
from __future__ import annotations

from datetime import datetime, timedelta
from typing import Any
from urllib.parse import quote

from backend.models.activity import ActivityType, CheckInStatus
from backend.services.business_metadata import derive_known_for, generate_short_description
from backend.services.visibility_score import calculate_live_visibility_score

_PALETTE = [
    ("
    ("
    ("
    ("
    ("
    ("
]

_DEMO_BUSINESSES: list[dict[str, Any]] = [
    {
        "place_id": "demo-ossington-lantern",
        "name": "Lantern Coffee House",
        "category": "Cafes & Coffee",
        "photo_url": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=1200&q=80",
        "address": "214 Ossington Ave",
        "city": "Toronto",
        "offset": (0.0072, -0.0105),
        "review_count": 18,
        "weighted_reviews": 21.5,
        "verified_visits": 14,
        "engagement_actions": 20,
        "last_activity_minutes": 12,
        "checkins_today": 8,
        "trending_score": 14.0,
        "local_confidence": 0.94,
        "business_type": "independent",
        "is_claimed": True,
        "has_deals": True,
        "description": "A warm all-day cafe with house-roasted espresso, pastry drops, and neighborhood regulars from open to close.",
        "known_for": ["Cozy", "House-roasted", "Quiet work"],
        "event_title": "Late Latte Set",
        "event_description": "Extended evening hours with a pastry pairing and acoustic set for the neighborhood crowd.",
    },
    {
        "place_id": "demo-queen-atelier",
        "name": "Atelier North",
        "category": "Shopping",
        "photo_url": "https://images.unsplash.com/photo-1441986300917-64674bd600d8?auto=format&fit=crop&w=1200&q=80",
        "address": "451 Queen St W",
        "city": "Toronto",
        "offset": (0.0041, -0.0048),
        "review_count": 9,
        "weighted_reviews": 11.6,
        "verified_visits": 6,
        "engagement_actions": 9,
        "last_activity_minutes": 38,
        "checkins_today": 4,
        "trending_score": 9.5,
        "local_confidence": 0.88,
        "business_type": "independent",
        "is_claimed": False,
        "has_deals": False,
        "description": "A design-led independent boutique featuring limited-run home goods, prints, and local maker capsules.",
        "known_for": ["Design-led", "Local makers", "Giftable"],
    },
    {
        "place_id": "demo-harbourline-social",
        "name": "Harbourline Social",
        "category": "Bars & Nightlife",
        "photo_url": "https://images.unsplash.com/photo-1514933651103-005eec06c04b?auto=format&fit=crop&w=1200&q=80",
        "address": "88 Front St E",
        "city": "Toronto",
        "offset": (-0.0036, 0.0054),
        "review_count": 22,
        "weighted_reviews": 24.8,
        "verified_visits": 11,
        "engagement_actions": 18,
        "last_activity_minutes": 22,
        "checkins_today": 7,
        "trending_score": 13.2,
        "local_confidence": 0.72,
        "business_type": "chain",
        "is_claimed": True,
        "has_deals": True,
        "description": "Cocktails, DJ-led lounge energy, and polished service built for after-work meetups that stretch late.",
        "known_for": ["Trendy", "Cocktails", "Nightlife"],
        "event_title": "Golden Hour DJ Set",
        "event_description": "A live rooftop-adjacent DJ session with rotating feature cocktails before the late-night rush.",
    },
    {
        "place_id": "demo-park-studio",
        "name": "Parkline Studio",
        "category": "Fitness & Wellness",
        "photo_url": "https://images.unsplash.com/photo-1518611012118-696072aa579a?auto=format&fit=crop&w=1200&q=80",
        "address": "129 King St E",
        "city": "Toronto",
        "offset": (-0.0051, -0.0038),
        "review_count": 16,
        "weighted_reviews": 19.4,
        "verified_visits": 9,
        "engagement_actions": 13,
        "last_activity_minutes": 55,
        "checkins_today": 5,
        "trending_score": 8.8,
        "local_confidence": 0.91,
        "business_type": "independent",
        "is_claimed": False,
        "has_deals": False,
        "description": "An intimate movement studio blending reformer, mobility, and recovery sessions in a calm premium setting.",
        "known_for": ["Premium", "Quiet", "Recovery"],
    },
    {
        "place_id": "demo-clover-market",
        "name": "Clover Market Hall",
        "category": "Grocery",
        "photo_url": "https://images.unsplash.com/photo-1542838132-92c53300491e?auto=format&fit=crop&w=1200&q=80",
        "address": "301 Jarvis St",
        "city": "Toronto",
        "offset": (0.0088, 0.0061),
        "review_count": 7,
        "weighted_reviews": 8.5,
        "verified_visits": 5,
        "engagement_actions": 7,
        "last_activity_minutes": 90,
        "checkins_today": 3,
        "trending_score": 7.4,
        "local_confidence": 0.83,
        "business_type": "independent",
        "is_claimed": False,
        "has_deals": True,
        "description": "A compact neighborhood food hall with prepared meals, pantry staples, and highly local produce rotations.",
        "known_for": ["Neighborhood favorite", "Fresh", "Budget-friendly"],
    },
    {
        "place_id": "demo-studio-mercer",
        "name": "Studio Mercer",
        "category": "Beauty & Spas",
        "photo_url": "https://images.unsplash.com/photo-1521590832167-7bcbfaa6381f?auto=format&fit=crop&w=1200&q=80",
        "address": "52 Mercer St",
        "city": "Toronto",
        "offset": (-0.0027, -0.0082),
        "review_count": 13,
        "weighted_reviews": 15.1,
        "verified_visits": 7,
        "engagement_actions": 10,
        "last_activity_minutes": 28,
        "checkins_today": 4,
        "trending_score": 10.4,
        "local_confidence": 0.86,
        "business_type": "independent",
        "is_claimed": True,
        "has_deals": False,
        "description": "A polished self-care studio known for fast appointments, high-touch service, and a quietly premium finish.",
        "known_for": ["Premium", "Appointments", "Self-care"],
        "event_title": "Glow Session Week",
        "event_description": "A limited run of bundled treatments with evening availability for post-work appointments.",
    },
]

def _demo_image_data_uri(title: str, category: str, color_a: str, color_b: str) -> str:
    safe_title = title.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    safe_category = category.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    svg = f"""
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900">
      <defs>
        <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="{color_a}" />
          <stop offset="100%" stop-color="{color_b}" />
        </linearGradient>
      </defs>
      <rect width="1200" height="900" fill="url(
      <circle cx="980" cy="180" r="210" fill="rgba(255,255,255,0.12)" />
      <circle cx="180" cy="760" r="240" fill="rgba(255,255,255,0.09)" />
      <text x="90" y="650" fill="white" font-family="Georgia, serif" font-size="92" font-weight="700">{safe_title}</text>
      <text x="96" y="732" fill="rgba(255,255,255,0.82)" font-family="Arial, sans-serif" font-size="34" letter-spacing="4">{safe_category.upper()}</text>
    </svg>
    Upsert a curated local demo cluster and refresh matching activity docs.
    Safe to call at startup when DEMO_MODE is enabled.
