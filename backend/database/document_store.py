"""Supabase-backed document store with a MongoDB-compatible async API."""
from __future__ import annotations

import asyncio
import math
import re
from dataclasses import dataclass
from datetime import datetime
from typing import Any, AsyncIterator, Iterable

from bson import ObjectId

from backend.config import DEMO_LAT, DEMO_LNG, DEMO_MODE, SUPABASE_SERVICE_ROLE_KEY, SUPABASE_URL
from backend.database.supabase import get_supabase_client, run_supabase

_CONNECTED = False
_PAGE_SIZE = 500


class DatabaseUnavailableError(RuntimeError):
    """Raised when the document store has not been connected or is unreachable."""


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
    """Async cursor that mimics Motor's cursor interface over Supabase rows."""

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
        server_limit = None if self._sort else (self._limit if self._limit is not None else length)
        server_offset = 0 if self._sort else self._skip
        docs = await self.collection._find_docs(self.query, limit=server_limit, offset=server_offset)
        docs = [self.collection._apply_projection(d, self.projection) for d in docs]

        for field, direction in reversed(self._sort):
            reverse = direction == -1
            docs.sort(key=lambda d: _sort_value(_get_nested(d, field)), reverse=reverse)

        if self._sort and self._skip:
            docs = docs[self._skip :]

        cap = self._limit if self._limit is not None else length
        if cap is not None:
            docs = docs[:cap]

        return docs

    def __aiter__(self) -> AsyncIterator[dict]:
        async def _iterate():
            for doc in await self.to_list(length=None):
                yield doc

        return _iterate()


class AggregateCursor:
    """Async cursor for aggregation pipelines over a Supabase collection."""

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
    """A MongoDB-like collection backed by Supabase's ``documents`` table."""

    def __init__(self, name: str):
        self.name = name

    async def create_index(self, *args, **kwargs):
        return None

    def _table(self):
        return get_supabase_client().table("documents")

    def _base_select(self, *, count: str | None = None):
        return self._table().select("doc_id,data", count=count).eq("collection", self.name)

    async def _fetch_all_rows(self, builder) -> list[dict]:
        offset = 0
        rows: list[dict] = []
        while True:
            result = await run_supabase(lambda b=builder, start=offset: b.range(start, start + _PAGE_SIZE - 1).execute())
            batch = result.data or []
            if not batch:
                break
            rows.extend(batch)
            if len(batch) < _PAGE_SIZE:
                break
            offset += _PAGE_SIZE
        return rows

    def _apply_pushdown_filters(self, builder, query: dict | None):
        requires_python_filter = False
        for key, condition in (query or {}).items():
            if key in {"$or", "$and"}:
                requires_python_filter = True
                continue

            if key == "_id":
                builder, pushed = _apply_scalar_filter(builder, "doc_id", condition)
                requires_python_filter = requires_python_filter or not pushed
                continue

            if key == "location" and isinstance(condition, dict) and "$near" in condition:
                requires_python_filter = True
                continue

            json_path = _json_path(key)
            if isinstance(condition, dict):
                for operator, expected in condition.items():
                    pushed = True
                    if operator == "$in":
                        builder = builder.in_(json_path, [_normalize_value(item) for item in expected])
                    elif operator == "$nin":
                        requires_python_filter = True
                        pushed = False
                    elif operator == "$ne":
                        builder = builder.neq(json_path, _normalize_value(expected))
                    elif operator in {"$gt", "$gte", "$lt", "$lte"} and _supports_ordered_pushdown(expected):
                        normalized = _normalize_value(expected)
                        if operator == "$gt":
                            builder = builder.gt(json_path, normalized)
                        elif operator == "$gte":
                            builder = builder.gte(json_path, normalized)
                        elif operator == "$lt":
                            builder = builder.lt(json_path, normalized)
                        else:
                            builder = builder.lte(json_path, normalized)
                    elif operator == "$regex":
                        pattern = str(expected).replace(".*", "%")
                        case_insensitive = "i" in str(condition.get("$options", "i"))
                        builder = builder.ilike(json_path, pattern) if case_insensitive else builder.like(json_path, pattern)
                    elif operator in {"$options", "$exists"}:
                        requires_python_filter = True
                        pushed = False
                    else:
                        requires_python_filter = True
                        pushed = False
                    requires_python_filter = requires_python_filter or not pushed
            else:
                normalized = _normalize_value(condition)
                builder = builder.contains("data", _build_nested_payload(key, normalized))
        return builder, requires_python_filter

    async def _query_rows(
        self,
        query: dict | None,
        *,
        offset: int = 0,
        limit: int | None = None,
        include_count: bool = False,
    ) -> tuple[list[dict], int | None]:
        query = query or {}
        try:
            builder, requires_python_filter = self._apply_pushdown_filters(
                self._base_select(count="exact" if include_count else None),
                query,
            )

            if requires_python_filter:
                rows = await self._fetch_all_rows(builder)
                docs = [self._hydrate_row(row) for row in rows]
                docs = [doc for doc in docs if _matches_query(doc, query)]
                total_count = len(docs) if include_count else None
                if offset:
                    docs = docs[offset:]
                if limit is not None:
                    docs = docs[:limit]
                return [{"doc_id": doc["_id"], "data": doc} for doc in docs], total_count

            if limit is not None:
                builder = builder.range(offset, offset + max(limit - 1, 0))
                result = await run_supabase(lambda: builder.execute())
                return result.data or [], getattr(result, "count", None)

            rows = await self._fetch_all_rows(builder)
            total_count = len(rows) if include_count else None
            if offset:
                rows = rows[offset:]
            return rows, total_count
        except Exception:
            rows = await self._load_rows_fallback()
            docs = [self._hydrate_row(row) for row in rows]
            docs = [doc for doc in docs if _matches_query(doc, query)]
            total_count = len(docs) if include_count else None
            if offset:
                docs = docs[offset:]
            if limit is not None:
                docs = docs[:limit]
            return [{"doc_id": doc["_id"], "data": doc} for doc in docs], total_count

    async def _load_rows_fallback(self) -> list[dict]:
        rows: list[dict] = []
        offset = 0
        while True:
            result = await run_supabase(
                lambda start=offset: self._base_select().range(start, start + _PAGE_SIZE - 1).execute()
            )
            batch = result.data or []
            if not batch:
                break
            rows.extend(batch)
            if len(batch) < _PAGE_SIZE:
                break
            offset += _PAGE_SIZE
        return rows

    @staticmethod
    def _hydrate_row(row: dict) -> dict:
        data = dict(row.get("data") or {})
        if "_id" not in data:
            data["_id"] = row.get("doc_id")
        return data

    async def _find_docs(self, query: dict | None, *, offset: int = 0, limit: int | None = None) -> list[dict]:
        rows, _ = await self._query_rows(query, offset=offset, limit=limit)
        return [self._hydrate_row(row) for row in rows]

    def _apply_projection(self, doc: dict, projection: dict | None) -> dict:
        if not projection:
            return doc
        include = {key for key, value in projection.items() if value}
        if not include:
            return doc
        projected = {key: doc[key] for key in include if key in doc}
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
        await run_supabase(lambda: self._table().upsert(
            {
                "collection": self.name,
                "doc_id": payload_id,
                "data": _normalize_document(payload),
                "updated_at": datetime.utcnow().isoformat(),
            },
            on_conflict="collection,doc_id",
        ).execute())
        return InsertOneResult(inserted_id=payload_id)

    async def insert_many(self, docs: list[dict], ordered: bool = False):
        rows = []
        inserted_ids: list[str] = []
        for doc in docs:
            payload = dict(doc)
            payload_id = str(payload.get("_id") or ObjectId())
            payload["_id"] = payload_id
            inserted_ids.append(payload_id)
            rows.append(
                {
                    "collection": self.name,
                    "doc_id": payload_id,
                    "data": _normalize_document(payload),
                    "updated_at": datetime.utcnow().isoformat(),
                }
            )
        if rows:
            await run_supabase(lambda: self._table().upsert(rows, on_conflict="collection,doc_id").execute())
        return InsertManyResult(inserted_ids=inserted_ids)

    async def update_one(self, query: dict, update: dict):
        docs = await self._find_docs(query, limit=1)
        if not docs:
            return UpdateResult(modified_count=0)
        target = docs[0]
        _apply_update(target, update)
        await self._persist_docs([target])
        return UpdateResult(modified_count=1)

    async def update_many(self, query: dict, update: dict):
        docs = await self._find_docs(query)
        if not docs:
            return UpdateResult(modified_count=0)
        for target in docs:
            _apply_update(target, update)
        await self._persist_docs(docs)
        return UpdateResult(modified_count=len(docs))

    async def delete_one(self, query: dict):
        docs = await self._find_docs(query, limit=1)
        if not docs:
            return DeleteResult(deleted_count=0)
        await self._delete_doc_ids([str(docs[0]["_id"])])
        return DeleteResult(deleted_count=1)

    async def delete_many(self, query: dict):
        docs = await self._find_docs(query)
        if not docs:
            return DeleteResult(deleted_count=0)
        await self._delete_doc_ids([str(doc["_id"]) for doc in docs])
        return DeleteResult(deleted_count=len(docs))

    async def count_documents(self, query: dict):
        _, count = await self._query_rows(query, include_count=True)
        return int(count or 0)

    async def bulk_write(self, updates: Iterable[Any], ordered: bool = False):
        modified_docs: list[dict] = []
        modified = 0
        for op in updates:
            filt = getattr(op, "_filter", None) or getattr(op, "filter", None)
            doc = getattr(op, "_doc", None) or getattr(op, "doc", None)
            if filt is None or doc is None:
                continue
            targets = await self._find_docs(filt, limit=1)
            if not targets:
                continue
            target = targets[0]
            _apply_update(target, doc)
            modified_docs.append(target)
            modified += 1
        if modified_docs:
            await self._persist_docs(modified_docs)
        return UpdateResult(modified_count=modified)

    def aggregate(self, pipeline: list[dict]):
        return AggregateCursor(self, pipeline)

    async def _persist_docs(self, docs: list[dict]):
        rows = []
        for doc in docs:
            payload = dict(doc)
            payload_id = str(payload.get("_id") or ObjectId())
            payload["_id"] = payload_id
            rows.append(
                {
                    "collection": self.name,
                    "doc_id": payload_id,
                    "data": _normalize_document(payload),
                    "updated_at": datetime.utcnow().isoformat(),
                }
            )
        if rows:
            await run_supabase(lambda: self._table().upsert(rows, on_conflict="collection,doc_id").execute())

    async def _delete_doc_ids(self, doc_ids: list[str]):
        if not doc_ids:
            return
        try:
            await run_supabase(
                lambda: self._table()
                .delete()
                .eq("collection", self.name)
                .in_("doc_id", doc_ids)
                .execute()
            )
        except Exception:
            for doc_id in doc_ids:
                await run_supabase(
                    lambda value=doc_id: self._table()
                    .delete()
                    .eq("collection", self.name)
                    .eq("doc_id", value)
                    .execute()
                )


def _normalize_value(value: Any):
    if isinstance(value, ObjectId):
        return str(value)
    if isinstance(value, datetime):
        return value.isoformat()
    if hasattr(value, "value"):
        return value.value
    return value


def _normalize_document(value: Any):
    if isinstance(value, dict):
        return {key: _normalize_document(val) for key, val in value.items()}
    if isinstance(value, list):
        return [_normalize_document(item) for item in value]
    return _normalize_value(value)


def _build_nested_payload(path: str, value: Any) -> dict:
    parts = path.split(".")
    root: dict[str, Any] = {}
    cursor = root
    for part in parts[:-1]:
        cursor[part] = {}
        cursor = cursor[part]
    cursor[parts[-1]] = value
    return root


def _json_path(path: str) -> str:
    pieces = path.split(".")
    if len(pieces) == 1:
        return f"data->{pieces[0]}"
    inner = "->".join(pieces[:-1])
    return f"data->{inner}->{pieces[-1]}"


def _supports_ordered_pushdown(value: Any) -> bool:
    normalized = _normalize_value(value)
    return isinstance(normalized, (datetime, int, float)) or (
        isinstance(normalized, str) and ("T" in normalized or re.match(r"^\d{4}-\d{2}-\d{2}", normalized) is not None)
    )


def _apply_scalar_filter(builder, field: str, condition: Any):
    if isinstance(condition, dict):
        pushed = True
        for operator, expected in condition.items():
            normalized = _normalize_value(expected)
            if operator == "$in":
                builder = builder.in_(field, [_normalize_value(item) for item in expected])
            elif operator == "$ne":
                builder = builder.neq(field, normalized)
            elif operator == "$gt":
                builder = builder.gt(field, normalized)
            elif operator == "$gte":
                builder = builder.gte(field, normalized)
            elif operator == "$lt":
                builder = builder.lt(field, normalized)
            elif operator == "$lte":
                builder = builder.lte(field, normalized)
            else:
                pushed = False
        return builder, pushed
    return builder.eq(field, _normalize_value(condition)), True


def _run_pipeline(docs: list[dict], pipeline: list[dict]) -> list[dict]:
    current = docs
    for stage in pipeline:
        if "$match" in stage:
            current = [doc for doc in current if _matches_query(doc, stage["$match"])]
        elif "$group" in stage:
            spec = stage["$group"]
            grouped: dict[str, dict] = {}
            id_expr = spec.get("_id")
            for doc in current:
                group_id = _eval_group_id(doc, id_expr)
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
                        grouped[key][out_key] += _eval_numeric(doc, out_expr["$sum"])
                    elif "$avg" in out_expr:
                        state = grouped[key][out_key]
                        state["sum"] += _eval_numeric(doc, out_expr["$avg"])
                        state["count"] += 1
            current = []
            for row in grouped.values():
                out = dict(row)
                for key, value in list(out.items()):
                    if isinstance(value, dict) and set(value.keys()) == {"sum", "count"}:
                        out[key] = (value["sum"] / value["count"]) if value["count"] else 0.0
                current.append(out)
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


def _haversine_meters(lat1: float, lng1: float, lat2: float, lng2: float) -> float:
    radius_m = 6_371_000.0
    d_lat = math.radians(lat2 - lat1)
    d_lng = math.radians(lng2 - lng1)
    a = (
        math.sin(d_lat / 2) ** 2
        + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(d_lng / 2) ** 2
    )
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return radius_m * c


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
            for operator, expected in condition.items():
                normalized = _normalize_value(expected)
                if operator == "$in":
                    if value not in [_normalize_value(item) for item in expected]:
                        return False
                elif operator == "$nin":
                    if value in [_normalize_value(item) for item in expected]:
                        return False
                elif operator == "$ne":
                    if value == normalized:
                        return False
                elif operator == "$gt":
                    if value is None or value <= normalized:
                        return False
                elif operator == "$gte":
                    if value is None or value < normalized:
                        return False
                elif operator == "$lt":
                    if value is None or value >= normalized:
                        return False
                elif operator == "$lte":
                    if value is None or value > normalized:
                        return False
                elif operator == "$regex":
                    pattern = str(expected)
                    if not re.search(pattern, str(value or ""), regex_flags):
                        return False
                elif operator == "$options":
                    continue
                elif operator == "$exists":
                    if bool(expected) != exists:
                        return False
                elif operator == "$near":
                    near = expected
                    geom = near.get("$geometry", {})
                    coords = geom.get("coordinates", [None, None])
                    max_distance = near.get("$maxDistance", 0)
                    if not isinstance(value, dict):
                        return False
                    doc_coords = value.get("coordinates", [None, None])
                    if None in coords or None in doc_coords:
                        return False
                    distance = _haversine_meters(doc_coords[1], doc_coords[0], coords[1], coords[0])
                    if distance > max_distance:
                        return False
                else:
                    return False
        else:
            normalized = _normalize_value(condition)
            if key == "_id":
                if str(value) != str(normalized):
                    return False
            elif value != normalized:
                return False
    return True


def _get_nested(obj: dict, path: str):
    current: Any = obj
    for piece in path.split("."):
        if not isinstance(current, dict) or piece not in current:
            return None
        current = current[piece]
    return current


def _has_nested(obj: dict, path: str) -> bool:
    current: Any = obj
    for piece in path.split("."):
        if not isinstance(current, dict) or piece not in current:
            return False
        current = current[piece]
    return True


def _set_nested(obj: dict, path: str, value: Any):
    parts = path.split(".")
    current = obj
    for piece in parts[:-1]:
        if piece not in current or not isinstance(current[piece], dict):
            current[piece] = {}
        current = current[piece]
    current[parts[-1]] = value


def _apply_update(doc: dict, update: dict):
    for operator, payload in update.items():
        if operator == "$set":
            for key, value in payload.items():
                _set_nested(doc, key, _normalize_document(value))
        elif operator == "$inc":
            for key, value in payload.items():
                previous = _get_nested(doc, key) or 0
                _set_nested(doc, key, previous + value)
        elif operator == "$push":
            for key, value in payload.items():
                current = _get_nested(doc, key)
                if not isinstance(current, list):
                    current = []
                current.append(_normalize_document(value))
                _set_nested(doc, key, current)
        elif operator == "$addToSet":
            for key, value in payload.items():
                current = _get_nested(doc, key)
                if not isinstance(current, list):
                    current = []
                normalized = _normalize_document(value)
                if normalized not in current:
                    current.append(normalized)
                _set_nested(doc, key, current)
        elif operator == "$pull":
            for key, value in payload.items():
                current = _get_nested(doc, key)
                if not isinstance(current, list):
                    continue
                normalized = _normalize_document(value)
                _set_nested(doc, key, [item for item in current if item != normalized])


class SupabaseDocumentDatabase:
    """Top-level database accessor that returns ``SupabaseCollection`` by name."""

    def __getitem__(self, item: str):
        return SupabaseCollection(item)


async def connect_to_mongo():
    """Initialize the Supabase document store connection."""
    global _CONNECTED
    if not SUPABASE_URL or not SUPABASE_SERVICE_ROLE_KEY:
        _CONNECTED = False
        print("Supabase connection warning: SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY is missing")
        return
    try:
        await run_supabase(lambda: get_supabase_client().table("documents").select("doc_id").limit(1).execute())
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
    """Return the document database instance."""
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
