"""
Vercel serverless function entry point for Vantage API.
This file serves as the handler for all /api/* routes.
"""

import sys
from pathlib import Path

# Add backend directory to Python path so imports work
backend_path = Path(__file__).parent.parent / "backend"
sys.path.insert(0, str(backend_path))

# Import the FastAPI app
from main import app

# Vercel expects the app to be available at module level
# The app is already configured with all routes and middleware
