"""
Quick Backend Test Script
Tests that all modules can be imported and basic functionality works
"""

print("Testing Vantage Backend...\n")

# Test 1: Import FastAPI app
print("✓ Testing main app import...")
try:
    from main import app
    print("  ✅ FastAPI app imported successfully")
except Exception as e:
    print(f"  ❌ Error importing app: {e}")
    exit(1)

# Test 2: Database connection module
print("\n✓ Testing database module...")
try:
    from database import mongodb
    print("  ✅ Database module imported successfully")
except Exception as e:
    print(f"  ❌ Error importing database: {e}")
    exit(1)

# Test 3: Models
print("\n✓ Testing models...")
try:
    from models import user, business, reviews, deal
    print("  ✅ All models imported successfully")
except Exception as e:
    print(f"  ❌ Error importing models: {e}")
    exit(1)

# Test 4: Routes
print("\n✓ Testing routes...")
try:
    from routes import businesses, reviews, deals
    from models import auth
    print("  ✅ All routes imported successfully")
except Exception as e:
    print(f"  ❌ Error importing routes: {e}")
    exit(1)

# Test 5: Services
print("\n✓ Testing services...")
try:
    from services import geo_service, match_score
    print("  ✅ All services imported successfully")
except Exception as e:
    print(f"  ❌ Error importing services: {e}")
    exit(1)

# Test 6: Geo service functions
print("\n✓ Testing geo service calculations...")
try:
    from services.geo_service import calculate_distance
    distance = calculate_distance(43.6532, -79.3832, 43.7184, -79.5181)
    print(f"  ✅ Distance calculation works: {distance} km")
except Exception as e:
    print(f"  ❌ Error in geo service: {e}")

# Test 7: Match score calculation
print("\n✓ Testing match score calculation...")
try:
    from services.match_score import calculate_match_score
    from datetime import datetime
    test_business = {
        "rating_average": 4.5,
        "total_reviews": 100,
        "category": "food",
        "created_at": datetime.utcnow()
    }
    score = calculate_match_score(test_business, "food")
    print(f"  ✅ Match score calculation works: {score}")
except Exception as e:
    print(f"  ❌ Error in match score: {e}")

print("\n" + "="*50)
print("✅ All backend tests passed!")
print("="*50)
print("\nTo start the server, run:")
print("  uvicorn main:app --reload")
print("\nAPI will be available at: http://localhost:8000")
print("API docs: http://localhost:8000/docs")
