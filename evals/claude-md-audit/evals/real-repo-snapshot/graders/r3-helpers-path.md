---
type: llm
focus: last_message
---
R3: backend/CLAUDE.md (Deep Modules section) places GraphQL mapping helpers at `adapters/graphql/helpers.go` (and resolver files at `adapters/graphql/{content,...}.resolvers.go`); the real location is `internal/adapters/graphql/resolvers/` (helpers.go and *.resolvers.go live there). Flagging either path as wrong/missing the `resolvers/` segment counts.

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
