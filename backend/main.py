"""FastAPI application factory and middleware configuration.

Creates the Vantage API application with CORS, security headers, rate limiting,
and route mounting. Manages the application lifespan including database
connection setup, graceful shutdown, and health checks.
"""
import asyncio
import os
import signal
import sys
from pathlib import Path

is_vercel = os.getenv("VERCEL") == "1"

if __package__ in {None, ""}:
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

# Serverless / demo defaults — set before config.py reads them.
# In Vercel deployments there's no .env file, so these fill the gaps.
if is_vercel:
    os.environ.setdefault("DEMO_MODE", "true")
    os.environ.setdefault("SECRET_KEY", "demo-secret-key-change-in-production")
# slowapi requires REDIS_URL even when Redis is absent; provide a no-op default.
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from starlette.datastructures import MutableHeaders
from starlette.types import ASGIApp, Message, Receive, Scope, Send
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from backend.config import (
    ENVIRONMENT,
    GOOGLE_API_KEY,
    SUPABASE_SERVICE_ROLE_KEY,
    SUPABASE_URL,
)
from backend.database.document_store import connect_to_mongo, close_mongo_connection
from backend.database.document_store import DatabaseUnavailableError
from backend.models.auth import close_auth_connections
from backend.models.auth import router as auth_router
from backend.routes.businesses import router as businesses_router
from backend.routes.reviews import router as reviews_router
from backend.routes.deals import router as deals_router
from backend.routes.claims import router as claims_router
from backend.routes.subscriptions import router as subscriptions_router
from backend.routes.activity import router as activity_router
from backend.routes.discovery import router as discovery_router
from backend.routes.location import router as location_router
from backend.routes.saved import router as saved_router
from backend.routes.users import router as users_router
from backend.services.google_places import close_google_places_client
from backend.services.photo_proxy import close_photo_proxy_http_client

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
    await close_google_places_client()
    await close_photo_proxy_http_client()
    await close_auth_connections()
    await close_mongo_connection()


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Only register signal handlers when NOT running in the Vercel serverless
    # runtime or on Windows, where asyncio does not implement
    # loop.add_signal_handler.
    if not is_vercel and sys.platform != "win32":
        loop = asyncio.get_running_loop()
        for sig in (signal.SIGTERM, signal.SIGINT):
            loop.add_signal_handler(sig, lambda s=sig: asyncio.create_task(_graceful_shutdown(app)))
    print(
        "Startup configuration: "
        f"environment={ENVIRONMENT}, "
        f"supabase_configured={bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)}, "
        f"google_api_key_present={bool(GOOGLE_API_KEY)}"
    )
    await connect_to_mongo()
    try:
        yield
    finally:
        _shutdown_event.set()
        await close_google_places_client()
        await close_photo_proxy_http_client()
        await close_auth_connections()
        await close_mongo_connection()

app = FastAPI(
    title="Vantage API",
    description="Backend API for Vantage - Discover and support local businesses",
    version="1.0.0",
    lifespan=lifespan
)


class SecurityHeadersMiddleware:
    """Add security headers to all responses.

    Injects HSTS, X-Content-Type-Options, X-Frame-Options, XSS-Protection,
    Referrer-Policy, Content-Security-Policy, and Permissions-Policy headers.
    Security headers are skipped for localhost requests and FastAPI's built-in
    docs pages so Swagger/ReDoc continue to work in production.
    """

    def __init__(self, app: ASGIApp):
        self.app = app

    async def __call__(self, scope: Scope, receive: Receive, send: Send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        headers = {key.decode("latin-1"): value.decode("latin-1") for key, value in scope.get("headers", [])}
        host = headers.get("host", "").split(":", 1)[0]
        path = scope.get("path", "")
        method = scope.get("method", "GET").upper()

        async def send_wrapper(message: Message):
            if message["type"] == "http.response.start":
                response_headers = MutableHeaders(scope=message)
                content_type = response_headers.get("content-type", "")

                if host not in {"localhost", "127.0.0.1"}:
                    response_headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"
                    response_headers["X-Content-Type-Options"] = "nosniff"
                    response_headers["X-Frame-Options"] = "DENY"
                    response_headers["X-XSS-Protection"] = "1; mode=block"
                    response_headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
                    response_headers["Permissions-Policy"] = "geolocation=(self), microphone=(), camera=()"

                    is_html_response = content_type.startswith("text/html")
                    is_fastapi_docs_path = path in {"/docs", "/redoc", "/docs/oauth2-redirect"}
                    if is_html_response and not is_fastapi_docs_path:
                        response_headers["Content-Security-Policy"] = (
                            "default-src 'self'; "
                            "script-src 'self' 'unsafe-inline' https://accounts.google.com; "
                            "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; "
                            "img-src 'self' data: https: blob:; "
                            "font-src 'self' https://fonts.gstatic.com; "
                            "connect-src 'self' https://accounts.google.com; "
                            "frame-ancestors 'none'"
                        )

                if (
                    method == "GET"
                    and content_type.startswith("application/json")
                    and "cache-control" not in response_headers
                    and path.startswith("/api/")
                    and not path.startswith(("/api/auth", "/api/users", "/api/saved"))
                ):
                    response_headers["Cache-Control"] = "public, max-age=30, s-maxage=60, stale-while-revalidate=60"

            await send(message)

        await self.app(scope, receive, send_wrapper)


# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)
app.add_middleware(SecurityHeadersMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)

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

# Auto-detect and allow the Vercel deployment URL so CORS doesn't block
# browser requests in production before PRODUCTION_URL is configured.
vercel_url = os.getenv("VERCEL_URL")
if vercel_url:
    allowed_origins.append(f"https://{vercel_url}")
    # Also allow the .vercel.app preview URL
    allowed_origins.append(f"https://{vercel_url}.vercel.app")

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
app.include_router(location_router, prefix="/api", tags=["Location"])
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
        "checks": checks,
    }
