from backend.database.supabase import get_supabase_client
from backend.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY

if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
    print("ERROR: Supabase credentials not configured")
    print(f"SUPABASE_URL: {SUPABASE_URL}")
    print(f"SUPABASE_SERVICE_ROLE_KEY: {'SET' if SUPABASE_SERVICE_ROLE_KEY else 'NOT SET'}")
else:
    try:
        client = get_supabase_client()
        # Try to check if users table exists by querying it
        print("Checking users table...")
        response = client.table('users').select('count', count='exact').execute()
        print(f"Users table exists! Count response: {response}")
        
        # Try to insert a test user
        print("\nTrying to insert test user...")
        test_payload = {
            "name": "Test",
            "email": f"test_{id(object())}@example.com",
            "hashed_password": "$2b$12$test",
            "role": "customer",
            "favorites": [],
            "created_at": "2024-01-01T00:00:00"
        }
        insert_response = client.table('users').insert(test_payload).execute()
        print(f"Insert response: {insert_response}")
        
    except Exception as e:
        print(f"ERROR: {e}")
        print(f"Error type: {type(e).__name__}")
        import traceback
        traceback.print_exc()
