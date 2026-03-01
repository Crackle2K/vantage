#!/usr/bin/env python3
"""
Seed production database with initial business data.
Run this script after deploying to Vercel to populate your MongoDB Atlas database.

Usage:
    python seed_production.py
"""

import asyncio
import os
from motor.motor_asyncio import AsyncIOMotorClient
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

MONGODB_URI = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "vantage")

# Sample businesses to seed - customize these for your area
SAMPLE_BUSINESSES = [
    {
        "place_id": "sample-toronto-cafe-1",
        "name": "Sample Coffee Shop",
        "category": "Cafes & Coffee",
        "address": "123 Main St",
        "city": "Toronto",
        "state": "ON",
        "postal_code": "M5H 2N2",
        "country": "Canada",
        "location": {
            "type": "Point",
            "coordinates": [-79.3832, 43.6532]  # Toronto coordinates [lng, lat]
        },
        "rating": 4.5,
        "platform_review_count": 50,
        "weighted_reviews": 45.0,
        "verified_visits": 30,
        "engagement_actions": 25,
        "trending_score": 10.0,
        "local_confidence": 0.85,
        "business_type": "independent",
        "is_claimed": False,
        "has_deals": False,
        "is_active": True,
        "phone": "+1-416-555-0100",
        "website": "https://example.com",
        "description": "A cozy neighborhood coffee shop.",
        "primary_image_url": "https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?w=800",
    },
    {
        "place_id": "sample-toronto-restaurant-1",
        "name": "Sample Italian Restaurant",
        "category": "Italian",
        "address": "456 King St",
        "city": "Toronto",
        "state": "ON",
        "postal_code": "M5H 1A1",
        "country": "Canada",
        "location": {
            "type": "Point",
            "coordinates": [-79.3850, 43.6550]
        },
        "rating": 4.7,
        "platform_review_count": 120,
        "weighted_reviews": 110.0,
        "verified_visits": 80,
        "engagement_actions": 60,
        "trending_score": 15.0,
        "local_confidence": 0.92,
        "business_type": "independent",
        "is_claimed": False,
        "has_deals": False,
        "is_active": True,
        "phone": "+1-416-555-0200",
        "website": "https://example-restaurant.com",
        "description": "Authentic Italian cuisine in the heart of downtown.",
        "primary_image_url": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800",
    },
    # Add more businesses as needed
]


async def seed_database():
    """Seed the database with sample businesses."""
    print(f"Connecting to MongoDB...")
    client = AsyncIOMotorClient(MONGODB_URI)
    database = client[DATABASE_NAME]
    
    try:
        # Test connection
        await client.admin.command('ping')
        print(f"✅ Connected to database: {DATABASE_NAME}")
        
        businesses_collection = database["businesses"]
        
        # Check if businesses already exist
        existing_count = await businesses_collection.count_documents({})
        print(f"📊 Current businesses in database: {existing_count}")
        
        if existing_count > 0:
            response = input("⚠️  Database already has businesses. Clear and reseed? (yes/no): ")
            if response.lower() == 'yes':
                result = await businesses_collection.delete_many({})
                print(f"🗑️  Deleted {result.deleted_count} existing businesses")
            else:
                print("❌ Seeding cancelled")
                return
        
        # Insert sample businesses
        print(f"📥 Inserting {len(SAMPLE_BUSINESSES)} businesses...")
        result = await businesses_collection.insert_many(SAMPLE_BUSINESSES)
        print(f"✅ Successfully inserted {len(result.inserted_ids)} businesses")
        
        # Create indexes
        print("🔧 Creating indexes...")
        await businesses_collection.create_index([("location", "2dsphere")])
        await businesses_collection.create_index("place_id", unique=True, sparse=True)
        print("✅ Indexes created")
        
        print("\n🎉 Database seeding complete!")
        print(f"📍 Total businesses: {await businesses_collection.count_documents({})}")
        
    except Exception as e:
        print(f"❌ Error seeding database: {e}")
        raise
    finally:
        client.close()


if __name__ == "__main__":
    print("=" * 60)
    print("🌱 Vantage Production Database Seeder")
    print("=" * 60)
    print()
    
    if not MONGODB_URI or MONGODB_URI == "mongodb://localhost:27017":
        print("❌ Error: MONGODB_URI not configured")
        print("Set your MongoDB Atlas connection string in .env file")
        exit(1)
    
    asyncio.run(seed_database())
