"""Application configuration loaded from environment variables.

Loads settings from a ``.env`` file (looked up in the backend directory first,
then the repository root). Exposes module-level constants for JWT authentication,
Google OAuth, reCAPTCHA Enterprise, Supabase, Stripe, and application behavior.

Attributes:
    SECRET_KEY (str): JWT signing key. **Must** be set or the app will refuse to start.
    ALGORITHM (str): JWT algorithm (default ``HS256``).
    ACCESS_TOKEN_EXPIRE_MINUTES (int): Access-token TTL in minutes (default 30).
    REFRESH_TOKEN_EXPIRE_DAYS (int): Refresh-token TTL in days (default 7).
    GOOGLE_API_KEY (str): Google Maps / Places API key.
    GOOGLE_CLIENT_ID (str): Google OAuth client ID.
    GOOGLE_CLIENT_SECRET (str): Google OAuth client secret.
    RECAPTCHA_ENTERPRISE_*: reCAPTCHA Enterprise configuration for signup protection.
    API_URL (str): Backend API base URL.
    FRONTEND_URL (str): Frontend base URL (used for CORS and redirect URLs).
    ENVIRONMENT (str): Deployment environment (``development`` | ``production``).
    REDIS_URL (str): Redis connection URL for rate limiting and account lockout.
    SUPABASE_URL (str): Supabase project URL.
    SUPABASE_SERVICE_ROLE_KEY (str): Supabase service-role key.
    SUPABASE_JWT_SECRET (str): Supabase JWT verification secret.
    STRIPE_SECRET_KEY (str): Stripe secret key for billing.
    STRIPE_PUBLISHABLE_KEY (str): Stripe publishable key (sent to the frontend).
    STRIPE_WEBHOOK_SECRET (str): Stripe webhook signing secret.
"""
import os
from pathlib import Path
from dotenv import load_dotenv

def _get_bool(name: str, default: bool = False) -> bool:
    """Parse an environment variable as a boolean.

    Recognizes ``1``, ``true``, ``yes``, and ``on`` (case-insensitive) as True.

    Args:
        name (str): Environment variable name.
        default (bool): Fallback when the variable is unset.

    Returns:
        bool: Parsed boolean value.
    """
    raw = str(os.getenv(name, str(default))).strip().lower()
    return raw in {"1", "true", "yes", "on"}

_HERE = Path(__file__).resolve().parent
_BACKEND_ENV = _HERE / ".env"
_ROOT_ENV = _HERE.parent / ".env"

if _BACKEND_ENV.exists():
    load_dotenv(dotenv_path=_BACKEND_ENV)
else:
    load_dotenv(dotenv_path=_ROOT_ENV)

# Security: Fail fast if SECRET_KEY is not set
_ENV_SECRET_KEY = os.getenv("SECRET_KEY")
if not _ENV_SECRET_KEY:
    raise RuntimeError("SECRET_KEY environment variable must be set")

SECRET_KEY: str = _ENV_SECRET_KEY
ALGORITHM: str = os.getenv("ALGORITHM", "HS256")

# Reduced from 7 days to 30 minutes for security
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "30"))
REFRESH_TOKEN_EXPIRE_DAYS: int = int(os.getenv("REFRESH_TOKEN_EXPIRE_DAYS", "7"))

GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")

RECAPTCHA_ENTERPRISE_PROJECT_ID: str = os.getenv("RECAPTCHA_ENTERPRISE_PROJECT_ID", "")
RECAPTCHA_ENTERPRISE_API_KEY: str = os.getenv("RECAPTCHA_ENTERPRISE_API_KEY", "")
RECAPTCHA_ENTERPRISE_SITE_KEY: str = os.getenv("RECAPTCHA_ENTERPRISE_SITE_KEY", "")
RECAPTCHA_SIGNUP_ACTION: str = os.getenv("RECAPTCHA_SIGNUP_ACTION", "SIGNUP")
RECAPTCHA_MIN_SCORE: float = float(os.getenv("RECAPTCHA_MIN_SCORE", "0.5"))
RECAPTCHA_VERIFY_TIMEOUT_SECONDS: int = int(os.getenv("RECAPTCHA_VERIFY_TIMEOUT_SECONDS", "10"))

API_URL: str = os.getenv("API_URL", "http://localhost:8000")

FRONTEND_URL: str = os.getenv("FRONTEND_URL", "http://localhost:5173")

ENVIRONMENT: str = os.getenv("ENVIRONMENT", "development")
REDIS_URL: str = os.getenv("REDIS_URL", "redis://localhost:6379/0")

# Supabase configuration
SUPABASE_URL: str = os.getenv("SUPABASE_URL", "")
SUPABASE_SERVICE_ROLE_KEY: str = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
SUPABASE_JWT_SECRET: str = os.getenv("SUPABASE_JWT_SECRET", "")

# Stripe billing configuration
STRIPE_SECRET_KEY: str = os.getenv("STRIPE_SECRET_KEY", "")
STRIPE_PUBLISHABLE_KEY: str = os.getenv("STRIPE_PUBLISHABLE_KEY", "")
STRIPE_WEBHOOK_SECRET: str = os.getenv("STRIPE_WEBHOOK_SECRET", "")
