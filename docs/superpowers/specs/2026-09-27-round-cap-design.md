# Round Cap: Configurable, Graceful and Measured

**Status:** approved by the owner (2026-09-27, teaching session). Plan: `docs/superpowers/plans/2026-09-27-tracer-6-round-cap-plan.md`.

## Problem

The agent loop (`ai-tooling/agent/loop.go`) caps tool rounds at a hard-coded 6 (`DefaultMaxRounds`). Three gaps:

1. **Not configurable.** CORE-05 says the round cap comes from configuration. `Loop.MaxRounds` exists but nothing sets it: not the backend, not `botler`, not the evals.
2. **Abrupt at the cap.** When the model still wants tools after the last allowed round, the loop returns `ErrRoundCap`, and the user sees "couldn't answer". Everything the tools found is thrown away.
3. **Not measured.** 6 was a judgment call (there is no industry standard; defaults range from 1 to hundreds by task). Eval reports record model calls per run, but nothing summarizes them, so there's no data to set the cap from.

## Design

### 1. Configurable cap

- `jeeves.Config.MaxRounds` feeds `agent.Loop.MaxRounds`. `0` means `agent.DefaultMaxRounds` (6). Values outside `0..agent.MaxAllowedRounds` (20) are rejected by `jeeves.New`, so a typo can't create a runaway loop.
- Backend: `ASSISTANT_MAX_ROUNDS` (optional; invalid or out-of-range fails config loading at startup, not on a user's first question).
- `botler chat --max-rounds N` and `botler eval --max-rounds N`, so evals can compare caps.

### 2. Graceful cap (wrap-up turn)

When the model asks for tools after `MaxRounds` tool rounds:

1. The loop does **not** run those tools. It answers each pending `tool_use` with an error `tool_result` saying the lookup budget is used up and asking for an answer from what it already has. Every `tool_use` must be followed by a matching `tool_result`, or the API rejects the next request.
2. It makes **one final call** with the tool definitions still attached (the history contains `tool_use` blocks) and **`tool_choice: none`**, so the model can only answer in text.
3. `Result.CapReached` is `true` and the error is `nil`; the answer is a normal answer. If the model somehow still asks for tools, the loop returns `ErrRoundCap` as before.

Neutral type change: `llm.Request.ToolChoice` (`""` = auto, `llm.ToolChoiceNone`). Only the Anthropic adapter translates it (`sdk.ToolChoiceUnionParam{OfNone: …}`), consistent with decision 3 (no SDK types outside the adapter).

Cost: the wrap-up is one extra call, and only on questions that hit the cap.

### 3. Measurement

- `evals.RunResult.CapReached`; `SeedReport.MaxCalls`; `Report.MaxCalls` and `Report.CapReached` (the number of runs that hit the cap).
- `botler eval` prints a `MAX CALLS` column and a summary line, so a live baseline shows the real distribution. The cap is then set from data (for example, the longest run seen plus a margin), not a guess.
- The backend usage log gains `cap_reached`.

## Learning objectives

- Why an agent loop needs a round cap (cost and latency per round; confused models loop).
- Why a hard stop throws away work, and how a "no tools" final turn recovers it.
- The API's pairing rule: every `tool_use` needs a `tool_result`, even when we refuse to run the tool.
- Setting a limit from measured data instead of convention.

## Out of scope

- A per-user token budget (INAPP-08) and Anthropic's `task_budget` beta. Those bound tokens, not rounds; revisit with INAPP-08.
- Changing the default of 6 before a live baseline exists.
