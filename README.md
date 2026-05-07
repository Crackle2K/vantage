<div align="center">

# Vantage

[![Build](https://img.shields.io/badge/build-passing-brightgreen)](https://vercel.com)
[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.11x-009688?logo=fastapi&logoColor=white)](https://fastapi.tiangolo.com)
[![Python](https://img.shields.io/badge/Python-3.11+-3776AB?logo=python&logoColor=white)](https://www.python.org)
[![Supabase](https://img.shields.io/badge/Supabase-Database-3ECF8E?logo=supabase&logoColor=white)](https://supabase.com)

</div>

## About the Business

**What is Vantage?**
Vantage is a trust-first local business discovery platform. We surface the best nearby businesses through a real-time ranking engine — the Live Visibility Score (LVS) — powered by verified in-person visits, credibility-weighted reviews, and community activity signals. Unlike Google Maps or Yelp, visibility on Vantage is earned through genuine behavior, not advertising spend or SEO dominance.

**What Service Do We Offer?**
Vantage provides two interconnected services:
- **For consumers:** A hyperlocal discovery experience that shows which independent businesses are genuinely active and trusted in their neighborhood right now — not which ones paid the most for placement.
- **For business owners:** A fair, merit-based visibility platform where a new café or family-run shop competes on the quality of their real-world activity, not their marketing budget. Owners can claim profiles, post events, create deals, and build credibility through verified customer engagement.

**Is This a Need or a Want?**
Vantage addresses a genuine need. Consumers increasingly distrust static star ratings and pay-to-play discovery platforms. Independent local businesses are being systematically buried by chain advertising and SEO spend on existing platforms. Vantage solves the real problem of unfair, unreliable local discovery — making it a trust infrastructure need for local economies, not a luxury feature.

**Who Is Our Target Consumer?**
- **Urban and suburban consumers** (ages 18–45) who regularly dine out, shop local, or explore their city and are frustrated by biased or stale results on existing platforms.
- **Independent business owners** — cafés, restaurants, boutiques, gyms, salons — who rely on community foot traffic and want fair, earned exposure to local customers.
- **Community-minded users** who value supporting local over chain businesses and want their recommendations to carry real weight.

**What Motivated Us to Start Vantage?**
The motivation is straightforward: local independent businesses are the backbone of communities, yet they are losing ground to chains that can outspend them on ads, SEO, and review manipulation. Every dollar that flows to a local business stays in the community. Vantage exists to level that playing field — to give independent businesses the same shot at visibility that was once only available to corporations with marketing departments. We believe that if a neighborhood café is packed every morning because it's genuinely great, the whole community deserves to know about it.

**Why You Should Invest in Vantage**
- **Defensible technical moat:** The Live Visibility Score is architecturally manipulation-proof — claim status, ad spend, and review volume have zero effect on rankings. Only verified real-world activity counts. This is not a policy; it is enforced in the codebase.
- **Massive underserved market:** Independent local businesses represent the overwhelming majority of all businesses globally, yet no major discovery platform truly serves their interests.
- **Network effects:** The platform grows more valuable as community activity increases. Every check-in, review, and owner event makes rankings more accurate for everyone in the neighborhood.
- **Multiple revenue streams:** Subscription tiers for business owners (deals, enhanced profiles, analytics) alongside a consumer-side platform with strong engagement and retention signals.
- **Mission-aligned growth:** The business model is aligned with user trust. We earn revenue when businesses earn real customer engagement — not when they pay for fake visibility.

## Setup

```bash
python -m venv venv
venv\Scripts\activate
pip install -r requirements.txt
uvicorn backend.main:app --reload
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Frontend default URL: `http://localhost:5173`

## Supabase Setup

Vantage can now use Supabase directly for authentication and user profile storage.

### Configure backend environment

Add these values in `backend/.env` (see `backend/.env.example`):

- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`

Recommended initial values:

- `DB_READ_PROVIDER=mongo` for the remaining legacy data paths
- `DB_WRITE_MODE=mongo` until the rest of the backend is rewritten

### Run the Supabase users schema

Execute:

- `scripts/supabase/migrations/000_users.sql`

### Notes

- User auth, login, profile updates, password changes, and account deletion are now backed by Supabase users storage.
- The remaining business/discovery/activity routes still use the existing Mongo-backed implementation and will need to be rewritten separately.

## Next Steps

- Consolidate repeated frontend view helpers into shared utilities.
- Add route-level backend tests for ranking, auth guards, and saved/check-in flows.
- Add stronger moderation tooling for fake reviews and coordinated engagement.
- Separate demo-only operational scripts from production deployment docs more aggressively.
