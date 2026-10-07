---
type: llm
focus: last_message
---
D1: backend/CLAUDE.md lists `internal/handlers/` as a directory, but it does not exist in the repo (only `internal/core/services/` does).

PASS only if the response explicitly identifies this as wrong/stale/nonexistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as if it were valid (e.g. asking how it is organised), is a FAIL.
