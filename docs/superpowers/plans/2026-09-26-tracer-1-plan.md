# Tracer 1: Guide → Agent Loop → botler → Eval

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans **in the main session** (teaching mode). Steps use checkbox (`- [ ]`) syntax. Load the `claude-api` skill before touching `llm/anthropic` (Go SDK shapes drift; don't write them from memory).

**Goal:** A thin, real, end-to-end slice. `botler chat "How do I compare two perspectives?"` streams an answer from Claude that cites `[compare.pick-two]`, retrieved through a `read_guide` tool. `botler eval` runs the compare seeds 3× each and reports pass rate, tokens and latency. It's one area, one tool and one eval: production-quality code that later work builds on (tracer, not prototype; decision 12 in `ai-tooling/CLAUDE.md`).

**Why a tracer:** it proves the neutral types, adapter, loop, tool registry, guide loader, CLI and eval harness fit together before any layer is widened. It deliberately **avoids the backend** (`read_guide` needs no GraphQL), so the open `botler`-auth decision isn't needed yet.

**Spec:** decisions in `ai-tooling/CLAUDE.md`, requirements CORE-01..05, TOOLS-01, CLI-02 (partial), EVAL-01..04 (partial) in `.planning/v1.2-REQUIREMENTS.md`, research in `.planning/v1.2-research/` (STACK: Anthropic Go SDK v1.75.0, hand-written loop, `google/jsonschema-go`).

## Global Constraints

- Branch `claude/jeevesbot-plan-overview-i8cdx2`; no `&&` chains; run `gofmt -l .`, `go vet ./...` and `go test ./...` in `ai-tooling/` before every commit.
- **No SDK type outside `llm/anthropic/`** (decision 3). Tests use a fake provider, and CI never calls a model API.
- Model from config: `ASSISTANT_MODEL` env var, default `claude-opus-5` (current default per the claude-api skill). `ANTHROPIC_API_KEY` comes from the environment only and is never logged or committed. Live runs happen where the owner has set the key (local, or the cloud environment's secrets).
- Adaptive thinking; streaming; `max_tokens` 16000 per turn; round cap 6; tool-result cap 16 KB.
- **Refusal handling:** map `stop_reason: refusal` to a neutral stop reason. Enable server-side refusal fallbacks (the `claude-api` skill's default for Opus 5), verifying the Go SDK shape by compiling. If the SDK shape blocks it, record why and continue without it.

## Architecture (tracer scope)

```
cmd/botler ──► jeeves (system prompt, read_guide tool, citations)
                 │            └──► appguide (Load)
                 ▼
               agent (Registry, Loop) ──► llm (neutral types + Provider interface)
                                              ▲
                                  llm/anthropic (SDK adapter)   llm/fake (tests)
evals ──► agent + jeeves + seeds  (deterministic checks)
```

- `llm`: `Message{Role, Parts}`; `Part` is text, tool call `{ID, Name, Input json.RawMessage}` or tool result `{CallID, Content, IsError}`. `ToolSpec{Name, Description, InputSchema}`. `Request{Model, System, Messages, Tools, MaxTokens}`. `Event` is `Start | TextDelta | ToolCall | Done{Stop, Usage} | Error`. `Provider.Stream(ctx, Request, onEvent func(Event)) (Message, Stop, Usage, error)`. A callback instead of a channel keeps errors and cancellation simple.
- `agent.Loop.Run(ctx, req, onEvent)`: call the provider → if the stop is tool-use, run all tool calls concurrently → append the assistant message + **one** user message with all results → repeat (cap 6) → return the final message + accumulated usage.
- `jeeves.ReadGuideTool`: input `{"area":"compare"}` or `{"id":"compare.pick-two"}`, returns the entries as compact Markdown. The system prompt carries the persona, the rules (answer only from guide entries, cite IDs as `[area.task]`, and for unsupported features say exactly **"Perspectize doesn't support that."**), and the list of available areas with their summaries.
- **Deterministic eval checks:** normal seed passes if the answer cites at least one `expect_ids` value (`\[([a-z0-9-]+\.[a-z0-9-]+)\]`) and cites no unknown ID. Trap seed passes if the answer contains the exact unsupported phrase. Each seed runs 3 times; the report shows pass rate, input/output tokens and latency per seed and overall.

---

## Task 1: `llm` neutral types + fake provider (TDD)

**Files:** `ai-tooling/llm/llm.go`, `ai-tooling/llm/fake/fake.go`, `ai-tooling/llm/fake/fake_test.go`

- [x] Write tests for the fake provider: it replays scripted turns (text deltas, tool calls, stop), invokes `onEvent` in order, and honours `ctx` cancellation.
- [x] Implement the types (doc-comment every exported type) and the fake. Run tests, gofmt, vet. Commit `feat(ai-tooling): add provider-neutral llm types and fake provider`.

**Learn:** *Concept:* ports and adapters again, now for LLMs. Why the fake exists (fast tests, no API cost, deterministic). *Quiz:* (1) Why is `Input` a `json.RawMessage` and not `map[string]any`? (2) What would you have to change if `Part` were `anthropic.ContentBlockParamUnion`?

## Task 2: Agent loop + tool registry (TDD)

**Files:** `ai-tooling/agent/registry.go`, `ai-tooling/agent/loop.go`, `ai-tooling/agent/*_test.go`; add `github.com/google/jsonschema-go`.

- [x] Registry tests: register a tool; unknown tool gives an error result (`IsError`), not a crash; input failing the schema gives an error result with the validation message; a handler error gives an error result; output over 16 KB is truncated with a marker.
- [x] Loop tests (fake provider): single text turn; one tool round (**2 provider calls**); two parallel tool calls in one round (**2 calls**, one results message); round cap reached returns `ErrRoundCap` with the partial message; context cancelled mid-loop stops at once; usage summed across calls.
- [x] Implement, run tests, gofmt, vet, commit `feat(ai-tooling): add agent loop and tool registry`.

**Learn:** *Concept:* the tool-use handshake, where the model requests and your code executes (your shaky Q1). *Quiz:* re-ask "2 tool rounds → how many API calls?" and "why must all parallel results go in ONE user message?"

## Task 3: `read_guide` tool + system prompt (TDD)

**Files:** `ai-tooling/jeeves/guide_tool.go`, `ai-tooling/jeeves/prompt.go`, `ai-tooling/jeeves/*_test.go`

- [x] Tests: `{"area":"compare"}` returns all 5 entries; `{"id":"compare.pick-two"}` returns one; an unknown area or ID gives an error result listing valid areas; the system prompt contains every area slug and summary, the citation rule and the exact unsupported phrase; the prompt is **byte-stable** across calls (a prompt-caching prerequisite).
- [x] Implement, test, commit `feat(ai-tooling): add read_guide tool and Jeeves system prompt`.

**Learn:** *Concept:* why the full guide isn't pasted into the prompt (progressive discovery, token budget); prompt-cache prefix stability. *Quiz:* "What silently breaks prompt caching if the system prompt includes today's date?"

## Task 4: Anthropic adapter

**Files:** `ai-tooling/llm/anthropic/anthropic.go`, `ai-tooling/llm/anthropic/anthropic_test.go`; add `github.com/anthropics/anthropic-sdk-go` (the v1.75.0 line per STACK.md).

- [x] Load the `claude-api` skill and read `go/claude-api/{README,streaming,tool-use}.md`.
- [x] Unit tests with **no network**: neutral `Request` → SDK params translation (system with a cache-control breakpoint, tools, messages with tool calls/results, adaptive thinking); SDK stream events → neutral events + final message; stop-reason mapping including refusal.
- [x] A live smoke test that skips unless `ANTHROPIC_API_KEY` is set: one text turn and one tool round against the real API.
- [x] Implement with streaming (`Messages.NewStreaming` + `Accumulate`, or the beta equivalent if fallbacks are enabled). Test, commit `feat(ai-tooling): add Anthropic provider adapter`.

**Recorded during execution:**
- SDK v1.75.0, non-beta `Messages.NewStreaming` + `Message.Accumulate`. Tests run the **real SDK** against an `httptest` SSE server (thinking + text + streamed tool input; refusal; HTTP 400; a foreign opaque block dropped), with no network. `TestLive_Smoke` skips without `ANTHROPIC_API_KEY`.
- Thinking and other non-text/non-tool blocks round-trip as `PartOpaque` (the JSON of `ContentBlockUnion.ToParam()`, unmarshalled back into `ContentBlockParamUnion`). A test proves the signature comes back unchanged.
- **Server-side refusal fallbacks deferred:** they need the beta Messages API (`Beta*` types throughout the adapter). The tracer uses the GA API; refusals map to `llm.StopRefusal` and surface to the caller. Revisit when widening (tracked here).
- Leak check: `grep -rln anthropic-sdk-go --include=*.go` matches only `llm/anthropic/`.

**Learn:** *Concept:* streaming events versus the final message; why thinking blocks must be passed back unchanged within a turn. *Reading (~10 min):* the Claude docs pages on streaming and tool use; focus on the event types and where `tool_use` blocks appear. *Quiz:* "Where exactly does SDK-specific code stop in our tree, and how would you prove it with grep?"

## Task 5: `botler` CLI (tracer commands)

**Files:** `ai-tooling/cmd/botler/main.go`, `ai-tooling/cmd/botler/main_test.go`

- [x] Stdlib `flag` subcommands (same style as `backend/cmd/seed-bible`): `tools list`, `tools call <name> --input '<json>'` (no model), `chat "<question>"` (streams text; prints tool calls as `→ read_guide {"area":"compare"}`; prints usage at the end).
- [x] Tests: argument parsing; `tools list` / `tools call read_guide` output; `chat` with a fake provider injected.
- [x] Commit `feat(ai-tooling): add botler CLI (tools, chat)`.
- [ ] **Tracer checkpoint (live, where the key exists):** `go run ./cmd/botler chat "How do I compare two perspectives?"` cites `[compare.pick-two]`. Record the transcript and usage in the plan. If no key is available in this session, hand the command to the owner.

**Learn:** *Quiz:* "Walk the call path from `botler chat` to the model and back, naming each package."

## Task 6: Minimal eval harness

**Files:** `ai-tooling/evals/evals.go`, `ai-tooling/evals/evals_test.go`, `botler eval` subcommand

- [x] Tests (fake provider): citation check pass and fail; unknown-ID citation fails; trap phrase check; 3 runs per seed with pass-rate math; report aggregates tokens and latency.
- [x] `botler eval --model <id> [--area compare] [--runs 3]` prints a table and writes `ai-tooling/evals/results/<timestamp>-<model>.json` (gitignored).
- [x] Commit `feat(ai-tooling): add minimal eval harness and botler eval`.
- [ ] **Live baseline (where the key exists):** run it and record pass rate, tokens and latency in `ai-tooling/CLAUDE.md` under "Phase 25 learnings". That's the first Claude baseline (partial EVAL-04).

**Learn:** *Concept:* deterministic eval checks and why the trap phrase is a *contract* between prompt and eval. *Quiz:* "Why run each seed 3 times? What does a 2/3 pass mean?"

**Live steps pending (recorded during execution):** this cloud session has no `ANTHROPIC_API_KEY`. The owner either adds it to the environment settings (new session picks it up) or runs locally from `ai-tooling/`:
`go run ./cmd/botler chat "How do I compare two perspectives?"` and then
`go run ./cmd/botler eval --area compare --runs 3`.
Added during execution: `jeeves.Assistant` (shared wiring for botler, evals, and later the backend); `botler eval` prints a table plus FAIL reasons and saves JSON to `ai-tooling/evals/results/` (gitignored).

## Task 7: Tracer review, then widen

- [ ] Verification: `go build ./...`, `gofmt -l .`, `go vet ./...` and `go test -race ./...` in `ai-tooling/` (report output). CI green on PR #457.
- [ ] Record what the tracer taught (guide token size per area, tool-round count, latency, eval failures, format friction) in `ai-tooling/CLAUDE.md` → "Phase 25 learnings".
- [ ] Re-plan: adjust the guide format if needed, **resume app-guide plan Task 5** (fan-out), then write the Tracer 2 plan (backend import → one subscription → bare sidebar), pulling the Bridge risks forward.
- [ ] Phase-style review quiz, then update `LEARNING.md`.
