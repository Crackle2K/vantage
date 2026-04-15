# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Vantage is a trust-first local business discovery app that ranks businesses by verified activity, credibility-weighted reviews, and recency. It is a full-stack app with a React/TypeScript frontend and a FastAPI/Python backend, deployed to Vercel.

## Commands

### Backend

```bash
# Create and activate virtual environment
python -m venv .venv
source .venv/Scripts/activate  # Windows

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
├── backend/         # FastAPI app (local dev / uvicorn)
│   ├── main.py      # App factory, CORS, route mounting
│   ├── config.py    # Settings from .env (JWT, MongoDB, Google APIs)
│   ├── database/    # Motor async MongoDB connection + index setup
│   ├── models/      # Pydantic request/response models
│   ├── routes/      # FastAPI routers (one file per domain)
│   └── services/    # Business logic (ranking, geo, Google Places, scoring)
├── api/
│   └── index.py     # Thin Vercel serverless wrapper around backend app
├── frontend/src/
│   ├── main.tsx     # React root: GoogleOAuthProvider, Router, AuthContext, ThemeContext
│   ├── api.ts       # Central fetch client; resolves base URL by environment
│   ├── pages/       # One component per route
│   ├── components/  # Shared UI and feature components
│   ├── contexts/    # AuthContext (JWT + Google OAuth state), ThemeContext
│   └── hooks/       # useSavedBusinesses and other custom hooks
└── vercel.json      # Routes /api/* → serverless function; SPA fallback
```

### Backend API Routes

Mounted under `/api/` prefix in `backend/main.py`:

| Router module | Path prefix |
|---|---|
| auth | `/api/auth` |
| businesses | `/api/businesses` |
| reviews | `/api/reviews` |
| deals | `/api/deals` |
| claims | `/api/claims` |
| subscriptions | `/api/subscriptions` |
| activity | `/api/activity` |
| discovery | `/api/discovery` |
| saved | `/api/saved` |
| users | `/api/users` |

### Key Architectural Decisions

- **Demo mode**: `config.py` exposes `DEMO_MODE` flag; `database/document_store.py` seeds from `data/demo_businesses.json` when enabled. Routes fall back to demo data if Supabase document storage is unreachable (`DatabaseUnavailableError`).
- **Ranking**: `services/visibility_score.py` and `services/match_score.py` compute per-business scores used by `routes/discovery.py`.
- **Google Places**: `services/google_places.py` enriches business data; results are cached in the `geo_cache` MongoDB collection.
- **Auth flow**: Frontend stores JWT in context (`AuthContext`). Backend issues JWTs via `routes/auth.py` using PyJWT. Google OAuth is handled both client-side (`@react-oauth/google`) and server-side (`google-auth`).
- **Frontend API client**: `frontend/src/api.ts` automatically picks the correct base URL (`localhost:8000` for dev, relative `/api` for Vercel production).

### MongoDB Collections

`users`, `businesses`, `reviews`, `deals`, `claims`, `checkins`, `activity_feed`, `owner_posts`, `credibility`, `subscriptions`, `visits`, `geo_cache`, `api_usage_log`, `saved`

## Commit Conventions

Follow the Conventional Commits format (see `COMMIT.md`):

```
<type>(<scope>): <description>
```

Types: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `build`, `chore`

Breaking changes: append `!` to the type or add `BREAKING CHANGE:` footer.
