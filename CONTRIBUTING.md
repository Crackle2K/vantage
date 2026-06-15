# Contributing to Vantage

Thanks for your interest in contributing! This document covers everything you need to get up and running.

If you disagree with anything here, [open an issue](https://github.com/Crackle2K/vantage/issues/new) to discuss it.

## Table of Contents

1. [Project overview](#project-overview)
2. [Getting started](#getting-started)
3. [Branch names](#branch-names)
4. [Commit messages](#commit-messages)
5. [Making a pull request](#making-a-pull-request)
6. [Code standards](#code-standards)
7. [Invariants](#invariants)

## Project overview

Vantage is a trust-first local business discovery platform. The Live Visibility Score (LVS) ranks businesses by verified activity, credibility-weighted reviews, recency, and community signals. Claiming or paying for a listing has zero effect on LVS — that invariant is non-negotiable.

The stack:

- **Backend** — Rust + Axum, deployed as a Vercel serverless function
- **Frontend** — React + TypeScript + Tailwind CSS
- **Database/Auth** — Supabase (PostgREST, Auth, Storage, Realtime)
- **Payments** — Stripe

## Getting started

### Prerequisites

- [Rust](https://rustup.rs/) (stable)
- [Node.js](https://nodejs.org/) 20+
- [Supabase CLI](https://supabase.com/docs/guides/cli) (for local database development and migrations)
- A Supabase project with the migrations applied (see `scripts/supabase/migrations/`)

### Backend

```bash
cargo run -p vantage-backend --bin vantage
```

Runs on `http://localhost:8000`. Other useful commands:

```bash
cargo check
cargo fmt --all
cargo clippy --all-targets --all-features -- -D warnings
cargo test
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`. Other useful commands:

```bash
npm run lint
npm run build
npm audit --audit-level=high
```

### Environment variables

Copy `.env.example` to `.env` and fill in your Supabase URL, anon key, and any other required values. Never commit `.env` files or secrets.

## Branch names

- All lowercase
- Use `-` as a word separator
- Include a short descriptor of the change (e.g. `fix-lvs-recency-weight`, `feat-deal-expiry`)

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <description>
```

| Type | When to use |
|------|-------------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting or visual changes |
| `refactor` | Code restructure, no behavior change |
| `perf` | Performance improvement |
| `build` | Build system or dependency changes |
| `chore` | Miscellaneous maintenance |

Rules:

- Keep the description under 72 characters
- Use the imperative mood ("add", not "added" or "adds")
- Each commit should represent one logical unit of change
- For breaking changes, add `!` after the type or a `BREAKING CHANGE:` footer

Examples:

```
feat(reviews): add credibility-weighted score to review feed

fix(lvs): correct recency decay for businesses inactive > 90 days

docs: add setup instructions for local Supabase
```

## Making a pull request

1. Fork the repository and create a branch off `main`.
2. Make your changes and verify them locally (run tests, lint, and check the UI if applicable).
3. Open a pull request against `main` with:
   - A clear title following the commit format above
   - A description covering what changed, why, and anything a reviewer needs to know
4. Address any review feedback and keep your branch up to date with `main`.

PRs are squash-merged, so your branch history does not need to be perfectly clean — but each commit should still represent a coherent unit of work.

## Code standards

### Rust

- Run `cargo fmt --all` before committing.
- Run `cargo clippy --all-targets --all-features -- -D warnings` and fix all warnings.
- Use `cargo test` to confirm nothing is broken.
- Data access goes through the Supabase/PostgREST helpers in `backend/src/db/supabase.rs`. Do not bypass them.

### TypeScript / React

- Run `npm run lint` before committing.
- All API calls must go through `frontend/src/api.ts` — never fetch directly from a component.
- Keep components focused; shared logic belongs in `frontend/src/hooks/` or `frontend/src/lib/`.

### Database

- Never edit applied migrations. Add a new migration file instead.
- Follow the naming convention: `YYYYMMDDNNNN_short_description.sql`.
- Test migrations against a local Supabase instance before opening a PR.

## Invariants

These are hard rules — PRs that break them will not be merged:

- **LVS is neutral.** Claimed businesses, paid subscribers, and ad spend must never receive a scoring advantage.
- **No secrets in commits.** Never commit `.env` files, API keys, or credentials.
- **Auth stays server-side.** Bearer tokens must not be exposed to frontend JavaScript. Protected routes verify Supabase-signed tokens from httpOnly cookies.
- **Stripe webhooks are authoritative.** Paid subscriptions activate only after a signed Stripe webhook confirmation.
- **Owners cannot review their own listings.**
