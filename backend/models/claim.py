"""Business claim domain models for the Vantage API.

Defines Pydantic models for business ownership claims including submission,
admin review, and claim status tracking. A claim is how a business owner
verifies they own a listing.
"""
from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum

class ClaimStatus(str, Enum):
    """Possible states for a business ownership claim."""
    PENDING = "pending"
    VERIFIED = "verified"
    REJECTED = "rejected"
    REVOKED = "revoked"

class VerificationMethod(str, Enum):
    """Methods by which a claim can be verified by an admin."""
    EMAIL_DOMAIN = "email_domain"
    PHONE_CALL = "phone_call"
    DOCUMENT = "document"
    IN_PERSON = "in_person"
    COMMUNITY = "community"

class BusinessClaim(BaseModel):
    """Full business claim model returned in API responses.

    Attributes:
        id (str): Unique claim identifier.
        business_id (str): ID of the business being claimed.
        user_id (str): ID of the user making the claim.
        status (ClaimStatus): Current status of the claim.
        verification_method (Optional[VerificationMethod]): How the claim was verified.
        verification_notes (Optional[str]): Admin notes from the review.
        owner_name (str): Claimant's name (2-100 characters).
        owner_role (str): Claimant's role at the business (max 50 characters).
        owner_phone/owner_email: Claimant contact information.
        proof_description (Optional[str]): Description of ownership proof (max 500 characters).
        created_at (datetime): Timestamp when the claim was submitted.
        reviewed_at (Optional[datetime]): Timestamp when the claim was reviewed.
        reviewed_by (Optional[str]): ID of the admin who reviewed the claim.
    """
    id: str
    business_id: str
    user_id: str
    status: ClaimStatus = ClaimStatus.PENDING
    verification_method: Optional[VerificationMethod] = None
    verification_notes: Optional[str] = None
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_role: str = Field(default="owner", max_length=50)
    owner_phone: Optional[str] = None
    owner_email: Optional[str] = None
    proof_description: Optional[str] = Field(None, max_length=500)
    created_at: datetime
    reviewed_at: Optional[datetime] = None
    reviewed_by: Optional[str] = None

    class Config:
        from_attributes = True

class ClaimCreate(BaseModel):
    """Request body for submitting a new business ownership claim."""
    business_id: str
    owner_name: str = Field(..., min_length=2, max_length=100)
    owner_role: str = Field(default="owner", max_length=50)
    owner_phone: Optional[str] = None
    owner_email: Optional[str] = None
    proof_description: Optional[str] = Field(None, max_length=500)

class ClaimReview(BaseModel):
    """Request body for an admin to approve or reject a claim.

    Attributes:
        status (ClaimStatus): New status (verified or rejected).
        verification_method (Optional[VerificationMethod]): Method used for verification.
        verification_notes (Optional[str]): Admin notes (max 500 characters).
    """
    status: ClaimStatus
    verification_method: Optional[VerificationMethod] = None
    verification_notes: Optional[str] = Field(None, max_length=500)
