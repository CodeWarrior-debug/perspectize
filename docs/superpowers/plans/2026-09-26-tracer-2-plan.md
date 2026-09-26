# Tracer 2: Backend → GraphQL Subscription → Dev Sidebar

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans **in the main session** (teaching mode). Steps use checkbox (`- [ ]`) syntax. **Blocked on owner actions** at Task 1 (Sevalla Docker context) and Task 5 (backend `ANTHROPIC_API_KEY`); everything else can proceed and be verified locally or in CI.

**Goal:** The same how-to answer tracer 1 produces in the terminal, streamed into the real app. The backend imports `ai-tooling`, exposes one authenticated GraphQL subscription, and a bare sidebar behind a dev flag renders the streamed answer. It's one question path end to end, pulling the Bridge phase's riskiest items (the Docker build context, a subscription, assistant-output rendering) forward while there's little code (decision 12, tracer bullets).

**Depends on:** Tracer 1 (`docs/superpowers/plans/2026-09-26-tracer-1-plan.md`), code-complete.
**Requirements touched:** BRIDGE-01, INAPP-01 (dev-flagged), INAPP-02 (stream + Stop), INAPP-03 (citations), INAPP-07 (no-image renderer). BRIDGE-02 (privacy in `PerspectiveService`) is **not needed yet**: tracer 2 exposes only `read_guide`, which touches no user data. It becomes a hard gate before any perspective tool reaches the backend.

## Global Constraints

- No `&&` chains. Backend: `go build ./...`, `gofmt -l .`, `go test ./...` in `backend/`. Frontend: `pnpm run test:run` and prettier. ai-tooling: its own checks. CI must be green before moving on.
- `schema.graphql` is **not** edited. The subscription lives in a new `backend/assistant.graphql`, registered in `gqlgen.yml`, so `layout: follow-schema` generates `resolvers/assistant.resolvers.go` and avoids the `schema.resolvers.go` collision gotcha.
- Never run migrations (none needed). Never read secret files.
- The feature is off unless `JEEVES_ENABLED=true` (backend) **and** `VITE_JEEVES_DEV=true` (frontend). Production stays dark.

## Task 1: Build context bridge (its own PR, owner action on Sevalla)

**Files:** `backend/go.mod` (a `require` + `replace ../ai-tooling` for `github.com/CodeWarrior-debug/perspectize/ai-tooling`), `backend/Dockerfile`, a new root `.dockerignore`, `.github/workflows/ci.yml` (backend jobs need the whole checkout, which they already have).

- [x] Rewrite the Dockerfile for a **repo-root context**: `COPY backend/go.mod backend/go.sum ./backend/`, `COPY ai-tooling/go.mod ai-tooling/go.sum ./ai-tooling/`, `go mod download` in `/app/backend`, then `COPY backend ./backend` and `COPY ai-tooling ./ai-tooling` (never `COPY . .`, which would pull in `frontend/` and secret files), then build `./cmd/server` from `/app/backend`. Keep the distroless runtime stage.
- [x] Root `.dockerignore`: deny by default (`*`), then allow `backend/` and `ai-tooling/`, and re-exclude secret files, `**/node_modules`, `**/.git` and test artifacts. Mirror `backend/.dockerignore`'s current exclusions.
- [x] Verify locally: `docker build -f backend/Dockerfile .` from the repo root if Docker is available. Otherwise add a CI job that runs the same build (no push). *(Done as the CI `docker-image` job: no local Docker daemon.)*
- [ ] **Owner action:** set Sevalla's Docker build context from `backend` to the repo root (the Dockerfile path stays `backend/Dockerfile`). Deploy and confirm health. Do this **before** Task 2 merges, or the deploy breaks.
- [x] Commit `build: build backend image from repo root so it can import ai-tooling`.

**Learn:** *Concept:* Docker build context versus the Dockerfile location; why `replace ../ai-tooling` needs the sibling inside the context; deny-by-default ignore files. *Quiz:* "What leaks into the image if the root `.dockerignore` is missing?"

## Task 2: Backend assistant service (in-process)

**Files:** `backend/internal/adapters/assistant/assistant.go` (+ test), `backend/internal/config/config.go` (`Assistant` config: `JEEVES_ENABLED`, `ASSISTANT_MODEL`, per-user limits placeholder), `backend/cmd/server/main.go` wiring.

- [x] Build `jeeves.New(...)` with `appguide.Load()` areas and `anthropic.New()` (reads `ANTHROPIC_API_KEY` from env) once at startup, only when enabled. Log the model, never the key.
- [x] A per-user concurrency guard (one in-flight reply per user) and a simple per-user rate limit in the service layer. The HTTP limiter doesn't cover subscriptions (research finding).
- [x] Tests with `llm/fake` (injected provider): events are forwarded; concurrency guard; disabled means an error.

**Learn:** *Quiz:* "Why must this adapter live under `backend/internal/` and not in `ai-tooling`?"

## Task 3: GraphQL subscription

**Files:** `backend/assistant.graphql`, `backend/gqlgen.yml`, generated code, `backend/internal/adapters/graphql/resolvers/assistant.resolvers.go` (+ test in `backend/test/resolvers/`).

```graphql
input AssistantAskInput { message: String! page: String }
type AssistantTextDelta { text: String! }
type AssistantToolActivity { name: String! }
type AssistantDone { stop: String! citations: [String!]! inputTokens: Int! outputTokens: Int! }
type AssistantError { message: String! }
union AssistantEvent = AssistantTextDelta | AssistantToolActivity | AssistantDone | AssistantError
extend type Subscription { assistantReply(input: AssistantAskInput!): AssistantEvent! @auth }
```

- [x] Input on the subscription (no mutation/subscription race). Cap `message` at 4 KB (well under the 1 MB WebSocket frame limit, since an oversized frame kills the shared socket and messaging with it).
- [x] Batch text deltas about every 50 ms. Unsubscribing cancels the context and stops the model call. Usage is logged with `context.WithoutCancel` so it survives a Stop.
- [x] Resolver tests with a fake provider: the event sequence, auth required, oversized input rejected, cancellation stops the upstream call.

**Learn:** *Quiz:* "Trace what happens, layer by layer, when the user presses Stop."

## Task 4: Dev sidebar (frontend)

**Files:** `frontend/src/lib/components/assistant/AssistantPanel.svelte`, `AssistantMessage.svelte` (+ tests), a mount point in the root layout behind `VITE_JEEVES_DEV`.

- [x] Use the existing `subscribeGraphql` (`frontend/src/lib/messaging/ws-client.svelte.ts`). One input and one streamed answer. A Stop button disposes the subscription.
- [x] `AssistantMessage`: parse Markdown with `marked`, sanitize with DOMPurify **forbidding `img`, `iframe`, `form`, `style`** and allowlisting links. Never reuse `SafeHtml` as-is (zero-click image exfiltration through the permissive CSP). Render `[area.task]` citations as small chips.
- [x] Accessibility minimum: announce "responding" and "answer ready", not every token.
- [x] Vitest tests: an image in the Markdown is stripped; citations render as chips; Stop disposes the subscription.

**Learn:** *Quiz:* "How could a prompt-injected answer leak data with no click, and which line of `AssistantMessage` stops it?"

## Task 5: Live tracer checkpoint (owner)

- [ ] **Owner action:** set `JEEVES_ENABLED=true` and `ANTHROPIC_API_KEY` on the backend (Sevalla env or local `.env`), and `VITE_JEEVES_DEV=true` on the frontend.
- [ ] Local session: sign in, open the dev sidebar, ask "How do I compare two perspectives?", and confirm the streamed answer cites `[compare.pick-two]` and Stop works. Capture an `sv-` screenshot for the PR.
- [ ] Record latency, tokens and any friction in `ai-tooling/CLAUDE.md` → Phase 25 learnings, then widen (the in-app phase proper: per-page tools, perspective tools after BRIDGE-02, confirm-to-apply).

## Deviations (recorded at code-complete)

- **Flag name:** the frontend flag is `VITE_JEEVES_DEV`, not `PUBLIC_JEEVES_DEV`. The app reads every client variable through Vite's `VITE_*` prefix (`frontend/.env.example`), so it follows that convention.
- **Task 1 went out as PR #458** (stacked on #457). The `go.mod` `require`/`replace` moved to Task 2, where the first import happens, so #458 is a build-only change.
- **Citation parsing moved** from `evals` into `jeeves.Citations`, so the backend and the evals share one parser.
- **`page` is accepted but unused** in the tracer. It is carried through to the service so per-page tools (Phase 27) need no schema change.
- **Usage goes to slog only** (model, stop reason, tokens, duration, via `context.WithoutCancel`). There is no usage table yet; that comes with per-user budgets.
- **Rate limit:** an in-memory 20 questions per user per hour plus one in-flight reply per user. It resets on restart and is per instance, which is fine for a dev-flagged tracer on one Sevalla instance.

