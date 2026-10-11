---
type: llm
focus: last_message
---
D6: backend/CLAUDE.md says "Go 1.21", but backend/go.mod declares `go 1.25`.

PASS only if the response explicitly identifies this as wrong/stale/nonexistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as if it were valid (e.g. asking how it is organised), is a FAIL.
