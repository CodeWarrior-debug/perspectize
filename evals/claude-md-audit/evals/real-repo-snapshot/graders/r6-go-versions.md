---
type: llm
focus: last_message
---
R6: backend/CLAUDE.md Go version section says go.mod has `go 1.25` (and Stack says "Go 1.25+") with Dockerfile base `golang:1.26-alpine`; actually go.mod declares `go 1.26` and the Dockerfile uses `golang:1.27-alpine`. Flagging either the go.mod minimum or the Dockerfile image as stale counts.

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
