---
type: llm
focus: last_message
---
R5: backend/CLAUDE.md CORS section says CORS "currently allows all origins (*)", but cmd/server/main.go restricts AllowedOrigins to configured origins (secCfg.CORSOrigins).

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
