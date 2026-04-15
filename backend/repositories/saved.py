from __future__ import annotations

from abc import ABC, abstractmethod
from datetime import datetime
from typing import Any

from backend.database.supabase import get_supabase_client


class SavedRepository(ABC):
    @abstractmethod
    async def business_exists(self, business_id: str) -> bool:
        raise NotImplementedError

    @abstractmethod
    async def save(self, user_id: str, business_id: str, created_at: datetime) -> None:
        raise NotImplementedError

    @abstractmethod
    async def remove(self, user_id: str, business_id: str) -> None:
        raise NotImplementedError

    @abstractmethod
    async def list_saved_records(self, user_id: str, limit: int = 200) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    async def list_businesses_by_ids(self, business_ids: list[str]) -> list[dict[str, Any]]:
        raise NotImplementedError


class SupabaseSavedRepository(SavedRepository):
    async def business_exists(self, business_id: str) -> bool:
        client = get_supabase_client()
        result = (
            client.table("documents")
            .select("doc_id")
            .eq("collection", "businesses")
            .eq("doc_id", business_id)
            .limit(1)
            .execute()
        )
        return bool(result.data)

    async def save(self, user_id: str, business_id: str, created_at: datetime) -> None:
        client = get_supabase_client()
        client.table("saved").upsert(
            {
                "user_id": user_id,
                "business_id": business_id,
                "created_at": created_at.isoformat(),
            },
            on_conflict="user_id,business_id",
        ).execute()

    async def remove(self, user_id: str, business_id: str) -> None:
        client = get_supabase_client()
        client.table("saved").delete().eq("user_id", user_id).eq("business_id", business_id).execute()

    async def list_saved_records(self, user_id: str, limit: int = 200) -> list[dict[str, Any]]:
        client = get_supabase_client()
        result = (
            client.table("saved")
            .select("business_id,created_at")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    async def list_businesses_by_ids(self, business_ids: list[str]) -> list[dict[str, Any]]:
        if not business_ids:
            return []
        client = get_supabase_client()
        result = (
            client.table("documents")
            .select("doc_id,data")
            .eq("collection", "businesses")
            .in_("doc_id", business_ids)
            .execute()
        )
        items = []
        for row in (result.data or []):
            payload = dict(row.get("data") or {})
            payload.setdefault("_id", row.get("doc_id"))
            items.append(payload)
        return items
