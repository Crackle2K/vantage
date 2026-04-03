from __future__ import annotations

import asyncio
import hashlib
import io
import json
import logging
import re
import time
from collections import OrderedDict
from pathlib import Path
from threading import Lock
from typing import Optional
from urllib.parse import quote_plus, urljoin

import httpx
from fastapi import HTTPException

logger = logging.getLogger(__name__)

from config import GOOGLE_API_KEY

PHOTO_PROXY_TTL_SECONDS = 7 * 24 * 60 * 60
PHOTO_PROXY_MEMORY_ITEMS = 192
PHOTO_PROXY_DISK_DIR = Path("/tmp/vantage_photos")
GOOGLE_PHOTO_URL = "https://maps.googleapis.com/maps/api/place/photo"
GOOGLE_DETAILS_URL = "https://maps.googleapis.com/maps/api/place/details/json"
_META_TAG_RE = re.compile(
    r"""<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)["']""",
    re.IGNORECASE,
)

_CATEGORY_COLORS: dict[str, tuple[str, str]] = {
    "restaurants": ("#FF6B6B", "#C92A2A"),
    "cafes": ("#A67C52", "#6B4423"),
    "bars": ("#845EC2", "#5A3E8F"),
    "shopping": ("#FF9671", "#FF6F91"),
    "beauty": ("#FFC75F", "#FF8066"),
    "fitness": ("#4ECDC4", "#1A535C"),
    "health": ("#00C9A7", "#008F7A"),
    "hotels": ("#5E72E4", "#3F51B5"),
    "grocery": ("#51CF66", "#2F9E44"),
    "default": ("#4C6EF5", "#364FC7"),
}

_memory_cache: "OrderedDict[str, tuple[float, str, bytes]]" = OrderedDict()
_memory_lock = Lock()

def _clamp_width(maxwidth: int) -> int:
    return max(120, min(int(maxwidth or 1200), 1600))

def build_photo_proxy_url(place_id: str, maxwidth: int = 1200) -> str:
    if not place_id:
        return ""
    return f"/api/photos?place_id={quote_plus(place_id)}&maxwidth={_clamp_width(maxwidth)}"

def _cache_key(place_id: str, maxwidth: int) -> str:
    return f"{place_id}:{maxwidth}"

def _cache_file_base(cache_key: str) -> Path:
    digest = hashlib.sha256(cache_key.encode("utf-8")).hexdigest()
    return PHOTO_PROXY_DISK_DIR / digest

def _ensure_disk_cache_dir() -> None:
    try:
        PHOTO_PROXY_DISK_DIR.mkdir(parents=True, exist_ok=True)
    except Exception:
        pass

def _memory_get(cache_key: str) -> Optional[tuple[str, bytes]]:
    now = time.time()
    with _memory_lock:
        cached = _memory_cache.get(cache_key)
        if not cached:
            return None
        expires_at, content_type, payload = cached
        if expires_at < now:
            _memory_cache.pop(cache_key, None)
            return None
        _memory_cache.move_to_end(cache_key)
        return content_type, payload

def _memory_set(cache_key: str, content_type: str, payload: bytes) -> None:
    expires_at = time.time() + PHOTO_PROXY_TTL_SECONDS
    with _memory_lock:
        _memory_cache[cache_key] = (expires_at, content_type, payload)
        _memory_cache.move_to_end(cache_key)
        while len(_memory_cache) > PHOTO_PROXY_MEMORY_ITEMS:
            _memory_cache.popitem(last=False)

def _disk_get(cache_key: str) -> Optional[tuple[str, bytes]]:
    _ensure_disk_cache_dir()
    base = _cache_file_base(cache_key)
    meta_path = base.with_suffix(".json")
    payload_path = base.with_suffix(".bin")

    try:
        if not meta_path.exists() or not payload_path.exists():
            return None

        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        if float(meta.get("expires_at", 0)) < time.time():
            meta_path.unlink(missing_ok=True)
            payload_path.unlink(missing_ok=True)
            return None

        content_type = str(meta.get("content_type") or "image/jpeg")
        payload = payload_path.read_bytes()
        return content_type, payload
    except Exception:
        return None

def _disk_set(cache_key: str, content_type: str, payload: bytes) -> None:
    _ensure_disk_cache_dir()
    base = _cache_file_base(cache_key)
    meta_path = base.with_suffix(".json")
    payload_path = base.with_suffix(".bin")
    expires_at = time.time() + PHOTO_PROXY_TTL_SECONDS

    try:
        payload_path.write_bytes(payload)
        meta_path.write_text(
            json.dumps({"content_type": content_type, "expires_at": expires_at}),
            encoding="utf-8",
        )
    except Exception:
        return

def _normalize_category(category: str = "") -> str:
    lower = (category or "").strip().lower()
    if "restaurant" in lower or "food" in lower:
        return "restaurants"
    if "cafe" in lower or "coffee" in lower:
        return "cafes"
    if "bar" in lower or "nightlife" in lower:
        return "bars"
    if "shopping" in lower or "retail" in lower:
        return "shopping"
    if "beauty" in lower or "spa" in lower:
        return "beauty"
    if "fitness" in lower or "wellness" in lower or "active" in lower:
        return "fitness"
    if "health" in lower or "medical" in lower:
        return "health"
    if "hotel" in lower or "travel" in lower:
        return "hotels"
    if "grocery" in lower:
        return "grocery"
    return "default"

def _escape_svg_text(value: str) -> str:
    return (
        (value or "")
        .replace("&", "&amp;")
        .replace("<", "&lt;")
        .replace(">", "&gt;")
        .replace('"', "&quot;")
    )

def build_category_placeholder_bytes(category: str = "", label: str = "V") -> tuple[str, bytes]:
    normalized = _normalize_category(category)
    start, end = _CATEGORY_COLORS.get(normalized, _CATEGORY_COLORS["default"])
    monogram = _escape_svg_text((label or "V").strip()[:1].upper())
    safe_category = _escape_svg_text((category or "Local business").strip()[:32])
    svg = f"""<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 900" role="img" aria-label="{safe_category}">
<defs>
  <linearGradient id="g" x1="0%" x2="100%" y1="0%" y2="100%">
    <stop offset="0%" stop-color="{start}" />
    <stop offset="100%" stop-color="{end}" />
  </linearGradient>
  <filter id="blur"><feGaussianBlur stdDeviation="32" /></filter>
</defs>
<rect width="1200" height="900" fill="url(#g)" />
<circle cx="220" cy="170" r="140" fill="rgba(255,255,255,0.16)" filter="url(#blur)" />
<circle cx="980" cy="760" r="180" fill="rgba(255,255,255,0.12)" filter="url(#blur)" />
<text x="80" y="760" fill="rgba(255,255,255,0.92)" font-family="Arial, sans-serif" font-size="300" font-weight="700">{monogram}</text>
<text x="86" y="840" fill="rgba(255,255,255,0.88)" font-family="Arial, sans-serif" font-size="54">{safe_category}</text>
</svg>"""
    return "image/svg+xml", svg.encode("utf-8")

async def _fetch_bytes(url: str, timeout_seconds: float = 4.0) -> tuple[str, bytes]:
    async with httpx.AsyncClient(timeout=timeout_seconds, follow_redirects=True) as client:
        response = await client.get(url)
        response.raise_for_status()
        content_type = response.headers.get("content-type", "image/jpeg").split(";")[0]
        return content_type, response.content

async def _fetch_google_photo_bytes(photo_reference: str, maxwidth: int) -> tuple[str, bytes]:
    if not GOOGLE_API_KEY:
        raise HTTPException(status_code=503, detail="Google Places photo proxy is not configured")

    url = (
        f"{GOOGLE_PHOTO_URL}"
        f"?maxwidth={_clamp_width(maxwidth)}"
        f"&photo_reference={quote_plus(photo_reference)}"
        f"&key={GOOGLE_API_KEY}"
    )
    return await _fetch_bytes(url, timeout_seconds=4.0)

async def _resolve_google_photo_references(place_id: str) -> list[str]:
    if not GOOGLE_API_KEY:
        return []

    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            response = await client.get(
                GOOGLE_DETAILS_URL,
                params={
                    "place_id": place_id,
                    "fields": "photos",
                    "key": GOOGLE_API_KEY,
                },
            )
            response.raise_for_status()
            payload = response.json()
    except Exception:
        return []

    if payload.get("status") != "OK":
        return []

    result = payload.get("result", {})
    photos = result.get("photos", []) if isinstance(result, dict) else []
    refs: list[str] = []
    seen: set[str] = set()
    for photo in photos:
        ref = str(photo.get("photo_reference") or "").strip()
        if not ref or ref in seen:
            continue
        seen.add(ref)
        refs.append(ref)
    return refs

async def _resolve_og_image_url(website_url: str) -> str:
    if not website_url:
        return ""

    try:
        async with httpx.AsyncClient(timeout=2.0, follow_redirects=True) as client:
            response = await client.get(website_url)
            response.raise_for_status()
            html = response.text[:40000]
            match = _META_TAG_RE.search(html)
            if not match:
                return ""
            return urljoin(str(response.url), match.group(1).strip())
    except Exception:
        return ""

async def _fetch_cached_url(url: str) -> tuple[str, bytes]:
    content_type, payload = await _fetch_bytes(url, timeout_seconds=5.0)
    if not content_type.startswith("image/"):
        raise ValueError("Resolved OG image URL did not return an image payload")
    return content_type, payload

async def resolve_business_photo_payload(
    business: dict,
    place_id: str,
    maxwidth: int,
) -> tuple[str, bytes]:
    refs = [
        str(ref).strip()
        for ref in (business.get("photo_references") or [])
        if str(ref).strip()
    ]
    primary_ref = str(business.get("photo_reference") or "").strip()
    if primary_ref and primary_ref not in refs:
        refs.insert(0, primary_ref)

    if not refs:
        refs = await _resolve_google_photo_references(place_id)

    for photo_reference in refs:
        try:
            return await _fetch_google_photo_bytes(photo_reference, maxwidth)
        except Exception:
            continue

    website = str(business.get("website") or "").strip()
    og_url = await _resolve_og_image_url(website) if website else ""
    if og_url:
        try:
            return await _fetch_cached_url(og_url)
        except Exception:
            pass

    return build_category_placeholder_bytes(
        category=str(business.get("category") or ""),
        label=str(business.get("name") or "V"),
    )

async def get_photo_payload(
    businesses_collection,
    place_id: str,
    maxwidth: int,
) -> tuple[str, bytes]:
    if not place_id:
        return build_category_placeholder_bytes(label="V")

    cache_key = _cache_key(place_id, maxwidth)
    cached = _memory_get(cache_key)
    if cached:
        return cached

    cached = _disk_get(cache_key)
    if cached:
        _memory_set(cache_key, cached[0], cached[1])
        return cached

    business = await businesses_collection.find_one({"place_id": place_id})
    if not business:
        payload = build_category_placeholder_bytes(label="V")
        _memory_set(cache_key, payload[0], payload[1])
        _disk_set(cache_key, payload[0], payload[1])
        return payload

    existing_refs = [
        str(ref).strip()
        for ref in (business.get("photo_references") or [])
        if str(ref).strip()
    ]
    primary_ref = str(business.get("photo_reference") or "").strip()
    if primary_ref and primary_ref not in existing_refs:
        existing_refs.insert(0, primary_ref)

    if not existing_refs:
        hydrated_refs = await _resolve_google_photo_references(place_id)
        if hydrated_refs:
            business["photo_references"] = hydrated_refs
            business["photo_reference"] = hydrated_refs[0]
            try:
                await businesses_collection.update_one(
                    {"_id": business["_id"]},
                    {
                        "$set": {
                            "photo_reference": hydrated_refs[0],
                            "photo_references": hydrated_refs,
                        }
                    },
                )
            except Exception:
                pass

    try:
        content_type, payload = await asyncio.wait_for(
            resolve_business_photo_payload(business, place_id, maxwidth),
            timeout=7.0,
        )
    except asyncio.TimeoutError:
        content_type, payload = build_category_placeholder_bytes(
            category=str(business.get("category") or ""),
            label=str(business.get("name") or "V"),
        )
    except Exception:
        logger.exception("Unexpected error resolving photo for place_id=%s", place_id)
        content_type, payload = build_category_placeholder_bytes(
            category=str(business.get("category") or ""),
            label=str(business.get("name") or "V"),
        )
    _memory_set(cache_key, content_type, payload)
    _disk_set(cache_key, content_type, payload)
    return content_type, payload

def build_stream(content_type: str, payload: bytes):
    return io.BytesIO(payload), {
        "Cache-Control": f"public, max-age={PHOTO_PROXY_TTL_SECONDS}, immutable",
        "Content-Length": str(len(payload)),
    }
