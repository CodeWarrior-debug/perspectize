# Jev-based Claude tier router

Status: draft

## Problem

Every planned step and subagent runs on whatever model the session happens to be on, usually a high tier. Mechanical work (renames, small edits, lookups) spends the same Anthropic subscription allowance as hard work (security-sensitive changes, ambiguous specs, cross-module refactors), so limits run out early.

Picking the tier by hand for each subagent doesn't scale. Naive automatic routers make it worse: switching models mid-conversation throws away the prompt cache, which is per-model, and a public router's logs showed that this cost more than routing saved.

Jeeves, the planned Perspectize AI assistant ([FEATURE_BACKLOG.md → Jeeves AI Assistant](../../FEATURE_BACKLOG.md#jeeves-ai-assistant)), will face the same choice for each conversation and each background job, on the same Claude tiers.

## Proposed outcome

- A router picks a Claude tier (Haiku / Sonnet / Opus / Fable) for each unit of work, and only at a boundary: a subagent spawn, a new task or job, or a new conversation. It never switches a running conversation's model.
- One Jev call (TypeSafe System One, pinned `typesafe/jev-1.13`, reached through OpenRouter) answers several typed questions about the work: a tier choice, risk flags and a complexity score.
- Deterministic rules in code then raise the floor. Sensitive paths and keywords (migrations, auth, payments, secrets) set a minimum tier. Two consecutive failing test runs bump one tier. A Jev failure or timeout falls back to a safe default tier.
- It ships in **dry-run** mode. It logs what it *would* pick while the normal model runs, and a report script shows whether live routing would cut cost without raising the retry rate.
- The core is harness-agnostic, so the same decision logic, config and log format serve two adapters:
  1. **oh-my-pi (omp) extension**, in the personal omp/harness config repo, on omp's `before_subagent_spawn` hook. This is the first adapter.
  2. **Jeeves**, in this repo's Go backend, as a hexagonal port and adapter. This comes later. Jeeves won't run on omp.
- Success is measured as **lower cost at an equal or lower retry rate**, not as agreement with the tiers a human would have picked.

## Affected users and systems

- **The owner's Claude Code / omp usage:** subagent model selection, via the omp extension.
- **Personal omp/harness config repo** (repo name TBD, not yet attached to the cloud session): extension code, config, tests, report script.
- **Perspectize backend (later):** a Jeeves model-tier port and a Jev adapter beside the future `internal/jeeves` package.
- **External services:** OpenRouter, and TypeSafe behind it. They receive the routing state: the task description plus computed features in words. They never receive source code.

## Constraints

- **Never switch models mid-conversation.** Route only at boundaries.
- **Jev is weak at numbers, dates and counting.** Compute file counts, diff sizes and similar in code and pass them as words ("large refactor across many modules").
- **Jev favours the first choice option.** Use descriptive option names, not A/B/C, and shuffle the option order on every call.
- **Confidence** is the margin between the top two probabilities, not the `confidence` field. Below the configured threshold, escalate one tier.
- **Task text is untrusted data.** It goes in a named JSON field of `state`. Instructions appear only in question text.
- **Secrets:** `OPENROUTER_API_KEY` comes from the environment and is never committed.
- **TypeSafe terms** (as stated by the owner; the clause itself is not yet verified, see Open questions) forbid using Jev outputs to train or distill models. Outcomes are logged for evaluation only, never built into training sets. Logs store a hash of the task text by default, not the raw text.
- **Swappable decider.** A small `Decider` interface lets Jev, DeepSeek or a local model (e.g. Kev) be swapped in.
- **Rollback is one setting**, and live routing is never on by default.
- **Owner approval first** before adding dependencies, touching global omp config outside the config repo, or sending real project content to an external service. Dry-run still *calls* Jev, so the first real call needs that approval.

## Open questions

- The omp/harness config repo will be `CodeWarrior-debug/oh-my-pi-home`. It doesn't exist yet, and the owner creates it because cloud sessions can't create repos.
- Where does the shared contract live (question set, config schema, log schema, golden fixtures) so the TypeScript and Go implementations can't drift? Options: the omp config repo, copied into perspectize when the Jeeves work starts; a small standalone repo; or perspectize itself.
- Tier order and model selectors: is Fable above Opus? Default assumed: Haiku < Sonnet < Opus < Fable, configurable.
- How is a subagent's outcome (retries, test results, tokens) joined back to its routing decision in omp? Candidate events: `tool_result`, `agent_end`, `retry_fallback_applied`.
- Exact TypeSafe Master Customer Agreement wording on output use, and its data-retention terms for submitted `state`.
- Dry-run evaluation gate: how many decisions, and what cost and retry thresholds, before live mode is switched on?
- Jeeves boundary: one tier per conversation, or per job type (refinement, summarization, categorization)? This is decided when Jeeves is specced.

## Downstream

- Spec: none yet. The design decisions are recorded in the plan below until this intent is accepted; a spec follows sign-off if the Jeeves phase needs one.
- Plan(s): [docs/superpowers/plans/2026-10-22-jev-model-router-plan.md](../../docs/superpowers/plans/2026-10-22-jev-model-router-plan.md)
- PRs (one line each, add as they open; tick on merge):
  - [ ] docs: Jev model router intent and plan (this PR)
