# ai-tooling

Go module (sibling to `backend/`) for Perspectize's AI assistant tooling: provider-neutral LLM layer, agent loop, tool registry, Jeeves tools, evals, and the `botler` dev CLI.

**Status:** Milestone v1.2 (Phases 25–28, `.planning/ROADMAP.md`; requirements `.planning/v1.2-REQUIREMENTS.md`; research `.planning/v1.2-research/`). Phase 25 first plan ready: `docs/superpowers/plans/2026-09-26-app-guide-plan.md` (spec alongside in `docs/superpowers/specs/`). Phase 25 in progress: `appguide` package (parser + lint) built; guide content being written.

## Teaching mode (always on in this folder)

The owner is learning how AI tooling is built (LLM APIs, tool use, agent loops, streaming, MCP, evals, provider abstraction) *through* this work. Quizzing and commenting is what makes it stick — do it proactively, without being asked:

- **Explain as you go.** When a concept first appears (in discussion or code), explain it briefly in plain terms, tied to the code at hand. Relate to the owner's stack where it helps: C#, Go, Node; React, Angular, Svelte.
- **Quiz at checkpoints.** 1–3 short questions after a concept is introduced, after a task completes, and at the start of a session (review from `LEARNING.md`). Mix recall, "why", and "what would break if…". Wait for answers.
- **Comment honestly on answers.** Say what's right, what's missing, and correct misconceptions directly — no empty praise.
- **Assign reading with direction.** Link a specific page, say what to look for, and estimate time ("MCP spec → Tools section, focus on how `inputSchema` is declared, ~10 min"). Prefer primary sources (Anthropic docs, MCP spec, Go docs). Pointing the owner at something *you* wrote in the repo, then quizzing on it, is also good.
- **Spaced review.** Revisit earlier concepts occasionally, weighted toward ones answered shakily.
- **Keep it proportional.** Don't block urgent fixes with lessons. If the owner says "skip teaching", skip for that task only.
- **Log it.** After a quiz, update `LEARNING.md` (concept, date, how it went) so future sessions — which don't share memory — can do spaced review.

### Teaching in specs and plans

Every ai-tooling spec and plan builds teaching in; it isn't bolted on afterwards:

- **Spec:** a short "Learning objectives" section listing the concepts the work teaches.
- **Plan, per task:** a `Learn` block with the concept(s) the task introduces, one directed reading (link, what to look for, time), and 1–3 quiz questions to ask *after* the task, before starting the next one.
- **Plan, per phase:** a review checkpoint (a quiz spanning the phase, with `LEARNING.md` updated), and at least one **owner-implements** task (a small, well-scoped piece, e.g. one tool or one eval case) that the owner writes and Claude reviews. The owner can opt out of any of these.
- **Execution:** subagents can't talk to the owner, so teaching happens in the main session at task boundaries. Prefer `superpowers:executing-plans` in the main session. If `subagent-driven-development` is used, the main session runs each task's `Learn` block with the owner before dispatching the next task.

## Gotchas

- `go:embed` fails to compile if a pattern matches no files — embed directories that always hold a README (`//go:embed guide seeds`), and skip READMEs in the loader.
- Local `go` may be older than `go.mod`'s `toolchain go1.26.0`; `go` auto-downloads it through the proxy on first run in the module dir (takes ~a minute).

## Locked decisions (from design discussion, 2026-09-26)

1. In-app Jeeves first (Go backend runs Claude tool use), MCP server later.
2. Code lives here, as its own Go module; backend imports it in the in-app phase (Docker build context must then move to repo root — Sevalla setting).
3. Provider-neutral core: own message/event types; Anthropic adapter first, OpenRouter/BYOK later. SDK types never leak outside an adapter.
4. `botler` dev CLI talks to the backend over GraphQL (Go forbids importing `backend/internal`).
5. `PerspectizeData` interface with three implementations: GraphQL (CLI/MCP), fixtures (evals/tests), in-process services (in-app, lives in backend).
6. Evals are first-class: deterministic checks first, fixture data, model × prompt-version matrix; they gate the OpenRouter pivot.
7. Browser streaming via GraphQL subscription on the existing WebSocket transport — input on the subscription, batched text deltas.
8. Users see "Jeevesbot" by default (renamable); code stays neutral (`assistant`); CLI is `botler`. Trademark check before launch.
9. Go over TypeScript/Python/Rust/Mojo; gRPC not now (interface leaves room).
10. Progressive tool discovery to avoid token bloat: in-app sends per-page tool sets; MCP exposes a small intent-level core + a discovery tool (`find_tools`), uses resources for reference content, treats `tools/list_changed` as an enhancement only. Evals record tool-definition tokens per session.
11. Milestone is progressive: only the next phase is planned in detail; later phases are goal + scope + exit gate, re-planned from what the previous phase learned.

**Open:** `botler` auth (dev-only header vs long-lived Clerk token); first capability; write access; free vs Pro; UI placement.
