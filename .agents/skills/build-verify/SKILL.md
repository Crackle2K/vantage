---
name: build-verify
description: Verify the frontend builds cleanly and the backend starts without import errors
command: verify
---

## What I do

- Run `npm run build` in the frontend to confirm a clean production build
- Verify the backend can be imported without errors (dry-run import check)
- Catch type errors, missing imports, and build configuration issues

## When to use me

Use `/verify` before pushing or deploying to confirm nothing is broken.

## How I work

1. Run `cd frontend && npm run build`
2. Run `python -c "from backend.main import app"` from repo root to verify backend imports
3. Report any errors with file paths and line numbers

## Output format

- If build succeeds: "Build verified — frontend and backend clean"
- If build fails: show the error output with file path and line number