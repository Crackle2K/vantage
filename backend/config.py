"""
Vantage Configuration
Loads all secrets from .env — never hardcode or expose API keys.
"""

import os
from dotenv import load_dotenv

load_dotenv()

# ── MongoDB ─────────────────────────────────────────────────────────
MONGODB_URI: str = os.getenv("MONGODB_URI", "mongodb://localhost:27017")
DATABASE_NAME: str = os.getenv("DATABASE_NAME", "vantage")

# ── JWT / Auth ──────────────────────────────────────────────────────
SECRET_KEY: str = os.getenv("SECRET_KEY", "CHANGE_ME")
ALGORITHM: str = os.getenv("ALGORITHM", "HS256")
ACCESS_TOKEN_EXPIRE_MINUTES: int = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "10080"))

# ── Google Places API ───────────────────────────────────────────────
GOOGLE_API_KEY: str = os.getenv("GOOGLE_API_KEY", "")

# ── API ─────────────────────────────────────────────────────────────
API_URL: str = os.getenv("API_URL", "http://localhost:8000")
