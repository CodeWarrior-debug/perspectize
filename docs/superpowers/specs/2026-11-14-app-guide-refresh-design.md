# App Guide Refresh (current + compact) — Design

Status: **approved by the owner 2026-11-14**, plus a monthly-routine step added at the owner's request ("probably add to monthly routine as well"; the step's design is my call). Small change: docs and one routine-skill edit, no product code. Extends [2026-09-26-app-guide-design.md](2026-09-26-app-guide-design.md); the format, lint and closed writing loop there are unchanged unless stated.

Calls marked **(my call)** were proposed by the agent, not decided by the owner.

## Intent and why

Jeeves answers how-to questions only from the app guide, and the guide was verified on 2026-09-26. Since then 72 commits have touched `frontend/src`. Measured against `origin/main` on 2026-11-14:

- Three cited `Source` files no longer exist: `UserActivityView.svelte`, `discover/FilterBar.svelte`, `PerspectiveEditor.svelte`. The guide's own lint should fail once `main` is merged in (not yet run).
- `getting-started` says "Select **Activity**". The nav label is **Library**, at `/content-library`.
- No entry covers adding or browsing movies and books. The system prompt makes Jeeves say the "unsupported" sentence when an area has no entry, so Jeeves tells users the app can't do things it can.
- #457 is 59 commits ahead of and 199 behind `main`, and conflicts with it.

A stale guide is worse than a missing one: Jeeves states false things confidently.

## Learning objectives (ai-tooling teaching mode)

- **Grounding drift:** why an assistant that answers only from a guide becomes confidently wrong as the guide ages, and how a "not supported" line turns drift into a false denial.
- **Closed loops:** why an independent verifier checking against objective ground truth (the code) catches what a self-checking writer misses.
- **Knowledge cost:** always-loaded versus fetched-on-demand context, and why pruning saves less than new coverage adds.

## Goals

1. Every claim in the 9 existing areas is true against `main` at refresh time, and an independent verifier has checked it.
2. The guide is shorter per area without losing a fact, measured before and after.
3. #457 is mergeable: `main` merged in, conflicts resolved, CI green including the AI Tooling job.
4. The monthly maintenance routine checks the guide for drift, so the next refresh is not another 72-commit surprise.

## Non-goals (decided: later)

- New areas: Plan, Import, Settings → Fonts, Feedback, Web page (option 2).
- A best-practice layer, "how to use the app well" (option 3). This is also where "well" gets defined.
- A per-PR staleness mechanism: CI drift check or generated facts (option 4). The owner wants it explained before approving anything. The monthly step below is a manual stopgap, not a decision on option 4.
- Restacking #458–#464, running a live eval, or any change to `backend/`, `frontend/` or Jeeves code.

## Anti-goals

- Jeeves says "not supported" for a feature that exists, or gives steps for one that doesn't.
- Any claim not traceable to a `Source` file.
- Compaction that costs accuracy (fragments, dropped labels).

## Scope line (my call)

In: anything that changed inside the 9 existing areas: the Library rename, per-type columns, movie and book flows in Add content and Discover, removed components, and any new nav entries the existing entries must mention. Out: whole new surfaces (see Non-goals).

## Approaches

| | A. On #457's own branch (**chosen**) | B. Restack first, refresh after |
|---|---|---|
| How | Merge `main` into #457's branch, resolve conflicts, refresh the guide there | Rebase the stack onto `main` as a separate job; refresh follows as a small PR |
| For | Guide current in the PR that introduces it; #457 becomes mergeable; starts now | Small, clean diff to review |
| Against | #458–#464 need restacking afterwards (already owed: #458 trails #457 by 27 commits) | Blocked until the restack is done |

Either way `main` must be in the guide's branch, because the verifier and lint need the current `frontend/`.

## Method

- **Branch (my call):** local branch `claude/jeevesbot-plan-overview-i8cdx2` in worktree slot 3, created `--no-track` from the origin branch (not checked out in any other local worktree). Merge `main` by merge commit: no rebase, no force-push. **Nothing is pushed without the owner's go.**
- **Process:** the existing closed loop. A fresh writer subagent per area, then lint, then an independent verifier that sees only the area file, the seeds and the code. At most 3 rounds, then escalate. Up to 3 writers in parallel. Done per area = lint clean, verifier passes every entry and seed.
- **Entry IDs (my call):** keep every ID unless its feature is gone. Update `seeds/*.json` to match. `settings.change-theme` stays reserved for the owner.
- **Format (my call):** no new fields this pass.

## Compaction (my call)

Apply writing-for-agents: prune sentences the model follows by default, give each fact one home, state things positively where possible, keep lookups out of prose. `Not supported:` lines stay as guardrails; the prompt already pairs them with "closest supported option".

Honest expectation: savings are small. `ai-tooling/CLAUDE.md` records all 9 areas at about 34 KB (about 8.6k tokens) as `read_guide` results, one area about 800 tokens, and scoped loading fetches one area per question. The value is mostly accuracy and upkeep. So:

- The recorded decision "not caveman-compressed" stands for **fragments**. Update the README rule and spec line 113 to "pruned, not fragmented."
- Fragment-style compression stays unproven until the eval A/B the original spec names. It needs the owner's `ANTHROPIC_API_KEY`.
- Report size per area before and after, using the same `read_guide` output measure, with characters ÷ 4 as an approximate token count (labelled approximate).

## Monthly drift step (design is my call)

A new step **5b. Check the Jeeves app guide for drift** in `.claude/skills/monthly-maintenance/SKILL.md`, and its `description` line. It only reports. It never rewrites a guide area without the owner's yes.

1. If `ai-tooling/appguide/` does not exist, skip and note "guide not on main" in ROUTINES.md Comments. This makes the step safe on any branch.
2. Run `go test ./appguide/...` in `ai-tooling/`. A failure is definite drift (for example a cited file was deleted).
3. For each area, list commits since its **Verified at** commit that touched its `Source` files: `git log --oneline <sha>..origin/main -- <paths>`. Any hit flags the area.
4. List routes under `frontend/src/routes/` and `navLinks` in `Header.svelte` that no area covers. These are candidate new areas (option 2).
5. Present flagged areas and uncovered routes. On the owner's yes, run the closed loop for the flagged areas only, update their **Verified at**, and paste the summary into the routine's PR body.

Supporting change: the guide README's area index gains a **Verified at** column (commit and date of the `main` the verifier checked against). The README is not loaded as an area, so no lint change is expected; the builder confirms.

No new script: plain `git` and `go test` commands, one per step, no chaining. A script is a later option if the step proves tedious. It lands with the refresh on #457's branch, because the step is meaningless without the guide; the builder may split it into its own chore PR.

## Left to the builder

Order of areas (suggest most drift first: getting-started, activity/Library, adding-content, discover); writer brief wording; how to resolve conflicts in the `main` merge; whether a repeated field (e.g. `Sign-in required: yes` on every in-app entry) is worth raising later as a format change; updating the "Guide fan-out" line in `ai-tooling/CLAUDE.md` with the new numbers.

## Owner checks at the end

Spot-check one refreshed area in the running app (as in #457's test plan). Review escalated disagreements, if any.
