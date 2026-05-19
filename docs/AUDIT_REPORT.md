# Vantage Full-Stack Audit Report

Last updated: May 19, 2026

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
- Aligned reverse-geocode and credibility responses with frontend contracts.
- Replaced full-row comment counting with PostgREST exact count headers.
- Removed local JWT session minting and redundant `SECRET_KEY`/bcrypt auth
  dependency; protected requests now trust Supabase-signed JWTs only.
- Added stricter deal discount/timestamp validation, owner-event timestamp
  validation, public profile privacy tests, and SPA catch-all routing.
- Preserved the LVS invariant that claim status is not a ranking input.

### Frontend

- Removed unused `purgeChains` API method.
- Added a cache-generation guard so stale in-flight GETs cannot repopulate
  cached data after auth or write mutations.
- Added an auth session epoch guard so stale `/auth/me` responses cannot
  restore a signed-out user.
- Added credentials to the manual explore-lanes fetch path.
- Verified current API client route calls compile and bundle.

### Database

- Added Supabase schema for all runtime tables.
- Added RLS policies for public reads and authenticated user-owned writes.
- Added Storage buckets for business media and user avatars.
- Added realtime publication entries for feed/comments/events.

### Documentation

- Updated README Supabase setup.
- Replaced PRD with current architecture, data model, API surface, completion
  status, limitations, and next priorities.
- Removed MongoDB variables from `backend/.env.example`.

## Verification Evidence

Commands run successfully:

```bash
cargo check
cargo fmt --all
cargo check
cargo test
cd frontend && npm run lint
cd frontend && npm run build
```

Current verified result:

- Rust backend and Vercel API wrapper compile.
- Backend unit tests pass, including the LVS claim-status invariant.
- Backend unit tests pass for LVS, Supabase JWT verification, UUID validation,
  public profile privacy, credibility-tier frontend contract, route
  construction, invalid business IDs, invalid user IDs, and invalid coordinates.
- Backend router construction test passes, catching route alias conflicts.
- Frontend lint passes.
- Frontend TypeScript production build passes.
- `cargo tree -i mongodb` returns no matching package, confirming MongoDB is no
  longer in the Rust dependency graph.

## Remaining Risks and Recommendations

- Apply the Supabase migration to the actual Supabase project and run smoke
  tests against live tables.
- Verify Supabase Google provider configuration in the target project because
  backend Google login now uses Supabase `id_token` sign-in rather than local
  Google token verification.
- Add integration tests for protected routes and owner/admin authorization.
- Add Stripe Checkout Sessions plus webhook-confirmed subscription activation.
- Replace JSON coordinate filtering with PostGIS for indexed radius queries.
- Connect frontend realtime subscriptions for feed/comments/events.
- Add abuse detection for suspicious reviews, check-ins, and likes.
- Add route-level contract tests so frontend API paths cannot drift from backend
  route mounting again.
