"""
Vantage - FastAPI Backend
A location-based platform connecting users with local businesses
"""

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from database.mongodb import connect_to_mongo, close_mongo_connection


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Manage application lifecycle"""
    # Startup
    await connect_to_mongo()
    yield
    # Shutdown
    await close_mongo_connection()


# Initialize FastAPI app
app = FastAPI(
    title="Vantage API",
    description="Backend API for Vantage - Discover and support local businesses",
    version="1.0.0",
    lifespan=lifespan
)

# Configure CORS for frontend localhost
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",  # Vite default port
        "http://localhost:3000",  # Next.js/React alternative
        "http://localhost:5174",  # Alternative Vite port
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Import and include routers
from models.auth import router as auth_router
from routes.businesses import router as businesses_router
from routes.reviews import router as reviews_router
from routes.deals import router as deals_router
from routes.claims import router as claims_router
from routes.subscriptions import router as subscriptions_router
from routes.activity import router as activity_router

app.include_router(auth_router, prefix="/api/auth", tags=["Authentication"])
app.include_router(businesses_router, prefix="/api", tags=["Businesses"])
app.include_router(reviews_router, prefix="/api", tags=["Reviews"])
app.include_router(deals_router, prefix="/api", tags=["Deals"])
app.include_router(claims_router, prefix="/api", tags=["Claims"])
app.include_router(subscriptions_router, prefix="/api", tags=["Subscriptions"])
app.include_router(activity_router, prefix="/api", tags=["Activity"])

# Root endpoint
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

# Run with: uvicorn main:app --reload

