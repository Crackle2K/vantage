# Next Agent Handoff

Last updated: May 21, 2026

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

- Add route-level integration tests for auth, owner checks, saved businesses,
  reviews, check-ins, subscriptions, and activity feed.
- Add backend pagination/cursor contracts for high-volume feed, review,
  business, and activity routes.
- Add Supabase realtime subscriptions in the frontend for feed, comments, and
  owner events.
- Add abuse/fraud detection for repeated check-ins, suspicious review patterns,
  and coordinated likes/comments.
- Add deployment smoke tests for `/api/health`, `/api/discover`,
  `/api/stripe/webhook`, `/api/auth/me`, and SPA fallback routes.
- Apply and smoke-test the Supabase PostGIS, review-summary, and deal-status
  migrations in the target Supabase project.
- Link or pull Vercel project settings locally, then rerun `npx vercel build`.

## External Completion Blockers

- Live Supabase migration apply/smoke verification has not been performed from
  this workspace.
- Live Stripe webhook delivery verification has not been performed against the
  deployed endpoint.
- Local Vercel build verification is blocked until project settings are linked.

## Suggested Next Moves

1. Add protected-route integration coverage first; it gives the best signal for
   auth, ownership, and subscription regressions.
2. After tests, clear deployment blockers in order:
   - Supabase migrations + smoke tests
   - deployed Stripe webhook smoke
   - `vercel pull` / `npx vercel build`
3. Only mark the goal complete after those external checks are evidenced, not
   just after local green builds.
