---
name: lint-check
description: Run linting and static analysis on the Vantage codebase
command: lint
---

## What I do

- Run ESLint on the frontend TypeScript/React code
- Check Python files for common issues (syntax, imports, unused variables)
- Report all findings grouped by severity

## When to use me

Use `/lint` after making code changes to verify you haven't introduced lint errors.

## How I work

1. Run `cd frontend && npm run lint` for ESLint checks
2. Scan modified Python files for common issues (undefined names, unused imports, syntax errors)
3. Report results clearly

## Output format

- Group by file, then by severity (Error / Warning)
- If all checks pass, confirm with a brief summary