# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vantage is a trust-first local business discovery app that ranks businesses by verified activity, credibility-weighted reviews, and recency. It is a full-stack app with a React/TypeScript frontend and a FastAPI/Python backend, deployed to Vercel.

## Commands

### Backend

```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/Scripts/activate # Windows

# Install dependencies
pip install -r requirements.txt

# Run dev server (from repo root)
uvicorn backend.main:app --reload
# Backend runs on http://localhost:8000
```

### Frontend

```bash
cd frontend

# Install dependencies
npm install

# Start dev server
npm run dev
# Frontend runs on http://localhost:5173

# Lint
npm run lint

# Build
npm run build
```

## Architecture

### Full-Stack Layout

```
/
├── backend/          # FastAPI app (local dev / uvicorn)
│   ├── main.py       # App factory, CORS, rate limiting, route mounting
│   ├── config.py     # Settings from .env (JWT, MongoDB, Google APIs, Stripe, Supabase)
│   ├── database/     # document_store.py (unified async DB layer) + supabase.py client
│   ├── models/       # Pydantic request/response models
│   ├── routes/       # FastAPI routers (one file per domain)
│   └── services/     # Business logic (ranking, geo, Google Places, scoring, payments)
├── api/
│   └── index.py      # Thin Vercel serverless wrapper around backend app
├── data/
│   └── demo_businesses.json  # Seed data for demo/offline mode
├── frontend/src/
│   ├── main.tsx      # React root: GoogleOAuthProvider, Router, AuthContext, ThemeContext
│   ├── api.ts        # Central fetch client; resolves base URL by environment
│   ├── pages/        # One component per route
│   ├── components/   # Shared UI and feature components
│   ├── contexts/     # AuthContext (JWT + Google OAuth state), ThemeContext
│   ├── hooks/        # useSavedBusinesses and other custom hooks
│   ├── lib/          # Shared utilities
│   └── types/        # TypeScript type definitions
└── vercel.json       # Routes /api/* → serverless function; SPA fallback
```

### Backend API Routes

Mounted under `/api/` prefix in `backend/main.py`:

| Router module  | Path prefix          |
|---|---|
| auth           | `/api/auth`          |
| businesses     | `/api/businesses`    |
| reviews        | `/api/reviews`       |
| deals          | `/api/deals`         |
| claims         | `/api/claims`        |
| subscriptions  | `/api/subscriptions` |
| activity       | `/api/activity`      |
| discovery      | `/api/discovery`     |
| saved          | `/api/saved`         |
| users          | `/api/users`         |
| location       | `/api/location`      |

### Key Architectural Decisions

- **Demo mode**: `config.py` exposes `DEMO_MODE` flag; `database/document_store.py` seeds from `data/demo_businesses.json` when enabled. Routes fall back to demo data if Supabase document storage is unreachable (`DatabaseUnavailableError`).
- **Document store**: `database/document_store.py` is the unified async database layer. It wraps Supabase with a Motor-compatible cursor/aggregation API, making the storage backend swappable without touching route logic.
- **Supabase**: `database/supabase.py` provides the Supabase client with retry/timeout logic and service-role key auth. User auth, profiles, and password management are backed by Supabase; remaining collections still use MongoDB via Motor.
- **Ranking**: `services/visibility_score.py` and `services/match_score.py` compute per-business scores used by `routes/discovery.py`.
- **Google Places**: `services/google_places.py` enriches business data; results are cached in the `geo_cache` MongoDB collection. `services/photo_proxy.py` caches Place photos and serves SVG fallbacks.
- **Location**: `routes/location.py` exposes `/api/location/reverse` for reverse geocoding via the Google Geocoding API. `services/geo_service.py` provides shared geolocation utilities.
- **Auth flow**: Frontend stores JWT in context (`AuthContext`). Backend issues JWTs via `routes/auth.py` using PyJWT. Google OAuth is handled both client-side (`@react-oauth/google`) and server-side (`google-auth`). Stripe customer IDs are stored alongside user records for subscription context.
- **Payments**: `services/stripe_service.py` handles subscription lifecycle with Stripe. `routes/subscriptions.py` exposes the billing API. Subscription models include `customer_id`, `subscription_id`, and `price_id` fields.
- **Rate limiting**: `slowapi` is configured in `main.py` to throttle endpoints by IP.
- **Frontend API client**: `frontend/src/api.ts` automatically picks the correct base URL (`localhost:8000` for dev, relative `/api` for Vercel production).

### Services

| Service file                  | Responsibility                                      |
|-------------------------------|-----------------------------------------------------|
| `visibility_score.py`         | Live Visibility Score computation                   |
| `match_score.py`              | Query-to-business relevance scoring                 |
| `google_places.py`            | Google Places API enrichment + geo_cache writes     |
| `photo_proxy.py`              | Place photo caching and SVG fallback generation     |
| `geo_service.py`              | Geolocation utilities (distance, cell hashing)      |
| `stripe_service.py`           | Stripe subscription and customer lifecycle          |
| `local_business_classifier.py`| ML-based business category classification           |
| `business_metadata.py`        | Metadata normalization (known_for, descriptions)    |

### MongoDB Collections

`users`, `businesses`, `reviews`, `deals`, `claims`, `checkins`, `activity_feed`, `owner_posts`, `credibility`, `subscriptions`, `visits`, `geo_cache`, `api_usage_log`, `saved`

User auth and profiles are now primarily stored in Supabase; the `users` collection retains legacy fields and Stripe metadata.

## Commit Conventions

Follow the Conventional Commits format (see `COMMIT.md`):

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `build`, `chore`

Breaking changes: append `!` to the type or add `BREAKING CHANGE:` footer.
