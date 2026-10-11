---
type: llm
focus: last_message
---
R7: backend/CLAUDE.md architecture tree lists `internal/middleware/` (HTTP middleware), but that directory does not exist — middleware lives in `backend/pkg/middleware/`.

PASS only if the response explicitly identifies this as wrong/stale/nonexistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
