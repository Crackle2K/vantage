<div align="center">

# Vantage

[![Build](https://img.shields.io/badge/build-passing-brightgreen)](https://vercel.com)
[![React](https://img.shields.io/badge/React-19-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![Rust](https://img.shields.io/badge/Rust-Axum-B7410E?logo=rust&logoColor=white)](https://www.rust-lang.org)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)

</div>

## About the Business

**What is Vantage?**
Vantage is a trust-first local business discovery platform. We surface the best nearby businesses through a real-time ranking engine - the Live Visibility Score (LVS) - powered by verified in-person visits, credibility-weighted reviews, and community activity signals. Unlike Google Maps or Yelp, visibility on Vantage is earned through genuine behavior, not advertising spend or SEO dominance.

**What Service Do We Offer?**
Vantage provides two interconnected services:
- **For consumers:** A hyperlocal discovery experience that shows which independent businesses are genuinely active and trusted in their neighborhood right now - not which ones paid the most for placement.
- **For business owners:** A fair, merit-based visibility platform where a new café or family-run shop competes on the quality of their real-world activity, not their marketing budget. Owners can claim profiles, post events, create deals, and build credibility through verified customer engagement.

**Is This a Need or a Want?**
Vantage addresses a genuine need. Consumers increasingly distrust static star ratings and pay-to-play discovery platforms. Independent local businesses are being systematically buried by chain advertising and SEO spend on existing platforms. Vantage solves the real problem of unfair, unreliable local discovery - making it a trust infrastructure need for local economies, not a luxury feature.

**Who Is Our Target Consumer?**
- **Urban and suburban consumers** (ages 18-45) who regularly dine out, shop local, or explore their city and are frustrated by biased or stale results on existing platforms.
- **Independent business owners** - cafés, restaurants, boutiques, gyms, salons - who rely on community foot traffic and want fair, earned exposure to local customers.
- **Community-minded users** who value supporting local over chain businesses and want their recommendations to carry real weight.

**What Motivated Us to Start Vantage?**
The motivation is straightforward: local independent businesses are the backbone of communities, yet they are losing ground to chains that can outspend them on ads, SEO, and review manipulation. Every dollar that flows to a local business stays in the community. Vantage exists to level that playing field - to give independent businesses the same shot at visibility that was once only available to corporations with marketing departments. We believe that if a neighborhood café is packed every morning because it's genuinely great, the whole community deserves to know about it.

**Why You Should Invest in Vantage**
- **Defensible technical moat:** The Live Visibility Score is architecturally manipulation-proof - claim status, ad spend, and review volume have zero effect on rankings. Only verified real-world activity counts. This is not a policy; it is enforced in the codebase.
- **Massive underserved market:** Independent local businesses represent the overwhelming majority of all businesses globally, yet no major discovery platform truly serves their interests.
- **Network effects:** The platform grows more valuable as community activity increases. Every check-in, review, and owner event makes rankings more accurate for everyone in the neighborhood.
- **Multiple revenue streams:** Subscription tiers for business owners (deals, enhanced profiles, analytics) alongside a consumer-side platform with strong engagement and retention signals.
- **Mission-aligned growth:** The business model is aligned with user trust. We earn revenue when businesses earn real customer engagement - not when they pay for fake visibility.

## Setup

```bash
cargo run -p vantage-backend --bin vantage
```

Backend default URL: `http://localhost:8000`

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Supabase Setup

Supabase is the single source of truth for Vantage authentication, Postgres data,
storage buckets, realtime activity, and user metadata.

### Configure backend environment

Add these values in `backend/.env` (see `backend/.env.example`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `SUPABASE_JWT_SECRET`

Feature-specific integrations use the optional Google, reCAPTCHA, and Stripe
values shown in `backend/.env.example`. In production, set `FRONTEND_URL` or
`PRODUCTION_URL` to the public frontend origin so Stripe Checkout redirects do
not fall back to localhost.

Apply the database/storage/realtime schema migrations in order:

```bash
scripts/supabase/migrations/202605180001_supabase_single_source.sql
scripts/supabase/migrations/202605200001_postgis_geo_queries.sql
scripts/supabase/migrations/202605200002_review_summary_rpc.sql
scripts/supabase/migrations/202605200003_deal_status_consistency.sql
```

### Notes

- The active deployment backend is Rust + Axum via `api/index.rs`.
- User auth uses Supabase Auth access/refresh tokens in httpOnly cookies; profile
  data lives in Supabase Auth metadata. Auth responses return user data only and
  do not expose bearer tokens to frontend JavaScript.
- Google sign-in requires the Google provider to be enabled in Supabase Auth;
  the frontend still needs `VITE_GOOGLE_CLIENT_ID` for the Google button.
- Frontend realtime updates for feed items, comments, and owner events require
  `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY`; without them, the app falls
  back to ordinary API polling/loading behavior.
- Business, discovery, activity, saved businesses, claims, deals, reviews, and subscriptions use Supabase PostgREST through the Rust API.
- Subscription cancellation is business-scoped when needed and auth
  subscription metadata is recomputed from the user's highest active business
  subscription.
- Owner workflows authorize against `businesses.owner_id`; claims cannot take
  over already claimed or owner-linked listings.
- Owners cannot review their own listings; review aggregates are platform-owned
  and update as part of review writes through a Supabase RPC after migrations
  are applied.
- Business deal badges are platform-owned; `businesses.has_deals` is refreshed
  by a Supabase RPC/trigger after deal writes and has an API fallback before
  deployments apply the migration.
- Check-ins require either no coordinates or a complete valid latitude/longitude
  pair.
- Paid subscriptions start Stripe Checkout Sessions as `pending_checkout` and
  activate only after signed Stripe webhook payment confirmation.
- Discovery, nearby business search, activity pulse, and owner-event radius
  reads use PostGIS RPCs after the geo migration is applied, with backend
  compatibility fallbacks before deployment migration.
- Static Vercel responses and backend API responses apply security headers;
  private user, owner, and billing API responses use `no-store` cache-control.
- Business claiming does not contribute to Live Visibility Score; this invariant remains enforced in `backend/src/services/visibility_score.rs`.

## Next Steps

- Consolidate repeated frontend view helpers into shared utilities.
- Run live Supabase migration and realtime smoke tests against the target
  project.
- Add stronger moderation tooling beyond the current baseline abuse guards for
  fake reviews and coordinated engagement.
- Smoke-test signed Stripe webhook delivery against the deployed
  `/api/stripe/webhook` endpoint.
- Link or pull Vercel project settings locally before rerunning `npx vercel build`.
- Separate demo-only operational scripts from production deployment docs more aggressively.
