# CLAUDE.md

This file provides guidance to Claude Code when working with the Vantage
repository.

## Project Overview

Vantage is a trust-first local business discovery platform. It ranks businesses
by verified activity, credibility-weighted reviews, recency, and community
signals via the Live Visibility Score (LVS). Business claiming has zero effect
on LVS.

## Commands

### Backend

```bash
cargo run -p vantage-backend --bin vantage
cargo check
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

Backend dev runs on `http://localhost:8000`.

### Frontend

```bash
cd frontend
npm install
npm run dev
npm run lint
npm run build
npm audit --audit-level=high
```

Frontend dev runs on `http://localhost:5173`.

### Deployment Verification

```bash
npx vercel build
```

This requires linked local Vercel project settings. If settings are missing,
run `vercel pull --yes --environment preview` or `vercel build --yes`.

## Architecture

```text
/
├── backend/                 # Rust + Axum backend crate
│   ├── src/lib.rs           # App factory, CORS, middleware, route mounting
│   ├── src/config.rs        # Environment settings
│   ├── src/db/supabase.rs   # Supabase PostgREST/Auth client
│   ├── src/models/          # Rust domain/request models
│   ├── src/routes/          # Axum route modules
│   └── src/services/        # LVS, Google, Stripe, geo services
├── api/index.rs             # Vercel Rust serverless wrapper
├── frontend/src/
│   ├── main.tsx             # React root/router/providers
│   ├── api.ts               # Central fetch client
│   ├── contexts/            # Auth and theme state
│   ├── pages/               # Route components
│   ├── components/          # Shared UI/feature components
│   ├── hooks/               # Frontend hooks
│   ├── lib/                 # Shared utilities/logger
│   └── types.ts             # API/domain TypeScript types
├── scripts/supabase/migrations/
└── vercel.json              # /api/* Rust function routing + SPA fallback
```

## Data And Auth

Supabase is the single source of truth for authentication, relational data,
storage buckets, realtime publication tables, and user metadata. MongoDB has
been removed from runtime code and dependencies.

Authoritative migrations are applied in order:

```text
scripts/supabase/migrations/202605180001_supabase_single_source.sql
scripts/supabase/migrations/202605200001_postgis_geo_queries.sql
scripts/supabase/migrations/202605200002_review_summary_rpc.sql
scripts/supabase/migrations/202605200003_deal_status_consistency.sql
```

Protected backend routes verify Supabase-signed access tokens from httpOnly
cookies. Auth JSON responses must not expose bearer tokens to frontend
JavaScript. Frontend API calls must go through `frontend/src/api.ts`.

## API Surface

Routes are mounted in `backend/src/lib.rs` under `/api`:

| Domain | Routes |
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

## Invariants

- Never modify LVS to favor claimed businesses, paid businesses, or ad spend.
- Never commit `.env` files, API keys, or secrets.
- Never add Rust dependencies without checking `Cargo.lock`.
- Use Supabase/PostgREST helpers for data access; do not reintroduce MongoDB or
  local JWT session storage.
- Owner workflows authorize with `businesses.owner_id` plus owner/admin role.
- Owners cannot review their own listings.
- Paid subscriptions activate only after signed Stripe webhook confirmation.
- API URLs in components must be resolved through `frontend/src/api.ts`.
- Applied Supabase migrations should not be edited; add follow-up migrations.

## Key Services

| File | Responsibility |
|---|---|
| `backend/src/services/visibility_score.rs` | LVS scoring invariant |
| `backend/src/services/google_places.rs` | Google Places/photo/geocode integration |
| `backend/src/services/stripe.rs` | Stripe Checkout and subscription calls |
| `backend/src/routes/discovery.rs` | Discovery, Decide, explore lanes |
| `backend/src/routes/activity.rs` | Feed, check-ins, comments, events, pulse |
| `backend/src/routes/subscriptions.rs` | Subscription tiers, checkout, cancellation, webhooks |

## Commit Conventions

Use Conventional Commits:

```text
<type>(<scope>): <description>
```

Common types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `build`,
`chore`.
