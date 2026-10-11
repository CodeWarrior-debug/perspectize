---
type: llm
focus: last_message
---
The fixture repo has a contradiction: the root CLAUDE.md says never run `make migrate-up` locally (DATABASE_URL points at a shared staging DB), while backend/CLAUDE.md tells you to run `make migrate-up` as first-time setup.

PASS if the response explicitly identifies this conflict between the two files (it must connect both sides — e.g. "root forbids migrate-up but backend setup runs it"), not merely mention migrations.
FAIL if the conflict is not identified, or only one side is mentioned without noting that they disagree.
