"""
Geospatial Service for Vantage
Provides geographic calculation utilities
"""

import math


def calculate_distance(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    """
    Calculate the distance between two geographic coordinates using the Haversine formula.
    
    The Haversine formula calculates the great-circle distance between two points
    on a sphere given their longitudes and latitudes.
    
    Args:
        lat1: Latitude of the first point in decimal degrees
        lng1: Longitude of the first point in decimal degrees
        lat2: Latitude of the second point in decimal degrees
        lng2: Longitude of the second point in decimal degrees
    
    Returns:
        Distance in kilometers (float)
    
    Example:
        >>> calculate_distance(43.6532, -79.3832, 43.7184, -79.5181)
        13.46  # Distance between Toronto downtown and Mississauga in km
    """
    # Earth's radius in kilometers
    EARTH_RADIUS_KM = 6371.0
    
    # Convert latitude and longitude from degrees to radians
    lat1_rad = math.radians(lat1)
    lng1_rad = math.radians(lng1)
    lat2_rad = math.radians(lat2)
    lng2_rad = math.radians(lng2)
    
    # Calculate differences
    dlat = lat2_rad - lat1_rad
    dlng = lng2_rad - lng1_rad
    
    # Haversine formula
    a = math.sin(dlat / 2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(dlng / 2)**2
    c = 2 * math.asin(math.sqrt(a))
    
    # Calculate distance
    distance_km = EARTH_RADIUS_KM * c
    
    return round(distance_km, 2)


def is_within_radius(lat1: float, lng1: float, lat2: float, lng2: float, radius_km: float) -> bool:
    """
    Check if two coordinates are within a specified radius.
    
    Args:
        lat1: Latitude of the first point
        lng1: Longitude of the first point
        lat2: Latitude of the second point
        lng2: Longitude of the second point
        radius_km: Radius in kilometers
    
    Returns:
        True if points are within radius, False otherwise
    """
    distance = calculate_distance(lat1, lng1, lat2, lng2)
    return distance <= radius_km


def get_bounding_box(lat: float, lng: float, radius_km: float) -> dict:
    """
    Calculate a bounding box (min/max lat/lng) for a given center point and radius.
    Useful for efficient geospatial queries.
    
    Args:
        lat: Center latitude
        lng: Center longitude
        radius_km: Radius in kilometers
    
    Returns:
        Dictionary with min_lat, max_lat, min_lng, max_lng
    """
    # Earth's radius in kilometers
    EARTH_RADIUS_KM = 6371.0
    
    # Angular distance in radians
    angular_distance = radius_km / EARTH_RADIUS_KM
    
    # Calculate latitude boundaries
    min_lat = lat - math.degrees(angular_distance)
    max_lat = lat + math.degrees(angular_distance)
    
    # Calculate longitude boundaries (accounting for latitude)
    min_lng = lng - math.degrees(angular_distance / math.cos(math.radians(lat)))
    max_lng = lng + math.degrees(angular_distance / math.cos(math.radians(lat)))
    
    return {
        "min_lat": round(min_lat, 6),
        "max_lat": round(max_lat, 6),
        "min_lng": round(min_lng, 6),
        "max_lng": round(max_lng, 6)
    }


def validate_coordinates(lat: float, lng: float) -> bool:
    """
    Validate if latitude and longitude are within valid ranges.
    
    Args:
        lat: Latitude to validate
        lng: Longitude to validate
    
    Returns:
        True if coordinates are valid, False otherwise
    """
    return -90 <= lat <= 90 and -180 <= lng <= 180
