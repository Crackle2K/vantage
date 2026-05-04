# AGENTS.md

Project instructions for OpenAI Codex when working with the Vantage repository.

## Project Overview

Vantage is a trust-first local business discovery platform. It ranks businesses by verified activity, credibility-weighted reviews, and recency via a Live Visibility Score (LVS). Ranking is earned, never bought — business claiming has zero effect on LVS (architecturally enforced).

## Commands

- **Backend dev:** `source .venv/Scripts/activate && uvicorn backend.main:app --reload` (runs on :8000)
- **Frontend dev:** `cd frontend && npm run dev` (runs on :5173)
- **Install backend:** `pip install -r requirements.txt`
- **Install frontend:** `cd frontend && npm install`
- **Lint frontend:** `cd frontend && npm run lint`
- **Build frontend:** `cd frontend && npm run build`

## Architecture

- **Backend:** FastAPI (Python) at `backend/` — routers in `routes/`, business logic in `services/`, Pydantic models in `models/`
- **Frontend:** React 19 + TypeScript + Vite at `frontend/src/` — pages in `pages/`, components in `components/`, contexts in `contexts/`
- **Serverless wrapper:** `api/index.py` (Vercel entry point)
- **Database:** MongoDB Atlas (primary) + Supabase Postgres (auth, users, saved, subscriptions) — migration is in progress

## Key Files

- `backend/main.py` — App factory, CORS, route mounting
- `backend/config.py` — Environment variable settings (JWT, MongoDB, Google, Supabase, Stripe)
- `backend/services/visibility_score.py` — Live Visibility Score (LVS) engine
- `backend/services/match_score.py` — Discovery match scoring
- `frontend/src/api.ts` — Central fetch client (env-aware base URL)
- `frontend/src/contexts/AuthContext.tsx` — JWT + Google OAuth state
- `vercel.json` — Routes /api/* to serverless; SPA fallback

## Conventions

- **Python:** snake_case, async/await everywhere, Pydantic v2 models, Motor for MongoDB
- **TypeScript:** camelCase, React functional components, Tailwind CSS 4 utility classes
- **Commits:** Conventional Commits format — `<type>(<scope>): <description>` (see `docs/COMMIT.md`)
- **Formatting:** Prettier config at `.prettierrc` (single quotes, no semicolons, trailing comma: none, 80 char width)
- **Linting:** ESLint flat config at `frontend/eslint.config.js`

## Constraints

- **Never** modify LVS calculation to favor claimed businesses — this is an architectural invariant
- **Never** commit `.env` files, API keys, or secrets — use environment variables
- **Never** add dependencies without updating both `requirements.txt` (root) and `api/requirements.txt` (Vercel serverless)
- **Always** use async patterns in backend code (Motor async MongoDB, async route handlers)
- **Always** resolve base URL through `frontend/src/api.ts` — never hardcode API URLs in components

## Restricted Areas

- `backend/config.py` — Contains env var mappings; changes may break deployment
- `api/index.py` — Thin Vercel wrapper; do not add business logic here
- `backend/database/` — Connection setup and indexing; changes require MongoDB Atlas review
- `scripts/supabase/migrations/` — Applied migrations; never modify, only add new ones

## Verification

After making changes:
1. Backend: restart uvicorn and verify no import/startup errors
2. Frontend: run `cd frontend && npm run lint` and fix any issues
3. Frontend: run `cd frontend && npm run build` to confirm clean production build
4. Check that API routes match the mounting in `backend/main.py`