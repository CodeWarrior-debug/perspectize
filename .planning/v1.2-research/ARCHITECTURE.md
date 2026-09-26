# Architecture Research: v1.2 Jeeves AI Assistant

**Domain:** In-app LLM assistant (tool-using agent loop) added to an existing Go/gqlgen hexagonal backend and a static SvelteKit frontend
**Researched:** 2026-09-26
**Confidence:** HIGH for integration points (read directly from the codebase), MEDIUM for provider/SDK behaviour (training data plus official docs where cited)

> Scope: only what v1.2 adds or changes. Locked decisions in `ai-tooling/CLAUDE.md` are taken as given. This document designs *within* them.

---

## Standard Architecture

### System Overview

```
┌──────────────────────────── frontend/ (SvelteKit, adapter-static) ────────────────────────────┐
│  AssistantSidebar.svelte ── useAssistantTurn.svelte.ts ── subscribeGraphql() (existing)        │
│        │  page id + context ids from route          │  shares the ONE graphql-ws socket        │
│        │  confirm card → existing TanStack mutation (updatePerspective etc., normal @auth/@owner)│
└────────┼────────────────────────────────────────────┼──────────────────────────────────────────┘
         │ WS: subscription assistantTurn(input)      │
┌────────▼──────────────────────── backend/ (Go module, imports ai-tooling) ─────────────────────┐
│  transport.Websocket InitFunc (existing) → auth.WithAuthenticatedUser(ctx)                      │
│  resolvers/assistant.resolvers.go  (NEW, primary adapter)                                        │
│     │ auth.ForContext → rate-limit gate → Runner.StartTurn(ctx, viewer, input)                   │
│  adapters/assistant/  (NEW)                                                                      │
│     ├─ runner.go        builds per-turn: system prompt + page guide + page toolset + data impl   │
│     ├─ inprocess.go     PerspectizeData impl over core/ports/services (viewer-bound)             │
│     ├─ usage_recorder.go  agent.Observer → AssistantUsageRepository (Postgres)                   │
│     └─ limits.go        per-user turn limiter + daily token budget + 1 active turn per user      │
│  core/services (existing Content/Perspective/User/Category services, privacy fix pushed down)    │
│  adapters/repositories/postgres  (+ gorm_assistant_usage_repository.go, + assistant name column) │
└────────┬────────────────────────────────────────────────────────────────────────────────────────┘
         │ go import (replace => ../ai-tooling)  — dependency points backend → ai-tooling ONLY
┌────────▼──────────────────────── ai-tooling/ (sibling Go module, no backend imports) ───────────┐
│  llm/        neutral Message/ContentBlock/ToolDef/Event/Usage types + Provider port             │
│  llm/anthropic/   adapter (SDK types stay inside)      llm/openrouter/  (later phase)            │
│  agent/      loop: provider stream → tool calls → registry dispatch → repeat (round cap)        │
│  tools/      Registry (name, description, JSON Schema, handler) + Toolset selection             │
│  jeeves/     read-only tools over PerspectizeData port; DTOs; ToolsetFor(page); conformance test │
│  jeeves/data/graphqlclient/  PerspectizeData over HTTP GraphQL (botler, future MCP)             │
│  jeeves/data/fixture/        PerspectizeData over embedded JSON fixtures (evals, tests)         │
│  guide/      //go:embed pages/*.md → ForPage(page), Read(topic), Version()                       │
│  prompt/     system prompt assembly + version hash                                               │
│  evals/      cases, deterministic checks, matrix runner, token/latency capture                  │
│  cmd/botler/ tools list | tools call | chat | eval                                               │
└────────┬────────────────────────────────────────────────────────────────────────────────────────┘
         │ HTTPS streaming
   Anthropic Messages API  (later: OpenRouter, OpenAI-compatible)
```

### Component Responsibilities

| Component | New / Modified | Responsibility | Implementation |
|---|---|---|---|
| `ai-tooling/llm` | NEW | Provider-neutral types (`Message`, `ContentBlock{Text,ToolUse,ToolResult}`, `ToolDef`, `Event{TextDelta,ToolCall,Usage,Stop,Error}`) and `Provider` interface `Stream(ctx, Request) (<-chan Event, error)` | Plain Go structs; no SDK imports |
| `ai-tooling/llm/anthropic` | NEW | Map neutral request ↔ Anthropic Messages streaming; accumulate `input_json_delta` into complete tool calls before emitting; map usage incl. cache tokens | `anthropic-sdk-go`; ctx passed straight to the SDK so cancellation aborts the HTTP stream |
| `ai-tooling/agent` | NEW | The loop. Resend history + tools each round (stateless API), dispatch tool calls (parallel calls in one round share one results message), enforce `MaxRounds`, emit neutral events, call `Observer` hooks | Goroutine + output channel; checks `ctx.Err()` between rounds and before each tool call |
| `ai-tooling/tools` | NEW | `Registry` of `Tool{Name, Description, InputSchema, Handler}`; `Subset(names...)` returns a toolset; validates args against schema before calling handler; tool errors become `ToolResult{IsError:true}` (fed back to the model), not loop failures | Map + ordered slice (stable order matters for prompt caching) |
| `ai-tooling/jeeves` | NEW | Jeeves tool definitions + handlers written against the `PerspectizeData` port; LLM-shaped DTOs; `ToolsetFor(page)`; shared conformance suite | Handlers take `(ctx, PerspectizeData, args)` |
| `jeeves/data/graphqlclient` | NEW | `PerspectizeData` over the public GraphQL API (hand-written queries, `net/http`) | Used by `botler` and a future MCP server |
| `jeeves/data/fixture` | NEW | Deterministic `PerspectizeData` from embedded JSON, including private rows owned by other users so privacy is testable | Used by evals and unit tests |
| `ai-tooling/guide` | NEW | Task-oriented app guide as embedded markdown with per-page front-matter; exposes `ForPage`, `Topics`, `Read`, `Version` | `//go:embed` inside the `guide` package directory |
| `ai-tooling/evals` + `cmd/botler` | NEW | Eval harness and dev CLI (see build order) | CLI over GraphQL impl; evals over fixture impl |
| `backend/assistant.graphql` | NEW | `extend type Subscription { assistantTurn(input: AssistantTurnInput!): AssistantEvent! @auth }`, event union, `AssistantPage` enum, `setAssistantName` mutation | Separate schema file so `follow-schema` emits `resolvers/assistant.resolvers.go` (same trick as `messaging.graphql`) |
| `backend/gqlgen.yml` | MODIFIED | Add `assistant.graphql` to `schema:` list | One line |
| `resolvers/assistant.resolvers.go` | NEW | Auth check, input validation/caps, limiter gate, call runner, map neutral events → GraphQL union, batch text deltas, close channel on done | Mirrors `ThreadEvents`/`InboxEvents` goroutine pattern and `subscriptionBuffer` |
| `resolvers/resolver.go` + `NewResolver` | MODIFIED | Add `Assistant` dependency (interface) | Constructor gains one param |
| `backend/internal/adapters/assistant` | NEW | In-process `PerspectizeData`, runner (composition of ai-tooling pieces per turn), usage recorder, limits | Only package in backend that imports ai-tooling besides resolvers' event mapping |
| `PerspectiveService.GetByID` (or new `GetVisibleByID`) | MODIFIED | Enforce private-perspective visibility in the service, not only in the resolver | See Pitfall-level anti-pattern 1 |
| `core/ports/repositories/assistant_usage_repository.go` + postgres impl + migration | NEW | Persist per-provider-call usage rows | GORM separate-model pattern |
| Users domain + migration (`assistant_name`) | MODIFIED | Store the user's chosen assistant display name | Nullable column; null = "Jeevesbot" |
| `cmd/server/main.go` | MODIFIED | Construct provider (API key from env), guide, registry, runner, limiter, usage repo; pass to resolver | Wiring only |
| `backend/Dockerfile` + Sevalla context + `.dockerignore` (root) | MODIFIED/NEW | Build from repo root so `../ai-tooling` is in context | See "Docker build-context change" |
| `.github/workflows/ci.yml`, `trivy.yml` | MODIFIED | Add ai-tooling build/test/gofmt job; include `ai-tooling/go.sum` in cache keys and path filters | |
| `frontend/src/lib/assistant/*` | NEW | `useAssistantTurn.svelte.ts` (wraps existing `subscribeGraphql`), transcript store, page-id derivation from route | Reuses `ws-client.svelte.ts` — no second socket |
| `frontend/src/lib/components/assistant/*` | NEW | Sidebar, message list, tool-activity chips, confirm-to-apply card, rename control | Mounted in `routes/+layout.svelte` beside `MessagingWidget` (signed-in only) |

---

## Recommended Project Structure

```
ai-tooling/                      # module github.com/CodeWarrior-debug/perspectize/ai-tooling
├── go.mod                       # go directive <= backend's; own deps (anthropic-sdk-go)
├── llm/
│   ├── types.go                 # Message, ContentBlock, ToolDef, Event, Usage, StopReason
│   ├── provider.go              # type Provider interface { Stream(ctx, Request) (<-chan Event, error) }
│   ├── fake/                    # scripted provider for unit tests + deterministic evals
│   ├── anthropic/               # adapter #1
│   └── openrouter/              # adapter #2 (phase 3)
├── agent/
│   ├── loop.go                  # Run(ctx, Config, history) (<-chan Event)
│   ├── observer.go              # OnProviderCall(Usage, latency), OnToolCall(name, dur, err)
│   └── batch.go                 # CoalesceTextDeltas(in, interval, maxBytes) — pure, testable
├── tools/
│   └── registry.go
├── jeeves/
│   ├── data.go                  # type PerspectizeData interface { ... } + DTOs (NOT backend domain types)
│   ├── tools.go                 # search_content, get_content, list_my_perspectives, get_perspective, read_guide ...
│   ├── toolsets.go              # Page enum + ToolsetFor(page) []string
│   ├── conformancetest/         # RunConformance(t, func(viewer) PerspectizeData) — shared contract tests
│   └── data/
│       ├── graphqlclient/
│       └── fixture/             # //go:embed testdata/*.json
├── guide/
│   ├── guide.go                 # //go:embed pages/*.md ; ForPage, Read, Topics, Version
│   └── pages/                   # global.md, discover.md, compare.md, messages.md, perspective-form.md
├── prompt/
│   └── system.go                # Build(persona name, page, guide) + Version() hash
├── evals/
│   ├── cases/                   # YAML/JSON cases: page, user msg, fixture viewer, expected checks
│   ├── checks.go                # deterministic: tool called?, args?, no private leak?, cites guide?
│   └── runner.go                # model × prompt-version matrix, N runs/case, tokens + latency
└── cmd/botler/
    └── main.go                  # tools list | tools call | chat | eval

backend/
├── assistant.graphql            # NEW schema file
├── internal/adapters/assistant/ # NEW: inprocess.go, runner.go, usage_recorder.go, limits.go
├── internal/adapters/graphql/resolvers/assistant.resolvers.go   # NEW
└── migrations/0000NN_assistant_usage.up/down.sql, 0000NN_user_assistant_name.*  # check next number first

frontend/src/lib/
├── assistant/                   # useAssistantTurn.svelte.ts, transcript.svelte.ts, page.ts
└── components/assistant/        # AssistantSidebar.svelte, ConfirmActionCard.svelte, ...
```

### Structure Rationale

- **`jeeves/data.go` owns the port and its DTOs.** ai-tooling cannot import `backend/internal/...` (Go's `internal` rule), so the port must speak its own types. Keep DTOs LLM-shaped (flattened, only fields the model needs, scores already formatted) rather than mirroring `domain.Perspective` 1:1 — this is also the token-budget lever.
- **In-process implementation lives in `backend/internal/adapters/assistant/`.** It is a backend adapter that *implements an ai-tooling port using backend ports*. It imports ai-tooling (allowed: different module, public packages) and `internal/core/ports/services` (allowed: same module). Nothing in ai-tooling ever imports backend, so there is no cycle and no `internal/` violation. Depend on the `portservices` interfaces, not concrete `*services.PerspectiveService`, per the backend's "callers see ports" rule.
- **`guide/` is inside ai-tooling, not `frontend/`.** `go:embed` patterns may not contain `..`, so embedded files must live under the embedding package's directory. The guide is verified *against* the frontend (see Pattern 5) but not stored there.
- **`toolsets.go` in ai-tooling, not backend.** Evals must exercise exactly the page → tools mapping production uses; if it lived in backend, evals could not see it.
- **`conformancetest/` in ai-tooling.** Three implementations of one port will drift. One exported test suite, run by the fixture impl (ai-tooling tests), the in-process impl (backend tests), and optionally the GraphQL impl (against a dev server), is the cheapest guard.

---

## Architectural Patterns

### Pattern 1: Subscription-as-request ("input on the subscription")

**What:** Each user message opens one `assistantTurn(input)` subscription. The server streams events and closes the channel when the turn ends; gqlgen then sends `complete`. Stop button = client unsubscribes.
**When:** Locked decision 7. Fits the existing WS transport, Clerk `InitFunc`, and `subscribeGraphql` helper with zero new infrastructure.
**Trade-offs:** No separate mutation/turn-id round trip, and cancellation is free (see Data Flow). Downside: the turn input rides in a WS frame, so input size must be capped well under gqlgen's 1 MB `PayloadReadLimit` — an oversized frame closes the *whole socket*, which also kills the user's messaging subscriptions.

```graphql
# backend/assistant.graphql
enum AssistantPage { HOME DISCOVER COMPARE MESSAGES PERSPECTIVE_FORM }

input AssistantTurnInput {
  page: AssistantPage!
  contentId: ID          # page context, validated server-side
  perspectiveId: ID
  history: [AssistantHistoryMessage!]!   # text-only prior turns, capped
  message: String!
}
input AssistantHistoryMessage { role: AssistantRole!  text: String! }

union AssistantEvent = AssistantTextDelta | AssistantToolActivity
                     | AssistantProposedAction | AssistantTurnDone | AssistantTurnError

extend type Subscription {
  assistantTurn(input: AssistantTurnInput!): AssistantEvent! @auth
}
```

### Pattern 2: Viewer-bound data implementation (privacy by construction)

**What:** Construct `PerspectizeData` per turn with the viewer baked in: `assistant.NewInProcess(svcs, viewerID)`. Tool handlers never see a user id argument and cannot be tricked by the model into passing someone else's.
**When:** Always, for all three implementations (fixture takes a viewer too so evals can assert "no private leak").
**Trade-offs:** Slight per-turn allocation; worth it. Never expose `userId` as a tool parameter for "my" data.

```go
// backend/internal/adapters/assistant/inprocess.go
type inProcess struct {
    perspectives portservices.PerspectiveService
    content      portservices.ContentService
    viewerID     int
}
func (d *inProcess) ListMyPerspectives(ctx context.Context, q jeeves.ListQuery) ([]jeeves.Perspective, error) {
    params := domain.PerspectiveListParams{ViewerID: &d.viewerID /* ... */}
    params.Filter.UserID = &d.viewerID
    res, err := d.perspectives.ListPerspectives(ctx, params) // service applies RestrictToPublicOrOwner
    // map domain → jeeves DTO here, once
}
```

### Pattern 3: Server-side page → toolset allowlist

**What:** Client sends only `page` (+ context ids). Server calls `jeeves.ToolsetFor(page)` → names → `registry.Subset(names...)`. A small global core (`read_guide`, maybe `get_current_page_context`) is always included.
**When:** Every turn. Locked decision 10 (progressive discovery; in-app sends per-page tool sets).
**Trade-offs:** Client can never request tools by name (no privilege escalation via crafted input). Each page has a distinct tools prefix, so Anthropic prompt caching yields one cache entry per page rather than one global entry — acceptable; keep tool order stable within a page so the cache hits. Record tool-definition tokens per turn in usage (decision 10).

Suggested initial mapping (to be revised from evals):

| Page (`route.id`) | Toolset beyond core |
|---|---|
| `/` (activity) | `search_content`, `get_content`, `list_my_perspectives` |
| `/discover` | `search_content`, `get_content`, `content_stats` |
| `/compare` | `get_content`, `get_perspective`, `compare_perspectives` |
| `/messages` | guide only (no message-reading tools in v1.2 — privacy surface) |
| perspective form (modal context) | `get_content`, `get_perspective`, `propose_perspective_edit` (confirm-to-apply) |

### Pattern 4: Confirm-to-apply = proposal event + existing mutation

**What:** "Do with confirmation" tools do not write. They return a structured proposal; the runner emits `AssistantProposedAction{kind, targetId, patch, summary}`. The sidebar renders a diff card; on confirm the **frontend calls the existing mutation** (`updatePerspective`, etc.) with the user's own Clerk token.
**When:** All write-shaped capabilities in v1.2.
**Trade-offs:** Writes keep flowing through `@auth`/`@owner` directives, validation, and TanStack cache invalidation that already exist — zero new write path in the assistant. The model never holds write authority, which bounds prompt-injection blast radius (other users' perspective text is untrusted input to the model). The tool result sent back to the model is "proposal shown to user", not "applied".

### Pattern 5: Embedded, page-scoped guide with a version hash

**What:** `ai-tooling/guide/pages/*.md` with front-matter (`pages: [DISCOVER]`, `topics: [...]`). `guide.ForPage(p)` returns global + page section for the system prompt; other sections are reachable via the `read_guide(topic)` tool (progressive disclosure). `guide.Version()` hashes the embedded FS; `prompt.Version()` hashes persona + guide version + tool defs and is stored on every usage row and eval result.
**When:** Build once at startup (embedded, immutable) — no filesystem access in the distroless image.
**Trade-offs:** Guide changes require a backend redeploy (fine; it tracks frontend releases). Verification against the frontend happens in CI, not at runtime: a Go test (or `botler guide check`) reads `../frontend/src` from disk (not embed) and asserts referenced routes/button labels exist. That test cannot run inside the Docker build — keep it in CI.

### Pattern 6: Observer hook shared by production logging and evals

**What:** `agent.Observer` interface called by the loop after every provider call (usage incl. cache read/write tokens, model, latency, stop reason) and tool call (name, duration, error). Backend implements it with the Postgres usage repo; evals implement it with an in-memory collector for the token/latency matrix.
**When:** One hook, two consumers — avoids a separate eval-only instrumentation path that could diverge from what production measures.
**Trade-offs:** Writes must use `context.WithoutCancel(ctx)` (Go 1.21+) so a user pressing Stop — which cancels ctx — doesn't drop the usage row for tokens already billed.

---

## Data Flow

### Request Flow (one turn)

```
User types in AssistantSidebar (page = route.id → AssistantPage)
  ↓ subscribeGraphql({ assistantTurn(input) })   — existing graphql-ws socket, Clerk token from connection_init
gqlgen WS transport → @auth directive → subscriptionResolver.AssistantTurn(ctx, input)
  ↓ auth.ForContext(ctx) → viewer
  ↓ validate: message/history length caps, contentId/perspectiveId parse; page enum
  ↓ limits: activeTurn[viewer] set? → reject; SlidingWindowLimiter.Allow("assistant:"+id)? ; daily token budget (DB sum) ok?
  ↓ runner.StartTurn(ctx, viewer, input):
  │    data    := NewInProcess(ports, viewer.ID)
  │    tools   := registry.Subset(jeeves.ToolsetFor(page)...)
  │    system  := prompt.Build(user.AssistantName ?? "Jeevesbot", page, guide.ForPage(page))
  │    history := sanitize(input.history) + input.message
  │    events  := agent.Run(ctx, {Provider, Tools, System, MaxRounds, MaxTokens, Observer}, history)
  ↓
agent loop round k:
  provider.Stream(ctx, req) ──HTTPS SSE──► Anthropic
     ◄── text deltas ──► Event{TextDelta}  ─────────────────────────────┐
     ◄── tool_use (args accumulated) ──► Event{ToolCall} → registry     │
            handler(ctx, data, args) → portservices.* → GORM WithContext → Postgres
            ◄── DTO JSON (truncated to budget) → ToolResult → Event{ToolActivity}
     ◄── usage/stop ──► Observer.OnProviderCall → usage row (WithoutCancel)
  stop_reason == tool_use && k < MaxRounds → round k+1 (history + tool results resent)
  ↓                                                                     │
resolver goroutine: CoalesceTextDeltas(~50–100 ms or N bytes) ◄──────────┘
  → map neutral Event → model.AssistantEvent → out chan (buffer = subscriptionBuffer)
  ↓ Done/Error → close(out) → gqlgen sends `complete`
Sidebar appends deltas; ProposedAction → ConfirmActionCard → existing mutation on confirm
```

### Cancellation propagation

```
Stop button / sidebar close / route teardown → unsubscribe()  (graphql-ws `complete`)
   or socket drop / tab close
 → gqlgen cancels the operation ctx
 → resolver goroutine: select on ctx.Done() → stops forwarding, returns
 → agent loop: ctx.Err() checked between rounds and before each tool dispatch
 → provider adapter: SDK request built with ctx → HTTP stream aborted → no more tokens generated
 → in-flight tool handler: ctx → service → GORM .WithContext(ctx) → query cancelled
 → Observer still records partial usage via context.WithoutCancel
 → limits: activeTurn[viewer] released in a defer
```
Also wrap the turn in `context.WithTimeout` (e.g. 90 s) so a hung provider cannot pin a goroutine forever. Every send on `out` must be inside a `select` with `ctx.Done()` — the existing messaging resolvers already model this.

### State Management

- **Conversation state is client-held for v1.2.** The Svelte transcript store keeps prior turns; each turn sends *text-only* history (user text + assistant final text). Tool calls/results from earlier turns are not sent back — the model re-calls tools if it needs data again. This keeps the server stateless (multi-instance safe on Sevalla with no sticky sessions) and prevents a client from forging `tool_result` blocks. Cap history by count and bytes server-side.
- **Persisted server-side:** usage rows only (and the assistant name). A conversation table is a later-milestone concern (it pairs with the deferred usage ledger).

### Key Data Flows

1. **botler (dev):** `botler chat` → `graphqlclient` PerspectizeData (HTTP + auth header/token, open decision) → same `agent.Run` + same `jeeves` tools → stdout. Proves the loop and tools with zero backend changes.
2. **Evals:** case → fixture PerspectizeData (viewer from case) + `llm/fake` (deterministic) or real provider (matrix) → `agent.Run` with collector Observer → deterministic checks → report (pass rate, tokens incl. tool-def tokens, latency, prompt version).
3. **In-app:** as above, in-process PerspectizeData.

---

## Docker build-context change (locked decision 2)

Today: Sevalla context = `backend/`, Dockerfile `backend/Dockerfile`, `COPY go.mod go.sum ./` then `COPY . .`. Once `backend/go.mod` has `replace github.com/CodeWarrior-debug/perspectize/ai-tooling => ../ai-tooling`, the builder cannot see `../ai-tooling`.

Required changes:
1. **Sevalla:** Docker context = repo root (`.`); Dockerfile path stays `backend/Dockerfile`.
2. **Dockerfile:**
   ```dockerfile
   WORKDIR /src
   COPY ai-tooling/go.mod ai-tooling/go.sum ./ai-tooling/
   COPY backend/go.mod backend/go.sum ./backend/
   WORKDIR /src/backend
   RUN go mod download
   COPY ai-tooling/ /src/ai-tooling/
   COPY backend/ /src/backend/
   RUN CGO_ENABLED=0 ... go build -o /out/server ./cmd/server
   # runtime: COPY --from=builder /out/server /server ; COPY --from=builder /src/backend/migrations /migrations
   ```
3. **Root `.dockerignore` (new, essential):** exclude `frontend/`, `**/node_modules`, `.git`, `.planning`, `graphify-out`, `docs`, `perspectize/` (legacy C#). Without it the root context ships the frontend's `node_modules` to the builder on every deploy.
4. **Use a committed `replace` directive, not a committed `go.work`.** `replace` works identically in CI (`working-directory: backend`), Docker, and locally. A committed `go.work` silently changes resolution for every `go` command in the repo; keep any `go.work` local/gitignored if wanted for editor convenience.
5. **CI/Trivy:** add an ai-tooling job (build, `gofmt -l .`, `go test ./...`); add `ai-tooling/go.sum` to `cache-dependency-path`; add `ai-tooling/**` to path filters so backend builds re-run when ai-tooling changes. `.hooks/pre-commit` gofmt glob should include `ai-tooling/*.go`.
6. **Go version alignment:** ai-tooling's `go` directive must be ≤ backend's toolchain and the Dockerfile image (currently `golang:1.27-alpine`, backend `go 1.26`).

**Sequencing tip:** flip the Sevalla context + Dockerfile *before* backend imports ai-tooling, in its own small PR (Dockerfile copies only `backend/` at first). Verify a deploy. Then the in-app phase's import is a pure code change. This splits one risky infra-plus-code deploy into two boring ones.

---

## Scaling Considerations

| Scale | Architecture Adjustments |
|---|---|
| 0–1k users | Everything above as-is. In-memory `SlidingWindowLimiter` per instance is fine with 1–2 Sevalla instances. |
| 1k–100k users | Per-instance limiter becomes per-instance-N× too permissive → move turn limits to DB (count usage rows in window) or Redis. Daily token budget is already DB-backed. Add `(user_id, created_at)` index on usage table from day one. |
| 100k+ | Provider rate limits/cost dominate, not Go. Model routing via OpenRouter registry, stricter per-page tool/guide budgets, possibly a job queue. Out of v1.2 scope. |

### Scaling Priorities

1. **First bottleneck: cost and provider rate limits**, not server CPU. Controls: `MaxRounds` (e.g. 4–6), `max_tokens`, tool-result truncation, history cap, prompt caching on the static prefix, daily per-user token budget.
2. **Second: long-lived goroutines per active turn.** Bounded by one-active-turn-per-user and the turn timeout.

---

## Anti-Patterns

### Anti-Pattern 1: Calling services directly and assuming they enforce privacy

**What people do:** In-process tool calls `PerspectiveService.GetByID(id)` and returns it.
**Why it's wrong:** In this codebase the single-perspective privacy check lives in the **resolver** (`PerspectiveByID` in `perspective.resolvers.go` returns nil for another user's private row); `PerspectiveService.GetByID` does not check. List privacy likewise depends on the resolver setting `params.ViewerID`. An in-process adapter bypassing resolvers would leak private perspectives to the model.
**Do this instead:** Before the in-app phase, push visibility into the service (e.g. `GetVisibleByID(ctx, id, viewerID)` or viewer-aware `GetByID`) so resolvers and the in-process adapter share one rule; always set `ViewerID` in the in-process adapter; add a conformance test "viewer A never sees B's private perspective" run against fixture and in-process impls.

### Anti-Pattern 2: Letting SDK or backend domain types cross the boundary

**What people do:** Return `anthropic.Message` from the loop, or make `jeeves` tools take `domain.Perspective`.
**Why it's wrong:** Violates locked decision 3 and is impossible anyway for backend `internal` types; makes the OpenRouter pivot a rewrite.
**Do this instead:** Neutral `llm` types; mapping only inside `llm/anthropic` and `adapters/assistant/inprocess.go`; resolver maps neutral events → GraphQL model in one helper.

### Anti-Pattern 3: Client-selected tools or client-supplied tool results

**What people do:** Send `tools: [...]` or full Anthropic-format history (including `tool_result`) from the browser.
**Why it's wrong:** Privilege escalation and forged data injection.
**Do this instead:** `page` enum → server allowlist; text-only history.

### Anti-Pattern 4: Streaming every token as its own WS frame

**What people do:** Forward each provider delta directly.
**Why it's wrong:** Hundreds of frames per answer, each a Svelte state update; wasteful on mobile.
**Do this instead:** `agent.CoalesceTextDeltas` (time + size flush), per locked decision 7.

### Anti-Pattern 5: Agent writes directly

**What people do:** Give the model an `update_perspective` tool that mutates.
**Why it's wrong:** Skips `@owner`, skips user consent, and makes prompt injection from other users' text a write vector.
**Do this instead:** Pattern 4 (proposal + existing mutation).

### Anti-Pattern 6: Logging usage on the request context

**Why it's wrong:** Stop/disconnect cancels ctx → insert fails → billed tokens unrecorded; rate/budget checks undercount.
**Do this instead:** `context.WithoutCancel` for the recorder.

---

## Integration Points

### External Services

| Service | Integration Pattern | Notes |
|---|---|---|
| Anthropic Messages API | `llm/anthropic` adapter, streaming, ctx-cancellable | API key via env (`ANTHROPIC_API_KEY`), added to `.env.example` name-only and to Sevalla by a human. Tool args arrive as partial JSON deltas — accumulate before dispatch. |
| OpenRouter (phase 3) | `llm/openrouter`, OpenAI-compatible chat completions streaming | Tool-call deltas are indexed and fragmented differently; the neutral `Event{ToolCall}` must be emitted only when complete. Gated by the eval matrix (decision 6). |
| Clerk | Existing WS `InitFunc` | No change. `botler` auth is an open decision (dev header vs long-lived token) — affects only `graphqlclient`. |

### Internal Boundaries

| Boundary | Communication | Notes |
|---|---|---|
| backend → ai-tooling | Go import via `replace` | One-way. ai-tooling has no knowledge of backend. |
| resolvers ↔ adapters/assistant | Interface `Runner.StartTurn(ctx, viewer, input) (<-chan llm.Event, error)` | Resolver owns auth, input caps, delta batching, GraphQL mapping; runner owns composition, limits, usage. |
| adapters/assistant ↔ core | `core/ports/services` interfaces | Same as resolvers. Requires the privacy push-down above. |
| agent ↔ tools | `tools.Registry` dispatch with ctx | Tool errors → `ToolResult{IsError}` back to model; panics recovered per call. |
| agent ↔ observability | `agent.Observer` | Postgres in prod, in-memory in evals, stdout in botler. |
| frontend sidebar ↔ WS | Existing `subscribeGraphql` / `getWsClient` | Same socket as messaging — cap input size (1 MB frame limit closes the socket). |
| frontend sidebar ↔ writes | Existing TanStack mutations | Confirm-to-apply only. |

### Where limits and logging hook in (summary)

| Control | Location | Scope |
|---|---|---|
| One active turn per user | `adapters/assistant/limits.go`, checked in resolver before `StartTurn`, released in defer | per instance |
| Turns per window | Existing `services.NewSlidingWindowLimiter` instance dedicated to assistant (key `assistant:<userID>`) | per instance (see scaling) |
| Daily token budget | Sum of usage rows for user today (DB) | cross-instance |
| Input size caps | Resolver (message bytes, history count/bytes) | per turn |
| Round cap / max_tokens / timeout | `agent.Config` + `context.WithTimeout` in runner | per turn |
| Tool result size cap | `jeeves` handlers / registry wrapper | per call |
| Usage rows | `agent.Observer` → `AssistantUsageRepository` (user, model, provider, prompt_version, page, input/output/cache tokens, tool-def tokens, tool calls, latency, stop reason, cancelled flag) | per provider call |

---

## Suggested Build Order

Dependencies drive this: the neutral types and the `PerspectizeData` port are needed by everything; the in-app phase needs a working loop, tools, guide, and evals first; OpenRouter needs the eval matrix.

**Phase A — Foundation + guide + CLI + evals (ai-tooling only, zero backend import)**
1. `ai-tooling/go.mod`, CI job, pre-commit glob. `llm` types + `Provider` port + `llm/fake`.
2. `agent` loop against `llm/fake` (round cap, parallel tool calls, cancellation, Observer) — fully unit-testable without network.
3. `tools.Registry` + schema validation.
4. `llm/anthropic` adapter (streaming, tool-arg accumulation, usage incl. cache).
5. `jeeves.PerspectizeData` port + DTOs + `fixture` impl + `conformancetest` (including privacy case).
6. `guide` package (embed, front-matter, `ForPage`, `Version`) + `read_guide` tool + frontend-reference check test.
7. `jeeves` read-only tools + `ToolsetFor(page)` + `prompt.Build/Version`.
8. `graphqlclient` impl + `cmd/botler` (`tools list`, `tools call`, `chat`). Requires the botler-auth decision.
9. `evals`: deterministic checks on fixtures, matrix runner, token/latency/tool-def-token capture; `botler eval`.
   *Owner-implements candidates:* one jeeves tool, one eval case.

**Phase A→B bridge (small, separate PRs, can overlap Phase A):**
- Sevalla context → repo root + Dockerfile + root `.dockerignore` (no ai-tooling import yet). Verify deploy.
- Push perspective visibility into `PerspectiveService` (resolver behaviour unchanged; add tests).

**Phase B — In-app Jeeves (backend imports ai-tooling)**
1. `replace` directive + require in `backend/go.mod`; Dockerfile now copies ai-tooling.
2. Migrations (check next free number; manual apply per environment): `assistant_usage`, `users.assistant_name`. Repo port + GORM impl.
3. `adapters/assistant`: in-process impl (runs `conformancetest`), usage recorder, limits, runner.
4. `assistant.graphql` + gqlgen.yml + `make graphql-gen` (expect the stray `schema.resolvers.go`; move stubs) + `assistant.resolvers.go` with delta batching; wire in `main.go`.
5. Frontend: `lib/assistant` hook + transcript store + page derivation; sidebar; tool-activity chips; stop button.
6. Confirm-to-apply: `propose_perspective_edit` tool → `AssistantProposedAction` → `ConfirmActionCard` → existing `updatePerspective` mutation.
7. Rename: `setAssistantName` mutation + settings control; name flows into `prompt.Build`.
8. Rate limits + budget surfaced as a typed `AssistantTurnError{code: RATE_LIMITED|BUDGET_EXCEEDED|...}`.

**Phase C — OpenRouter**
1. `llm/openrouter` adapter + model registry (id, provider, pricing, context window, tool support).
2. Run eval matrix across models × prompt versions; define the pass gate.
3. Provider/model selection in backend config; usage rows already carry `provider`/`model`.

---

## Sources

- Codebase (HIGH): `backend/cmd/server/main.go` (WS transport, `InitFunc`, `SlidingWindowLimiter` wiring), `backend/messaging.graphql` + `gqlgen.yml` (separate schema file pattern), `resolvers/messaging.resolvers.go` (subscription goroutine/ctx pattern, `subscriptionBuffer = 64`), `resolvers/perspective.resolvers.go` (privacy enforced in resolver), `core/services/perspective_service.go` (`GetByID` has no privacy check; `ListPerspectives` relies on caller-set `ViewerID`), `backend/Dockerfile`, `.github/workflows/ci.yml`, `frontend/src/lib/messaging/ws-client.svelte.ts`, `frontend/src/routes/+layout.svelte`.
- `ai-tooling/CLAUDE.md` locked decisions; `.planning/PROJECT.md` v1.2 section.
- gqlgen subscriptions recipe — 1 MB default WS `PayloadReadLimit`, oversize closes the connection; ctx cancellation on client stop (MEDIUM-HIGH): https://gqlgen.com/recipes/subscriptions/
- coder/websocket `SetReadLimit` docs (raw library default 32 KB; gqlgen overrides) (HIGH): https://pkg.go.dev/github.com/coder/websocket#Conn.SetReadLimit
- Go `embed` package — patterns may not contain `.`/`..` elements (HIGH, training + Go docs): https://pkg.go.dev/embed
- Go `context.WithoutCancel` (Go 1.21+) (HIGH): https://pkg.go.dev/context#WithoutCancel
- Anthropic streaming/tool-use/prompt-caching behaviour (tool args as `input_json_delta`, cache order tools → system → messages) (MEDIUM, training data; verify in STACK research against current docs): https://docs.anthropic.com/en/docs/build-with-claude/streaming

---
*Architecture research for: v1.2 Jeeves AI Assistant*
*Researched: 2026-09-26*
