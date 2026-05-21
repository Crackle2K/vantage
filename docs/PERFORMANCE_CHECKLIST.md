# Vantage Performance Checklist

Audited: May 21, 2026
Stack: React 19 + Vite + Rust Axum + Supabase + Vercel Serverless

## Completed In Current Baseline

- [x] Removed MongoDB runtime dependency from backend.
- [x] Replaced MongoDB route queries with Supabase PostgREST calls.
- [x] Added request timeout to the Supabase HTTP client.
- [x] Added bounded Google HTTP client usage for Places, photo proxy, and
  reverse-geocode requests.
- [x] Added frontend route-level lazy loading.
- [x] Added frontend GET response cache and in-flight request de-duping.
- [x] Added cache-generation and auth-session guards to prevent stale in-flight
  GET responses from restoring old auth/data state after mutations.
- [x] Replaced full-row comment counting with PostgREST exact count headers.
- [x] Added radius filtering for activity pulse and owner event reads.
- [x] Added PostGIS generated geography/index migration and RPC-backed radius
  queries for discovery, nearby businesses, activity pulse, and owner events.
- [x] Added a Supabase RPC for review aggregate refreshes so review writes do
  not need to fetch every review row for a business after migrations are applied.
- [x] Added a Supabase RPC/trigger for deal badge refreshes so
  `businesses.has_deals` stays aligned with active, unexpired deals after deal
  writes.
- [x] Removed Vantage-owned JWT minting; protected routes now verify
  Supabase-signed access tokens and refresh through Supabase Auth.
- [x] Tightened public data exposure for profiles, claims, subscriptions,
  reviews, and activity display names.
- [x] Added SPA catch-all routing so unknown client routes do not render blank.
- [x] Added paid subscription checkout creation without pre-payment activation;
  paid rows now start as `pending_checkout`.
- [x] Added signed Stripe webhook activation for completed paid checkout
  sessions and cancellation handling for deleted Stripe subscriptions.
- [x] Made subscription cancellation business-scoped, with Stripe cancellation
  during cancel/downgrade/paid-plan replacement and Supabase Auth tier metadata
  refresh treated as required writes.
- [x] Added Vercel serverless request/response body caps.
- [x] Added static Vercel security headers and expanded backend CSP.
- [x] Changed private API JSON cache-control to `no-store`.
- [x] Added production frontend-origin validation for checkout redirects.
- [x] Sanitized public Google integration errors so upstream request URLs are
  not reflected to clients.
- [x] Removed bearer tokens from auth JSON responses; browser sessions remain in
  httpOnly cookies.
- [x] Fixed auth mutation loading-state races that could leave routes stuck on
  loading screens.
- [x] Tightened Supabase claim/check-in RLS policies to prevent direct
  self-approval or trust-state promotion.
- [x] Blocked claim submission/approval takeovers of already owner-linked
  businesses.
- [x] Blocked business owners from reviewing their own listings.
- [x] Required check-in coordinates to be submitted as a complete valid pair.
- [x] Required partial location filters/writes across business, discovery, pulse,
  and event routes to fail validation instead of silently broadening queries.
- [x] Made review aggregate update failures propagate instead of silently
  leaving stale business rating/review-count state.
- [x] Aligned dashboard, pricing, and business profile edit controls with
  backend `owner_id` authorization.
- [x] Aligned claim/search and modal actions with owner-linked business
  claimability and self-review rules enforced by the backend.
- [x] Wired pricing downgrades to the business-scoped subscription cancellation
  endpoint.
- [x] Guarded theme storage writes so blocked browser storage does not break
  boot.
- [x] Guarded explore session-cache removal and bounded signup reCAPTCHA
  polling/error states.
- [x] Replaced clickable explore card wrappers with native buttons so favorite
  and open/view actions are no longer nested interactive controls.
- [x] Replaced per-component body overflow mutations with a shared scroll-lock
  hook so overlapping overlays do not restore page scrolling out of order.
- [x] Replaced frontend direct console output with a dev-only logger.
- [x] Changed reCAPTCHA Enterprise to lazy-load only when configured.
- [x] Removed unused Redis/governor/nonzero dependencies and unused frontend
  Supabase/Stripe public env variables.
- [x] Updated agent guidance files to match the Rust + Supabase-only runtime.
- [x] Tightened owner/admin role checks for owner-only workflows.
- [x] Split Vite vendor chunks for React, router, GSAP, Google OAuth, icons, and UI.
- [x] Verified production frontend build.
- [x] Verified backend workspace compile.
- [x] Verified backend Clippy with `-D warnings`.
- [x] Verified high-severity npm audit reports 0 vulnerabilities.

## Highest Priority Remaining Work

- [ ] Add route-level integration tests for auth, owner checks, saved businesses,
  reviews, check-ins, subscriptions, and activity feed.
- [ ] Add backend pagination/cursor contracts for high-volume feed, review,
  business, and activity routes.
- [ ] Add Supabase realtime subscriptions in the frontend for feed, comments,
  and owner events.
- [ ] Add abuse/fraud detection for repeated check-ins, suspicious review
  patterns, and coordinated likes/comments.
- [ ] Add deployment smoke tests for `/api/health`, `/api/discover`,
  `/api/stripe/webhook`, `/api/auth/me`, and SPA fallback routes.
- [ ] Apply and smoke-test the PostGIS, review-summary, and deal-status
  migrations in the target Supabase project.
- [ ] Link or pull Vercel project settings locally, then rerun `npx vercel build`.

## Bundle Observations

Latest verified build produced separate chunks for:

- React vendor
- Router
- GSAP
- Google OAuth
- Icons
- Main app routes

The largest gzip chunks are currently React vendor and GSAP. Keep GSAP isolated
to home/marketing surfaces and avoid importing it into operational pages.

## Backend Observations

- Supabase requests currently go through PostgREST with a 15 second timeout.
- Stripe requests use a 15 second timeout.
- Business distance filtering has an authored PostGIS/indexed RPC path, but it
  still needs to be applied and smoke-tested in the target Supabase project.
- Authenticated user data still calls Supabase Auth Admin endpoints through the
  backend. Add short-lived caching only after authorization behavior is covered
  by tests.
- Private user/owner/billing API responses now use `no-store` cache-control.
