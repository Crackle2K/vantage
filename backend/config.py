"""
Vantage Configuration
Loads all secrets from .env — never hardcode or expose API keys.
"""

import os
from pathlib import Path
from dotenv import load_dotenv

# Resolve env files deterministically so running from repo root still loads backend/.env.
_HERE = Path(__file__).resolve().parent
_BACKEND_ENV = _HERE / ".env"
_ROOT_ENV = _HERE.parent / ".env"

if _BACKEND_ENV.exists():
    load_dotenv(dotenv_path=_BACKEND_ENV)
else:
    # Fallback for setups that keep a project-level .env file.
    load_dotenv(dotenv_path=_ROOT_ENV)


def _parse_csv_env(value: str) -> list[str]:
    """Parse a comma-separated env var into a clean list of strings."""
    if not value:
        return []
    return [item.strip().rstrip("/") for item in value.split(",") if item.strip()]

# ── MongoDB ─────────────────────────────────────────────────────────
MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME: str = os.getenv("DATABASE_NAME", "vantage")

# ── JWT / Auth ──────────────────────────────────────────────────────
SECRET_KEY: str = os.getenv("SECRET_KEY", "CHANGE_ME")
ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

# ── Google Places API ───────────────────────────────────────────────
GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

# ── Google OAuth ────────────────────────────────────────────────────
GOOGLE_CLIENT_ID: str = os.getenv("GOOGLE_CLIENT_ID", "")
GOOGLE_CLIENT_SECRET: str = os.getenv("GOOGLE_CLIENT_SECRET", "")

# ── API ─────────────────────────────────────────────────────────────
API_URL: str = os.getenv("API_URL", "http://localhost:8000")

# ── CORS ────────────────────────────────────────────────────────────
_DEFAULT_CORS_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5174",
]
CORS_ORIGINS: list[str] = _parse_csv_env(os.getenv("CORS_ORIGINS", "")) or _DEFAULT_CORS_ORIGINS
CORS_ORIGIN_REGEX: str = os.getenv(
    "CORS_ORIGIN_REGEX",
    r"https?://(localhost|127\.0\.0\.1)(:\d+)?$|https://([a-zA-Z0-9-]+\.)*vercel\.app$",
)

# Demo auth fallback (for local demos when DB is unavailable)
DEMO_AUTH_ENABLED: bool = os.getenv("DEMO_AUTH_ENABLED", "false").lower() in ("1", "true", "yes", "on")
DEMO_ADMIN_EMAIL: str = os.getenv("DEMO_ADMIN_EMAIL", "vantageadmin@gmail.com")
DEMO_ADMIN_PASSWORD: str = os.getenv("DEMO_ADMIN_PASSWORD", "demo-admin-password")
