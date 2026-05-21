# Vantage Full-Stack Audit Report

Last updated: May 21, 2026

## Scope Covered This Pass

- Backend data layer, dependencies, route mounting, route contracts, auth guards,
  health checks, error handling, and deployment wrapper compatibility.
- Frontend API client route usage and build/lint verification.
- Supabase database/storage/realtime schema requirements.
- Environment variable and README/PRD documentation alignment.

## Critical Issues Found

### MongoDB Still Drove Core Runtime Paths

The backend still depended on the `mongodb` crate and `backend/src/db/mongo.rs`.
Core route modules queried MongoDB collections directly:

- `businesses`
- `reviews`
- `saved`
- `claims`
- `deals`
- `subscriptions`
- `activity`
- `discovery`
- health check
- LVS input type

Impact: Supabase was not the single source of truth, production required two
databases, and the stated migration objective was incomplete.

Fix: Removed the MongoDB dependency and runtime wrapper, deleted
`backend/src/db/mongo.rs`, moved route modules to Supabase PostgREST helpers,
and changed LVS scoring to operate on JSON Supabase rows.

### Frontend and Backend Route Contracts Were Mismatched

The frontend called endpoints that did not exist or returned incompatible
shapes, including:

- `/reviews/business/:id`
- `/deals/business/:id`
- `/checkins`
- `/feed`
- `/events`
- `/subscriptions/my`
- `/subscriptions/business/:business_id`
- `/businesses/:id/activity`
- `/decide` as a GET endpoint
- `/photos?place_id=...`

Impact: major UI flows could fail at runtime despite TypeScript passing.

Fix: Added backend aliases and response shapes matching the frontend API client.
Removed unused `api.purgeChains()` because it pointed to an unimplemented
endpoint and had no call sites.

### Database Schema Was Not Authoritative

There was no Supabase migration defining the replacement tables, RLS, storage,
or realtime setup.

Fix: Added
`scripts/supabase/migrations/202605180001_supabase_single_source.sql` covering
Postgres tables, indexes, RLS policies, Storage buckets, and realtime
publication entries.

### Documentation Was Stale

`PRD.md`, `README.md`, and `backend/.env.example` still described MongoDB or a
FastAPI/Python backend.

Fix: Updated docs and env examples to match Rust + Axum + Supabase.

### Auth Still Had a Parallel Local JWT System

Email/password and Google sign-in touched Supabase Auth, but the backend then
minted a separate Vantage JWT signed with `SECRET_KEY`. Protected route guards
trusted that local token rather than the Supabase Auth session, and Google login
manually created password-backed users instead of using Supabase's Google ID
token flow.

Impact: Supabase was not the only authentication authority, disabled/updated
Supabase users could keep using a locally valid token until expiry, and
deployment required a redundant secret unrelated to the Supabase project.

Fix: Replaced Vantage-owned JWT issuance with Supabase Auth access/refresh
tokens in httpOnly cookies. Backend guards now verify Supabase JWTs with
`SUPABASE_JWT_SECRET`, refresh expired access tokens through Supabase, and use
Supabase's Google `id_token` sign-in flow.

### Sensitive Records Were Overexposed

Several routes returned or accepted data too broadly:

- Public user profiles exposed account email addresses through the Supabase Auth
  Admin API.
- Public review/activity rows used email addresses as display names.
- Any authenticated user could read a claim detail record, including owner
  contact/proof fields.
- Customers could submit ownership claims despite the UI restricting the flow to
  business owners.
- Business subscription lookup exposed full billing records, including Stripe
  identifiers, without owner authorization.
- Paid subscription creation accepted a client-supplied Stripe price id.

Impact: avoidable PII/billing leakage and weaker trust boundaries around owner
workflows.

Fix: Public profiles now omit email, activity/review rows use display names,
claim detail reads are owner/admin-only, claim submission requires
business-owner/admin role, business subscription lookup requires owner/admin
access, and Stripe price ids are resolved server-side from configured env vars.

### Runtime Contract Bugs Remained After Migration

Additional route-level review found several issues that compiled cleanly but
would still break production flows:

- Invalid UUID route parameters could reach Supabase and surface as generic
  server/database errors instead of client-safe 400 responses.
- Reverse geocoding returned `state`/`formatted_address`, while the frontend
  reads `region`/`label`.
- Credibility tiers were uppercase, while the frontend badge contract expects
  lowercase snake_case values.
- Activity pulse and owner-event list endpoints accepted location/radius params
  but did not apply them.
- Frontend auth/cache state could be repopulated by stale in-flight GET
  responses after login/logout mutations.
- Comment counts fetched every matching row instead of using PostgREST exact
  count headers.

Fix: Added UUID validation, route regression tests, reverse-geocode contract
fields, lowercase credibility tiers, location filtering for pulse/events,
frontend cache-generation guards, auth session epoch guards, consistent
credentials on manual fetches, and efficient Supabase count handling.

### Paid Subscriptions Activated Before Payment Confirmation

Paid subscription creation inserted active subscription rows and upgraded the
user's Supabase Auth metadata before any Stripe payment/checkout confirmation.

Impact: a client could request a paid tier and receive active product access
without completing payment.

Fix: Paid subscription requests now create Stripe Checkout Sessions using
server-side price IDs, insert `pending_checkout` subscription rows, and return a
checkout URL/session id. The free tier remains immediately active. Signed
Stripe webhooks now activate pending paid rows only after checkout payment
confirmation and downgrade canceled Stripe subscriptions. Cancellation is now
business-scoped, cancels Stripe before local downgrading or paid-plan
replacement, and refreshes auth metadata from the highest remaining active
business subscription.

### Serverless Body Handling Was Unbounded

The Vercel Rust wrapper buffered request and response bodies without explicit
limits.

Impact: oversized payloads could consume serverless memory before application
handlers ran.

Fix: Added a 2 MiB request body cap with 413 responses and a 20 MiB response
body cap when collecting Axum responses in `api/index.rs`.

### Security Header, Cache, and Runtime Surface Gaps

Additional production-hardening review found several gaps:

- Static Vercel responses had no explicit security headers or CSP.
- Backend CSP did not allow the current Google OAuth/reCAPTCHA flows.
- Private API JSON responses could receive public cache headers.
- Production checkout return URLs could silently fall back to localhost.
- Login, registration, and Google auth responses returned bearer access tokens
  in JSON even though the intended session model uses httpOnly cookies.
- Frontend console diagnostics shipped directly through `console.*` calls.
- The reCAPTCHA Enterprise script loaded globally even when the feature was not
  configured.
- Unused Redis/governor/nonzero dependencies and unused frontend Supabase/Stripe
  env vars remained documented or installed.
- Some owner workflows checked `businesses.owner_id` but not the authenticated
  user's owner/admin role.
- Public user-display fallbacks could still expose email addresses when profile
  name metadata was absent.
- The initial Supabase RLS policies allowed users to directly update their own
  claim/check-in rows, including trust-sensitive fields such as claim status and
  geo-verification state.
- Business owners could review their own listings, allowing them to influence
  rating/review-count signals that feed discovery ranking.
- Check-ins accepted partial coordinates, which could store incomplete location
  data and make geo-verification behavior ambiguous.
- Review aggregate updates swallowed Supabase update errors, allowing a review
  write to succeed while business rating/review-count state silently went stale.
- Review aggregate recalculation loaded all reviews for a business through the
  API after each review write, which would scale poorly for high-volume
  listings.
- Deal creation set `businesses.has_deals` best-effort only, while deal updates
  and deletes did not recompute it at all. Listings could keep stale "Deals"
  badges after the last current deal expired, was disabled, or was deleted.
- Check-in and owner-event activity feed inserts, activity comment counter
  updates, and fallback business lookups could silently discard Supabase write
  or read failures, producing partial user-visible state without surfacing an
  error.
- Google Places, photo proxy, and reverse-geocode requests used unbounded
  `reqwest::get` calls, and some failure paths returned raw upstream/client
  errors that could include request URLs.
- Auth state could stay permanently loading if login/register/Google sign-in or
  logout completed while the initial `/auth/me` request was still in flight.
- Theme persistence wrote to `localStorage` without a guard, so blocked browser
  storage could crash app boot.
- Ownership claims could be submitted for owner-linked or already-claimed
  businesses, and claim approval could overwrite a business owner if an older
  claim was verified after the business had already been claimed.
- Owner dashboard/pricing/profile-edit UI checked only `is_claimed`, while the
  backend owner tools authorize by `owner_id`. Owner-linked listings that were
  not claim-badged yet could be hidden from owner workflows.
- Explore business cards and owner-event cards used clickable article elements
  with nested buttons for save/open actions, creating invalid interactive
  nesting and weaker keyboard/screen-reader behavior.
- Business modal and mobile header drawer each mutated `document.body.style.overflow`
  directly, so overlapping overlays could unlock scrolling out of order.

Fix: Added Vercel/static security headers, expanded backend CSP, changed private
API cache-control to `no-store`, rejected localhost frontend origins in
production, removed bearer tokens from auth JSON responses, moved frontend
diagnostics behind a dev-only logger, lazily loads reCAPTCHA only when
configured, removed unused dependencies/env variables, tightened owner-role
authorization, removed public email fallbacks, and split broad claim/check-in RLS
policies into read/insert-only user policies plus admin claim management. Added
self-review prevention for business owners, required check-in coordinates to be
provided as a valid pair, made review aggregate update failures propagate,
added a database-side review summary refresh RPC with API-side fallback,
added a database-side deal status refresh RPC/trigger with API-side fallback,
made activity feed/comment counter persistence failures propagate,
bounded Google integration requests and sanitized their public error responses,
cleared auth loading state after auth mutations, guarded theme storage writes,
blocked claim takeovers of owner-linked businesses, and aligned owner UI flows
with `owner_id`. Replaced clickable card wrappers with separate native buttons
for media/name opening and save/view actions. Replaced per-component body
overflow writes with a shared stacked scroll-lock hook for overlays.

## Changes Made

### Backend

- Added JSON Supabase helpers for select, select-one, insert, update, delete,
  count, and health checks.
- Removed MongoDB from backend dependency graph.
- Replaced MongoDB health check with Supabase table health check.
- Migrated business CRUD, nearby search, profile updates, and Google photo proxy.
- Migrated reviews with duplicate-review protection and aggregate business
  rating updates.
- Migrated saved businesses to return full business items for the UI.
- Migrated discovery, explore lanes, and Decide For Me to Supabase rows.
- Migrated claims and owner approval behavior.
- Migrated deals and deal route aliases.
- Migrated subscriptions to Supabase records and Stripe price-id lookup.
- Migrated check-ins, activity feed, likes, comments, credibility, owner posts,
  owner events, activity pulse, and business activity status.
- Added malformed UUID and coordinate validation before database access.
- Added location/radius filtering to activity pulse and owner event reads.
- Added PostGIS-backed radius RPCs for nearby businesses, discovery, activity
  pulse, and owner events, with compatibility fallback to Rust Haversine
  filtering until the new migration is applied.
- Added a Supabase review-summary RPC so review writes can refresh rating and
  review-count aggregates without loading all reviews through the API.
- Added a Supabase deal-status RPC/fallback so deal create/update/delete flows
  refresh `businesses.has_deals` based on active, unexpired deals.
- Made check-in and owner-event activity feed inserts, activity comment count
  updates, and fallback business lookup failures propagate instead of silently
  returning partial state.
- Added bounded Google HTTP client usage for Places, photo proxy, and reverse
  geocoding, with sanitized public errors for upstream failures.
- Aligned reverse-geocode and credibility responses with frontend contracts.
- Replaced full-row comment counting with PostgREST exact count headers.
- Removed local JWT session minting and redundant `SECRET_KEY`/bcrypt auth
  dependency; protected requests now trust Supabase-signed JWTs only.
- Added stricter deal discount/timestamp validation, owner-event timestamp
  validation, public profile privacy tests, and SPA catch-all routing.
- Added Stripe Checkout Session creation for paid subscription requests,
  pending checkout rows, signed Stripe webhook activation/cancellation,
  business-scoped cancellation, and highest-active-tier auth metadata refresh.
- Added request/response body caps in the Vercel Rust serverless wrapper.
- Added static/security-header parity for Vercel responses and backend API
  responses, including stricter private API `no-store` cache-control.
- Added production-origin validation so checkout redirects cannot use localhost
  fallback URLs in production.
- Removed Supabase bearer tokens from auth response bodies; sessions remain in
  httpOnly cookies.
- Tightened owner/admin role requirements across business, deal, activity, and
  subscription owner workflows.
- Blocked claim submission for already-claimed or owner-linked businesses, and
  blocked claim approval from taking over a business owned by another user.
- Prevented business owners from creating or updating reviews for their own
  listings.
- Required check-in latitude/longitude to be provided together and validated as
  a pair.
- Required business create/update, discovery, nearby, activity pulse, and owner
  event coordinate inputs to provide latitude/longitude as a complete valid
  pair instead of silently ignoring partial location filters.
- Made business rating/review-count aggregate updates fail loudly instead of
  silently ignoring Supabase write failures.
- Made business deal badge updates fail loudly and recompute after deal
  activation changes or deletion.
- Removed unused Redis/governor/nonzero dependencies and unused config/env
  fields.
- Preserved the LVS invariant that claim status is not a ranking input.

### Frontend

- Removed unused `purgeChains` API method.
- Added a cache-generation guard so stale in-flight GETs cannot repopulate
  cached data after auth or write mutations.
- Added an auth session epoch guard so stale `/auth/me` responses cannot
  restore a signed-out user.
- Added credentials to the manual explore-lanes fetch path.
- Replaced direct `console.*` diagnostics with a dev-only logger.
- Changed reCAPTCHA Enterprise loading from a global script tag to lazy
  injection only when `VITE_RECAPTCHA_SITE_KEY` is configured.
- Fixed auth state loading after login/register/Google/logout mutations so stale
  in-flight `/auth/me` responses cannot leave the app in a permanent loading
  state.
- Guarded theme `localStorage` writes so blocked storage does not break the app.
- Guarded explore-page forced session-cache invalidation so blocked
  `sessionStorage` cannot break manual refreshes.
- Added bounded reCAPTCHA Enterprise polling and load-failure messaging on
  signup so a blocked script does not leave users with an indefinitely disabled
  form and no explanation.
- Aligned owner dashboard, pricing, and business profile edit controls with
  backend `owner_id` authorization instead of relying only on the visual
  `is_claimed` badge.
- Wired the pricing Free plan action through the business-scoped cancellation
  endpoint so selected-business downgrades are not a frontend no-op.
- Aligned claim/search and business modal actions with the backend
  `owner_id` claimability contract, and hid owner self-review entry points that
  the API rejects.
- Replaced clickable explore card wrappers with separate native buttons for
  opening details and saving/viewing businesses so cards no longer contain
  nested interactive controls.
- Replaced direct body overflow mutations in the modal and mobile header drawer
  with a shared scroll-lock hook so overlapping overlays do not unlock page
  scrolling out of order.
- Removed unused public Supabase and Stripe frontend env variables from the
  example env file.
- Verified current API client route calls compile and bundle.

### Database

- Added Supabase schema for all runtime tables.
- Added RLS policies for public reads and authenticated user-owned writes.
- Added Storage buckets for business media and user avatars.
- Added realtime publication entries for feed/comments/events.
- Added `stripe_checkout_session_id` to subscription records.
- Added a follow-up PostGIS migration with an indexed generated geography column
  and RPCs for radius-filtered discovery/activity reads.
- Added a follow-up review summary RPC migration for database-side rating and
  review-count refreshes.
- Added a follow-up deal status RPC/trigger migration for database-side
  `businesses.has_deals` refreshes after deal inserts, updates, deletes, and
  backfill.
- Tightened claim and check-in RLS policies so authenticated users can read their
  own rows and submit safe initial rows, but cannot directly self-approve claims
  or promote check-ins to geo-verified status.

### Documentation

- Updated README Supabase setup.
- Replaced PRD with current architecture, data model, API surface, completion
  status, limitations, and next priorities.
- Updated repository agent guidance files so they no longer describe the removed
  FastAPI/MongoDB architecture.
- Removed MongoDB variables from `backend/.env.example`.

## Verification Evidence

Commands run successfully:

```bash
cargo check
cargo fmt --all
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test
cd frontend && npm run lint
cd frontend && npm run build
npm audit --audit-level=high
```

Current verified result:

- Rust backend and Vercel API wrapper compile.
- Backend unit tests pass: 37 passed, including the LVS claim-status invariant.
- Backend unit tests pass for LVS, Supabase JWT verification, UUID validation,
  public profile privacy, credibility-tier frontend contract, route
  construction, invalid business IDs, invalid user IDs, and invalid coordinates.
- Backend unit tests also cover production frontend-origin validation, private
  API cache-control classification, owner-role checks, public email fallback
  privacy, auth responses not exposing bearer tokens, claim takeover
  prevention, Stripe webhook signature/payment guards, geospatial/review RPC
  fallback helpers, owner self-review prevention, and complete check-in
  coordinate validation, deal expiry filtering, and current-deal PostgREST
  filter construction.
- Backend router construction test passes, catching route alias conflicts.
- Backend Clippy passes with `-D warnings`.
- Frontend lint passes.
- Frontend TypeScript production build passes.
- Frontend high-severity npm audit passes with 0 vulnerabilities found.
- `cargo tree -i mongodb` returns no matching package, confirming MongoDB is no
  longer in the Rust dependency graph.
- `cargo tree -i redis`, `cargo tree -i governor`, and `cargo tree -i bcrypt`
  return no matching package, confirming those unused/legacy dependencies are no
  longer in the Rust dependency graph.
- `npx vercel build` was attempted but could not run without linked local Vercel
  project settings. Vercel reported `project_settings_required`.

## Remaining Risks and Recommendations

- Apply the Supabase migrations to the actual Supabase project and run smoke
  tests against live tables, including PostGIS radius RPCs, review-summary RPC,
  and deal-status trigger/RPC behavior.
- Verify Supabase Google provider configuration in the target project because
  backend Google login now uses Supabase `id_token` sign-in rather than local
  Google token verification.
- Add integration tests for protected routes and owner/admin authorization.
- Smoke-test signed Stripe webhook delivery against the deployed
  `/api/stripe/webhook` endpoint.
- Smoke-test PostGIS-backed `/api/businesses/nearby`, `/api/discover`,
  `/api/activity/pulse`, and `/api/events` radius reads after migration apply.
- Connect frontend realtime subscriptions for feed/comments/events.
- Add abuse detection for suspicious reviews, check-ins, and likes.
- Add route-level contract tests so frontend API paths cannot drift from backend
  route mounting again.
- Link or pull Vercel project settings locally, then rerun `npx vercel build`.
