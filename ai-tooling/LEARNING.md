# Learning Log

Spaced-review log for teaching mode (see `CLAUDE.md`). One row per concept; update after each quiz.

Confidence: `new` (introduced, not quizzed) → `shaky` → `solid`.

| Concept | Introduced | Last quizzed | Confidence | Notes |
|---|---|---|---|---|
| CLI vs MCP: who each serves, context-token cost, shell requirement | 2026-09-26 | — | new | |
| In-app assistant = direct API tool use (no CLI/MCP needed) | 2026-09-26 | 2026-09-26 | shaky | Got in-process service access; missed that CLI/MCP bridge *external* agents and the model-requests/backend-executes handshake |
| Tool = name + description + JSON Schema + handler (shared by API tool use and MCP) | 2026-09-26 | — | new | |
| Agent loop: model → tool calls → tool results → repeat | 2026-09-26 | — | new | |
| Provider port/adapter; normalizing tool-call + stream formats | 2026-09-26 | — | new | |
| In-process vs over-HTTP clients | 2026-09-26 | — | new | Go `internal/` rule forced HTTP for `botler` |
| Latency: tool round-trips + model time dominate, not network hops | 2026-09-26 | — | new | |
| Evals: deterministic vs model-graded, fixtures, multiple runs per case | 2026-09-26 | — | new | |
| Streaming transport: GraphQL subscription vs SSE | 2026-09-26 | — | new | |
