"""
MongoDB Connection Module
Provides async database connection using Motor driver.
"""

from motor.motor_asyncio import AsyncIOMotorClient
from config import MONGODB_URI, DATABASE_NAME

# Global database client
client: AsyncIOMotorClient = None
database = None


async def connect_to_mongo():
    """Establish connection to MongoDB Atlas. Called on app startup."""
    global client, database
    try:
        client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        database = client[DATABASE_NAME]
        await client.admin.command("ping")
        print(f"✅ Connected to MongoDB: {DATABASE_NAME}")
        await _ensure_indexes()
    except Exception as e:
        print(f"⚠️  MongoDB connection warning: {e}")
        print("⚠️  Server will start without database. Some features may not work.")


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

        print("✅ MongoDB indexes ensured")
    except Exception as e:
        print(f"⚠️  Index creation warning: {e}")


async def close_mongo_connection():
    """Close MongoDB connection. Called on app shutdown."""
    global client
    if client:
        client.close()
        print("🔌 MongoDB connection closed")


def get_database():
    """Get the database instance."""
    if database is None:
        raise Exception("Database not initialized. Call connect_to_mongo() first.")
    return database


# ── Collection getters ──────────────────────────────────────────────

def get_users_collection():
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
