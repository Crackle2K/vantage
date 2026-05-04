---
name: code-review
description: Review code changes for bugs, architectural violations, and Vantage-specific constraints
command: review
---

## What I do

- Review code diffs for bugs, logic errors, and security issues
- Check for violations of Vantage architectural invariants (LVS independence, async patterns, API URL usage)
- Verify style consistency with project conventions (snake_case Python, camelCase TypeScript, Conventional Commits)

## When to use me

Use `/review` when you want a second pair of eyes on code changes before committing.

## How I work

1. Read the provided files or diff
2. Check for Vantage constraint violations first:
   - LVS calculation must not favor claimed businesses
   - Backend must use async patterns (Motor, async/await)
   - Frontend API calls must go through `frontend/src/api.ts`
3. Identify bugs and logic errors
4. Check dependency changes against both `requirements.txt` and `api/requirements.txt`
5. Verify no secrets or `.env` references are committed

## Output format

- List issues by severity: **Critical** (constraint violations), **Warning** (bugs/potential errors), **Nitpick** (style/conventions)
- End with an overall assessment: Approve / Request Changes