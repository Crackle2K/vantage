import os
from pathlib import Path
from dotenv import load_dotenv

def _get_bool(name: str, default: bool = False) -> bool:
    raw = str(os.getenv(name, str(default))).strip().lower()
    return raw in {"1", "true", "yes", "on"}

_HERE = Path(__file__).resolve().parent
_BACKEND_ENV = _HERE / ".env"
_ROOT_ENV = _HERE.parent / ".env"

if _BACKEND_ENV.exists():
    load_dotenv(dotenv_path=_BACKEND_ENV)
else:
    load_dotenv(dotenv_path=_ROOT_ENV)

MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME: str = os.getenv("DATABASE_NAME", "vantage")

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

DEMO_MODE: bool = _get_bool("DEMO_MODE", False)
DEMO_LAT: float = float(os.getenv("DEMO_LAT", "43.6532"))
DEMO_LNG: float = float(os.getenv("DEMO_LNG", "-79.3832"))
