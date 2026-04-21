"""Subscription repository with abstract interface and Supabase implementation.

Defines the ``SubscriptionsRepository`` ABC and its ``SupabaseSubscriptionsRepository``
implementation for managing business subscription records.
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from backend.database.supabase import get_supabase_client


class SubscriptionsRepository(ABC):
    """Abstract base class for subscription persistence."""
    @abstractmethod
    async def get_business(self, business_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    @abstractmethod
    async def create_or_replace(self, payload: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    @abstractmethod
    async def list_for_user(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        raise NotImplementedError

    @abstractmethod
    async def get_active_for_business_user(self, business_id: str, user_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    @abstractmethod
    async def get_by_id(self, subscription_id: str) -> dict[str, Any] | None:
        raise NotImplementedError

    @abstractmethod
    async def update_by_id(self, subscription_id: str, update: dict[str, Any]) -> dict[str, Any] | None:
        raise NotImplementedError


class SupabaseSubscriptionsRepository(SubscriptionsRepository):
    """Supabase-backed implementation of the subscription repository.

    Business data is read from the ``documents`` table; subscription
    records are stored in a dedicated ``subscriptions`` table.
    ``create_or_replace`` deletes any existing subscription for the
    same user+business pair before inserting.
    """
    async def get_business(self, business_id: str) -> dict[str, Any] | None:
        client = get_supabase_client()
        result = (
            client.table("documents")
            .select("doc_id,data")
            .eq("collection", "businesses")
            .eq("doc_id", business_id)
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        row = result.data[0]
        payload = dict(row.get("data") or {})
        payload.setdefault("_id", row.get("doc_id"))
        return payload

    async def create_or_replace(self, payload: dict[str, Any]) -> dict[str, Any]:
        client = get_supabase_client()
        client.table("subscriptions").delete().eq("business_id", payload["business_id"]).eq("user_id", payload["user_id"]).execute()
        result = client.table("subscriptions").insert(payload).execute()
        return (result.data or [None])[0]

    async def list_for_user(self, user_id: str, limit: int = 50) -> list[dict[str, Any]]:
        client = get_supabase_client()
        result = (
            client.table("subscriptions")
            .select("*")
            .eq("user_id", user_id)
            .order("created_at", desc=True)
            .limit(limit)
            .execute()
        )
        return result.data or []

    async def get_active_for_business_user(self, business_id: str, user_id: str) -> dict[str, Any] | None:
        client = get_supabase_client()
        result = (
            client.table("subscriptions")
            .select("*")
            .eq("business_id", business_id)
            .eq("user_id", user_id)
            .eq("status", "active")
            .limit(1)
            .execute()
        )
        if not result.data:
            return None
        return result.data[0]

    async def get_by_id(self, subscription_id: str) -> dict[str, Any] | None:
        client = get_supabase_client()
        result = client.table("subscriptions").select("*").eq("id", subscription_id).limit(1).execute()
        if not result.data:
            return None
        return result.data[0]

    async def update_by_id(self, subscription_id: str, update: dict[str, Any]) -> dict[str, Any] | None:
        client = get_supabase_client()
        result = client.table("subscriptions").update(update).eq("id", subscription_id).execute()
        if not result.data:
            return None
        return result.data[0]
