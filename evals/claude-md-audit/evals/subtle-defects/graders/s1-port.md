---
type: llm
focus: last_message
---
S1: frontend/CLAUDE.md says the dev proxy forwards `/api` to port 3000, but frontend/vite.config.ts proxies to http://localhost:8080 (and the API listens on :8080).

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
