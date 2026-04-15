from __future__ import annotations

from typing import Any

from backend.database.supabase import get_supabase_client
from backend.config import SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY


class SupabaseUsersRepository:
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
        result = self._table().select("*").eq("email", email).limit(1).execute()
        if not result.data:
            return None
        return self._normalize_user(result.data[0])

    async def get_by_id(self, user_id: str) -> dict[str, Any] | None:
        result = self._table().select("*").eq("id", user_id).limit(1).execute()
        if not result.data:
            return None
        return self._normalize_user(result.data[0])

    async def create(self, payload: dict[str, Any]) -> dict[str, Any]:
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
        self._table().delete().eq("id", user_id).execute()
