# Vantage Performance Checklist

Audited: May 18, 2026  
Stack: React 19 + Vite + Rust Axum + Supabase + Vercel Serverless

## Completed In Current Baseline

- [x] Removed MongoDB runtime dependency from backend.
- [x] Replaced MongoDB route queries with Supabase PostgREST calls.
- [x] Added request timeout to the Supabase HTTP client.
- [x] Added frontend route-level lazy loading.
- [x] Added frontend GET response cache and in-flight request de-duping.
- [x] Split Vite vendor chunks for React, router, GSAP, Google OAuth, icons, and UI.
- [x] Verified production frontend build.
- [x] Verified backend workspace compile.

## Highest Priority Remaining Work

- [ ] Add route-level integration tests for auth, owner checks, saved businesses,
  reviews, check-ins, subscriptions, and activity feed.
- [ ] Move geospatial filtering from JSON/app-side Haversine loops to PostGIS
  `geography(Point, 4326)` with indexed radius queries.
- [ ] Add backend pagination/cursor contracts for high-volume feed, review,
  business, and activity routes.
- [ ] Add Supabase realtime subscriptions in the frontend for feed, comments,
  and owner events.
- [ ] Add Stripe webhook-confirmed subscription state and avoid activating paid
  subscriptions before payment confirmation.
- [ ] Add abuse/fraud detection for repeated check-ins, suspicious review
  patterns, and coordinated likes/comments.
- [ ] Add deployment smoke tests for `/api/health`, `/api/discover`,
  `/api/auth/me`, and SPA fallback routes.

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
- Business distance filtering is correct but not yet indexed at the database
  layer.
- Authenticated user data still calls Supabase Auth Admin endpoints through the
  backend. Add short-lived caching only after authorization behavior is covered
  by tests.
