---
type: llm
focus: last_message
---
R2: frontend/CLAUDE.md architecture tree annotates `+layout.ts` as "Layout config (prerender = true)", but frontend/src/routes/+layout.ts sets `prerender = false` (and `ssr = false`).

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
