"""Saved-business domain models for the Vantage API.

Defines lightweight models for tracking which businesses a user has
saved/bookmarked, and the result of a save/unsave toggle operation.
"""
from datetime import datetime
from pydantic import BaseModel

class SavedRecord(BaseModel):
    """A record linking a user to a saved business.

    Attributes:
        user_id (str): ID of the user who saved the business.
        business_id (str): ID of the saved business.
        created_at (datetime): Timestamp when the save occurred.
    """
    user_id: str
    business_id: str
    created_at: datetime

class SavedMutationResult(BaseModel):
    """Result of a save or unsave operation.

    Attributes:
        business_id (str): ID of the affected business.
        saved (bool): True after saving, False after removing.
    """
    business_id: str
    saved: bool
