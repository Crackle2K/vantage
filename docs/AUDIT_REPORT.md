# Vantage Full-Stack Audit Report

Last updated: June 11, 2026 (Pass 4 — re-read of routes: reviews, deals, subscriptions, saved, claims, location; and services: stripe, google_places)

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
- Added cursor pagination metadata for business, review, activity feed, and
  activity comment reads while preserving legacy default response bodies.
- Replaced full-row business activity summary loads with PostgREST counts and a
  single latest-check-in lookup.
- Made business rating/review-count aggregate updates fail loudly instead of
  silently ignoring Supabase write failures.
- Made business deal badge updates fail loudly and recompute after deal
  activation changes or deletion.
- Added baseline abuse guards for repeated check-ins, high-frequency review
  creation, repeated comments, and rapid activity likes/comments/posts.
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
- Added Supabase Realtime subscriptions for feed items, feed comments, and
  owner events, enabled only when public Supabase realtime env vars are set.
- Removed unused public Stripe frontend env variables from the example env file.
- Reintroduced the public Supabase URL/anon-key frontend env vars as optional
  realtime-only configuration.
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
- Backend unit tests pass: 46 passed, including the LVS claim-status invariant.
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
- Backend unit tests now also cover protected-route auth requirements,
  owner-only route rejection for customer tokens, malformed saved/review/check-in
  subscription/activity-feed request contracts, local deployment smoke routes,
  Vercel API/SPA rewrites, and pagination cursor helpers.
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

## Pass 2 — Full File-by-File Backend Audit (June 2026)

All 40 source files in `backend/src/` and `api/` were read and reviewed. No
multi-agent tooling was used; every file was read sequentially. Findings are
listed by severity.

### Critical — Broken by Default

**All domain models use `#[serde(rename = "_id")]` on `id`**
Files: `models/business.rs:73`, `models/user.rs:46`, `models/review.rs:7`,
`models/subscription.rs:57`, `models/activity.rs:16,30,49`,
`models/claim.rs:24`, `models/deal.rs:7`, `models/saved.rs:6`.
Supabase columns are named `id`, not `_id`. These structs fail to deserialize
any DB row. `id` is always `None` in any response that uses these types directly.
The `normalize_id_alias` helper patches this only in `Value`-based JSON paths.

**`visibility_score::compute` stored-override early return**
File: `services/visibility_score.rs:15–18`.
If `visibility_score > 0` exists in the DB row, the function returns it
verbatim, skipping ALL organic signal computation. One non-zero DB value
permanently freezes a business's LVS rank. No unit test covers this path.

**`create_business` sets `owner_id` and `is_claimed: false` simultaneously**
File: `routes/businesses.rs`.
`ensure_business_open_for_claim_submission` rejects claims when `owner_id` is
non-null. Owner-created listings can never be claimed via the claims workflow.

**`max_deals()` subscription limit never enforced**
Files: `models/subscription.rs:33–40`, `routes/deals.rs`.
Per-tier deal limits are modelled but `create_deal` never calls `max_deals()`.
Free-tier businesses can create unlimited deals.

**`visibility_boost`/`featured_placement` advertised but never applied**
File: `models/subscription.rs:46–52`.
`TierInfo` responses tell PRO/PREMIUM subscribers they receive visibility boosts
that `visibility_score::compute()` never applies. False advertising and an
LVS-invariant trap for future developers.

### Security

**Session cookie overwrites valid Bearer token**
File: `middleware/auth.rs:121–122`.
When a request carries both `Authorization: Bearer <valid>` and a stale
`session=` cookie, the cookie value overwrites the already-extracted
`access_token`. The valid Bearer token is silently discarded.

**Rate limiter uses leftmost (client-controlled) X-Forwarded-For IP**
File: `middleware/rate_limit.rs:51`.
`.split(',').next()` takes the first IP in the header, which the client
controls. Rate limiting is bypassed by prepending a spoofed IP.

**`is_localhost` trusts the client-supplied `Host` header**
File: `middleware/security_headers.rs:10–25`.
Sending `Host: localhost` from any origin disables HSTS, X-Frame-Options,
X-Content-Type-Options, and all other security headers in production.

**Dev CORS origins are unconditionally trusted with credentials in production**
File: `config.rs`.
`localhost:5173`, `:3000`, `:5174`, and every `VERCEL_URL` preview URL are in
the CORS allowlist combined with `allow_credentials(true)`. No environment guard.

**Logout does not revoke Supabase tokens**
File: `routes/auth.rs:111–117`.
Only cookies are cleared. A stolen refresh token remains valid for up to 7 days.

**JWT `nbf` (not-before) claim not verified**
File: `jwt.rs:116–126`.
`parse_claims` checks `exp` but never `nbf`. A token with a future `nbf` is
accepted immediately.

**`PHOTO_REF_RE` regex allows `..` path traversal**
File: `security.rs`.
The `.` character class matches any character, permitting `../..` in photo
references passed to the Google photo proxy.

**Raw Supabase error strings returned to HTTP clients**
File: `errors.rs`.
`AppError::Internal(msg)` and `AppError::DatabaseUnavailable(msg)` return raw
error text, potentially exposing Supabase table names and constraint names.

### Race Conditions (TOCTOU)

**Duplicate review creation**
File: `routes/reviews.rs:119–134`.
Duplicate check and insert are separate DB calls. Two concurrent requests both
see no existing review and both insert.

**Stripe webhook duplicate activation**
File: `routes/subscriptions.rs:415–521`.
Activation is a non-atomic 4-step sequence (read → check → cancel → activate).
Stripe's at-least-once delivery creates two concurrent active subscriptions.

**Duplicate saved-business records**
File: `routes/saved.rs:77–102`.
Check and insert are separate calls. Concurrent saves create duplicate rows.

**Claim re-review / non-atomic ownership transfer**
File: `routes/claims.rs:168–215`.
Already-approved claims can be re-reviewed. Claim approval reads and writes
business ownership in two separate operations.

### N+1 Queries and Performance

**`list_saved` N+1**
File: `routes/saved.rs:43–57`.
One `select_one_json` call per saved business. No pagination limit on the
initial query.

**`get_activity_pulse` N+1**
File: `routes/activity.rs:438–480`.
`find_business` called inside the pulse-items loop — up to 90 sequential
round-trips per request.

**`list_owner_events` N+1**
File: `routes/activity.rs:651–673`.
`find_business` called per event — up to 100 sequential round-trips.

**HTTP clients created per external API call**
Files: `services/stripe.rs:97–101`, `services/google_places.rs:56–60`,
`services/recaptcha.rs:27–31`.
A new `reqwest::Client` (and TLS connection pool) is created for every
Stripe, Google Places, and reCAPTCHA call. Should be shared via `AppState`.

### Logic and Behaviour Bugs

**`/decide` always returns 5 results regardless of `limit` parameter**
File: `routes/discovery.rs:150+163`.
`params.limit` is multiplied by 5 for over-fetching, then
`rows.truncate(params.limit.unwrap_or(15).min(5))` uses the already-multiplied
value. The user's `limit` is discarded.

**`/explore/lanes` inherits caller's `q`/`search` across all 5 lanes**
File: `routes/discovery.rs:118–139`.
Lane params are cloned from user request params without clearing text search
fields. `?q=keyword` distorts all 5 curated lanes.

**`passes_decide_constraints` OPEN_NOW defaults to true when field absent**
File: `routes/discovery.rs:390`.
`open_now` absent from a DB row defaults to `true`. Businesses without hours
data pass the OPEN_NOW filter and appear as open.

**`discover_rows_geo` uses `match Some(sort) { Some("distance") => ... }`**
File: `routes/discovery.rs:338–371`.
`sort` is a `&str`. Wrapping it in `Some()` is always `Some`. The match works
by accident; the outer `Some` wrapper is dead.

**Google geocoding errors map to 400 Bad Request**
File: `routes/location.rs:49`.
Any upstream failure (rate limit, auth, network) becomes a 400, misleading
clients into thinking their coordinates were invalid. Should be 502/503.

**`DealUpdate` and `BusinessUpdate` have no validation**
Files: `models/deal.rs:37–47`, `models/business.rs:121–134`.
Update structs lack `#[derive(Validate)]`. Title can be set to empty,
`discount_percent` to any value, and addresses are unbounded on update.

**`BusinessCreate.address` has no max length**
File: `models/business.rs:108`.
`#[validate(length(min = 1))]` with no `max`. Multi-MB address strings are
accepted and stored.

**`select_one<T>` returns last row; `select_one_json` returns first**
File: `db/supabase.rs:348`.
`select_one<T>` calls `results.pop()` (last element). `select_one_json` calls
`.next()` (first). Callers using the two methods against the same table may get
different rows.

**`unsave_business` silently returns success when no row exists**
File: `routes/saved.rs`.
`delete_json` succeeds even when no matching row was deleted. Always returns
`{"saved": false}`.

**`registration` partial failure leaves orphaned Supabase account**
File: `routes/auth.rs:62–85`.
If `update_registration_metadata` fails after `auth_create_user` succeeds, the
account exists without role/tier metadata. User cannot re-register (duplicate
email) and cannot log in correctly. No rollback path.

### Files with No New Findings

`backend/src/state.rs`, `backend/src/main.rs`, `api/index.rs`,
`backend/src/services/geo_service.rs`, `backend/src/routes/mod.rs`,
`backend/src/services/mod.rs`, `backend/src/middleware/mod.rs`,
`backend/src/db/mod.rs`.

---

## Pass 3 — Auth, Config, Security, and Supporting Layers (June 2026)

Pass 3 re-read `middleware/auth.rs`, `middleware/security_headers.rs`,
`middleware/rate_limit.rs`, `config.rs`, `security.rs`, `errors.rs`,
`jwt.rs`, `routes/auth.rs`, `routes/users.rs`, `routes/businesses.rs`,
`models/business.rs`, `models/user.rs`, `services/recaptcha.rs`,
`db/supabase.rs`, `api/index.rs`, and `state.rs`.

### Security

**`constant_time_eq` replaces `ring::constant_time::verify_slices_are_equal`**
File: `jwt.rs:131–139`.
The inline fold uses `acc | (x ^ y)`. LLVM can theoretically short-circuit this
without assembly barriers. `ring` is already a dependency (ES256 still uses it)
so the replacement gives no benefit and introduces a potential timing side-channel
for HS256 signature verification. Should revert to `ring::constant_time`.

**`parse_claims` error messages can leak JWT claim structure**
File: `jwt.rs:117,128`.
`format!("Invalid JWT claims: {}", e)` where `e` is a serde deserialisation
error. These messages include field names and byte offsets, telling an attacker
which fields are expected. Should return a generic "Invalid token" message.

**`proxy_google_photo` reads response body with no size limit**
File: `routes/businesses.rs:368–371`.
`response.bytes().await` loads the full Google image into memory without a
`Content-Length` guard or byte cap. A slow Google response serving a 50 MB blob
would exhaust serverless memory. Should limit to `MAX_RESPONSE_BODY_BYTES` or
a sane photo cap (e.g., 8 MB).

**`profile_picture` stored as arbitrary text, not a validated URL**
File: `routes/users.rs:49–52`.
`sanitize_optional_text(Some(profile_picture), 500)` strips HTML tags and
control characters but does not validate URL scheme. A `javascript:alert(1)`
string passes. If the frontend ever renders `profile_picture` as an `<a href>`,
this is stored XSS. Should use `normalize_url(..., require_https: false)`.

**Raw `anyhow::Error` messages returned to HTTP clients on 5xx**
File: `errors.rs:66–75`.
The `From<anyhow::Error>` impl calls `e.to_string()` and wraps it directly in
`AppError::Internal` or `AppError::DatabaseUnavailable`, both of which include
the raw text in the JSON response body. Supabase table names, constraint names,
and URL fragments from DB errors reach the client. Should log the full error
server-side and return a generic message to the client.

**JWKS `refresh_jwks` TOCTOU: concurrent refresh under split locks**
File: `db/supabase.rs:93–112`.
Staleness is checked under a read lock (line 94) and the write lock is acquired
separately (line 112). Between the two, multiple concurrent requests can all
pass the minimum-refresh-interval guard and all fire a JWKS fetch. Under ES256
load this hammers the Supabase JWKS endpoint. Fix with `RwLock::try_write`
or a `Mutex`-gated atomic compare.

### Logic and Behaviour Bugs

**`DiscoveryMode` enum is a subset of the values `sanitize_preferences` accepts**
Files: `models/user.rs:25–32`, `security.rs:204–206`.
The `DiscoveryMode` enum has three variants (`Hyperlocal`, `Neighborhood`,
`Citywide`). `sanitize_preferences` accepts six strings including `"new_places"`,
`"trending"`, and `"trusted"`, which have no enum representation. These values
are stored in user metadata and returned in responses with no enum to validate
against.

**`match Some(sort) { ... }` dead outer wrapper in `query_businesses_geo`**
File: `routes/businesses.rs:539–555`.
Identical to the pattern in `discovery.rs`. `sort` is a `&str`; wrapping it in
`Some()` is always `Some`. The outer `Some` wrapper is dead and the `_ => {}`
arm is unreachable for valid sort strings. Functionally harmless but confusing.

### Correction to Pass 2

**`recaptcha-not-configured` is a rejection token, not a bypass**
File: `routes/auth.rs:43–44`.
The filter `*token != "recaptcha-not-configured"` causes that specific string to
fall through to `ok_or_else(|| AppError::BadRequest(...))`, blocking registration.
It is not a bypass — it prevents a frontend placeholder from being sent to the
reCAPTCHA API. Pass 2 summary incorrectly described this as a bypass.

---

## Pass 4 — Routes and Services Re-read (June 2026)

Pass 4 re-read `routes/reviews.rs`, `routes/deals.rs`, `routes/subscriptions.rs`,
`routes/saved.rs`, `routes/claims.rs`, `routes/location.rs`, `services/stripe.rs`,
`services/google_places.rs`, and `middleware/rate_limit.rs`.

### Security

**Stripe price-ID env var name exposed in 400 error response**
File: `routes/subscriptions.rs:595`.
`env::var(&key).map_err(|_| AppError::BadRequest(format!("{} is not configured", key)))` —
`key` is constructed from the tier and billing cycle (e.g.,
`STRIPE_PRICE_PRO_MONTHLY`). The env var name is returned to the client in
the 400 response, revealing how the server's environment is structured.
Should return a generic "Pricing not available for this tier" message.

**`X-Forwarded-For` leftmost IP is client-controlled, but only as last resort**
File: `middleware/rate_limit.rs:51`.
The middleware checks `cf-connecting-ip` then `x-real-ip` before falling back to
`x-forwarded-for`. On Vercel (which always injects `x-real-ip`), the
`x-forwarded-for` fallback should rarely be reached. However, if the API is
accessed directly, `x-forwarded-for` is controllable. The bypass works only
without Cloudflare or Vercel's edge layer.

### Logic and Behaviour Bugs

**`create_deal` stores empty title after sanitization**
File: `routes/deals.rs:134–137`.
`security::sanitize_text(&payload.title, 200)` returns an empty string for
empty or whitespace-only input. The result is inserted without a non-empty
check. Deals with empty titles can be created and are displayed to users.
Should validate that the sanitized title is non-empty.

**`list_deals` and `list_business_deals` have no offset/cursor pagination**
File: `routes/deals.rs:40–85`.
Both handlers accept `limit` but no `offset` or cursor parameter. Users cannot
page past the first page of results. The `PaginationParams` struct defines an
`offset` field but the query builders never use it.

Wait — re-reading: `PaginationParams` at line 35 only has `limit` and `offset`
fields, but the `select_json` calls at lines 44–49 only push `limit(...)` —
no `offset(...)`. Actually `PaginationParams` does include `offset: Option<i64>`
(line 37), but it is never read. Dead field.

**`update_review` has no rate limit**
File: `routes/reviews.rs:173–220`.
`create_review` calls `ensure_review_rate_allowed` (DB-backed, max 8/hour).
`update_review` has no corresponding check. A user can submit rapid updates
to a single review without restriction.

**`review_claim` can change a settled claim's status to an inconsistent state**
File: `routes/claims.rs:168–215`.
There is no check that the claim is still `"pending"` before applying a status
update. An admin who calls `review_claim` with `status: "rejected"` on an
already-`"verified"` claim will flip the claim record to `"rejected"` while
leaving `businesses.owner_id` set (the business update only runs on `"verified"`
transitions). The claim says rejected; the business says claimed. Already noted
in Pass 2 as a known gap; confirmed on re-read.

**`my_claims` serialises the claims list under two keys**
File: `routes/claims.rs:142`.
`json!({ "items": claims, "claims": claims })` — the same borrowed vector is
serialised twice into the response body (`serde_json::json!` borrows arguments).
Clients receive the identical list under both `"items"` and `"claims"`, doubling
the payload for no benefit.

**`visibility_score::compute` stored-override path has no test coverage**
File: `services/visibility_score.rs:15–18`.
The unit test at line 109 never provides a row that already has a non-zero
`visibility_score` field. The critical early-return bypass (the P0 bug that
freezes LVS) is exercised by no test. A future fix could inadvertently break
the organic path and tests would still pass.

**`cancel_stripe_subscription_if_needed` returns 400 for Stripe API failures**
File: `routes/subscriptions.rs:655`.
`AppError::BadRequest("Stripe subscription cancellation failed")` is returned
to the client when Stripe itself errors (rate limit, network, already-canceled).
Should be `AppError::Internal` or a service-unavailable variant; 400 implies
the caller made a mistake.

**Stripe webhook does not handle payment failure lifecycle events**
File: `routes/subscriptions.rs:386–394`.
Only `checkout.session.completed` and `customer.subscription.deleted` are
handled. `invoice.payment_failed`, `customer.subscription.past_due`, and
`customer.subscription.unpaid` are silently ignored. A user whose recurring
payment fails keeps paid feature access until Stripe definitively deletes the
subscription (up to several retry cycles, typically 3–14 days).

---

## Remediation Status — June 12, 2026

The P0/P1/P2 code findings listed above have been remediated in the current
worktree:

- Model structs now deserialize legacy `_id` via `alias` but serialize Supabase
  `id`.
- Owner-created businesses are owner-linked and claimed consistently.
- `visibility_score::compute` no longer trusts stored score overrides, and a
  regression test covers that path.
- `X-Forwarded-For` fallback uses the rightmost IP, and security headers no
  longer trust client-supplied `Host` to disable protections.
- Deal creation enforces current-plan active deal limits, sanitized non-empty
  titles, discount validation, and deal-list offsets.
- Unwired visibility/featured placement advertising was removed from tier
  metadata and pricing copy.
- Stripe checkout activation is conditionally idempotent, logout attempts
  Supabase token revocation, JWT `nbf` is enforced, and Bearer tokens take
  precedence over stale cookies.
- HS256 verification uses constant-time HMAC verification; JWT claim parse
  failures return generic token errors.
- Google photo proxy responses are size-capped, profile pictures must be URLs,
  and 5xx/internal errors are logged server-side with sanitized client
  responses.
- JWKS refresh is mutex-gated, typed `select_one` now returns the first row,
  and shared outbound `reqwest::Client`s live in `AppState`.
- Saved businesses, activity pulse, and owner events batch-fetch businesses.
- `/decide`, explore lanes, `OPEN_NOW`, `DiscoveryMode`, CORS origin handling,
  claim review state, `my_claims`, review update throttling, Stripe price
  lookup errors, Stripe cancellation errors, and payment-failure webhooks have
  been corrected.

Verification completed:

- `cargo check`
- `cargo test`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `cd frontend && npm audit --audit-level=high`
- `git diff --check`

**Remaining external/infrastructure risks:**

- Apply the Supabase migrations and verify PostGIS/RPC permissions in the
  target Supabase project.
- Run live deployment smoke tests for `/api/health`, `/api/discover`,
  `/api/stripe/webhook`, `/api/auth/me`, Supabase Realtime, and SPA fallback
  routes.
- Smoke-test signed Stripe webhook delivery against the deployed endpoint.
- Link or pull Vercel project settings locally, then rerun `npx vercel build`.
