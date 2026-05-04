"""Vercel serverless function entry point for Vantage.

Adds the ``backend/`` directory to ``sys.path`` so that the FastAPI
application can be imported without a full package installation, then
exposes the ``app`` object for Vercel's Python runtime.

Vercel routes all ``/api/*`` requests (configured in ``vercel.json``)
to this module. The ASGI app handles request routing, middleware, and
response generation.
"""

import os
import sys
from pathlib import Path

# Demo mode is opt-in. Set DEMO_MODE=true in Vercel env vars explicitly;
# defaulting to true caused seed_demo_dataset to run on every cold start.
os.environ.setdefault("DEMO_MODE", "false")

# Set a default SECRET_KEY for JWT signing in serverless demo mode.
# In production, this should be set via environment variables.
os.environ.setdefault("SECRET_KEY", "demo-secret-key-change-in-production")

# Suppress slowapi's redis dependency warning when no REDIS_URL is set.
# slowapi will still load, it just won't enforce rate limits without Redis.
if not os.getenv("REDIS_URL"):
    os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

from main import app