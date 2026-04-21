"""Supabase-backed document store with a MongoDB-compatible async API.

This module implements a document database interface on top of Supabase,
exposing an async API that mimics Motor/PyMongo's collection interface.
Documents are stored as JSON blobs in a single Supabase ``documents``
table keyed by ``(collection, doc_id)``.

Note: This file is a parallel copy of ``document_store.py``. Both are
kept in sync; the application imports from ``document_store`` at runtime.
"""
from __future__ import annotations

import math
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, Iterable

from bson import ObjectId

from backend.config import DEMO_LAT, DEMO_LNG, DEMO_MODE, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
from backend.database.supabase import get_supabase_client


_CONNECTED = False


class DatabaseUnavailableError(RuntimeError):
    pass


@dataclass
class InsertOneResult:
    inserted_id: str


@dataclass
class InsertManyResult:
    inserted_ids: list[str]


@dataclass
class UpdateResult:
    modified_count: int


@dataclass
class DeleteResult:
    deleted_count: int


class SupabaseCursor:
    def __init__(self, collection: "SupabaseCollection", query: dict | None = None, projection: dict | None = None):
        self.collection = collection
        self.query = query or {}
        self.projection = projection
        self._sort: list[tuple[str, int]] = []
        self._limit: int | None = None
        self._skip: int = 0

    def sort(self, field: str | list[tuple[str, int]], direction: int | None = None):
        if isinstance(field, list):
            self._sort = field
        else:
            self._sort = [(field, direction if direction is not None else 1)]
        return self

    def skip(self, value: int):
        self._skip = max(0, int(value))
        return self

    def limit(self, value: int):
        self._limit = max(0, int(value))
        return self

    async def to_list(self, length: int | None = None):
        docs = await self.collection._find_docs(self.query)
        docs = [self.collection._apply_projection(d, self.projection) for d in docs]

        for field, direction in reversed(self._sort):
            reverse = direction == -1
            docs.sort(key=lambda d: _sort_value(_get_nested(d, field)), reverse=reverse)

        if self._skip:
            docs = docs[self._skip :]

        cap = self._limit if self._limit is not None else length
        if cap is not None:
            docs = docs[:cap]

        return docs


class AggregateCursor:
    def __init__(self, collection: "SupabaseCollection", pipeline: list[dict]):
        self._collection = collection
        self._pipeline = pipeline

    async def to_list(self, length: int | None = None):
        docs = await self._collection._find_docs({})
        data = _run_pipeline(docs, self._pipeline)
        if length is None:
            return data
        return data[:length]


class SupabaseCollection:
    def __init__(self, name: str):
        self.name = name

    async def create_index(self, *args, **kwargs):
        return None

    async def _load_rows(self) -> list[dict]:
        client = get_supabase_client()
        offset = 0
        page = 1000
        rows: list[dict] = []
        while True:
            resp = (
                client.table("documents")
                .select("doc_id,data")
                .eq("collection", self.name)
                .range(offset, offset + page - 1)
                .execute()
            )
            batch = resp.data or []
            if not batch:
                break
            rows.extend(batch)
            if len(batch) < page:
                break
            offset += page
        return rows

    async def _find_docs(self, query: dict | None) -> list[dict]:
        rows = await self._load_rows()
        docs: list[dict] = []
        for row in rows:
            data = dict(row.get("data") or {})
            if "_id" not in data:
                data["_id"] = row.get("doc_id")
            if _matches_query(data, query or {}):
                docs.append(data)
        return docs

    def _apply_projection(self, doc: dict, projection: dict | None) -> dict:
        if not projection:
            return doc
        include = {k for k, v in projection.items() if v}
        if not include:
            return doc
        projected = {}
        for k in include:
            if k in doc:
                projected[k] = doc[k]
        if "_id" in doc and projection.get("_id", 1):
            projected["_id"] = doc["_id"]
        return projected

    async def find_one(self, query: dict, projection: dict | None = None, sort: list[tuple[str, int]] | None = None):
        cursor = self.find(query, projection)
        if sort:
            cursor.sort(sort)
        docs = await cursor.limit(1).to_list(length=1)
        return docs[0] if docs else None

    def find(self, query: dict | None = None, projection: dict | None = None):
        return SupabaseCursor(self, query=query, projection=projection)

    async def insert_one(self, doc: dict):
        payload = dict(doc)
        payload_id = str(payload.get("_id") or ObjectId())
        payload["_id"] = payload_id
        client = get_supabase_client()
        client.table("documents").upsert(
            {
                "collection": self.name,
                "doc_id": payload_id,
                "data": payload,
                "updated_at": datetime.utcnow().isoformat(),
            },
            on_conflict="collection,doc_id",
        ).execute()
        return InsertOneResult(inserted_id=payload_id)

    async def insert_many(self, docs: list[dict], ordered: bool = False):
        inserted_ids: list[str] = []
        for doc in docs:
            result = await self.insert_one(doc)
            inserted_ids.append(result.inserted_id)
        return InsertManyResult(inserted_ids=inserted_ids)

    async def update_one(self, query: dict, update: dict):
        docs = await self._find_docs(query)
        if not docs:
            return UpdateResult(modified_count=0)
        target = docs[0]
        _apply_update(target, update)
        await self._persist_doc(target)
        return UpdateResult(modified_count=1)

    async def update_many(self, query: dict, update: dict):
        docs = await self._find_docs(query)
        modified = 0
        for target in docs:
            _apply_update(target, update)
            await self._persist_doc(target)
            modified += 1
        return UpdateResult(modified_count=modified)

    async def delete_one(self, query: dict):
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        await self._delete_doc(str(docs[0]["_id"]))
        return DeleteResult(deleted_count=1)

    async def delete_many(self, query: dict):
        docs = await self._find_docs(query)
        for doc in docs:
            await self._delete_doc(str(doc["_id"]))
        return DeleteResult(deleted_count=len(docs))

    async def count_documents(self, query: dict):
        docs = await self._find_docs(query)
        return len(docs)

    async def bulk_write(self, updates: Iterable[Any], ordered: bool = False):
        modified = 0
        for op in updates:
            filt = getattr(op, "_filter", None) or getattr(op, "filter", None)
            doc = getattr(op, "_doc", None) or getattr(op, "doc", None)
            if filt is None or doc is None:
                continue
            result = await self.update_one(filt, doc)
            modified += result.modified_count
        return UpdateResult(modified_count=modified)

    def aggregate(self, pipeline: list[dict]):
        return AggregateCursor(self, pipeline)

    async def _persist_doc(self, doc: dict):
        payload = dict(doc)
        payload_id = str(payload.get("_id") or ObjectId())
        payload["_id"] = payload_id
        client = get_supabase_client()
        client.table("documents").upsert(
            {
                "collection": self.name,
                "doc_id": payload_id,
                "data": payload,
                "updated_at": datetime.utcnow().isoformat(),
            },
            on_conflict="collection,doc_id",
        ).execute()

    async def _delete_doc(self, doc_id: str):
        client = get_supabase_client()
        client.table("documents").delete().eq("collection", self.name).eq("doc_id", doc_id).execute()


def _run_pipeline(docs: list[dict], pipeline: list[dict]) -> list[dict]:
    current = docs
    for stage in pipeline:
        if "$match" in stage:
            current = [d for d in current if _matches_query(d, stage["$match"])]
        elif "$group" in stage:
            spec = stage["$group"]
            grouped: dict[str, dict] = {}
            id_expr = spec.get("_id")
            for d in current:
                group_id = _eval_group_id(d, id_expr)
                key = str(group_id)
                if key not in grouped:
                    grouped[key] = {"_id": group_id}
                    for out_key, out_expr in spec.items():
                        if out_key == "_id":
                            continue
                        if "$sum" in out_expr:
                            grouped[key][out_key] = 0
                        elif "$avg" in out_expr:
                            grouped[key][out_key] = {"sum": 0.0, "count": 0}
                for out_key, out_expr in spec.items():
                    if out_key == "_id":
                        continue
                    if "$sum" in out_expr:
                        val = out_expr["$sum"]
                        grouped[key][out_key] += _eval_numeric(d, val)
                    elif "$avg" in out_expr:
                        val = out_expr["$avg"]
                        avg_state = grouped[key][out_key]
                        avg_state["sum"] += _eval_numeric(d, val)
                        avg_state["count"] += 1
            result = []
            for row in grouped.values():
                out = dict(row)
                for k, v in list(out.items()):
                    if isinstance(v, dict) and set(v.keys()) == {"sum", "count"}:
                        out[k] = (v["sum"] / v["count"]) if v["count"] else 0.0
                result.append(out)
            current = result
    return current


def _eval_group_id(doc: dict, expr: Any):
    if isinstance(expr, str) and expr.startswith("$"):
        return _get_nested(doc, expr[1:])
    return expr


def _eval_numeric(doc: dict, expr: Any) -> float:
    if isinstance(expr, (int, float)):
        return float(expr)
    if isinstance(expr, str) and expr.startswith("$"):
        value = _get_nested(doc, expr[1:])
        try:
            return float(value)
        except Exception:
            return 0.0
    return 0.0


def _sort_value(value: Any):
    if value is None:
        return ""
    return value


def _parse_date(value: Any):
    if isinstance(value, datetime):
        return value
    if isinstance(value, str):
        try:
            return datetime.fromisoformat(value.replace("Z", "+00:00"))
        except Exception:
            return None
    return None


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    r = 6371000.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return r * c


def _matches_query(doc: dict, query: dict) -> bool:
    if not query:
        return True
    for key, condition in query.items():
        if key == "$or":
            if not any(_matches_query(doc, sub) for sub in condition):
                return False
            continue
        if key == "$and":
            if not all(_matches_query(doc, sub) for sub in condition):
                return False
            continue

        value = _get_nested(doc, key)
        exists = _has_nested(doc, key)

        if isinstance(condition, dict):
            regex_flags = re.IGNORECASE
            if "$options" in condition and "i" not in str(condition.get("$options", "")):
                regex_flags = 0
            for op, expected in condition.items():
                if op == "$in":
                    if value not in expected:
                        return False
                elif op == "$nin":
                    if value in expected:
                        return False
                elif op == "$ne":
                    if value == expected:
                        return False
                elif op == "$gt":
                    if value is None or value <= expected:
                        return False
                elif op == "$gte":
                    if value is None or value < expected:
                        return False
                elif op == "$lt":
                    if value is None or value >= expected:
                        return False
                elif op == "$lte":
                    if value is None or value > expected:
                        return False
                elif op == "$regex":
                    if not re.search(str(expected), str(value or ""), regex_flags):
                        return False
                elif op == "$options":
                    continue
                elif op == "$exists":
                    if bool(expected) != exists:
                        return False
                elif op == "$near":
                    near = expected
                    geom = near.get("$geometry", {})
                    coords = geom.get("coordinates", [None, None])
                    max_distance = near.get("$maxDistance", 0)
                    if not isinstance(value, dict):
                        return False
                    doc_coords = value.get("coordinates", [None, None])
                    if None in coords or None in doc_coords:
                        return False
                    dist = _haversine_meters(doc_coords[1], doc_coords[0], coords[1], coords[0])
                    if dist > max_distance:
                        return False
                else:
                    # Unsupported operators are treated as non-match.
                    return False
        else:
            if key == "_id":
                if str(value) != str(condition):
                    return False
            elif value != condition:
                return False

    return True


def _get_nested(obj: dict, path: str):
    cur: Any = obj
    for piece in path.split("."):
        if not isinstance(cur, dict) or piece not in cur:
            return None
        cur = cur[piece]
    return cur


def _has_nested(obj: dict, path: str) -> bool:
    cur: Any = obj
    for piece in path.split("."):
        if not isinstance(cur, dict) or piece not in cur:
            return False
        cur = cur[piece]
    return True


def _set_nested(obj: dict, path: str, value: Any):
    parts = path.split(".")
    cur = obj
    for p in parts[:-1]:
        if p not in cur or not isinstance(cur[p], dict):
            cur[p] = {}
        cur = cur[p]
    cur[parts[-1]] = value


def _apply_update(doc: dict, update: dict):
    for op, payload in update.items():
        if op == "$set":
            for k, v in payload.items():
                _set_nested(doc, k, v)
        elif op == "$inc":
            for k, v in payload.items():
                prev = _get_nested(doc, k) or 0
                _set_nested(doc, k, prev + v)
        elif op == "$push":
            for k, v in payload.items():
                arr = _get_nested(doc, k)
                if not isinstance(arr, list):
                    arr = []
                arr.append(v)
                _set_nested(doc, k, arr)
        elif op == "$addToSet":
            for k, v in payload.items():
                arr = _get_nested(doc, k)
                if not isinstance(arr, list):
                    arr = []
                if v not in arr:
                    arr.append(v)
                _set_nested(doc, k, arr)
        elif op == "$pull":
            for k, v in payload.items():
                arr = _get_nested(doc, k)
                if not isinstance(arr, list):
                    continue
                _set_nested(doc, k, [item for item in arr if item != v])


class SupabaseDocumentDatabase:
    def __getitem__(self, item: str):
        return SupabaseCollection(item)


async def connect_to_mongo():
    global _CONNECTED
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        _CONNECTED = False
        print("Supabase connection warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing")
        return
    try:
        client = get_supabase_client()
        client.table("documents").select("doc_id").limit(1).execute()
        _CONNECTED = True
        print("Connected to Supabase document store")
        if DEMO_MODE:
            from backend.services.demo_seed import seed_demo_dataset

            await seed_demo_dataset(get_database(), DEMO_LAT, DEMO_LNG)
    except Exception as exc:
        _CONNECTED = False
        print(f"Supabase connection warning: {exc}")


async def _ensure_indexes():
    return None


async def _normalize_platform_review_metrics():
    return None


async def close_mongo_connection():
    return None


def get_database():
    if not _CONNECTED:
        raise DatabaseUnavailableError(
            "Supabase document store is not connected. Ensure SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set "
            "and that the documents table exists."
        )
    return SupabaseDocumentDatabase()


def _col(name: str):
    return get_database()[name]


def get_users_collection():
    return _col("users")


def get_businesses_collection():
    return _col("businesses")


def get_reviews_collection():
    return _col("reviews")


def get_deals_collection():
    return _col("deals")


def get_claims_collection():
    return _col("claims")


def get_checkins_collection():
    return _col("checkins")


def get_activity_feed_collection():
    return _col("activity_feed")


def get_owner_posts_collection():
    return _col("owner_posts")


def get_credibility_collection():
    return _col("credibility")


def get_subscriptions_collection():
    return _col("subscriptions")


def get_visits_collection():
    return _col("visits")


def get_geo_cache_collection():
    return _col("geo_cache")


def get_api_usage_log_collection():
    return _col("api_usage_log")


def get_saved_collection():
    return _col("saved")
