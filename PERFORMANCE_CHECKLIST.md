# Vantage Performance Audit Checklist

> Audited: 2026-05-03 | Stack: React 19 + Vite + FastAPI + Supabase + Vercel Serverless

---

## CRITICAL — Will cause production failure at scale

### Architecture

- [ ] **Replace document store full-table scans with native Postgres queries**
  - `backend/database/document_store.py:144-175` — `_find_docs()` loads EVERY row for a collection from Supabase, then filters in Python. Every `find()`, `find_one()`, `count_documents()`, `update_one()` triggers a full collection fetch.
  - Fix: Push query filters to Postgres via Supabase's `.select().eq().gte()` etc. instead of `_load_rows()` + Python filtering.
  - Impact: All endpoints are currently O(n) with data size. This is the #1 bottleneck.

- [ ] **Make Supabase client calls truly async**
  - `backend/database/document_store.py:150-156` — All `.execute()` calls are synchronous HTTP that block the event loop inside `async` functions.
  - Fix: Wrap in `asyncio.get_event_loop().run_in_executor(None, ...)` or use an async Supabase client.

- [ ] **Remove `DEMO_MODE=true` default in serverless entry point**
  - `api/index.py:18` — `os.environ.setdefault("DEMO_MODE", "true")` means missing env vars cause `seed_demo_dataset` to run on every cold start.
  - Fix: Remove the default or set it to `"false"`. Ensure production env vars are always set.

- [ ] **Configure Vercel serverless function limits**
  - `vercel.json` — No `functions` config for `maxDuration` or `memory`. Defaults to 10s timeout, 1024MB.
  - Fix: Add `"functions": { "api/index.py": { "maxDuration": 60, "memory": 2048 } }` or similar.

### Frontend Bundle

- [ ] **Add route-level code splitting with `React.lazy` + `Suspense`**
  - `frontend/src/main.tsx:14-25` — All 12 pages are statically imported. Every user downloads code for every page.
  - Fix: Convert to `const LoginPage = React.lazy(() => import('./pages/LoginPage'))` etc.

- [ ] **Configure Vite chunk splitting strategy**
  - `frontend/vite.config.ts:15` — `manualChunks: undefined` disables chunk splitting. Entire app is one monolithic bundle.
  - Fix: Configure vendor chunks (react, gsap, supabase, lucide-react).

- [ ] **Memoize `AuthContext` provider value**
  - `frontend/src/contexts/AuthContext.tsx:127-142` — Context value object and its functions (`signIn`, `signUp`, etc.) are recreated every render, causing app-wide re-renders on any auth change.
  - Fix: Wrap value in `useMemo`, wrap functions in `useCallback`.

- [ ] **Optimize hero videos (67MB total)**
  - `frontend/public/videos/` — `hero2.mp4` (34MB) and `hero3.mp4` (31MB) are served unoptimized. `HeroTransition.tsx:72` sets `preload="auto"`.
  - Fix: Compress to WebM/AV1, reduce bitrate, use adaptive streaming, change to `preload="none"` or `"metadata"`.

---

## HIGH — Significant latency under load

### Backend

- [ ] **Parallelize Google Places typed queries**
  - `backend/services/google_places.py:477-485` — 5 type-specific searches (restaurant, cafe, bar, store, beauty_salon) run sequentially. Each can take 6+ seconds with pagination.
  - Fix: Use `asyncio.gather()` for parallel execution.

- [ ] **Offload `bcrypt` to thread pool**
  - `backend/models/auth.py:229-256` — `bcrypt.checkpw`/`bcrypt.hashpw` are CPU-intensive synchronous calls blocking the event loop.
  - Fix: `await asyncio.get_event_loop().run_in_executor(None, bcrypt.checkpw, ...)`

- [ ] **Fix N+1 query in `get_all_deals`**
  - `backend/routes/deals.py:148-157` — For each deal, a separate `find_one` fetches the parent business (each being a full collection scan).
  - Fix: Batch-fetch businesses by IDs, or use a join/projection.

- [ ] **Add gzip compression middleware**
  - `backend/main.py` — No `GZipMiddleware`. Discovery responses with 100+ businesses send uncompressed JSON.
  - Fix: `app.add_middleware(GZipMiddleware, minimum_size=1000)`

- [ ] **Add timeouts to all Supabase/external HTTP calls**
  - `backend/database/document_store.py` and `backend/database/supabase.py` — No request timeouts configured. A hung query blocks the API indefinitely.
  - Fix: Configure httpx timeout on Supabase client.

- [ ] **Cache authenticated user lookups**
  - `backend/models/auth.py:298-341` — `get_current_user()` hits the database on every authenticated request.
  - Fix: Short-lived in-memory cache (e.g., 60s TTL) keyed by user ID from JWT claims.

- [ ] **Reduce `_recalculate_visibility` from 7 full-collection scans to 1-2 targeted queries**
  - `backend/routes/discovery.py:1269-1333` — Each visit triggers 7 separate full-table scans (visits, reviews, credibility, etc.).
  - Fix: Once document store is fixed (critical item #1), use targeted Postgres queries. Alternatively, compute incrementally.

- [ ] **Move `normalize_business_metadata` to write-time**
  - `backend/services/business_metadata.py:357-416` — Called on every business read via `business_helper()`. Expensive string processing repeated for every response.
  - Fix: Compute once on insert/update, store normalized fields on the document.

- [ ] **Batch `insert_many` / `update_many` / `delete_many`**
  - `backend/database/document_store.py:217-253` — Each operation makes one HTTP round-trip per document. Inserting 60 businesses = 60 sequential Supabase calls.
  - Fix: Use Supabase's batch `.upsert()` or `.insert()` with multiple rows.

- [ ] **Share `httpx.AsyncClient` instances instead of creating per-call**
  - `backend/services/google_places.py:473` and `backend/services/photo_proxy.py:209` — New client created per function call, no connection reuse.
  - Fix: Create long-lived client at module level or via dependency injection.

### Frontend

- [ ] **Add a data fetching library (SWR or React Query)**
  - `frontend/src/api.ts` — Raw `fetch()` with no caching, deduplication, or revalidation. Two components calling the same endpoint = two network requests.
  - Fix: Integrate SWR or TanStack Query.

- [ ] **Fix waterfall API calls on Businesses page**
  - `frontend/src/pages/Businesses.tsx:257-309` — `discoverBusinesses()` and `getExploreLanes()` run sequentially when they could be parallel.
  - Fix: Use `Promise.all([api.discoverBusinesses(), api.getExploreLanes()])`.

- [ ] **Lazy-load GSAP and `@react-oauth/google`**
  - `frontend/src/components/HeroTransition.tsx:2-5` — GSAP (~25KB gzip) is loaded on every route but only used on the landing page.
  - `frontend/src/main.tsx:9` — `GoogleOAuthProvider` wraps the entire app.
  - Fix: Dynamic `import('gsap')` inside `HeroTransition`. Move `GoogleOAuthProvider` to only wrap login/signup routes.

- [ ] **Add server-side filtering for "my businesses" endpoints**
  - `frontend/src/pages/PricingPage.tsx:51-71` and `DashboardPage.tsx:46-66` — Fetch ALL businesses then filter client-side for `b.owner_id === user.id`.
  - Fix: Add `?owner_id=` filter parameter to the API.

- [ ] **Fix render-blocking Google Fonts CSS `@import`**
  - `frontend/src/index.css:8` — Synchronous `@import url(...)` blocks first paint.
  - Fix: Use `<link rel="preconnect">` + `<link rel="stylesheet" media="print" onload>` pattern, or `font-display: swap`.

- [ ] **Load missing font families (`Plus Jakarta Sans`, `Space Grotesk`, `Instrument Serif`)**
  - `frontend/src/index.css:143,154,169` — These are referenced in CSS but not loaded via `@font-face` or Google Fonts import. They fall back to system fonts, causing layout shift.
  - Fix: Add proper `@font-face` declarations or Google Fonts imports with `display=swap`.

- [ ] **Add `React.memo` to frequently-rendered list items**
  - No component in the codebase uses `React.memo`. BusinessCard, OwnerEventCard, CategoryChip, etc. re-render on every parent state change.
  - Fix: Wrap pure list item components with `React.memo()`.

- [ ] **Optimize hero images — add `srcset` / `sizes` for responsive delivery**
  - `frontend/src/page.tsx:44-146,299,454` — 14 Unsplash images use fixed `w=900` or `w=2000` with no responsive variants. Mobile devices download desktop-sized images.
  - Fix: Use `<img srcSet="... 480w, ... 900w, ... 2000w" sizes="(max-width: 768px) 480px, 900px">`.

---

## MEDIUM — Degraded performance

### Backend

- [ ] **Add `Cache-Control` headers to JSON API responses**
  - All JSON endpoints return no caching headers. Clients re-fetch on every navigation.
  - Fix: Add `Cache-Control: public, max-age=30` or `s-maxage=60` for discovery/business endpoints.

- [ ] **Add pagination to `get_business_deals`, `get_my_claims`, `get_my_reviews`**
  - `backend/routes/deals.py:80-117`, `backend/routes/claims.py:105-115`, `backend/routes/reviews.py:233-253`
  - Fix: Add `skip`/`limit` params with total count metadata.

- [ ] **Replace `SecurityHeadersMiddleware` (BaseHTTPMiddleware) with pure ASGI middleware**
  - `backend/main.py:79-134` — `BaseHTTPMiddleware` adds overhead per request.
  - Fix: Write a lightweight ASGI middleware that injects headers without wrapping the response.

- [ ] **Add retry logic for transient Supabase errors**
  - No retry on network timeouts, 5xx responses, or connection drops.
  - Fix: Add exponential backoff retry (2-3 attempts) on database operations.

- [ ] **Combine `count_documents` + `find` in `get_businesses_feed` into a single query**
  - `backend/routes/businesses.py:151-207` — Two separate full-collection scans for count + data.
  - Fix: Single query that returns both count and results.

- [ ] **Remove `deepcopy` from lanes cache get/set**
  - `backend/routes/discovery.py:116-119` — O(n) copy on every cache hit and write.
  - Fix: Use immutable data structures or accept shared references (if callers don't mutate).

- [ ] **Reduce response payload size on list endpoints**
  - `backend/routes/businesses.py:109-149` — Returns all business fields including `ranking_components`, `image_urls`, `google_types` even for list views.
  - Fix: Create a `BusinessSummary` model with only fields needed for card rendering.

### Frontend

- [ ] **Compress `Vantage.png` logo (2MB)**
  - `frontend/public/Images/Vantage.png` — Loaded on every page via Header.
  - Fix: Convert to SVG or WebP, reduce to <50KB.

- [ ] **Move `postcss` and `autoprefixer` to devDependencies**
  - `frontend/package.json:21,25` — Build-only tools listed as production dependencies.
  - Fix: Move to `devDependencies`.

- [ ] **Remove unused `@supabase/ssr` and `@supabase/supabase-js` from frontend deps**
  - `frontend/package.json:17-18` — Zero imports found in `src/`.
  - Fix: `npm uninstall @supabase/ssr @supabase/supabase-js`.

- [ ] **Replace persistent `animate-pulse` / `animate-ping` decorations**
  - `frontend/src/components/MissionSection.tsx:58-63` — Two large gradient orbs animate indefinitely, triggering continuous repaints.
  - `frontend/src/components/FeatureShowcase.tsx:132-133` — Two `animate-ping` elements.
  - Fix: Use `will-change: transform` or replace with CSS `animation-play-state: paused` when off-screen via IntersectionObserver.

- [ ] **Add `will-change: transform` to BusinessCard hover animations**
  - `frontend/src/components/business-card.tsx:111` — `hover:-translate-y-1 hover:scale-[1.01]` without `will-change` causes paint on hover.
  - Fix: Add `will-change: transform` or `transform: translateZ(0)`.

- [ ] **Add cursor-based pagination to Businesses page**
  - `frontend/src/pages/Businesses.tsx:30` — `DISCOVERY_LIMIT = 300` fetches up to 300 businesses at once.
  - Fix: Implement cursor/offset pagination with incremental loading.

---

## LOW — Minor improvements

- [ ] **Remove `pymongo` from serverless requirements** — Only `bson.ObjectId` is used; install standalone `bson` package instead (`api/requirements.txt:19`).

- [ ] **Remove `watchfiles` from serverless requirements** — Dev-only auto-reload watcher, not needed in production (`api/requirements.txt:38`).

- [ ] **Add `Cache-Control` headers for `/assets/**` in `vercel.json`** — JS/CSS bundles with content hashes should have `immutable` cache headers.

- [ ] **Fix lanes cache eviction from O(n) to O(1)** — `backend/routes/discovery.py:121` — Use `OrderedDict` or `functools.lru_cache` instead of `min()` scan.

- [ ] **Add `fetchpriority="high"` to hero background image** — `frontend/src/page.tsx:269-273`.

- [ ] **Close Redis connections on shutdown** — `backend/models/auth.py:34-49`.

- [ ] **Exclude `data/` directory from Vercel deployment** — Add to `.vercelignore`.

- [ ] **Add Vite compression plugin** — `vite-plugin-compression` for Brotli/gzip pre-compression of static assets.

- [ ] **Remove `autoprefixer` from frontend deps** — Built into Tailwind CSS v4, not needed separately.

- [ ] **Parallelize `_update_user_credibility` calls** — `backend/routes/activity.py:284-285` — Two sequential calls that could use `asyncio.gather()`.

- [ ] **Add CI/CD pipeline** — No GitHub Actions workflows; deploys push directly without build validation.

---

## Quick Wins (highest impact, lowest effort)

| # | Action | Estimated Effort | Impact |
|---|--------|-----------------|--------|
| 1 | Add `React.lazy` + `Suspense` for route code splitting | 30 min | Large — cuts initial JS bundle significantly |
| 2 | Configure `manualChunks` in Vite | 15 min | Large — separates vendor from app code |
| 3 | Memoize `AuthContext` value with `useMemo`/`useCallback` | 20 min | Large — eliminates app-wide re-renders |
| 4 | Add `GZipMiddleware` to FastAPI | 5 min | Medium — 3-5x smaller JSON responses |
| 5 | Parallelize Google Places queries with `asyncio.gather` | 15 min | Medium — 5x faster discover endpoint |
| 6 | Remove `DEMO_MODE=true` default in `api/index.py` | 2 min | Medium — prevents accidental seed on cold start |
| 7 | Add Vercel `maxDuration` + `memory` config | 5 min | Medium — prevents 504 timeouts |
| 8 | Compress hero videos or switch to `preload="metadata"` | 30 min | Large — saves ~60MB on first load |
| 9 | Add `Promise.all` for parallel API calls on Businesses page | 10 min | Medium — eliminates request waterfall |
| 10 | Offload `bcrypt` to thread pool | 10 min | Medium — unblocks event loop on auth |