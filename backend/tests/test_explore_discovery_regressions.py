import asyncio
import importlib.util
import os
from pathlib import Path
from unittest import IsolatedAsyncioTestCase, TestCase
from unittest.mock import AsyncMock, patch

os.environ.setdefault("SECRET_KEY", "test-secret")


REPO_ROOT = Path(__file__).resolve().parents[2]


class FakeCursor:
    def __init__(self, docs):
        self.docs = docs
        self.limit_value = None

    def limit(self, value):
        self.limit_value = value
        return self

    async def to_list(self, length=None):
        cap = self.limit_value if self.limit_value is not None else length
        if cap is None:
            return [dict(doc) for doc in self.docs]
        return [dict(doc) for doc in self.docs[:cap]]


class FakeUpdateResult:
    modified_count = 0


class FakeCollection:
    def __init__(self):
        self.docs = []

    async def count_documents(self, query):
        from backend.database.document_store import _matches_query

        return len([doc for doc in self.docs if _matches_query(doc, query)])

    def find(self, query=None, projection=None):
        from backend.database.document_store import _matches_query

        return FakeCursor([doc for doc in self.docs if _matches_query(doc, query or {})])

    async def find_one(self, query, projection=None, sort=None):
        docs = await self.find(query, projection).limit(1).to_list(length=1)
        return docs[0] if docs else None

    async def insert_many(self, docs, ordered=False):
        from bson import ObjectId

        for doc in docs:
            next_doc = dict(doc)
            next_doc.setdefault("_id", str(ObjectId()))
            self.docs.append(next_doc)

    async def insert_one(self, doc):
        self.docs.append(dict(doc))

    async def update_one(self, query, update):
        return FakeUpdateResult()


class ExploreDiscoveryStaticTests(TestCase):
    def test_serverless_entry_defaults_demo_mode_to_true(self):
        entrypoint = (REPO_ROOT / "api" / "index.py").read_text(encoding="utf-8")

        self.assertIn('os.environ.setdefault("DEMO_MODE", "true")', entrypoint)

    def test_explore_page_fallback_uses_non_discovery_business_list(self):
        source = (REPO_ROOT / "frontend" / "src" / "pages" / "Businesses.tsx").read_text(encoding="utf-8")
        fallback_block = source[source.index("const fallback") : source.index("} catch (fetchError)")]

        self.assertIn("api.getBusinesses()", fallback_block)
        self.assertNotIn("api.getNearbyBusinesses", fallback_block)

    def test_explore_page_does_not_auto_request_browser_location(self):
        source = (REPO_ROOT / "frontend" / "src" / "pages" / "Businesses.tsx").read_text(encoding="utf-8")

        self.assertNotIn("didAutoLocateRef", source)
        self.assertEqual(source.count("navigator.geolocation.getCurrentPosition"), 1)


class GooglePlacesRegressionTests(IsolatedAsyncioTestCase):
    async def test_discover_returns_demo_businesses_when_demo_mode_enabled(self):
        from backend.routes import discovery

        businesses = FakeCollection()
        geo_cache = FakeCollection()
        fake_db = {"businesses": businesses}

        with (
            patch.object(discovery, "DEMO_MODE", True),
            patch.object(discovery, "get_database", return_value=fake_db),
            patch.object(discovery, "get_businesses_collection", return_value=businesses),
            patch.object(discovery, "get_geo_cache_collection", return_value=geo_cache),
            patch.object(discovery, "search_google_places", new=AsyncMock(return_value=[])),
        ):
            results = await discovery.discover_businesses(
                lat=43.6532,
                lng=-79.3832,
                radius=8,
                limit=20,
                sort_mode="canonical",
                refresh=True,
            )

        self.assertGreater(len(results), 0)
        self.assertTrue(all(item["city"] == "Toronto" for item in results))

    async def test_missing_google_api_key_logs_warning_and_returns_empty_list(self):
        from backend.services import google_places

        with patch.object(google_places, "GOOGLE_API_KEY", ""), self.assertLogs("backend.services.google_places", level="WARNING") as logs:
            results = await google_places.search_google_places(43.6532, -79.3832, 8000)

        self.assertEqual(results, [])
        self.assertTrue(any("GOOGLE_API_KEY is not configured" in line for line in logs.output))

    async def test_discover_does_not_cache_empty_result_when_google_is_unavailable(self):
        from backend.routes import discovery

        businesses = FakeCollection()
        geo_cache = FakeCollection()

        with (
            patch.object(discovery, "DEMO_MODE", False),
            patch.object(discovery, "GOOGLE_API_KEY", ""),
            patch.object(discovery, "get_businesses_collection", return_value=businesses),
            patch.object(discovery, "get_geo_cache_collection", return_value=geo_cache),
            patch.object(discovery, "search_google_places", new=AsyncMock(return_value=[])),
        ):
            results = await discovery.discover_businesses(
                lat=43.6532,
                lng=-79.3832,
                radius=8,
                limit=20,
                sort_mode="canonical",
                refresh=True,
            )

        self.assertEqual(results, [])
        self.assertEqual(geo_cache.docs, [])

    async def test_google_places_docs_include_city_from_address_components(self):
        from backend.models.business import Business
        from backend.routes.discovery import business_helper
        from backend.services import google_places

        place = {
            "place_id": "place-1",
            "name": "Queen Street Cafe",
            "business_status": "OPERATIONAL",
            "types": ["cafe", "food"],
            "vicinity": "100 Queen St W, Toronto",
            "geometry": {"location": {"lat": 43.6536, "lng": -79.3841}},
            "address_components": [
                {"long_name": "Toronto", "types": ["locality", "political"]},
                {"long_name": "Ontario", "types": ["administrative_area_level_1", "political"]},
            ],
        }

        async def fake_gather(*coroutines):
            results = []
            for coroutine in coroutines:
                coroutine.close()
                results.append([])
            return results

        with (
            patch.object(google_places, "GOOGLE_API_KEY", "test-key"),
            patch.object(google_places, "_get_google_places_client", new=AsyncMock(return_value=object())),
            patch.object(google_places, "_fetch_nearby_pages", new=AsyncMock(side_effect=[[place], [], [], [], [], []])),
            patch.object(google_places, "enrich_business_profile_details", new=AsyncMock(return_value={})),
            patch.object(google_places.asyncio, "gather", new=fake_gather),
        ):
            docs = await google_places.search_google_places(43.6532, -79.3832, 8000, max_results=1)

        self.assertEqual(docs[0]["city"], "Toronto")
        response_doc = business_helper({**docs[0], "_id": "507f1f77bcf86cd799439011"})
        Business.model_validate(response_doc)
