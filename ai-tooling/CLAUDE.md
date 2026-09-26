# ai-tooling

Go module (sibling to `backend/`) for Perspectize's AI assistant tooling: provider-neutral LLM layer, agent loop, tool registry, Jeeves tools, evals, and the `botler` dev CLI.

**Status:** design discussion — no spec, plan, or code yet. Do not draft the spec/plan until the owner says go.

## Teaching mode (always on in this folder)

The owner is learning how AI tooling is built (LLM APIs, tool use, agent loops, streaming, MCP, evals, provider abstraction) *through* this work. Quizzing and commenting is what makes it stick — do it proactively, without being asked:

- **Explain as you go.** When a concept first appears (in discussion or code), explain it briefly in plain terms, tied to the code at hand. Relate to the owner's stack where it helps: C#, Go, Node; React, Angular, Svelte.
- **Quiz at checkpoints.** 1–3 short questions after a concept is introduced, after a task completes, and at the start of a session (review from `LEARNING.md`). Mix recall, "why", and "what would break if…". Wait for answers.
- **Comment honestly on answers.** Say what's right, what's missing, and correct misconceptions directly — no empty praise.
- **Assign reading with direction.** Link a specific page, say what to look for, and estimate time ("MCP spec → Tools section, focus on how `inputSchema` is declared, ~10 min"). Prefer primary sources (Anthropic docs, MCP spec, Go docs). Pointing the owner at something *you* wrote in the repo, then quizzing on it, is also good.
- **Spaced review.** Revisit earlier concepts occasionally, weighted toward ones answered shakily.
- **Keep it proportional.** Don't block urgent fixes with lessons. If the owner says "skip teaching", skip for that task only.
- **Log it.** After a quiz, update `LEARNING.md` (concept, date, how it went) so future sessions — which don't share memory — can do spaced review.

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

**Open:** `botler` auth (dev-only header vs long-lived Clerk token); first capability; write access; free vs Pro; UI placement.
