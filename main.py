"""Vantage application entry point.

Imports the FastAPI application from the backend package so it can be
discovered by ASGI servers (e.g. ``uvicorn main:app``).  When running
from the repository root, this module acts as the top-level application
object that routes, middleware, and lifecycle events are attached to.
"""

from backend.main import app
