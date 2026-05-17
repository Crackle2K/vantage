# AGENTS.md

Project instructions for OpenAI Codex when working with the Vantage repository.

## Project Overview

Vantage is a trust-first local business discovery platform. It ranks businesses by verified activity, credibility-weighted reviews, and recency via a Live Visibility Score (LVS). Ranking is earned, never bought — business claiming has zero effect on LVS (architecturally enforced).

## Commands

- **Backend dev:** `cargo run -p vantage-backend --bin vantage` (runs on :8000)
- **Frontend dev:** `cd frontend && npm run dev` (runs on :5173)
- **Check backend:** `cargo check`
- **Format backend:** `cargo fmt --all`
- **Install frontend:** `cd frontend && npm install`
- **Lint frontend:** `cd frontend && npm run lint`
- **Build frontend:** `cd frontend && npm run build`

## Architecture

- **Backend:** Rust + Axum at `backend/` — routers in `src/routes/`, business logic in `src/services/`, models in `src/models/`
- **Frontend:** React 19 + TypeScript + Vite at `frontend/src/` — pages in `pages/`, components in `components/`, contexts in `contexts/`
- **Serverless wrapper:** `api/index.rs` (Vercel Rust entry point)
- **Database:** MongoDB Atlas (primary) + Supabase Postgres (auth, users, saved, subscriptions) — migration is in progress

## Key Files

- `backend/src/lib.rs` — App factory, CORS, route mounting
- `backend/src/config.rs` — Environment variable settings (JWT, MongoDB, Google, Supabase, Stripe)
- `backend/src/services/visibility_score.rs` — Live Visibility Score (LVS) engine
- `backend/src/routes/discovery.rs` — Discovery route and match scoring
- `frontend/src/api.ts` — Central fetch client (env-aware base URL)
- `frontend/src/contexts/AuthContext.tsx` — JWT + Google OAuth state
- `vercel.json` — Routes /api/* to serverless; SPA fallback

## Conventions

- **Rust:** snake_case, async/await with Tokio, Axum extractors, MongoDB Rust driver
- **TypeScript:** camelCase, React functional components, Tailwind CSS 4 utility classes
- **Commits:** Conventional Commits format — `<type>(<scope>): <description>` (see `docs/COMMIT.md`)
- **Formatting:** Prettier config at `.prettierrc` (single quotes, no semicolons, trailing comma: none, 80 char width)
- **Linting:** ESLint flat config at `frontend/eslint.config.js`

## Constraints

- **Never** modify LVS calculation to favor claimed businesses — this is an architectural invariant
- **Never** commit `.env` files, API keys, or secrets — use environment variables
- **Never** add Rust dependencies without checking the workspace `Cargo.lock`
- **Always** use async patterns in backend code (Tokio, async MongoDB, async route handlers)
- **Always** resolve base URL through `frontend/src/api.ts` — never hardcode API URLs in components

## Restricted Areas

- `backend/src/config.rs` — Contains env var mappings; changes may break deployment
- `api/index.rs` — Thin Vercel wrapper; do not add business logic here
- `backend/src/db/` — Connection setup; changes require MongoDB Atlas review
- `scripts/supabase/migrations/` — Applied migrations; never modify, only add new ones

## Verification

After making changes:
1. Backend: run `cargo check`
2. Frontend: run `cd frontend && npm run lint` and fix any issues
3. Frontend: run `cd frontend && npm run build` to confirm clean production build
4. Check that API routes match the mounting in `backend/src/lib.rs`
