---
type: llm
focus: last_message
---
S4: frontend/CLAUDE.md lists `pnpm run check` for type-checking, but package.json has no `check` script — it is `typecheck`.

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
