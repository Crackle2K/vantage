"""
Vantage - FastAPI Backend
A location-based platform connecting users with local businesses
"""

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from contextlib import asynccontextmanager
from pymongo.errors import PyMongoError

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
from routes.users import router as users_router


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    await connect_to_mongo()
    yield
    await close_mongo_connection()


app = FastAPI(
    title="Vantage API",
    description="Backend API for Vantage - Discover and support local businesses",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS for both development and production
import os
allowed_origins = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:5174",
]

# Add production origins from environment variable
frontend_url = os.getenv("FRONTEND_URL")
if frontend_url:
    allowed_origins.append(frontend_url)

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_origin_regex=r"https?://(localhost|127\.0\.0\.1)(:\d+)?$|https://.*\.vercel\.app$",
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(businesses_router, prefix="/api", tags=["Businesses"])
app.include_router(reviews_router, prefix="/api", tags=["Reviews"])
app.include_router(deals_router, prefix="/api", tags=["Deals"])
app.include_router(claims_router, prefix="/api", tags=["Claims"])
app.include_router(subscriptions_router, prefix="/api", tags=["Subscriptions"])
app.include_router(activity_router, prefix="/api", tags=["Activity"])
app.include_router(discovery_router, prefix="/api", tags=["Discovery"])
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
    """Root endpoint - API health check"""
    return {
        "message": "Vantage API running",
        "status": "active",
        "version": "1.0.0"
    }

@app.get("/health")
async def health_check():
    """Health check endpoint for monitoring"""
    return {"status": "healthy"}

