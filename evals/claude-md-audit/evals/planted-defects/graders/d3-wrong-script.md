---
type: llm
focus: last_message
---
D3: frontend/CLAUDE.md lists `pnpm run test:unit`, but frontend/package.json has no such script (the real one is `test:run`).

PASS only if the response explicitly identifies this as wrong/stale/nonexistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as if it were valid (e.g. asking how it is organised), is a FAIL.
