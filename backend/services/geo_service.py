"""Geographic utility functions for distance and coordinate calculations.

Provides Haversine distance computation, radius checks, bounding-box
generation, and coordinate validation used by the discovery engine
and geo-verified check-ins.
"""
import math

def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """Calculate the Haversine distance between two coordinates in kilometers.

    Args:
        lat1/lng1 (float): First point coordinates.
        lat2/lng2 (float): Second point coordinates.

    Returns:
        float: Distance in kilometers, rounded to 2 decimal places.
    """
    EARTH_RADIUS_KM = 6371.0
    lat1_rad = math.radians(lat1)
    lng1_rad = math.radians(lng1)
    lat2_rad = math.radians(lat2)
    lng2_rad = math.radians(lng2)
    dlat = lat2_rad - lat1_rad
    dlng = lng2_rad - lng1_rad
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    distance_km = EARTH_RADIUS_KM * c
    return round(distance_km, 2)

def is_within_radius(lat1: float, lng1: float, lat2: float, lng2: float, radius_km: float) -> bool:
    """Check whether two coordinates are within a given radius.

    Args:
        lat1/lng1 (float): First point coordinates.
        lat2/lng2 (float): Second point coordinates.
        radius_km (float): Maximum distance in kilometers.

    Returns:
        bool: True if the distance is within the radius.
    """
    distance = calculate_distance(lat1, lng1, lat2, lng2)
    return distance <= radius_km

def get_bounding_box(lat: float, lng: float, radius_km: float) -> dict:
    """Compute a rectangular bounding box around a point for geo queries.

    Args:
        lat (float): Center latitude.
        lng (float): Center longitude.
        radius_km (float): Radius in kilometers.

    Returns:
        dict: ``{"min_lat": float, "max_lat": float, "min_lng": float, "max_lng": float}``
    """
    EARTH_RADIUS_KM = 6371.0
    angular_distance = radius_km / EARTH_RADIUS_KM
    min_lat = lat - math.degrees(angular_distance)
    max_lat = lat + math.degrees(angular_distance)
    min_lng = lng - math.degrees(angular_distance / math.cos(math.radians(lat)))
    max_lng = lng + math.degrees(angular_distance / math.cos(math.radians(lat)))
    return {
        "min_lat": round(min_lat, 6),
        "max_lat": round(max_lat, 6),
        "min_lng": round(min_lng, 6),
        "max_lng": round(max_lng, 6)
    }

def validate_coordinates(lat: float, lng: float) -> bool:
    """Validate that latitude and longitude are within valid ranges.

    Args:
        lat (float): Latitude (-90 to 90).
        lng (float): Longitude (-180 to 180).

    Returns:
        bool: True if both coordinates are valid.
    """
    return -90 <= lat <= 90 and -180 <= lng <= 180
