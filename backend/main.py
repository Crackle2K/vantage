from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
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

# Rate limiting setup
limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

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
