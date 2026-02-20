"""
Business Claim Model Schema
Handles the hybrid business model:

1. SEED BUSINESSES (unclaimed):
   - Public businesses from our database / external sources
   - Basic listing with name, address, category
   - Anyone can review them
   - No owner controls

2. CLAIMED BUSINESSES:
   - A business_owner signs up and claims a listing
   - Gets verified as the actual owner
   - Unlocks: profile editing, deal posting, review responses,
     analytics, events, visibility boosts
   - Subscription tiers control which features they access
"""

from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class ClaimStatus(str, Enum):
    """Status of a business claim request"""
    PENDING = "pending"         # Submitted, awaiting review
    VERIFIED = "verified"       # Approved — owner confirmed
    REJECTED = "rejected"       # Denied — not the real owner
    REVOKED = "revoked"         # Was verified, but revoked


class VerificationMethod(str, Enum):
    """How the owner proved they own the business"""
    EMAIL_DOMAIN = "email_domain"     # Email matches business domain
    PHONE_CALL = "phone_call"         # Verified via phone
    DOCUMENT = "document"             # Uploaded business license/doc
    IN_PERSON = "in_person"           # Staff verified in person
    COMMUNITY = "community"           # Community vouched (future)


class BusinessClaim(BaseModel):
    """A claim request on a business listing"""
    id: str
    business_id: str
    user_id: str                                # The user claiming ownership
    status: ClaimStatus = ClaimStatus.PENDING
    verification_method: Optional[VerificationMethod] = None
    verification_notes: Optional[str] = None
    
    # Owner-provided proof
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_role: str = Field(default="owner", max_length=50)  # owner, manager, etc.
    owner_phone: Optional[str] = None
    owner_email: Optional[str] = None
    proof_description: Optional[str] = Field(None, max_length=500)
    
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None  # Admin who reviewed

    class Config:
        from_attributes = True


class ClaimCreate(BaseModel):
    """Schema for submitting a business claim"""
    business_id: str
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_role: str = Field(default="owner", max_length=50)
    owner_phone: Optional[str] = None
    owner_email: Optional[str] = None
    proof_description: Optional[str] = Field(None, max_length=500)


class ClaimReview(BaseModel):
    """Schema for admin reviewing a claim"""
    status: ClaimStatus
    verification_method: Optional[VerificationMethod] = None
    verification_notes: Optional[str] = Field(None, max_length=500)
