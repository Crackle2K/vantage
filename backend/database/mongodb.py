"""
MongoDB Connection Module
Provides async database connection using Motor driver
"""

import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# MongoDB connection settings
MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "vantage")

# Global database client
client: AsyncIOMotorClient = None
database = None


async def connect_to_mongo():
    """
    Establish connection to MongoDB Atlas
    Called on application startup
    """
    global client, database
    try:
        client = AsyncIOMotorClient(MONGODB_URI, serverSelectionTimeoutMS=5000)
        database = client[DATABASE_NAME]
        
        # Test connection
        await client.admin.command('ping')
        print(f"✅ Connected to MongoDB: {DATABASE_NAME}")
    except Exception as e:
        print(f"⚠️  MongoDB connection warning: {e}")
        print("⚠️  Server will start without database. Some features may not work.")
        print("   To fix: Install MongoDB or configure MongoDB Atlas connection string")
        # Don't raise - allow server to start without DB for development


async def close_mongo_connection():
    """
    Close MongoDB connection
    Called on application shutdown
    """
    global client
    if client:
        client.close()
        print("🔌 MongoDB connection closed")


def get_database():
    """
    Get the database instance
    Returns the active database connection
    """
    if database is None:
        raise Exception("Database not initialized. Call connect_to_mongo() first.")
    return database


# Collection getters for easy access
def get_users_collection():
    """Get users collection"""
    return get_database()["users"]


def get_businesses_collection():
    """Get businesses collection"""
    return get_database()["businesses"]


def get_reviews_collection():
    """Get reviews collection"""
    return get_database()["reviews"]


def get_deals_collection():
    """Get deals collection"""
    return get_database()["deals"]


def get_claims_collection():
    """Get business claims collection"""
    return get_database()["claims"]


def get_checkins_collection():
    """Get check-ins collection"""
    return get_database()["checkins"]


def get_activity_feed_collection():
    """Get activity feed collection"""
    return get_database()["activity_feed"]


def get_credibility_collection():
    """Get user credibility scores collection"""
    return get_database()["credibility"]


def get_subscriptions_collection():
    """Get subscriptions collection"""
    return get_database()["subscriptions"]
