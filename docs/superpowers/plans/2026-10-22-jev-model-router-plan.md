# Jev Model Router Implementation Plan

> ⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pick the Claude tier (Haiku / Sonnet / Opus / Fable) for each subagent or job at spawn time, using one Jev call plus deterministic rules in code. Ship dry-run first and prove a cost win before going live.

**Intent:** [project-management/intents/jev-model-router.md](../../../project-management/intents/jev-model-router.md). It holds the why, the constraints and the open questions; this plan doesn't repeat them.

**Architecture:** A harness-agnostic **core** (decider, policy, logging) driven by a shared **contract** (question set, config schema, log schema, golden fixtures). Thin adapters sit on top:

```
             ┌───────────────── contract (data, no code) ─────────────────┐
             │ questions.json · config.schema.json · log.schema.json ·    │
             │ fixtures/*.json (state + mocked answers → expected tier)   │
             └──────────────┬──────────────────────────────┬──────────────┘
                            │                              │
         Phase 1: TypeScript core                  Phase 3: Go core
         (omp/harness config repo)                 (perspectize backend)
                            │                              │
       omp extension: before_subagent_spawn     Jeeves: TierRouter port +
       (+ tool_result for failure tracking)     Jev adapter at conversation/job start
```

The omp adapter is the first consumer. Jeeves won't run on omp, so it gets a Go port of the same core (hexagonal: port in `internal/core/ports`, adapter in `internal/adapters/jev`). Both implementations must pass the same golden fixtures. That shared test is what stops them drifting.

**Tech Stack:**
- Phase 1: TypeScript on omp's extension runtime. Built-in `fetch` and the runtime's built-in test runner, with **no third-party packages** (approved by the owner 2026-10-22; any new dependency needs fresh approval). omp runs on Bun, so tests use `bun test`. The config is JSON unless the runtime has a built-in YAML parser.
- Phase 3: Go, the repo's existing hexagonal layout, `net/http`, testify.

## Step 0 findings (verified 2026-10-22 against the docs, not from memory)

**oh-my-pi** ([repo](https://github.com/can1357/oh-my-pi)):

| Need | Finding | Source |
|---|---|---|
| Per-subagent model | Per agent *definition* only. Resolution order: `task.agentModelOverrides[agent]` → agent frontmatter `model` (selector, CSV or array, tried in order) → the parent's model. The `task` call has no per-invocation model field. | `docs/task-agent-discovery.md` |
| Hook before spawn | `before_subagent_spawn` returns `{ model?: string \| string[]; block?; reason?; note? }`. It fires once per child, *before the child resolves its model*, and the last returned `model` wins. It replaces the spawn's model patterns and keeps the role. It doesn't touch the parent session. **The payload has no task text** (source: `BeforeSubagentSpawnEvent` in `extensibility/extensions/types.ts`): only `agent`, `invocationKind`, `modelRole`, `patterns` and `spawnKey`. For `task` spawns, `spawnKey` is the child's agent id, allocated from the task item's `name` and made unique. Handlers time out after 30 s. | `docs/extensions.md`, source |
| Getting the task text | The `tool_call` hook fires before the `task` tool runs and receives its input (`agent` plus items with `name`, `task`, …). The router decides there and stores the result keyed by item name; `before_subagent_spawn` looks it up by `spawnKey`. If nothing matches, it logs `unmatched` and leaves the model alone. | source: `task/index.ts`, `task/structured-subagent.ts` |
| Fallback chains | `retry.fallbackChains` maps a role, a model or `provider/*` to an ordered list of fallbacks. `retry.fallbackOn` takes `any`, `usage-limit` or `except-usage-limit`. `retry.fallbackRevertPolicy` takes `cooldown-expiry` or `never`. Project config is `<cwd>/.omp/config.yml` and overrides the global `~/.omp/agent/config.yml`. | `docs/settings.md` |
| Per-turn model switch | No hook exists. `before_provider_request` rewrites the payload only. That matches the never-switch-mid-conversation rule. | `docs/extensions.md` |
| Test-failure signal | `tool_result` fires after every tool runs. | `docs/extensions.md` |

**Decision:** an omp **extension** (option A). A standalone proxy only sees individual requests, so it risks a mid-conversation switch. A CLI called from omp can't set a subagent's model.

**Jev / System One** ([TypeSafe docs](https://docs.typesafe.ai), [OpenRouter guide](https://openrouter.ai/docs/guides/community/typesafe-sdk.md)):
- `POST https://openrouter.ai/api/v1/systemone`, `Authorization: Bearer $OPENROUTER_API_KEY`. The id `typesafe/jev-1.13` is used as sent. The response's `model` is the served snapshot (the docs example shows `typesafe/jev-1.13-20260917`) and is logged on every decision.
- Request: `{ model, state, questions }`. `state` can be a string, an object or an array. Question shapes:
  - `noul`: `{type, instructions, criteria?: {true, false}}`
  - `choice`: `{type, instructions, criteria: {option: description}}`, with 1–255 options
  - `score`: `{type, instructions, criteria: [levels, low→high]}`, with up to 10 levels
- Response: `{ id, model, provider, answers, usage: {input_tokens, output_tokens, cost} }`. Answer fields by type:
  - `choice`: `choice`, `probabilities`, `confidence`
  - `score`: `score`, `probabilities`, `confidence`, `legend`
  - `noul`: `noul` only (a 0–1 probability)
- Known weaknesses in jev-1.13 (the docs' "jaggedness" page): first-option bias, counting, numbers, dates, indirection and double negatives, large irrelevant state, adversarial state. The confidence docs themselves suggest the top-to-runner-up comparison for two-way decisions.
- Errors: 429 means rate-limited and 529 means overloaded. The body limit is 32 MiB. No latency figures are published, so the 2.5 s timeout is our own choice.
- **Not verified:** the output-use (no-training) clause in the TypeSafe Master Customer Agreement. Build to the owner's stated rule regardless.

## Global Constraints

- Route only at boundaries. Never change a running conversation's model.
- Live routing is **off by default**. Turning the router off is one config key: `enabled: false`, or `mode: "dry-run"` to keep logging.
- The secret is `OPENROUTER_API_KEY` from the environment, never written to config, logs or fixtures.
- The task text goes in `state.task_description`. All instructions go in question `instructions` and `criteria`.
- Logs hash the task text (SHA-256) by default. Raw text needs `log.includeTaskText: true`.
- Jev outputs are never exported as training or distillation data. The report script reads aggregates only.
- **Ask the owner before:** adding a dependency; editing `~/.omp/agent/config.yml` or anything else outside the config repo; and the first real Jev call. Dry-run sends task descriptions to OpenRouter/TypeSafe.
- No model identifiers hard-coded in logic. Tiers map to model selectors in config only.

## Decision pipeline (shared by both cores)

```
features (code)  ──►  state  ──►  Decider (Jev, 1 call)  ──►  policy (code)  ──►  tier + reason
  file count → "a few files"        task_description            choice: tier_need     max(choice tier
  diff size  → "large change"       scope_words                 noul: needs_deep_…      (+1 if margin < τ),
  path hits  → "touches auth"       sensitive_areas             noul: security_…      noul floors,
  module spread → "many modules"    prior_failures_words        noul: ambiguous_…     score floor,
                                                                noul: many_modules    override floors,
                                                                score: complexity     failure bump) ≤ top
```

- **Choice `tier_need`.** The options are descriptive names, mapped to tiers in code:
  - `routine_mechanical_edit` → Haiku
  - `standard_feature_work` → Sonnet
  - `hard_multi_step_reasoning` → Opus
  - `frontier_open_ended_problem` → Fable

  Option order is shuffled on every call with a seedable RNG, so tests are deterministic.
- **Nouls, phrased so `true` is the risky condition:** `needs_deep_reasoning`, `security_sensitive`, `spec_is_ambiguous`, `touches_many_modules`. Each p ≥ `thresholds.noul` raises the floor to that flag's configured minimum tier.
- **Score `complexity`:** four levels, from "one-line or config tweak" to "cross-cutting redesign". An expectation ≥ `thresholds.complexityForSonnet` (or `…ForOpus`) raises the floor. Per the docs, the expectation is used only for threshold tests, never for arithmetic.
- **Confidence:** the gap between the top two choice probabilities. Below `thresholds.choiceMargin`, escalate one tier.
- **Deterministic overrides (no Jev):**
  - path globs and keywords raise the floor (e.g. `**/migrations/**` → Opus; `auth`, `payment`, `secret`, `.env` → Sonnet or higher, configurable)
  - two consecutive failing test runs bump one tier
  - a Jev error, timeout or malformed answer returns `safeDefaultTier`, logged with `override_reason: "decider_failure"`
- **Output:** the omp adapter returns `[chosenTier, …higher tiers]` as model selectors, so omp's own retry walks *up*, never down.

## Config shape (`router.config.json`)

```json
{
  "enabled": true,
  "mode": "dry-run",
  "tiers": [
    { "name": "haiku",  "model": "<selector>" },
    { "name": "sonnet", "model": "<selector>" },
    { "name": "opus",   "model": "<selector>" },
    { "name": "fable",  "model": "<selector>" }
  ],
  "safeDefaultTier": "sonnet",
  "thresholds": { "choiceMargin": 0.25, "noul": 0.6, "complexityForSonnet": 1.0, "complexityForOpus": 2.0 },
  "noulFloors": { "needs_deep_reasoning": "opus", "security_sensitive": "opus", "spec_is_ambiguous": "sonnet", "touches_many_modules": "sonnet" },
  "overrides": {
    "paths": [{ "glob": "**/migrations/**", "minTier": "opus" }],
    "keywords": [{ "match": "auth|payment|secret|credential", "minTier": "opus" }],
    "consecutiveTestFailuresToBump": 2
  },
  "decider": { "kind": "jev", "endpoint": "https://openrouter.ai/api/v1/systemone", "model": "typesafe/jev-1.13", "apiKeyEnv": "OPENROUTER_API_KEY", "timeoutMs": 2500 },
  "log": { "path": "~/.omp/router/decisions.jsonl", "includeTaskText": false }
}
```

The thresholds are starting guesses, to be tuned from dry-run data in Phase 2.

## Log record (`decisions.jsonl`, one line per decision, outcome appended later by `decision_id`)

`decision_id, ts, adapter, mode, task_hash, features (words), questions (names + shuffled order), answers (probabilities per question), choice_margin, jev_tier, final_tier, override_reasons[], decider_model (served snapshot), latency_ms, usage {input_tokens, output_tokens, cost}, actual_model (the model that really ran)`. The outcome is a second record, `{decision_id, kind: "outcome", retries, test_runs_failed, tier_bumps, tokens, cost, success}`.

---

## File Structure

**Phase 1 (omp/harness config repo; final paths are fixed once the repo is attached):**
- Create: `router/contract/questions.json`, `config.schema.json`, `log.schema.json`, `fixtures/*.json`
- Create: `router/src/features.ts`: numbers to words, path and keyword hits
- Create: `router/src/decider.ts`: the `Decider` interface, `JevDecider` (OpenRouter), `StaticDecider` (tests and fallback)
- Create: `router/src/policy.ts`: margin, floors, overrides, failure bump, cap
- Create: `router/src/log.ts`: JSONL writer, hashing
- Create: `router/src/failures.ts`: consecutive test-failure tracker
- Create: `router/extension/index.ts`: omp wiring (`before_subagent_spawn`, `tool_result`, outcome events)
- Create: `router/scripts/report.ts`
- Create: `router/test/*.test.ts`, `router/test/integration.jev.test.ts` (opt-in)
- Create: `router/router.config.json` (dry-run), `router/README.md`
- Modify: the project-level `.omp/config.yml` in the config repo only, to load the extension

**Phase 3 (this repo, after Jeeves exists):**
- Create: `backend/internal/core/ports/tier_router.go`, `backend/internal/core/services/tier_router.go` (policy)
- Create: `backend/internal/adapters/jev/decider.go`
- Create: `backend/test/tierrouter/*_test.go`, which runs the vendored `contract/fixtures`

---

## Phase 1: omp extension (dry-run)

### Task 0: Attach the repo and confirm the runtime

- [ ] Attach the omp/harness config repo to the session (owner to name it) and read its structure and existing `.omp/` config
- [x] Confirm the `before_subagent_spawn` payload fields from the omp source. Done 2026-10-22: there's no task text, so the router joins on `tool_call` (see the Step 0 table)
- [ ] Confirm from the omp source: how `allocateUnique` suffixes duplicate names; the outcome events that can be tied to a spawned child; the extension runtime (Bun or Node), its built-in test runner, and built-in YAML support
- [ ] Record the findings at the top of `router/README.md`. If the payload lacks the task text, stop and re-plan with the owner

### Task 1: Contract and config

- [ ] Write `questions.json` (the choice, noul and score definitions above, wording only), `config.schema.json`, `log.schema.json`
- [ ] Write the default `router.config.json` with `mode: "dry-run"`
- [ ] Write five or more golden fixtures: trivial rename → haiku; migration path → opus floor; low margin → escalation; Jev timeout → safe default; `security_sensitive` p=0.9 → opus
- [ ] Commit: `feat(router): add contract, config schema and golden fixtures`

### Task 2: Feature extraction (numbers stay in code)

- [ ] `features.ts` maps file count, diff lines and module spread to word buckets ("one file", "a few files", "many files across several modules"), and finds path-glob and keyword hits
- [ ] Unit tests on the bucket edges
- [ ] Commit: `feat(router): compute task features in code and pass them as words`

### Task 3: Decider interface and Jev client

- [ ] `interface Decider { decide(state, questions, opts): Promise<DeciderResult> }`, with a result type that carries the probabilities, the served model, the usage and the latency
- [ ] `JevDecider` posts to the configured endpoint with an `AbortController` timeout, uses only the field names above, and builds `state` as `{ task_description, scope_words, sensitive_areas, prior_failures_words }`
- [ ] It shuffles the choice criteria order from an injected RNG
- [ ] A malformed or missing answer throws a typed error, which the policy turns into the safe default
- [ ] Commit: `feat(router): add Decider interface and Jev client over OpenRouter`

### Task 4: Policy

- [ ] `policy.ts`: tier = max(choice tier, plus one if margin < τ; noul floors; complexity floor; path and keyword floors; failure bump), capped at the top tier, with a list of the reasons that fired
- [ ] Unit tests with `StaticDecider` cover each rule alone, rules combined, the cap at the top tier, and decider failure → safe default
- [ ] All golden fixtures pass
- [ ] Commit: `feat(router): add tier policy with margin escalation and deterministic floors`

### Task 5: Failure tracker

- [ ] `failures.ts` classifies `tool_result` bash calls as test runs with configurable patterns (`go test`, `pnpm run test`, `vitest`, `pytest`, …) and counts consecutive failures per session. The bump applies at the *next* spawn
- [ ] Unit tests: fail-fail bumps once; fail-pass-fail doesn't; a non-test command is ignored
- [ ] Commit: `feat(router): bump tier after consecutive failing test runs`

### Task 6: Logging and the omp wiring

- [ ] `log.ts` appends JSONL decision and outcome records and hashes the task text unless configured not to
- [ ] `extension/index.ts`:
  - `tool_call` on the `task` tool → for each item, start the decision (Jev calls run in parallel) and store it keyed by the item's name
  - `before_subagent_spawn` → match `spawnKey` to a stored decision, allowing for the uniqueness suffix omp adds to duplicate names; no match → log `unmatched` and return `undefined`
  - `enabled: false` → no handlers registered
  - `dry-run` → decide, log, return `undefined` so omp's normal resolution stands
  - `live` → return the tier selectors ascending from the chosen tier
- [ ] Load the extension through the config repo's project `.omp/config.yml` only (never the global config)
- [ ] Commit: `feat(router): wire omp extension in dry-run mode`

### Task 7: Report script

- [ ] `scripts/report.ts` prints: the distribution of final and Jev tiers; how often the router picked a tier below the model actually run, with the estimated tokens and cost saved; the escalation rate and its reasons; the decider failure rate; Jev latency p50/p95; and the retry rate by tier
- [ ] Commit: `feat(router): add dry-run report script`

### Task 8: Opt-in integration test

- [ ] `integration.jev.test.ts` is skipped unless `RUN_JEV_INTEGRATION=1` and `OPENROUTER_API_KEY` are set. It sends one **synthetic** task (no real project content) and checks the response shape, the served model prefix and the latency
- [ ] Commit: `test(router): add opt-in OpenRouter integration test`

### Task 9: README

- [ ] Cover: setup, env vars, dry-run vs live, reading the report, rollback (`enabled: false`; `omp --no-extensions` as an emergency off), the privacy note (what leaves the machine), and the terms note (no training from Jev outputs)
- [ ] Commit: `docs(router): add README`

## Phase 2: Dry-run soak and go/no-go

- [ ] Get owner approval for real Jev calls in dry-run (task descriptions leave the machine)
- [ ] Run until the owner-set gate is met (default proposal: 200+ decisions across 2+ weeks)
- [ ] Go live only if the projected cost drops **and** the retry rate on cheaper picks is no worse than baseline. Tune the thresholds from the data first
- [ ] Switching to live is a one-line config change, made by the owner

## Phase 3: Jeeves adapter (perspectize, after Jeeves is specced)

**Suggested subagent:** `go-backend` (review: `code-reviewer`; tests: `test-writer`)

- [ ] Vendor the contract into `backend/internal/adapters/jev/contract/`, or reference it, per the intent's open question
- [ ] `TierRouter` port and a policy service that mirrors `policy.ts`
- [ ] `JevDecider` adapter with the same timeout and safe default
- [ ] Route once per Jeeves conversation or per background job, never mid-conversation
- [ ] The golden fixtures pass in Go; dry-run logging goes to the existing observability stack (OTel) rather than a local JSONL, if the owner prefers
- [ ] No DB changes expected. If any appear, they go through `db-migration` and are never applied during development

## Verification

- Phase 1: the runtime's test command passes; the integration test passes once by hand with the owner's key; the report runs on a sample log
- Phase 3: `go build ./...`, `gofmt -l .` (empty), `go test ./...` in `backend/`
