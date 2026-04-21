"""Supabase-backed user data repository.

Provides CRUD operations for the ``users`` table in Supabase,
used by authentication and user management routes.
"""
from __future__ import annotations

from typing import Any

from backend.database.supabase import get_supabase_client
from backend.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY


class SupabaseUsersRepository:
    """Repository for user CRUD operations backed by the Supabase ``users`` table.

    All methods are async and return normalized dicts with string IDs
    and ISO-formatted timestamps.
    """
    @staticmethod
    def _use_supabase() -> bool:
        return bool(SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY)

    def _table(self):
        if not self._use_supabase():
            raise RuntimeError("Supabase users repository is not configured")
        return get_supabase_client().table("users")

    @staticmethod
    def _normalize_user(row: dict[str, Any]) -> dict[str, Any]:
        user = dict(row)
        if "id" in user and user["id"] is not None:
            user["id"] = str(user["id"])
        created_at = user.get("created_at")
        if hasattr(created_at, "isoformat"):
            user["created_at"] = created_at.isoformat()
        return user

    async def get_by_email(self, email: str) -> dict[str, Any] | None:
        """Look up a user by email address.

        Args:
            email (str): The email to search for.

        Returns:
            dict[str, Any] | None: The user record, or None if not found.
        """
        result = self._table().select("*").eq("email", email).limit(1).execute()
        if not result.data:
            return None
        return self._normalize_user(result.data[0])

    async def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        """Look up a user by ID.

        Args:
            user_id (str): The user's unique identifier.

        Returns:
            dict[str, Any] | None: The user record, or None if not found.
        """
        result = self._table().select("*").eq("id", user_id).limit(1).execute()
        if not result.data:
            return None
        return self._normalize_user(result.data[0])

    async def create(self, payload: dict[str, Any]) -> dict[str, Any]:
        """Insert a new user record.

        Args:
            payload (dict[str, Any]): User fields to insert.

        Returns:
            dict[str, Any]: The created user record.

        Raises:
            RuntimeError: If the insert returns no data.
        """
        result = self._table().insert(payload).execute()
        if not result.data:
            raise RuntimeError("Failed to create user")
        return self._normalize_user(result.data[0])

    async def update_by_email(self, email: str, update: dict[str, Any]) -> dict[str, Any] | None:
        result = self._table().update(update).eq("email", email).execute()
        if not result.data:
            return None
        return self._normalize_user(result.data[0])

    async def update_by_id(self, user_id: str, update: dict[str, Any]) -> dict[str, Any] | None:
        result = self._table().update(update).eq("id", user_id).execute()
        if not result.data:
            return None
        return self._normalize_user(result.data[0])

    async def delete_by_id(self, user_id: str) -> None:
        """Delete a user by ID.

        Args:
            user_id (str): The user's unique identifier.
        """
        self._table().delete().eq("id", user_id).execute()
