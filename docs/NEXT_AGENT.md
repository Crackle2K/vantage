# Next Agent Handoff

Last updated: June 12, 2026

## Safe Current State

- MongoDB runtime usage has been removed; Supabase is the active runtime data
  source.
- Recent frontend safety fixes are in place:
  - explore business cards and owner-event cards now use native buttons instead
    of clickable wrappers with nested buttons
  - body scroll locking now uses `frontend/src/hooks/useBodyScrollLock.ts` so
    the mobile drawer and business modal can overlap without restoring page
    scroll out of order
- Recent backend consistency fixes are in place:
  - deal create/update/delete now refresh `businesses.has_deals`
  - activity-related write failures now propagate instead of being dropped
  - route-level contract tests now cover unauthenticated protected routes,
    owner-only authorization, malformed saved/review/check-in/subscription/feed
    requests, local deployment smoke routes, and Vercel API/SPA rewrites
  - business, review, feed, and activity-comment reads expose cursor pagination
    metadata while preserving existing default response shapes
  - business activity summaries use count queries instead of loading all
    check-in/feed rows
- Recent realtime and abuse fixes are in place:
  - frontend feed items, feed comments, and owner events subscribe to Supabase
    Realtime when `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` are set
  - repeated check-ins, high-frequency reviews, repeated comments, and rapid
    activity likes/comments/posts have baseline abuse guards

## Verified Before Handoff

- `cargo check`
- `cargo clippy --all-targets --all-features -- -D warnings`
- `cargo test`
- `cd frontend && npm run lint`
- `cd frontend && npm run build`
- `npm audit --audit-level=high`
- `git diff --check`

Known external blocker still reproduces:

- `npx vercel build` -> `project_settings_required`

## Remaining Checklist

- Apply and smoke-test the Supabase PostGIS, review-summary, and deal-status
  migrations in the target Supabase project.
- Run live deployment smoke tests for `/api/health`, `/api/discover`,
  `/api/stripe/webhook`, `/api/auth/me`, Supabase Realtime, and SPA fallback
  routes against the target environment.
- Smoke-test signed Stripe webhook delivery against the deployed endpoint.
- Link or pull Vercel project settings locally, then rerun `npx vercel build`.

## External Completion Blockers

- Live Supabase migration apply/smoke verification has not been performed from
  this workspace.
- Live Stripe webhook delivery verification has not been performed against the
  deployed endpoint.
- Local Vercel build verification is blocked until project settings are linked.

## Suggested Next Moves

1. Clear deployment blockers in order:
   - Supabase migrations + smoke tests
   - deployed Stripe webhook smoke
   - `vercel pull` / `npx vercel build`
2. Only mark the goal complete after those external checks are evidenced, not
   just after local green builds.
