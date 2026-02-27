"""
MongoDB Connection Module
Provides async database connection using Motor driver.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne
from bson import ObjectId

from config import MONGODB_URI, DATABASE_NAME

# Global database client
client: AsyncIOMotorClient = None
database = None


class DatabaseUnavailableError(RuntimeError):
    """Raised when MongoDB is not connected for request handling."""


async def connect_to_mongo():
    """Establish connection to MongoDB Atlas. Called on app startup."""
    global client, database
    try:
        # Configure client for serverless/cloud deployment with connection pooling
        temp_client = AsyncIOMotorClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=10000,
            socketTimeoutMS=10000,
            maxPoolSize=10,
            minPoolSize=1,
            maxIdleTimeMS=45000,
            retryWrites=True
        )
        temp_database = temp_client[DATABASE_NAME]
        await temp_client.admin.command("ping")
        client = temp_client
        database = temp_database
        print(f"Connected to MongoDB: {DATABASE_NAME}")
        await _ensure_indexes()
        await _normalize_platform_review_metrics()
    except Exception as e:
        client = None
        database = None
        print(f"MongoDB connection warning: {e}")
        print("Server will start without database. Some features may not work.")


async def _ensure_indexes():
    """Create required indexes if they don't already exist."""
    try:
        businesses = get_businesses_collection()
        await businesses.create_index([("location", "2dsphere")])
        await businesses.create_index("place_id", unique=True, sparse=True)
        await businesses.create_index("category")
        await businesses.create_index("owner_id", sparse=True)
        await businesses.create_index("live_visibility_score")

        visits = get_visits_collection()
        await visits.create_index([("user_id", 1), ("business_id", 1), ("created_at", -1)])
        await visits.create_index("business_id")

        geo_cache = get_geo_cache_collection()
        await geo_cache.create_index(
            [("cell_lat", 1), ("cell_lng", 1), ("radius_bucket", 1)], unique=True
        )
        await geo_cache.create_index("fetched_at")

        api_log = get_api_usage_log_collection()
        await api_log.create_index("timestamp")

        print("MongoDB indexes ensured")
    except Exception as e:
        print(f"Index creation warning: {e}")


async def _normalize_platform_review_metrics():
    """
    Ensure stars/review counts are derived only from Vantage reviews.
    """
    try:
        businesses = get_businesses_collection()
        reviews = get_reviews_collection()

        # Clear Google-seeded rating defaults on imported businesses.
        await businesses.update_many(
            {"source": "google_places"},
            {"$set": {"rating_average": 0.0, "total_reviews": 0}},
        )

        # Rebuild rating metrics from platform review documents.
        grouped = await reviews.aggregate(
            [
                {
                    "$group": {
                        "_id": "$business_id",
                        "count": {"$sum": 1},
                        "avg_rating": {"$avg": "$rating"},
                    }
                }
            ]
        ).to_list(length=None)

        ops = []
        for row in grouped:
            business_id = str(row.get("_id", ""))
            if not ObjectId.is_valid(business_id):
                continue
            ops.append(
                UpdateOne(
                    {"_id": ObjectId(business_id)},
                    {
                        "$set": {
                            "rating_average": round(float(row.get("avg_rating", 0.0)), 2),
                            "total_reviews": int(row.get("count", 0)),
                        }
                    },
                )
            )

        if ops:
            await businesses.bulk_write(ops, ordered=False)

        print(f"Review metrics normalized from platform reviews ({len(ops)} businesses)")
    except Exception as e:
        print(f"Review metric normalization warning: {e}")


async def close_mongo_connection():
    """Close MongoDB connection. Called on app shutdown."""
    global client
    if client:
        client.close()
        print("MongoDB connection closed")


def get_database():
    """Get the database instance."""
    if database is None:
        raise DatabaseUnavailableError(
            "MongoDB is not connected. Please ensure MongoDB is running and accessible at the configured URI. "
            "Start MongoDB or check your MONGODB_URI in the .env file."
        )
    return database


# Collection getters

def get_users_collection():
    """Get users collection with connection check."""
    return get_database()["users"]


def get_businesses_collection():
    return get_database()["businesses"]


def get_reviews_collection():
    return get_database()["reviews"]


def get_deals_collection():
    return get_database()["deals"]


def get_claims_collection():
    return get_database()["claims"]


def get_checkins_collection():
    return get_database()["checkins"]


def get_activity_feed_collection():
    return get_database()["activity_feed"]


def get_credibility_collection():
    return get_database()["credibility"]


def get_subscriptions_collection():
    return get_database()["subscriptions"]


def get_visits_collection():
    return get_database()["visits"]


def get_geo_cache_collection():
    """Tracks which lat/lng cells we already fetched from Google."""
    return get_database()["geo_cache"]


def get_api_usage_log_collection():
    """Every outbound Google Places call is recorded here."""
    return get_database()["api_usage_log"]
