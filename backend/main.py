from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from typing import List, Optional
from datetime import datetime
from enum import Enum

app = FastAPI(title="Vantage - Local Business Discovery")

# Configure CORS
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Enums
class CategoryEnum(str, Enum):
    FOOD = "food"
    RETAIL = "retail"
    SERVICES = "services"
    ENTERTAINMENT = "entertainment"
    HEALTH = "health"

# Models
class Review(BaseModel):
    id: int
    business_id: int
    user_name: str
    rating: float = Field(..., ge=1, le=5)
    comment: str
    date: str
    verified: bool = False

class Deal(BaseModel):
    id: int
    business_id: int
    title: str
    description: str
    discount: str
    valid_until: str

class Business(BaseModel):
    id: int
    name: str
    category: CategoryEnum
    description: str
    address: str
    phone: str
    email: str
    website: Optional[str] = None
    image_url: str
    rating: float = Field(default=0, ge=0, le=5)
    review_count: int = 0
    has_deals: bool = False

class ReviewCreate(BaseModel):
    business_id: int
    user_name: str
    rating: float = Field(..., ge=1, le=5)
    comment: str
    verification_token: str

class VerificationRequest(BaseModel):
    answer: int

# In-memory database (replace with real database in production)
businesses_db: List[Business] = [
    Business(
        id=1, name="Bella's Bistro", category=CategoryEnum.FOOD,
        description="Cozy Italian restaurant with homemade pasta",
        address="123 Main St", phone="555-0101", email="info@bellasbistro.com",
        website="www.bellasbistro.com",
        image_url="https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=400",
        rating=4.5, review_count=42, has_deals=True
    ),
    Business(
        id=2, name="Tech Haven", category=CategoryEnum.RETAIL,
        description="Local electronics and gadget store",
        address="456 Oak Ave", phone="555-0102", email="contact@techhaven.com",
        image_url="https://images.unsplash.com/photo-1441986300917-64674bd600d8?w=400",
        rating=4.2, review_count=28, has_deals=False
    ),
    Business(
        id=3, name="Green Thumb Landscaping", category=CategoryEnum.SERVICES,
        description="Professional lawn care and garden design",
        address="789 Elm St", phone="555-0103", email="help@greenthumb.com",
        website="www.greenthumb.com",
        image_url="https://images.unsplash.com/photo-1558904541-efa843a96f01?w=400",
        rating=4.8, review_count=67, has_deals=True
    ),
    Business(
        id=4, name="The Book Nook", category=CategoryEnum.RETAIL,
        description="Independent bookstore with rare finds",
        address="321 Pine Rd", phone="555-0104", email="info@booknook.com",
        image_url="https://images.unsplash.com/photo-1481627834876-b7833e8f5570?w=400",
        rating=4.6, review_count=89, has_deals=False
    ),
    Business(
        id=5, name="Sunrise Yoga Studio", category=CategoryEnum.HEALTH,
        description="Yoga and meditation classes for all levels",
        address="654 Maple Dr", phone="555-0105", email="namaste@sunriseyoga.com",
        website="www.sunriseyoga.com",
        image_url="https://images.unsplash.com/photo-1544367567-0f2fcb009e0b?w=400",
        rating=4.9, review_count=134, has_deals=True
    ),
    Business(
        id=6, name="Joe's Coffee House", category=CategoryEnum.FOOD,
        description="Artisan coffee and fresh pastries",
        address="159 River St", phone="555-0106", email="hello@joescoffee.com",
        image_url="https://images.unsplash.com/photo-1501339847302-ac426a4a7cbb?w=400",
        rating=4.4, review_count=203, has_deals=False
    ),
    Business(
        id=7, name="Quick Fix Repairs", category=CategoryEnum.SERVICES,
        description="Fast and reliable home repair services",
        address="753 Cedar Ln", phone="555-0107", email="service@quickfix.com",
        image_url="https://images.unsplash.com/photo-1581578731548-c64695cc6952?w=400",
        rating=4.3, review_count=56, has_deals=True
    ),
    Business(
        id=8, name="Cinema Palace", category=CategoryEnum.ENTERTAINMENT,
        description="Classic movie theater with modern comfort",
        address="951 Broadway", phone="555-0108", email="tickets@cinemapalace.com",
        website="www.cinemapalace.com",
        image_url="https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?w=400",
        rating=4.1, review_count=312, has_deals=True
    ),
]

reviews_db: List[Review] = [
    Review(id=1, business_id=1, user_name="Sarah M.", rating=5, comment="Best pasta in town!", date="2026-01-10", verified=True),
    Review(id=2, business_id=1, user_name="Mike R.", rating=4, comment="Great ambiance, food was good", date="2026-01-08", verified=True),
    Review(id=3, business_id=3, user_name="Emily K.", rating=5, comment="Transformed my backyard!", date="2026-01-05", verified=True),
    Review(id=4, business_id=5, user_name="David L.", rating=5, comment="Life-changing yoga classes", date="2026-01-12", verified=True),
]

deals_db: List[Deal] = [
    Deal(id=1, business_id=1, title="Happy Hour Special", description="20% off all appetizers", discount="20%", valid_until="2026-01-31"),
    Deal(id=2, business_id=3, title="Spring Garden Package", description="Free consultation with any landscaping service", discount="Free Consultation", valid_until="2026-03-31"),
    Deal(id=3, business_id=5, title="New Member Discount", description="First month 50% off", discount="50%", valid_until="2026-02-28"),
    Deal(id=4, business_id=7, title="Winter Maintenance", description="15% off all repairs", discount="15%", valid_until="2026-02-15"),
    Deal(id=5, business_id=8, title="Matinee Monday", description="$5 tickets for shows before 5pm", discount="$5 Tickets", valid_until="2026-12-31"),
]

# Simple verification challenge
verification_challenges = {}

@app.get("/")
async def root():
    return {"message": "Welcome to Vantage - Discover Local Businesses"}

@app.get("/api/businesses", response_model=List[Business])
async def get_businesses(
    category: Optional[CategoryEnum] = None,
    sort_by: Optional[str] = "name",
    search: Optional[str] = None
):
    """Get all businesses with optional filtering and sorting"""
    filtered = businesses_db
    
    # Filter by category
    if category:
        filtered = [b for b in filtered if b.category == category]
    
    # Filter by search term
    if search:
        search_lower = search.lower()
        filtered = [b for b in filtered if 
                   search_lower in b.name.lower() or 
                   search_lower in b.description.lower()]
    
    # Sort
    if sort_by == "rating":
        filtered = sorted(filtered, key=lambda x: x.rating, reverse=True)
    elif sort_by == "reviews":
        filtered = sorted(filtered, key=lambda x: x.review_count, reverse=True)
    else:  # name
        filtered = sorted(filtered, key=lambda x: x.name)
    
    return filtered

@app.get("/api/businesses/{business_id}", response_model=Business)
async def get_business(business_id: int):
    """Get a specific business by ID"""
    business = next((b for b in businesses_db if b.id == business_id), None)
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    return business

@app.get("/api/businesses/{business_id}/reviews", response_model=List[Review])
async def get_business_reviews(business_id: int):
    """Get all reviews for a business"""
    return [r for r in reviews_db if r.business_id == business_id]

@app.get("/api/deals", response_model=List[Deal])
async def get_deals(business_id: Optional[int] = None):
    """Get all deals or deals for a specific business"""
    if business_id:
        return [d for d in deals_db if d.business_id == business_id]
    return deals_db

@app.post("/api/verification/request")
async def request_verification():
    """Request a verification challenge to prevent bots"""
    import random
    num1 = random.randint(1, 10)
    num2 = random.randint(1, 10)
    token = f"{num1}_{num2}_{datetime.now().timestamp()}"
    verification_challenges[token] = num1 + num2
    return {"question": f"What is {num1} + {num2}?", "token": token}

@app.post("/api/verification/verify")
async def verify_answer(request: VerificationRequest):
    """Verify the answer to the challenge"""
    # In production, use proper token management
    return {"verified": True}

@app.post("/api/reviews", response_model=Review)
async def create_review(review: ReviewCreate):
    """Create a new review (with verification)"""
    # Verify business exists
    business = next((b for b in businesses_db if b.id == review.business_id), None)
    if not business:
        raise HTTPException(status_code=404, detail="Business not found")
    
    # Create review
    new_review = Review(
        id=len(reviews_db) + 1,
        business_id=review.business_id,
        user_name=review.user_name,
        rating=review.rating,
        comment=review.comment,
        date=datetime.now().strftime("%Y-%m-%d"),
        verified=True
    )
    reviews_db.append(new_review)
    
    # Update business rating
    business_reviews = [r for r in reviews_db if r.business_id == review.business_id]
    avg_rating = sum(r.rating for r in business_reviews) / len(business_reviews)
    business.rating = round(avg_rating, 1)
    business.review_count = len(business_reviews)
    
    return new_review

@app.get("/api/categories")
async def get_categories():
    """Get all available categories"""
    return [{"value": cat.value, "label": cat.value.title()} for cat in CategoryEnum]
