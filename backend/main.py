from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from starlette.middleware.base import BaseHTTPMiddleware
from contextlib import asynccontextmanager
from pymongo.errors import PyMongoError
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from config import DEMO_MODE
from database.mongodb import connect_to_mongo, close_mongo_connection
from database.mongodb import DatabaseUnavailableError
from models.auth import router as auth_router
from routes.businesses import router as businesses_router
from routes.reviews import router as reviews_router
from routes.deals import router as deals_router
from routes.claims import router as claims_router
from routes.subscriptions import router as subscriptions_router
from routes.activity import router as activity_router
from routes.discovery import router as discovery_router
from routes.saved import router as saved_router
from routes.users import router as users_router

@asynccontextmanager
async def lifespan(app: FastAPI):
    await connect_to_mongo()
    yield
    await close_mongo_connection()

app = FastAPI(
    title="Vantage API",
    description="Backend API for Vantage - Discover and support local businesses",
    version="1.0.0",
    lifespan=lifespan
)


class SecurityHeadersMiddleware(BaseHTTPMiddleware):
    """Add security headers to all responses."""

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

        # Content Security Policy
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
    return JSONResponse(
        status_code=503,
        content={
            "detail": str(exc),
            "error": "database_unavailable",
        },
    )

@app.exception_handler(PyMongoError)
async def handle_pymongo_error(_: Request, exc: PyMongoError):
    return JSONResponse(
        status_code=503,
        content={
            "detail": f"Database query failed: {str(exc)}",
            "error": "database_query_failed",
        },
    )

@app.get("/")
async def root():
    return {
        "message": "Vantage API running",
        "status": "active",
        "version": "1.0.0",
        "demo_mode": DEMO_MODE,
    }

@app.get("/health")
async def health_check():
    return {
        "status": "ok",
        "version": app.version,
        "demo_mode": DEMO_MODE,
    }
