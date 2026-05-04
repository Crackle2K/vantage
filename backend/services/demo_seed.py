"""Demo dataset seeder for development and testing."""
from __future__ import annotations

import json
from datetime import datetime
from pathlib import Path

from backend.services.business_metadata import normalize_business_metadata

DEMO_DATA_PATH = Path(__file__).resolve().parents[2] / "data" / "demo_businesses.json"


async def seed_demo_dataset(db, default_lat: float, default_lng: float) -> None:
    """Seed the demo business dataset once when demo mode is enabled."""
    businesses = db["businesses"]
    existing = await businesses.count_documents({"is_seed": True})
    if existing > 0 or not DEMO_DATA_PATH.exists():
        return

    try:
        payload = json.loads(DEMO_DATA_PATH.read_text(encoding="utf-8"))
    except Exception:
        return

    docs = []
    for item in payload:
        doc = dict(item)
        doc.setdefault("is_seed", True)
        doc.setdefault("is_claimed", False)
        doc.setdefault("owner_id", None)
        doc.setdefault("created_at", datetime.utcnow().isoformat())
        doc.setdefault("updated_at", datetime.utcnow().isoformat())
        doc.setdefault("location", {"type": "Point", "coordinates": [default_lng, default_lat]})
        normalize_business_metadata(doc)
        docs.append(doc)

    if docs:
        await businesses.insert_many(docs, ordered=False)
