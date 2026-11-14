# App Guide Refresh Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the 9 existing Jeeves app-guide areas true against current `main`, shorter without losing facts, with #457 mergeable and the monthly routine checking the guide for drift.

**Architecture:** Docs-only work on #457's own branch after merging `main` into it. Each area is refreshed by the closed loop the original spec defines (fresh writer, lint, independent verifier, at most 3 rounds). One new step in the monthly routine reports drift using plain `git` and `go test`.

**Tech Stack:** Markdown guide + JSON seeds in `ai-tooling/appguide/`, Go lint (`go test ./appguide/...`), git, the `monthly-maintenance` skill.

**Spec:** [2026-11-14-app-guide-refresh-design.md](../specs/2026-11-14-app-guide-refresh-design.md) (extends [2026-09-26-app-guide-design.md](../specs/2026-09-26-app-guide-design.md))

## Global Constraints

- Work in slot 3 on local branch `claude/jeevesbot-plan-overview-i8cdx2`, created `--no-track` from `origin/claude/jeevesbot-plan-overview-i8cdx2`. Merge `main` by merge commit: no rebase, no force-push. **Nothing is pushed without the owner's go.**
- Scope is the 9 existing areas only. No new areas (Plan, Import, Fonts, Feedback, Web page), no best-practice layer, no per-PR drift mechanism.
- Keep every entry ID unless its feature is gone; keep area slugs (the `activity` slug stays, its title and text say Library). Update `seeds/*.json` to match. `settings.change-theme` stays reserved for the owner.
- No new guide fields. Every area keeps at least 3 seeds including one `must_not_claim` trap (lint rule).
- Done per area = lint clean AND an independent verifier passes every entry and seed. At most 3 writer/verifier rounds, then escalate to the owner; never mark an area done silently. Up to 3 writers in parallel; each agent returns a summary of at most about 200 words.
- Style: pruned, not fragmented. Full sentences; cut filler, repeated facts and instructions the model follows by default.
- Repo rule: no chained bash commands (`&&`); run each command separately.

**Teaching mode (ai-tooling):** each task has a `Learn` line. The quizzes run once, at the end of the run in the final message, not between tasks, because the owner chose uninterrupted inline execution. The owner may skip them. No owner-implements task: this is a docs refresh with no tool or eval code (the reserved `settings.change-theme` entry is the owner's piece).

## Review Focus

1. A `Not supported:` line still denies something that now exists (movies and books in Add content are the known case). Pinned in Task 3 steps 1 and 3.
2. A bold UI label no longer matches what renders (Activity vs Library). Pinned in Task 3 step 3 and Task 5 step 2.
3. Compaction deletes a fact that was true. Pinned in Task 3 step 3 (verifier reads the old-vs-new diff).
4. The `main` merge clobbers or duplicates something outside the guide. Pinned in Task 1 step 3.
5. The monthly step runs where the guide does not exist yet, or ignores an area with no `Verified at`. Pinned in Task 4 step 3.

---

### Task 1: Branch, merge `main`, red baseline

**Files:** none changed except the merge. Scratch: sizes table in the scratchpad.

**Interfaces:**
- Produces: local branch with `main` merged; `MERGE_SHA` (record it); per-area `read_guide` byte sizes (the "before" numbers); the failing lint output.

**Learn:** a failing test before the fix. The guide lint is the test; Step 4 is watching it fail for the right reason. Reading: `ai-tooling/appguide/lint.go` (the rules, ~10 min). Quiz: what does `source-exists` catch, and what drift can it never catch?

- [ ] **Step 1:** `git checkout --no-track -b claude/jeevesbot-plan-overview-i8cdx2 origin/claude/jeevesbot-plan-overview-i8cdx2`. The uncommitted spec and plan files carry over.
- [ ] **Step 2:** `git fetch origin main`, then `git merge origin/main`. On conflict keep `main`'s content, then re-add only #457's own additions: the AI Tooling job in `.github/workflows/ci.yml`, the `ai-tooling/*.go` glob in `.hooks/pre-commit`, the ai-tooling line in the root `CLAUDE.md` checklist, `.docs/HOOKS.md` and `backend/CLAUDE.md` notes, and the v1.2 entries in `.planning/*`. Complete the merge commit and record `git rev-parse HEAD` as `MERGE_SHA`.
- [ ] **Step 3: Merge-clobber check.** `git diff origin/main --stat -- backend frontend` must list only `backend/CLAUDE.md`. `git diff origin/main --stat -- .github .hooks` must show only the AI Tooling job and the gofmt glob.
- [ ] **Step 4: Red baseline.** In `ai-tooling/`: `go test ./appguide/... -run TestEmbeddedGuideIsClean`. Expected: FAIL with `source-exists` problems naming `UserActivityView.svelte`, `discover/FilterBar.svelte` and `PerspectiveEditor.svelte`. If it passes, stop and report: the drift finding was wrong.
- [ ] **Step 5: Size baseline.** For each slug in `activity adding-content bible compare discover getting-started messaging perspectives settings`, run `go run ./cmd/botler tools call read_guide --input '{"area":"<slug>"}'` from `ai-tooling/` and count bytes of stdout (`wc -c`). Save `slug<TAB>bytes<TAB>bytes/4`. Expected total about 34 KB (`ai-tooling/CLAUDE.md` records that figure).

### Task 2: Writer brief and README index

**Files:**
- Modify: `ai-tooling/appguide/guide/README.md` (Style section and Area index table)
- Modify: `docs/superpowers/specs/2026-09-26-app-guide-design.md:113`

**Interfaces:**
- Consumes: Task 1's size table.
- Produces: the compaction rules writers follow; a **Verified at** column in the area index, value format `<short sha> (YYYY-MM-DD)`, `—` until an area closes. Task 4 reads this format.

**Learn:** a writers' brief is a prompt; every line costs attention. Reading: the "Pruning" section of the writing-for-agents skill (~5 min). Quiz: which kinds of sentence are "no-ops" in a guide entry?

- [ ] **Step 1:** In the README Style list, replace the "Not caveman-compressed" bullet with "Pruned, not fragmented", covering: full sentences; one home per fact; prune sentences the model follows by default; positive phrasing where possible; `Not supported:` lines stay as guardrails; fragment-style compression stays unproven until the eval A/B. Change spec line 113 to match.
- [ ] **Step 2:** Add the **Verified at** column to the Area index table, `—` for all nine.
- [ ] **Step 3:** Run `go test ./appguide/...` in `ai-tooling/`. Expected: the same three `source-exists` failures as Task 1, nothing new, and `TestLoad_SkipsREADMEs` passes.
- [ ] **Step 4: Commit** `docs(ai-tooling): guide style is pruned, not fragmented; add Verified at column`. Put Task 1's size table in the commit body so the "before" numbers live in git.

### Task 3: Refresh one area (run once per area, in this order)

| # | Area | Known drift (verified 2026-11-14; the writer also finds its own) |
|---|---|---|
| 1 | `getting-started` | Says "Select **Activity**" (line 43) and "Browsing the Activity… pages" (line 13). Nav is Library, Discover, Compare, Plan, Import. |
| 2 | `activity` | Cites deleted `UserActivityView.svelte` (the By User view became a User column, #564). Route is `/content-library`. Per-type column setups (#568). |
| 3 | `adding-content` | No movie or book entries; Add content now takes TMDB/IMDb and Open Library links (`detectContentType.ts`). |
| 4 | `discover` | Cites deleted `discover/FilterBar.svelte`. Movie and Book panels, trending feeds and ISBN lookup exist (`discover/Movie*`, `Book*`). |
| 5 | `perspectives` | Cites deleted `PerspectiveEditor.svelte`; the writer finds what replaced it (`CommentsEditor.svelte` exists). |
| 6–9 | `bible`, `compare`, `messaging`, `settings` | No dead sources found; the writer checks the `git log` of its Source files. |

**Files:**
- Modify: `ai-tooling/appguide/guide/<slug>.md`, `ai-tooling/appguide/seeds/<slug>.json`, `ai-tooling/appguide/guide/README.md` (that area's row)

**Interfaces:**
- Consumes: Task 2's README rules and `Verified at` format.
- Produces: a refreshed area file and seeds; the area's README row set to `verified (<n> rounds, refreshed 2026-11-14)` with `Verified at` = `git rev-parse --short origin/main` and today's date; the area's new `read_guide` byte size.

**Learn:** the closed loop and independence. Reading: the "Closed writing loop" section of `docs/superpowers/specs/2026-09-26-app-guide-design.md` (~5 min). Quiz: why does the verifier not see the writer's reasoning? What does a third failed round mean?

- [ ] **Step 1: Writer.** Dispatch a fresh writer subagent. Input: the README, the area file and seeds, the area's table row, and `git log --oneline --since=2026-09-26 -- <the area's Source paths>`. It rewrites the area in place: keeps IDs, adds entries for flows that now exist, removes entries for deleted features (and says so in its summary), applies the style rules, and adds one seed with `expect_ids` for each newly supported flow (for example "How do I add a movie?" expecting `adding-content.add-movie`). Every `Not supported:` line is searched for across the whole frontend, Settings included.
- [ ] **Step 2: Lint.** `go test ./appguide/...` in `ai-tooling/`. Expected: no problems for this area. Other areas may still fail until refreshed.
- [ ] **Step 3: Verifier.** Dispatch a fresh verifier subagent that sees only the area file, its seeds, the old-vs-new `git diff` of the area file, and the repo. It checks every route, location, step and bold label against the Source files and what they import (labels also against `navLinks` in `Header.svelte`); every `Not supported:` line against the whole frontend; and from the diff, any removed fact that was true. It returns pass or fail per entry and seed, listing each claim it could not confirm.
- [ ] **Step 4: Loop.** On any fail, send only the verifier's report back to a fresh writer. At most 3 rounds. After round 3, stop and escalate with the open disagreements.
- [ ] **Step 5: Record.** Update the README row and append the area's new size to the scratch table.
- [ ] **Step 6: Commit** `docs(ai-tooling): refresh <slug> guide area against main`.

### Task 4: Monthly routine step 5b

**Files:**
- Modify: `.claude/skills/monthly-maintenance/SKILL.md` (new step between 5 and 6; `description` frontmatter line)

**Interfaces:**
- Consumes: the README `Verified at` format from Task 2 and each entry's `Source` line.

**Learn:** drift detection without a CI gate: compare "last verified" against what changed since. Reading: `git log <sha>..<ref> -- <paths>` in the git docs (~5 min). Quiz: what would a false negative from this check look like?

- [ ] **Step 1:** Insert **"5b. Check the Jeeves app guide for drift."** with the five numbered actions from the spec's Monthly drift step, each command on its own line with no chaining: guard (skip and record "guide not on main" when `ai-tooling/appguide/` is missing); `go test ./appguide/...` in `ai-tooling/`; per area `git log --oneline <Verified at sha>..origin/main -- <Source paths>` (an area whose `Verified at` is `—` counts as flagged); uncovered routes and `navLinks`; present, then refresh flagged areas only on the owner's yes. State that it never rewrites an area unprompted. Add "Jeeves app guide drift check" to the `description`.
- [ ] **Step 2: Dry run, guide present** (after all nine areas are done). Expected: lint passes; every area's `git log` is empty; uncovered routes are exactly `plan` and `import`.
- [ ] **Step 3: Dry run, guide absent.** `git ls-tree origin/main --name-only -- ai-tooling/appguide`. Expected: empty output, so the guard branch applies and the step records "guide not on main".
- [ ] **Step 4: Commit** `docs(monthly): add Jeeves app guide drift check as step 5b`.

### Task 5: Close-out numbers, stale references, verification

**Files:**
- Modify: `ai-tooling/CLAUDE.md` (the "Guide token cost" and "Guide fan-out" lines, about 36–37)

**Learn:** context cost. Reading: the Anthropic docs' prompt caching page (~10 min; look for what makes a prefix cacheable). Quiz: why is one area about 800 tokens per question rather than 8.6k?

- [ ] **Step 1: Numbers.** Build the before/after table from the scratch table: per area and in total, bytes, approximate tokens (bytes ÷ 4, labelled approximate) and percent change. New movie and book entries may offset the pruning; if the total grew, say so plainly. Update the two `ai-tooling/CLAUDE.md` lines with the new entry count, seed count, KB and tokens.
- [ ] **Step 2: Stale references.** `git grep -n -E "UserActivityView|PerspectiveEditor|discover/FilterBar|Select \*\*Activity\*\*" -- ai-tooling` and `git grep -n "\*\*Activity\*\*" -- ai-tooling/appguide/guide`. Expected: no output.
- [ ] **Step 3: Verification.** In `ai-tooling/`: `go build ./...`, `gofmt -l .` (empty), `go vet ./...`, `go test -race ./...`; all pass. In `backend/`: `go build ./...` as merge sanity. Frontend tests are not run: nothing under `frontend/` changed.
- [ ] **Step 4: Scope check.** `git diff <MERGE_SHA>..HEAD --stat` lists only `ai-tooling/appguide/**`, `ai-tooling/CLAUDE.md`, `.claude/skills/monthly-maintenance/SKILL.md` and `docs/superpowers/**`.
- [ ] **Step 5: Commit** `docs(ai-tooling): record refreshed guide size and counts`.
- [ ] **Step 6: Hand over, do not push.** Report: escalated areas (if any), the before/after table, what was removed, and a request for the owner's go to push to #457's branch. Note that #458–#464 still need restacking and that CI can only be confirmed green after the push. The owner's spot-check of one refreshed area in the running app remains.
