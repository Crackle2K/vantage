"""
Migration script to backfill profile_picture field for existing comments
Run this once to update all existing comments with user profile pictures
"""

import asyncio
from pymongo import MongoClient
from bson import ObjectId
import os
from dotenv import load_dotenv

load_dotenv()

MONGODB_URL = os.getenv("MONGODB_URL", "mongodb://localhost:27017")
DATABASE_NAME = os.getenv("DATABASE_NAME", "vantage")


def migrate_comment_pictures():
    """Add profile_picture to all existing comments in activity feed"""
    client = MongoClient(MONGODB_URL)
    db = client[DATABASE_NAME]
    
    activity_feed = db.activity_feed
    users = db.users
    
    print("Starting migration: Adding profile_picture to comments...")
    
    # Get all activity items with comments
    cursor = activity_feed.find({"comments_list": {"$exists": True, "$ne": []}})
    
    updated_count = 0
    total_items = 0
    total_comments = 0
    
    for item in cursor:
        total_items += 1
        comments_list = item.get("comments_list", [])
        
        if not comments_list:
            continue
        
        updated_comments = []
        item_updated = False
        
        for comment in comments_list:
            total_comments += 1
            
            # Skip if already has profile_picture
            if "profile_picture" in comment:
                updated_comments.append(comment)
                continue
            
            # Fetch user's profile picture
            user_id = comment.get("user_id")
            if user_id:
                try:
                    user = users.find_one({"_id": ObjectId(user_id)})
                    if user:
                        comment["profile_picture"] = user.get("profile_picture")
                        item_updated = True
                        print(f"  Added profile_picture for user: {user.get('name')} (comment in activity {item['_id']})")
                except Exception as e:
                    print(f"  Warning: Could not find user {user_id}: {e}")
                    comment["profile_picture"] = None
            else:
                comment["profile_picture"] = None
            
            updated_comments.append(comment)
        
        # Update the activity item with modified comments
        if item_updated:
            activity_feed.update_one(
                {"_id": item["_id"]},
                {"$set": {"comments_list": updated_comments}}
            )
            updated_count += 1
    
    print(f"\nMigration complete!")
    print(f"  Total activity items checked: {total_items}")
    print(f"  Total comments processed: {total_comments}")
    print(f"  Activity items updated: {updated_count}")
    
    client.close()


if __name__ == "__main__":
    migrate_comment_pictures()
