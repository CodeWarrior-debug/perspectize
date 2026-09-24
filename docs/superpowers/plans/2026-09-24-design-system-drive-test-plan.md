# Design-System Live-Drive Test (Round 2) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to run this plan (the orchestrator dispatches one drive agent at a time in Task 3 and the Opus synthesis agent in Task 5). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Learn what each design tool finds when it can drive the running app (Chrome DevTools MCP) instead of reading source and stills, and whether that changes the ranking from round 1.

**Architecture:** One shared protocol outside the repo. Round-1 material is **quarantined** (moved out of the repo tree) for the whole run. Four design systems plus one no-system control each run **sequentially** as a fresh agent that knows nothing of any other run, writing to a staging folder outside the repo. After all five, quarantine is restored, outputs are copied into `docs/design-feedback/`, and a fresh Opus 5.5 agent writes the drive synthesis including the delta vs round 1.

**Tech Stack:** Claude Code Agent tool (sequential, foreground-per-run), chrome-devtools MCP against the existing `http://localhost:5173/` instance, Skill tool, markdown.

**Spec:** `$SCRATCH/drive/drive-protocol.md` (shared protocol) and round-1 brief `docs/design-feedback/0-design-request.md`

`SCRATCH=/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize/60d62a5e-f586-4932-bd37-64c4d6393b23/scratchpad`

## Global Constraints

- **Test integrity (highest priority):** no agent may learn anything from another agent or from round 1. Each agent is a fresh subagent. Every prompt is the identical template with only `{{SYSTEM}}`, `{{HOW_TO_APPLY}}`, `{{OUTFILE}}` substituted. The orchestrator **never** paraphrases, summarises, or hints at any earlier agent's or round-1 finding in a later prompt, and reads a drive output only after it is complete.
- **Quarantine:** while any drive agent can run, `docs/design-feedback/` and both plan files are absent from the repo tree (moved to `$SCRATCH/quarantine/`), verified by checksum before and after.
- **Read-only against app data** (no Save/Add/Create/Delete/Submit). Theme switching allowed (stored in browser `localStorage` only) but each agent restores the original theme.
- **Sequential, one Chrome.** Each agent opens and closes its own tab; the orchestrator confirms the tab list and theme are back to baseline between runs.
- No signed-in changes: never sign in or handle credentials; if signed out → stop and ask the human.
- **NO application changes.** Nothing under `frontend/`, `backend/`, `.claude/settings*`.
- No chained bash commands (`&&`). Do not read environment secret files.
- Only `http://localhost:5173/` may appear in outputs. Never the private deployment URL.
- Systems: impeccable, frontend-design, awesome-design-skills/refined, design-taste-frontend, plus **control** (no design skill; must not invoke any design/frontend skill).
- Synthesis model: `opus` (Opus 5.5).
- Do not commit; commit only `docs/` if the human asks.

## Review Focus

- Contamination: an agent reads round-1 files or another run's output → protocol rule 5 forbids it, quarantine removes the files, and the orchestrator greps each output for round-1 tell-tales only **after** the run (never feeding results forward).
- A previous agent left a stray tab, a changed theme, or a dialog open → between-run baseline check; if dirty, fix (close tab / restore theme) before the next run and log it.
- An agent writes data through the app → protocol rule 1; orchestrator checks the final tab/URL state and asks the human to spot-check if any write-capable button was mentioned as clicked.
- Signed-out session mid-run → agent reports `BLOCKED-SIGNED-OUT`; stop the sequence and ask the human.
- The control agent invokes a design skill anyway → check its self-report and tool-use log; mark run invalid and re-run once.
- Order bias (later agents benefit from a cleaner browser, not knowledge) → order is fixed and recorded; note it in the synthesis.

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `$SCRATCH/drive/drive-protocol.md` | Shared protocol given to every agent (outside repo) |
| `$SCRATCH/drive/out/` | Staging for the five drive outputs (outside repo) |
| `$SCRATCH/quarantine/` | Holds round-1 files during the runs |
| `docs/design-feedback/9-impeccable-drive-findings.md` | Run 1 |
| `docs/design-feedback/10-frontend-design-drive-findings.md` | Run 2 |
| `docs/design-feedback/11-awesome-refined-drive-findings.md` | Run 3 |
| `docs/design-feedback/12-design-taste-frontend-drive-findings.md` | Run 4 |
| `docs/design-feedback/13-control-drive-findings.md` | Run 5 (no design system) |
| `docs/design-feedback/drive-metrics.md` | Per-run time/tokens/tool uses/screenshots |
| `docs/design-feedback/14-drive-synthesis.md` | Opus synthesis incl. delta vs round 1 |

---

### Task 1: Preconditions and quarantine

**Files:** move only; nothing edited.

- [ ] **Step 1: Confirm the app is up**

Run: `curl -s -o /dev/null -w "%{http_code}" http://localhost:5173/`
Expected: `200`.

- [ ] **Step 2: Baseline the browser**

With chrome-devtools `list_pages`, note the open pages (baseline list). Read the current theme value from `localStorage` in the existing page (key from `frontend/src/lib/theme/store.svelte.ts`) and record as `BASELINE_THEME`. If the page shows a sign-in screen → stop, ask the human.

- [ ] **Step 3: Checksum, then quarantine round 1**

Run: `shasum docs/design-feedback/*.md docs/superpowers/plans/2026-09-24-design-system-feedback-bakeoff-plan.md docs/superpowers/plans/2026-09-24-design-system-drive-test-plan.md > $SCRATCH/quarantine-checksums.txt`
Then, one Bash call each: `mkdir -p $SCRATCH/quarantine`, `mv docs/design-feedback $SCRATCH/quarantine/design-feedback`, `mv docs/superpowers/plans/2026-09-24-design-system-feedback-bakeoff-plan.md $SCRATCH/quarantine/`, `mv docs/superpowers/plans/2026-09-24-design-system-drive-test-plan.md $SCRATCH/quarantine/`.
Verify: `ls docs/design-feedback` fails and no file in `docs/` mentions "bake-off" or "drive" (`grep -rli "bake-off\|drive-protocol" docs` returns nothing).

- [ ] **Step 4: Create staging dir**

Run: `mkdir -p $SCRATCH/drive/out`

### Task 2: Prompt template

**Interfaces:**
- Produces: the identical prompt used for all five runs.

```text
You are an independent design reviewer. You apply exactly ONE approach: {{SYSTEM}}.
{{HOW_TO_APPLY}}

Your complete instructions are in /private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize/60d62a5e-f586-4932-bd37-64c4d6393b23/scratchpad/drive/drive-protocol.md — read it first and follow it exactly, including its hard rules.

Write only this one file:
/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize/60d62a5e-f586-4932-bd37-64c4d6393b23/scratchpad/drive/out/{{OUTFILE}}
```

`{{HOW_TO_APPLY}}` and `{{OUTFILE}}` per run:

| Run | `{{SYSTEM}}` | `{{HOW_TO_APPLY}}` | `{{OUTFILE}}` |
|---|---|---|---|
| 1 | impeccable | Invoke the `impeccable` skill via the Skill tool and follow it. Use its live/browser iteration and critique flows as it directs. Design context is in `/Users/jamesjordan/GitHub/perspectize/.impeccable.md`; do not interview anyone. | `9-impeccable-drive-findings.md` |
| 2 | frontend-design | Invoke the `frontend-design:frontend-design` skill via the Skill tool and follow it. | `10-frontend-design-drive-findings.md` |
| 3 | awesome-design-skills / refined | Read `$SCRATCH/awesome-design-skills/skills/refined/SKILL.md` and `DESIGN.md` and apply them. | `11-awesome-refined-drive-findings.md` |
| 4 | design-taste-frontend | Invoke the `design-taste-frontend` skill via the Skill tool and follow it. | `12-design-taste-frontend-drive-findings.md` |
| 5 | control | Use NO design skill, design system, or design checklist. Do not invoke any skill. Review as a capable generalist would. | `13-control-drive-findings.md` |

### Task 3: Sequential runs (repeat for runs 1-5, in order)

For each run N:

- [ ] **Step 1: Baseline check** — `list_pages` equals the baseline list; the theme equals `BASELINE_THEME`. If not, close stray tabs / restore the theme and log it.
- [ ] **Step 2: Record T0** — `date +%s`.
- [ ] **Step 3: Dispatch ONE fresh agent** (`subagent_type: general-purpose`, default model) with the Task 2 template, verbatim. Wait for its completion notice; do not start the next run until it arrives.
- [ ] **Step 4: Record metrics** — tokens, tool uses, duration from the completion notice into `$SCRATCH/drive/drive-metrics.md`; count screenshots from its self-report.
- [ ] **Step 5: Post-run baseline check** — as Step 1. Do **not** open the output file yet.

### Task 4: Restore quarantine and integrity check

- [ ] **Step 1:** After run 5 completes, restore: `mv $SCRATCH/quarantine/design-feedback docs/design-feedback` and move both plan files back to `docs/superpowers/plans/` (one Bash call each).
- [ ] **Step 2:** Run `shasum -c $SCRATCH/quarantine-checksums.txt`. Expected: every file `OK`.
- [ ] **Step 3:** Copy `$SCRATCH/drive/out/*.md` into `docs/design-feedback/` and `drive-metrics.md` beside them.
- [ ] **Step 4: Contamination audit (now safe to read).** For each output, check whether it cites round-1 artefacts (`docs/design-feedback`, `ds-2026-09-23`, "round 1", another tool's name) and whether it made any write. Record in `drive-metrics.md`. Mark any tainted run **invalid** and offer a re-run.

### Task 5: Opus drive synthesis

- [ ] **Step 1: Dispatch ONE fresh agent, `model: opus`, `subagent_type: general-purpose`** with this prompt:

```text
You are an independent analyst. Read in /Users/jamesjordan/GitHub/perspectize/docs/design-feedback/: the round-1 files 0-design-request.md, 1- to 7-*.md and metrics.md, and the round-2 files 9- to 13-*-drive-findings.md, drive-metrics.md.
Round 1 = the same design tools reviewing from source and stills only. Round 2 = four tools and one no-system control driving the live app.
Write 14-drive-synthesis.md:
1. Per-tool scorecard for round 2 (specificity, live evidence quality, Part A completeness, new findings, cost) and a ranking, with the control as the baseline: what did each design system add over plain Claude?
2. Delta vs round 1, per tool: what live driving added, what it contradicted (esp. round-1 claims about hover, the theme not reaching the grid, focus rings, muted text), and what round 1 found that live driving did not.
3. Findings that ≥3 round-2 runs raised independently; unique findings; contradictions with judgement.
4. Whether the round-1 ranking changes, and which tool(s) to keep using and for what.
5. Updated consolidated top-10 recommendations and the C- to B+ path, merging both rounds.
6. Integrity notes: any sign of contamination or writes.
Analysis only; no app changes; do not chain shell commands with &&; do not read environment secret files; no URL other than http://localhost:5173/. Reply with the output path in one line.
```

- [ ] **Step 2:** Record its usage in `drive-metrics.md`.

### Task 6: No-changes verification and report

- [ ] **Step 1:** `git status --short` — only `docs/design-feedback/`, `docs/superpowers/plans/*`, and the previously untracked skill/`tools/` files. Anything under `frontend/` or `backend/` → report, don't revert.
- [ ] **Step 2:** Confirm final `list_pages` and theme equal baseline.
- [ ] **Step 3:** Report the ledger, the ranking, and links to files 9-14. Do not commit unless asked.
