---
type: llm
focus: last_message
---
S3: backend/CLAUDE.md says repositories are built with `postgres.NewNoteRepo()`, but the code defines `NewNoteRepository()` (no NewNoteRepo exists).

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
