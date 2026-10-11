---
type: llm
focus: last_message
---
D2: backend/CLAUDE.md lists `make seed`, but backend/Makefile has no `seed` target (only run, test, lint, migrate-up).

PASS only if the response explicitly identifies this as wrong/stale/nonexistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as if it were valid (e.g. asking how it is organised), is a FAIL.
