# COMMIT FORMATING

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

## Types

| Type | Purpose |
|------|---------|
| `feat` | New feature |
| `fix` | Bug fix |
| `docs` | Documentation only |
| `style` | Formatting, whitespace |
| `refactor` | Code restructure, no behavior change |
| `perf` | Performance improvement |
| `build` | Build system or dependency changes |
| `chore` | Miscellaneous maintenance |

**Breaking changes** - use `!` after the type or add a `BREAKING CHANGE:` footer.

## Rules

- **Type is required.** Must be a noun (`feat`, `fix`, etc.) followed by `:` and a space.
- **Description is required.** A short summary immediately after the type/scope prefix.
- **Body is optional.** Begins one blank line after the description. Free-form, any number of paragraphs.
- **`BREAKING CHANGE` must be uppercase** and can appear as a footer token or as `!` before the `:`.

## Breaking Changes

Two equivalent ways to mark a breaking change:

```
feat!: drop support for Node 6
```

```
feat: drop support for Node 6

BREAKING CHANGE: uses JavaScript features not available in Node 6.
```

Both can be combined for extra visibility:

```
feat(api)!: remove deprecated endpoint

BREAKING CHANGE: /v1/users endpoint has been removed. Use /v2/users instead.
```

--

## Examples

```
# Simple fix
fix: correct off-by-one error in pagination

# Feature with scope
feat(auth): add OAuth2 login support

# Breaking change with !
feat!: replace config format from JSON to YAML

BREAKING CHANGE: config files must now use .yaml extension and YAML syntax.

# Fix with body
fix: prevent race condition in request handling

Introduce a request ID and reference to the latest request.
Dismiss responses from any request other than the latest.

# Docs-only change
docs: update API authentication examples in README

# Revert
revert: let us never again speak of the noodle incident
```