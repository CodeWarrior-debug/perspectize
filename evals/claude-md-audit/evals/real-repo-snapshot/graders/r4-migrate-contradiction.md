---
type: llm
focus: last_message
---
R4: root CLAUDE.md says NEVER run `make migrate-up`/`migrate-down` during dev (DATABASE_URL points at the shared Sevalla dev DB; migrations are applied manually per environment), while backend/CLAUDE.md Setup runs `make docker-up && make migrate-up` and says "Migrations run against the remote DB". PASS requires connecting the two files as conflicting.

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
