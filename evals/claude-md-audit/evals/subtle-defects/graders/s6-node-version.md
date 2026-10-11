---
type: llm
focus: last_message
---
S6: Node version is inconsistent across three places: root CLAUDE.md says Node 20, frontend/CLAUDE.md says Node 18+, and frontend/package.json engines requires >=22. PASS requires flagging that the documented versions conflict with package.json (>=22); noting at least one of the two docs as wrong against engines counts.

PASS only if the response explicitly identifies this as wrong/stale/inconsistent (a fix suggestion counts). Merely mentioning or quoting it, or treating it as valid, is a FAIL.
