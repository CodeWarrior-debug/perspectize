---
type: llm
focus: last_message
---
S2: backend/CLAUDE.md prose says the shared validation rules live under `internal/validate/`; that directory does not exist — they are in `internal/core/validation/`.

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
