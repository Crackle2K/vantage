import urllib.request
import json

# Test signup with real credentials
payload = {
    'name': 'Test User Final',
    'email': 'finaltest@example.com',
    'password': 'TestPass123!',
    'role': 'customer',
    'recaptcha_token': 'test_token',
    'recaptcha_action': 'SIGNUP'
}

req = urllib.request.Request(
    'http://127.0.0.1:8000/api/auth/register',
    data=json.dumps(payload).encode('utf-8'),
    headers={'Content-Type': 'application/json'},
    method='POST'
)

try:
    with urllib.request.urlopen(req) as resp:
        print('SUCCESS: Signup endpoint returned 201')
        body = resp.read().decode()
        data = json.loads(body)
        user_id = data.get('user_id')
        print(f'User created with ID: {user_id}')
except urllib.error.HTTPError as e:
    print(f'FAILED: Status {e.code}')
    error_body = e.read().decode()
    print(f'Error: {error_body}')
except Exception as e:
    print(f'ERROR: {type(e).__name__}: {e}')
