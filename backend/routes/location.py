"""Location utilities for browser-driven Explore features."""

from typing import Any

import httpx
from fastapi import APIRouter, HTTPException, Query, status

from backend.config import GOOGLE_API_KEY

router = APIRouter()

GOOGLE_GEOCODE_URL = "https://maps.googleapis.com/maps/api/geocode/json"
GEOCODE_TIMEOUT_SECONDS = 8.0


def _component_name(components: list[dict[str, Any]], component_type: str) -> str:
    for component in components:
        if component_type in (component.get("types") or []):
            return str(component.get("long_name") or component.get("short_name") or "").strip()
    return ""


def _location_label_from_result(result: dict[str, Any]) -> tuple[str, str, str]:
    components = result.get("address_components") or []
    if not isinstance(components, list):
        return "", "", ""

    city = (
        _component_name(components, "locality")
        or _component_name(components, "postal_town")
        or _component_name(components, "administrative_area_level_2")
    )
    region = _component_name(components, "administrative_area_level_1")

    if city and region:
        return city, region, f"{city}, {region}"
    if city:
        return city, "", city
    if region:
        return "", region, region
    return "", "", ""


@router.get("/location/reverse")
async def reverse_geocode_location(
    lat: float = Query(..., ge=-90, le=90),
    lng: float = Query(..., ge=-180, le=180),
):
    """Resolve coordinates to a city and province/state label."""
    if not GOOGLE_API_KEY:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Location lookup is not configured.",
        )

    params = {
        "latlng": f"{lat},{lng}",
        "result_type": "locality|administrative_area_level_1|postal_town",
        "key": GOOGLE_API_KEY,
    }

    try:
        async with httpx.AsyncClient(timeout=GEOCODE_TIMEOUT_SECONDS) as client:
            response = await client.get(GOOGLE_GEOCODE_URL, params=params)
            response.raise_for_status()
            payload = response.json()
    except httpx.HTTPError as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Location lookup failed.",
        ) from exc

    if payload.get("status") not in {"OK", "ZERO_RESULTS"}:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail="Location lookup failed.",
        )

    for result in payload.get("results") or []:
        city, region, label = _location_label_from_result(result)
        if label:
            return {"city": city, "region": region, "label": label}

    raise HTTPException(
        status_code=status.HTTP_404_NOT_FOUND,
        detail="Location could not be resolved.",
    )
