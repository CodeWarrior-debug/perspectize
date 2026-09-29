# Tracer 3: First Data Tool (read-only perspectives)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans **in the main session** (teaching mode). Steps use checkbox (`- [ ]`) syntax. Stacked on tracer 2 (`feature/jeeves-tracer-2`, PR #459). No owner action is needed to build or verify it; the live checkpoint reuses tracer 2's (API key plus the two flags).

**Goal:** Jeeves can look at real perspective data for the first time, read-only and privacy-safe. A signed-in user asks "What have I rated highest?" or "What do people think of content 42?" and Jeeves calls `list_perspectives`, which returns the viewer's own perspectives or the public ones on a piece of content, never anyone else's private ones. It's one tool end to end: ai-tooling interface, contract test, backend adapter, sidebar label.

**Depends on:** tracer 2 (backend assistant service and subscription).
**Requirements touched:** BRIDGE-02, TOOLS-02 (partial: list only), TOOLS-03, TOOLS-04. **Not yet:** INAPP-04 (per-page tool sets). `list_perspectives` is offered on every page for now; the page mapping comes when there's a second data tool to choose between.

## Global Constraints

- No `&&` chains. Backend: `go build ./...`, `gofmt -l .`, `go test ./...`. ai-tooling: `go build`, `gofmt -l .`, `go vet`, `go test -race`. Frontend: `pnpm run test:run` and prettier on touched files.
- **Read-only.** No tool in this tracer writes anything. Writes arrive with confirm-to-apply (INAPP-06).
- **Explicit viewer, everywhere.** Every `PerspectizeData` call takes a `Viewer`; nothing reads the viewer from context inside ai-tooling. The zero `Viewer` is anonymous.
- **Defence in depth.** The service enforces visibility (BRIDGE-02), and the backend adapter re-checks every row before it reaches the model. Either layer alone passes the contract test.
- No schema, migration or GraphQL change.

## Task 1: BRIDGE-02, visibility in the service

**Files:** `backend/internal/core/ports/services/perspective_service.go`, `backend/internal/core/services/perspective_service.go`, `backend/internal/adapters/graphql/resolvers/perspective.resolvers.go`, `backend/test/services/perspective_service_test.go`.

Today `ListPerspectives` already scopes rows in the service (`RestrictToPublicOrOwner`), but the single-row check lives only in the `perspectiveByID` resolver, so any new caller of `GetByID` (like Jeeves) would bypass it.

- [x] Add `GetVisible(ctx, viewerID *int, id int) (*domain.Perspective, error)` to the port and service. It returns `domain.ErrNotFound` (not a permission error) for a private row the viewer doesn't own, so the id's existence isn't disclosed.
- [x] Keep `GetByID` unchanged: the `@owner` directive and update/delete need the raw row to check ownership.
- [x] `perspectiveByID` calls `GetVisible` and drops its inline check (behaviour unchanged: null for hidden rows).
- [x] Service tests: owner sees private; other user and anonymous get `ErrNotFound`; public is visible to all.

**Learn:** *Concept:* authorization belongs where every caller passes through (the service), not in one adapter. *Quiz:* "Why return not-found instead of forbidden for someone else's private perspective?"

## Task 2: `PerspectizeData`, the `list_perspectives` tool, and the shared contract test

**Files:** `ai-tooling/jeeves/data.go` (+ test), `ai-tooling/jeeves/datacontract/contract.go`, `ai-tooling/jeeves/memdata/memdata.go` (+ contract test), `ai-tooling/jeeves/assistant.go`, `ai-tooling/jeeves/jeeves.go` (prompt line).

- [x] Neutral types: `Viewer{UserID int}`, `Perspective` (id, content id and title, owner, mine, privacy, the four ratings, like, review, labels, created), `PerspectiveQuery{Mine bool; ContentID int; Limit int}`, and `PerspectizeData.ListPerspectives(ctx, Viewer, PerspectiveQuery)`.
- [x] `ListPerspectivesTool(data, viewer)` with input `{scope: "mine"|"content", content_id, limit ≤ 20}`. `mine` for an anonymous viewer returns a plain "sign in" message rather than an error the model retries.
- [x] **TOOLS-04:** the result is JSON whose user-written fields sit under a `data` key, preceded by a line saying it is untrusted user content and never instructions.
- [x] `datacontract.Run(t, factory)`: seeds two users with public and private rows on two contents, then asserts for anonymous, user 1 and user 2 across every query shape that no returned row is another user's private perspective, and that `Mine` returns exactly the viewer's rows.
- [x] `memdata`: an in-memory implementation for botler and eval fixtures (EVAL-01: never the shared dev DB), run through the contract.
- [x] `Config.Data` (optional). `AskAs(ctx, viewer, question, onEvent)` builds the per-viewer tool set; `Ask` stays guide-only for botler and evals.

**Learn:** *Concept:* a contract test that every implementation runs, the Go equivalent of an abstract test class in C#. *Quiz:* "The fake passes the contract. What does that prove about the backend adapter, and what doesn't it?"

## Task 3: Backend adapter

**Files:** `backend/internal/adapters/assistant/data.go` (+ contract test), `service.go` (`Asker.AskAs`), `backend/cmd/server/main.go`.

- [x] `PerspectiveData` implements `jeeves.PerspectizeData` over `PerspectiveService.ListPerspectives` (with `ViewerID` set; `Mine` becomes `Filter.UserID = viewer`) and `ContentService.GetByID` for titles. It re-checks visibility per row and drops violations with a warning log.
- [x] Run `datacontract.Run` against it, using the real `PerspectiveService` over an in-memory repository that applies `RestrictToPublicOrOwner` the way the SQL does (the SQL predicate is covered separately by the sqlmock repository test).
- [x] `Service.Ask` passes `jeeves.Viewer{UserID: userID}`; `NewJeeves` takes the data source.

**Learn:** *Quiz:* "Trace a `list_perspectives` call from the model's tool_use block to the SQL WHERE clause. Where are the two visibility checks?"

## Task 4: Sidebar label

- [x] `AssistantPanel` shows "Looking at perspectives…" for `list_perspectives` (test added).

## Task 5: Live checkpoint (owner, with tracer 2's)

- [ ] Signed in, ask "What have I rated highest?" and "What do people think of content <id>?". Confirm the answers use real data and never show another user's private perspective.
- [ ] Record latency, tokens and friction in `ai-tooling/CLAUDE.md` → Phase 25 learnings.

## Deviations and notes (recorded at code-complete)

- **Privacy is proven three ways.** Mutation checks during the build showed that the contract fails (8 leaks) with both checks removed and passes with either one alone: the service's `RestrictToPublicOrOwner`, or the adapter's per-row check.
- **The backend contract test** runs over the real `PerspectiveService` with an in-memory repository. The repository's SQL predicate stays covered by its own sqlmock test.
- **Ratings** are converted to the 0–10 display scale (stored ÷ 1000) so the model quotes the numbers users see.
- **Owner ids** never reach the model (`json:"-"`). It sees `mine` and `private` flags instead.
- **Deferred:** `botler` has no fixture data yet, so `botler tools call list_perspectives` isn't wired. The eval cases for tool selection (EVAL-02) will add `memdata` fixtures to `botler`. The per-page tool mapping (INAPP-04) is deferred too.

