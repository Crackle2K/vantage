"""FastAPI application factory and middleware configuration.

Creates the Vantage API application with CORS, security headers, rate limiting,
and route mounting. Manages the application lifespan including database
connection setup, graceful shutdown, and health checks.
"""
import asyncio
import signal
import sys
from pathlib import Path

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from backend.config import DEMO_MODE, ENVIRONMENT
from backend.database.document_store import connect_to_mongo, close_mongo_connection
from backend.database.document_store import DatabaseUnavailableError
from backend.models.auth import router as auth_router
from backend.routes.businesses import router as businesses_router
from backend.routes.reviews import router as reviews_router
from backend.routes.deals import router as deals_router
from backend.routes.claims import router as claims_router
from backend.routes.subscriptions import router as subscriptions_router
from backend.routes.activity import router as activity_router
from backend.routes.discovery import router as discovery_router
from backend.routes.saved import router as saved_router
from backend.routes.users import router as users_router

_shutdown_event = asyncio.Event()


async def _graceful_shutdown(app: FastAPI):
    """Drain in-flight requests before shutdown (max 30s).

    Waits up to 30 seconds for the shutdown event, then forces the MongoDB
    connection closed regardless.
    """
    print("Received shutdown signal, draining connections...")
    try:
        await asyncio.wait_for(_shutdown_event.wait(), timeout=30)
    except asyncio.TimeoutError:
        print("Shutdown timeout reached, forcing exit.")
    await close_mongo_connection()


@asynccontextmanager
async def lifespan(app: FastAPI):
    loop = asyncio.get_running_loop()
    for sig in (signal.SIGTERM, signal.SIGINT):
        loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(_graceful_shutdown(app)))
    await connect_to_mongo()
    yield
    _shutdown_event.set()

app = FastAPI(
    title="Vantage API",
    description="Backend API for Vantage - Discover and support local businesses",
    version="1.0.0",
    lifespan=lifespan
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses.

    Injects HSTS, X-Content-Type-Options, X-Frame-Options, XSS-Protection,
    Referrer-Policy, Content-Security-Policy, and Permissions-Policy headers.
    Security headers are skipped for localhost requests and FastAPI's built-in
    docs pages so Swagger/ReDoc continue to work in production.
    """

    async def dispatch(self, request: Request, call_next):
        response = await call_next(request)

        # Skip security headers for localhost development
        if request.url.hostname in ["localhost", "127.0.0.1"]:
            return response

        # HSTS: Force HTTPS for 1 year, include subdomains
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

        # Prevent MIME type sniffing
        response.headers["X-Content-Type-Options"] = "nosniff"

        # Prevent clickjacking
        response.headers["X-Frame-Options"] = "DENY"

        # XSS protection (legacy browsers)
        response.headers["X-XSS-Protection"] = "1; mode=block"

        # Referrer policy
        response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

        # Apply CSP only to non-docs HTML responses so FastAPI's built-in
        # Swagger/ReDoc pages keep working in production.
        content_type = response.headers.get("content-type", "")
        request_path = request.url.path
        is_html_response = content_type.startswith("text/html")
        is_fastapi_docs_path = request_path in ["/docs", "/redoc", "/docs/oauth2-redirect"]

        if is_html_response and not is_fastapi_docs_path:
            response.headers["Content-Security-Policy"] = (
                "default-src 'self'; "
                "script-src 'self' 'unsafe-inline' https://accounts.google.com; "
                "style-src 'self' 'unsafe-inline'; "
                "img-src 'self' data: https: blob:; "
                "font-src 'self'; "
                "connect-src 'self' https://accounts.google.com; "
                "frame-ancestors 'none'"
            )
        # Permissions Policy (formerly Feature Policy)
        response.headers["Permissions-Policy"] = (
            "geolocation=(self), "
            "microphone=(), "
            "camera=()"
        )

        return response


# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)

@app.exception_handler(RateLimitExceeded)
async def rate_limit_handler(request: Request, exc: RateLimitExceeded):
    """Return a JSON 429 response when the rate limiter triggers."""
    return JSONResponse(
        status_code=429,
        content={
            "detail": "Too many requests. Please try again later.",
            "error": "rate_limit_exceeded",
        },
    )

import os
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5174",
]

frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    allowed_origins.append(frontend_url)

# Add production domain if specified
production_url = os.getenv("PRODUCTION_URL")
if production_url:
    allowed_origins.append(production_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"^https://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "X-Requested-With"],
    expose_headers=["Set-Cookie"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(businesses_router, prefix="/api", tags=["Businesses"])
app.include_router(reviews_router, prefix="/api", tags=["Reviews"])
app.include_router(deals_router, prefix="/api", tags=["Deals"])
app.include_router(claims_router, prefix="/api", tags=["Claims"])
app.include_router(subscriptions_router, prefix="/api", tags=["Subscriptions"])
app.include_router(activity_router, prefix="/api", tags=["Activity"])
app.include_router(discovery_router, prefix="/api", tags=["Discovery"])
app.include_router(saved_router, prefix="/api", tags=["Saved"])
app.include_router(users_router, prefix="/api/users", tags=["Users"])

@app.exception_handler(DatabaseUnavailableError)
async def handle_db_unavailable(_: Request, exc: DatabaseUnavailableError):
    """Return a 503 response when the database is unreachable."""
    return JSONResponse(
        status_code=503,
        content={
            "detail": str(exc),
            "error": "database_unavailable",
        },
    )

@app.get("/")
async def root():
    """Root endpoint returning API name, status, and version."""
    return {
        "message": "Vantage API running",
        "status": "active",
        "version": "1.0.0",
        "demo_mode": DEMO_MODE,
    }

@app.get("/health")
async def health_check():
    """Health-check endpoint that verifies database connectivity.

    Returns:
        dict: Status (``ok`` or ``degraded``), version, demo-mode flag, and
            per-component check results.
    """
    checks = {"database": "ok"}
    try:
        from backend.database.document_store import get_database
        db = get_database()
        # Verify connectivity by doing a trivial query
        await db["users"].find_one({}, projection={"_id": 1})
    except Exception as exc:
        checks["database"] = f"error: {type(exc).__name__}"

    overall = "ok" if all(v == "ok" for v in checks.values()) else "degraded"
    return {
        "status": overall,
        "version": app.version,
        "demo_mode": DEMO_MODE,
        "checks": checks,
    }
