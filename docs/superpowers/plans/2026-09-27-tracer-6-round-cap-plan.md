# Tracer 6: Round Cap (configurable, graceful, measured)

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:executing-plans **in the main session** (teaching mode). Steps use checkbox (`- [ ]`) syntax. Spec: `docs/superpowers/specs/2026-09-27-round-cap-design.md`. Stacked on tracer 5 (`feature/jeeves-tracer-5`, PR #462). No API key needed to build or verify it.

**Goal:** The round cap comes from configuration, hitting it produces an answer instead of an error, and eval reports show how many rounds questions really take.

**Requirements touched:** CORE-03 (round cap behaviour), CORE-05 (cap from configuration), EVAL-03 (report detail).

## Global Constraints

- No `&&` chains. ai-tooling: `go build`, `gofmt -l .`, `go vet`, `go test -race`. Backend: `go build ./...`, `gofmt -l .`, `go test ./...`.
- No SDK type outside `llm/anthropic/` (decision 3). The Go SDK shape was checked against v1.75.0: `sdk.ToolChoiceUnionParam{OfNone: &sdk.ToolChoiceNoneParam{}}`.
- Tests use the fake provider; CI never calls a model.

## Task 1: Neutral `ToolChoice` and the Anthropic mapping

- [x] `llm.Request.ToolChoice` with `llm.ToolChoiceNone`.
- [x] The adapter sets `tool_choice: {"type":"none"}` when asked; the SSE test server asserts the request body.

**Learn:** *Quiz:* "Why keep the tool definitions on the final call instead of dropping them?"

## Task 2: Graceful cap in the loop

- [x] At the cap: an error `tool_result` for every pending call, then one final call with `ToolChoice: none`. `Result.CapReached = true`, nil error.
- [x] Still asking for tools after that returns `ErrRoundCap`.
- [x] `agent.MaxAllowedRounds = 20`.
- [x] Tests: the wrap-up answer returns with `CapReached`; every `tool_use` gets a `tool_result`; the final request has `ToolChoice none`; the pending tools never run; a stubborn model returns `ErrRoundCap`; a custom `MaxRounds` is honoured.

**Learn:** *Quiz:* "The loop refuses to run the last requested tools. Why must it still send a `tool_result` for each?"

## Task 3: Configuration

- [x] `jeeves.Config.MaxRounds` (validated `0..20`).
- [x] Backend `ASSISTANT_MAX_ROUNDS` (validated at startup). `NewJeeves` takes a `JeevesConfig`. The usage log gains `cap_reached`.
- [x] `botler chat/eval --max-rounds`.

## Task 4: Measurement

- [x] `RunResult.CapReached`, `SeedReport.MaxCalls`, `Report.MaxCalls` and `Report.CapReached`; `botler eval` prints them.

## Task 5: Baseline (owner, needs the API key)

- [ ] `botler eval --suite all --runs 3`, then read `MAX CALLS`. Record the distribution in `ai-tooling/CLAUDE.md`, and set `ASSISTANT_MAX_ROUNDS` from it if 6 is clearly wrong.

## Notes (recorded at code-complete)

- **Call count at the cap** is `MaxRounds` tool rounds, the over-cap request, then the wrap-up: `MaxRounds + 2` calls. The default is therefore at most 8 calls per question.
- **Range check** happens in `jeeves.New`, which runs at backend startup, so the config loader only rejects non-numbers. There's one source of truth for the range: `agent.MaxAllowedRounds`.
- **`ToolChoice` is neutral**, and only the Anthropic adapter knows `tool_choice: none`. The fake provider records it, so the loop tests assert it without a network.

