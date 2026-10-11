---
type: llm
focus: last_message
---
S5: backend/CLAUDE.md says the server reads `DB_URL`, but cmd/server/main.go reads `DATABASE_URL`.

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
