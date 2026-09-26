# Learning Log

Spaced-review log for teaching mode (see `CLAUDE.md`). One row per concept; update after each quiz.

Confidence: `new` (introduced, not quizzed) → `shaky` → `solid`.

| Concept | Introduced | Last quizzed | Confidence | Notes |
|---|---|---|---|---|
| CLI vs MCP: who each serves, context-token cost, shell requirement | 2026-09-26 | — | new | |
| In-app assistant = direct API tool use (no CLI/MCP needed) | 2026-09-26 | 2026-09-26 | shaky | Got in-process service access; missed that CLI/MCP bridge *external* agents and the model-requests/backend-executes handshake |
| Tool = name + description + JSON Schema + handler (shared by API tool use and MCP) | 2026-09-26 | — | new | |
| Agent loop: model → tool calls → tool results → repeat | 2026-09-26 | 2026-09-26 | shaky | Asked for the answer (calls = tool rounds + 1; parallel calls share a round; each call resends history). Re-quiz soon |
| Provider port/adapter; normalizing tool-call + stream formats | 2026-09-26 | 2026-09-26 | solid | Named the OpenRouter/DeepSeek switch. Added: test fakes + SDK upgrades as sooner pain points |
| In-process vs over-HTTP clients | 2026-09-26 | — | new | Go `internal/` rule forced HTTP for `botler` |
| Latency: tool round-trips + model time dominate, not network hops | 2026-09-26 | — | new | |
| Stateless API: tools + system + history resent every call → tool bloat compounds; progressive tool discovery | 2026-09-26 | 2026-09-26 | shaky | Knew the goal (avoid bloat); "stateless" reason was explained, not answered |
| Evals: deterministic vs model-graded, fixtures, multiple runs per case | 2026-09-26 | — | new | |
| Streaming transport: GraphQL subscription vs SSE | 2026-09-26 | — | new | |
| Closed loop: independent verifier + objective completion condition + failure feedback path + round cap | 2026-09-26 | 2026-09-26 | solid | Named verifier + completion condition; added feedback path, ground-truth checks, escalation cap. Follow-up: conflated open loop (no feedback) with non-terminating loop (feedback, no exit) — re-check |
| Context discipline: small tasks in fresh subagents (vs. % caps) | 2026-09-26 | — | new | |
| Guide format: concise plain English + scoped loading beats caveman compression | 2026-09-26 | — | new | Measurable later via evals A/B |
| go:embed is directory-scoped (no `..`); Go `internal/` is subtree-private, one-way deps backend → ai-tooling | 2026-09-26 | 2026-09-26 | shaky | Asked for the answer; C# `internal` analogy given. Re-quiz |
| Tracer bullets: thin real end-to-end slice first, then widen (≠ prototype, ≠ spike) | 2026-09-26 | — | new | Owner proposed it; applied as Tracer 1 (guide→loop→botler→eval) + Tracer 2 (backend→subscription→sidebar) |

## Pending (owner asked Claude to keep building without waiting — run these when the owner is back)

- [x] Task 1 quiz — owner asked for the answer (go:embed dir-scoped, no `..`; Go `internal/` rule is subtree-private). Log: shaky → re-quiz later
- [ ] Task 1 reading: pkg.go.dev/embed — "Directives" section
- [ ] Task 2 quiz: (1) which lint rule most protects future evals, and why; (2) one guide error lint can't catch that the verifier can
- [ ] Task 3 owner-implements: write `settings.change-theme` in `appguide/guide/settings.md` (reserved; Claude reviews it)
- [ ] Task 3 quiz: (1) why "Not supported" lines; (2) which claim in your entry a verifier would check first, against which file
- [ ] MCP Tools reading (modelcontextprotocol.io → Concepts → Tools, tool annotations) + one question
- [ ] Re-quiz shaky rows above (agent loop call count, stateless API, in-app handshake, open vs non-terminating loop)
