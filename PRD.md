# Vantage — Product Requirements Document

**Real-Time Trust Engine for Local Economies**

| Field | Value |
|---|---|
| Version | v2.1 — Supabase + Production Hardening Baseline |
| Last Updated | May 21, 2026 |
| Stack | React 19 / TypeScript / Vite / Rust Axum / Supabase / Vercel |

## 1. Product Vision

Vantage is a trust-first local business discovery platform. It surfaces nearby
businesses through verified activity, credibility-weighted reviews, recency, and
community engagement. Ranking is earned, never bought.

Business claiming has zero effect on the Live Visibility Score (LVS). That is an
architectural invariant enforced in `backend/src/services/visibility_score.rs`.

## 2. Current Architecture

```text
Browser
  -> Vercel static frontend
  -> /api/* rewrite
  -> api/index.rs Vercel Rust wrapper
  -> backend/src/lib.rs Axum router
  -> Supabase Auth Admin API + Supabase PostgREST
```

### Backend

- Rust + Axum workspace package: `vantage-backend`
- Vercel serverless wrapper: `api/index.rs`
- App factory and route mounting: `backend/src/lib.rs`
- Central configuration: `backend/src/config.rs`
- Supabase client: `backend/src/db/supabase.rs`
- Route modules: auth, users, businesses, discovery, saved, reviews, claims,
  deals, subscriptions, activity, location
- Integrations: Supabase, Google Places/Geocoding, reCAPTCHA Enterprise,
  Stripe Checkout, in-memory rate limiting
- Serverless request bodies are capped at 2 MiB and collected responses are
  capped at 20 MiB in the Vercel Rust wrapper.

### Frontend

- React 19 + TypeScript + Vite 8
- React Router route tree in `frontend/src/main.tsx`
- Central API client in `frontend/src/api.ts`
- Auth state in `frontend/src/contexts/AuthContext.tsx`
- Saved business guest/auth sync in `frontend/src/hooks/useSavedBusinesses.ts`

## 3. Supabase Data Model

Supabase is the single source of truth for authentication, relational data,
storage buckets, realtime activity, and user metadata.

Authoritative schema migration:

```text
scripts/supabase/migrations/202605180001_supabase_single_source.sql
scripts/supabase/migrations/202605200001_postgis_geo_queries.sql
scripts/supabase/migrations/202605200002_review_summary_rpc.sql
scripts/supabase/migrations/202605200003_deal_status_consistency.sql
```

### Tables

| Table | Purpose |
|---|---|
| `businesses` | Listings, owner linkage, Google place metadata, rating aggregates, profile media fields, generated PostGIS geography for indexed radius reads |
| `reviews` | One review per user/business with platform-owned rating aggregate updates |
| `saved_businesses` | User bookmarks |
| `claims` | Business ownership claim workflow |
| `deals` | Business promotions |
| `subscriptions` | Business-owner subscription records, including pending Stripe Checkout sessions |
| `checkins` | Self-reported and geo-verified visits |
| `activity_feed` | Community feed, likes, comments counters, realtime publication |
| `activity_comments` | Feed comments, realtime publication |
| `owner_events` | Business owner events, realtime publication |

### Storage

The migration creates public Supabase Storage buckets:

- `business-media`
- `user-avatars`

### Realtime

The migration adds these tables to `supabase_realtime`:

- `activity_feed`
- `activity_comments`
- `owner_events`

### Geospatial RPCs

The PostGIS migration adds:

- `search_businesses_geo`
- `activity_pulse_geo`
- `owner_events_geo`

The Rust API uses these RPCs for nearby/discovery/activity radius reads after
the migration is applied, with compatibility fallbacks to the older Haversine
path while deployments catch up.

### Aggregate and Derived-State RPCs

`refresh_business_review_summary` updates a business rating and review count
inside Postgres after review writes. The Rust API uses it after the migration is
applied and falls back to the older API-side calculation while deployments catch
up.

`refresh_business_has_deals` keeps the denormalized `businesses.has_deals` flag
aligned with active, unexpired deals. A Supabase trigger runs it after deal
writes, and the Rust API calls it with an API-side fallback while deployments
catch up.

## 4. API Surface

All endpoints are mounted under `/api`.

| Area | Endpoints |
|---|---|
| Auth | `/auth/register`, `/auth/login`, `/auth/logout`, `/auth/me`, `/auth/google` |
| Users | `/users/me`, `/users/me/preferences`, `/users/me/password`, `/users/:id` |
| Businesses | `/businesses`, `/businesses/nearby`, `/businesses/:id`, `/businesses/:id/profile`, `/photos` |
| Discovery | `/discover`, `/decide`, `/explore/lanes` |
| Saved | `/saved`, `/saved/:business_id` |
| Reviews | `/reviews`, `/reviews/:id`, `/reviews/business/:id`, `/businesses/:id/reviews` |
| Claims | `/claims`, `/claims/my`, `/claims/:id` |
| Deals | `/deals`, `/deals/:id`, `/deals/business/:id`, `/businesses/:id/deals` |
| Subscriptions | `/subscriptions/tiers`, `/subscriptions/my`, `/subscriptions/business/:business_id`, `/subscriptions`, `/subscriptions/cancel`, `/subscriptions/webhook/stripe`, `/stripe/webhook` |
| Activity | `/feed`, `/activity`, `/checkins`, `/activity/pulse`, `/feed/:id/like`, `/feed/:id/comments`, `/feed/posts`, `/credibility/me`, `/events`, `/businesses/:id/activity` |
| Location | `/location/reverse` |

## 5. Core Product Systems

### Live Visibility Score

Current Rust implementation computes a 0-100 score from:

- Rating confidence dampened by review count
- Review volume
- Verified status
- Description presence
- Photo presence
- Stored positive score override

`is_claimed` and `owner_id` are intentionally excluded.

Business owners cannot create or update reviews for their own listings, because
rating and review-count signals contribute to discovery trust and visibility.

### Discovery

Discovery supports category, text, verified-only, radius, distance, rating,
newest, most-reviewed, and canonical LVS sorting. Distance filtering is
application-side against the stored GeoJSON-style `location` field.

### Decide For Me

`/decide` accepts intent, radius, category, and modifier constraints. It returns
ranked business items plus explanation strings for the UI.

### Authentication

Email/password and Google OAuth are mediated by the Rust backend through
Supabase Auth. Login/register/Google flows return Supabase Auth sessions, and
the backend stores Supabase access and refresh tokens in httpOnly cookies. API
auth guards verify the Supabase access token with `SUPABASE_JWT_SECRET` and can
refresh expired access tokens with the Supabase refresh-token endpoint. Auth
response bodies return the user object only; bearer tokens are not exposed to
browser JavaScript.

### Business Owner Tools

Owners can claim a business, update profile fields, create events, post activity
updates, create deals, and manage subscriptions. Owner checks compare
`businesses.owner_id` against the authenticated Supabase user id and require the
authenticated user to have a `business_owner` or `admin` role for owner-only
flows. Claim submission and approval cannot take over a business that is already
claimed or owner-linked to another user. Frontend claim/search and business
modal actions use the same `owner_id` claimability rule, and owners are not
offered review entry points for their own listings because the API rejects
self-reviews.

Paid subscription creation starts a Stripe Checkout Session with server-side
price IDs and creates a `pending_checkout` row. Free subscriptions can be
activated immediately. Signed Stripe webhooks promote paid rows to `active`
after checkout payment confirmation and downgrade rows when Stripe reports a
subscription deletion. Subscription cancellation is scoped by business when a
user owns multiple listings, cancels Stripe before local downgrade, and keeps
Supabase Auth subscription metadata aligned to the highest remaining active
business subscription. Paid-plan replacement cancels the prior Stripe
subscription before activating the replacement row locally.

### Activity And Location

Activity feed, comments, check-ins, owner events, pulse cards, and business
activity status are served from Supabase tables. Pulse and event endpoints apply
location/radius filtering when coordinates are provided. Reverse geocoding
returns both backend-friendly fields (`formatted_address`, `state`) and
frontend contract fields (`label`, `region`). Check-ins accept either no
coordinates or a complete valid latitude/longitude pair; partial coordinate
payloads are rejected.

## 6. Environment Variables

Required:

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

Recommended/feature-specific:

- `GOOGLE_API_KEY`
- `RECAPTCHA_ENTERPRISE_*`
- `STRIPE_SECRET_KEY`
- `STRIPE_WEBHOOK_SECRET`
- `STRIPE_PRICE_STARTER_MONTHLY`
- `STRIPE_PRICE_STARTER_YEARLY`
- `STRIPE_PRICE_PRO_MONTHLY`
- `STRIPE_PRICE_PRO_YEARLY`
- `STRIPE_PRICE_PREMIUM_MONTHLY`
- `STRIPE_PRICE_PREMIUM_YEARLY`
- `FRONTEND_URL`
- `PRODUCTION_URL`

Production `FRONTEND_URL`/`PRODUCTION_URL` values must resolve to public
origins; localhost fallback origins are rejected in production to protect
checkout redirects.

Frontend-specific:

- `VITE_API_URL`
- `VITE_GOOGLE_CLIENT_ID`
- `VITE_RECAPTCHA_SITE_KEY`

MongoDB, Redis, frontend Supabase public env vars, and frontend Stripe
publishable-key env vars are no longer part of the target runtime architecture.

## 7. Deployment

Vercel configuration:

- `buildCommand`: `cd frontend && npm install && npm run build`
- `outputDirectory`: `frontend/dist`
- `/api/:path*` rewrites to `/api/index`
- SPA fallback rewrites to `/index.html`
- Static security headers are configured in `vercel.json`, including HSTS,
  content-type, frame, referrer, permissions, and CSP headers.
- Backend API responses also apply security headers and use `no-store` cache
  control for private user/owner/billing endpoints.

Local development:

```bash
cargo run -p vantage-backend --bin vantage
cd frontend && npm run dev
```

## 8. Current Completion Status

Completed in the current baseline:

- Rust backend compiles with MongoDB dependency removed.
- Supabase REST client handles select/insert/update/delete/count JSON flows.
- Core MongoDB-backed route modules were migrated to Supabase tables.
- Frontend API route mismatches were addressed with backend aliases.
- Unused frontend `purgeChains` API method was removed.
- Supabase schema migration now covers data, storage, realtime, indexes, and RLS.
- Supabase RLS policies for claims and check-ins restrict direct authenticated
  access to safe read/insert paths instead of broad user-managed updates.
- Malformed UUID and coordinate inputs are rejected before database access.
- Credibility tiers, reverse-geocode responses, pulse/event filters, and auth
  cache behavior are aligned with frontend contracts.
- Supabase count queries use exact count headers instead of loading all rows.
- Local Vantage-owned JWT sessions were removed; auth cookies now carry
  Supabase Auth access/refresh tokens and backend guards verify Supabase JWTs.
- Claim detail access, claim submission, business subscription lookup, public
  profiles, reviews, and activity display names were tightened to reduce PII
  and billing-data exposure.
- Deal/event timestamp validation and SPA catch-all routing were added.
- Paid subscriptions now create Stripe Checkout Sessions and `pending_checkout`
  rows instead of activating paid access before payment confirmation; signed
  Stripe webhooks activate confirmed paid checkouts and cancel deleted Stripe
  subscriptions. Cancellation is business-scoped and auth subscription metadata
  is recomputed from remaining active business subscriptions.
- Serverless body caps, static/backend security headers, private API no-store
  cache-control, and production checkout-origin validation were added.
- Google Places/photo/reverse-geocode requests use bounded HTTP clients and
  sanitized public errors for upstream failures.
- Auth JSON responses no longer expose Supabase bearer tokens to frontend
  JavaScript; sessions are held in httpOnly cookies.
- Auth mutations explicitly clear loading state, and stale in-flight `/auth/me`
  responses cannot leave the frontend stuck on route-loading screens.
- Claim takeover protection now rejects claims against owner-linked businesses,
  and owner dashboard/pricing/profile-edit UI follows backend `owner_id`
  authorization.
- Claim/search and business modal actions follow owner-linked claimability and
  owner self-review restrictions.
- Owner self-review is blocked, check-in coordinates must be complete, and
  business/discovery/activity coordinate inputs must provide latitude and
  longitude as a complete valid pair. Review aggregate updates now use a
  Supabase RPC with fallback and propagate failures instead of silently leaving
  business rating state stale.
- Deal create/update/delete flows now refresh `businesses.has_deals` through a
  Supabase RPC with fallback, and Supabase has a trigger migration so the deal
  badge remains database-owned even for non-API writes. Activity feed inserts
  and comment-count updates now propagate persistence failures instead of
  silently losing related state.
- Frontend diagnostics now use a dev-only logger, and reCAPTCHA Enterprise is
  loaded lazily only when configured, with bounded polling and load-failure
  messaging. Explore session-cache operations are best-effort so blocked browser
  storage does not break refresh flows. Explore business/event cards now use
  separate native buttons for open/save/view actions instead of nested
  clickable wrappers. Overlay scroll locking now goes through a shared stacked
  hook so the business modal and mobile drawer cannot restore body scrolling out
  of order.
- Unused Redis/governor/nonzero dependencies and unused public frontend
  Supabase/Stripe env variables were removed.
- Repository guidance files now reflect the Rust + Supabase architecture instead
  of the removed FastAPI/MongoDB stack.
- Owner-only workflows now require owner/admin role checks in addition to
  matching `businesses.owner_id`.
- Verification run: `cargo check`, `cargo fmt --all`, `cargo test`,
  `cargo clippy --all-targets --all-features -- -D warnings`,
  `cd frontend && npm run lint`, `cd frontend && npm run build`,
  `npm audit --audit-level=high`.

Known limitations:

- Supabase migration has been authored but not applied from this session.
- There are only focused backend route/unit tests so far; full integration tests
  are still needed for auth guards, owner checks, saved businesses, reviews,
  check-ins, subscriptions, and activity flows.
- Stripe webhook code is implemented, but live webhook delivery still needs to
  be smoke-tested against the deployed `/api/stripe/webhook` endpoint.
- PostGIS radius RPCs have been authored and wired into the backend, but the
  target Supabase project still needs the migration applied and smoke-tested.
- Realtime is enabled at the database publication level, but the frontend still
  polls/fetches instead of subscribing to Supabase realtime channels.
- `npx vercel build` could not be verified locally because the checkout does not
  have linked Vercel project settings. Run `vercel pull` or configure local
  project settings before repeating that gate.

## 9. Next Priorities

1. Apply the Supabase migrations in the target project and verify
   table/storage/PostGIS RPC permissions with real anon/authenticated/service-role
   requests.
2. Add backend integration tests for all protected route families.
3. Add fraud-resistant moderation for review/check-in abuse and coordinated
   engagement.
4. Add frontend realtime subscriptions for activity feed, comments, and events.
5. Add deployment smoke tests for `/api/health`, `/api/discover`,
   `/api/stripe/webhook`, `/api/auth/me`, and SPA fallback routes.
