from motor.motor_asyncio import AsyncIOMotorClient
from pymongo import UpdateOne
from bson import ObjectId

from config import MONGODB_URI, DATABASE_NAME, DEMO_MODE, DEMO_LAT, DEMO_LNG

client: AsyncIOMotorClient = None
database = None

class DatabaseUnavailableError(RuntimeError):
    pass

def _col(name: str):
    return get_database()[name]

async def connect_to_mongo():
    global client, database
    try:
        next_client = AsyncIOMotorClient(
            MONGODB_URI,
            serverSelectionTimeoutMS=5000,
            connectTimeoutMS=10000,
            socketTimeoutMS=10000,
            maxPoolSize=10,
            minPoolSize=1,
            maxIdleTimeMS=45000,
            retryWrites=True
        )
        next_db = next_client[DATABASE_NAME]
        await next_client.admin.command("ping")
        client = next_client
        database = next_db
        print(f"Connected to MongoDB: {DATABASE_NAME}")
        await _ensure_indexes()
        await _normalize_platform_review_metrics()
        if DEMO_MODE:
            from services.demo_seed import seed_demo_dataset

            await seed_demo_dataset(next_db, DEMO_LAT, DEMO_LNG)
            print(f"Demo Mode seeded around {DEMO_LAT:.4f}, {DEMO_LNG:.4f}")
    except Exception as exc:
        client = None
        database = None
        print(f"MongoDB connection warning: {exc}")
        print("Server will start without database. Some features may not work.")

async def _ensure_indexes():
    try:
        businesses = get_businesses_collection()
        await businesses.create_index([("location", "2dsphere")])
        await businesses.create_index("place_id", unique=True, sparse=True)
        await businesses.create_index("category")
        await businesses.create_index("owner_id", sparse=True)
        await businesses.create_index("live_visibility_score")

        owner_posts = get_owner_posts_collection()
        await owner_posts.create_index("business_id")
        await owner_posts.create_index("created_at")
        await owner_posts.create_index("start_time")
        await owner_posts.create_index("end_time")

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

        saved = get_saved_collection()
        await saved.create_index([("user_id", 1), ("business_id", 1)], unique=True)
        await saved.create_index("created_at")

        print("MongoDB indexes ensured")
    except Exception as exc:
        print(f"Index creation warning: {exc}")

async def _normalize_platform_review_metrics():
    try:
        businesses = get_businesses_collection()
        reviews = get_reviews_collection()

        await businesses.update_many(
            {"source": "google_places"},
            {"$set": {"rating_average": 0.0, "total_reviews": 0}},
        )

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

        updates = []
        for row in grouped:
            business_id = str(row.get("_id", ""))
            if not ObjectId.is_valid(business_id):
                continue
            updates.append(
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

        if updates:
            await businesses.bulk_write(updates, ordered=False)

        print(f"Review metrics normalized from platform reviews ({len(updates)} businesses)")
    except Exception as exc:
        print(f"Review metric normalization warning: {exc}")

async def close_mongo_connection():
    global client
    if client:
        client.close()
        print("MongoDB connection closed")

def get_database():
    if database is None:
        raise DatabaseUnavailableError(
            "MongoDB is not connected. Please ensure MongoDB is running and accessible at the configured URI. "
            "Start MongoDB or check your MONGODB_URI in the .env file."
        )
    return database

def get_users_collection():
    return _col("users")

def get_businesses_collection():
    return _col("businesses")

def get_reviews_collection():
    return _col("reviews")

def get_deals_collection():
    return _col("deals")

def get_claims_collection():
    return _col("claims")

def get_checkins_collection():
    return _col("checkins")

def get_activity_feed_collection():
    return _col("activity_feed")

def get_owner_posts_collection():
    return _col("owner_posts")

def get_credibility_collection():
    return _col("credibility")

def get_subscriptions_collection():
    return _col("subscriptions")

def get_visits_collection():
    return _col("visits")

def get_geo_cache_collection():
    return _col("geo_cache")

def get_api_usage_log_collection():
    return _col("api_usage_log")

def get_saved_collection():
    return _col("saved")
