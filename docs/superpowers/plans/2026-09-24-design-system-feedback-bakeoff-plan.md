# Design-System Feedback Bake-off Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to run this plan (the orchestrator dispatches the parallel analysis agents itself in Task 3 and the Opus synthesis agent in Task 5). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Find out which design tool gives the best out-of-the-box feedback on the Perspectize UI (C- today, target B+ or better), by running six analyses in parallel against one shared brief and having an independent Opus reviewer compare them.

**Architecture:** One shared brief (`0-design-request.md`) + one shared evidence set (pre-captured screenshots + source pointers) → six fresh parallel subagents, each applying exactly one design system and writing exactly one recommendations file → one fresh Opus 5.5 agent, seeing only the files (not this conversation), writes the synthesis. The orchestrator records wall-clock, tokens and tool-uses from each agent's result into a metrics ledger.

**Tech Stack:** Claude Code Agent tool (parallel subagents, no agent-teams flag), Skill tool, pre-captured `ds-` screenshots, markdown.

**Spec:** `docs/design-feedback/0-design-request.md`

## Global Constraints

- **NO application changes.** Nothing under `frontend/`, `backend/`, `.claude/settings*`, or tokens may be edited. Only files in `docs/design-feedback/` (and this plan) are written.
- Branch: `docs/design-feedbacks-from-systems` (already created from `main`).
- No chained bash commands (`&&`) — one command per Bash call, including in subagent prompts.
- Never put the private frontend deployment URL (see `CLAUDE.local.md`) in any file under `docs/`.
- Never read or write environment secret files. Do not capture new screenshots, start the app, or sign in; use the pre-captured `ds-` screenshots only.
- Each analysis agent writes exactly one file: `docs/design-feedback/N-<system>-recommendations.md`.
- Each analysis must deliver ~10 colour palettes for the theme picker with a `row-hover` distinct from `surface-alt` (zebra) in every palette.
- Synthesis agent model: `opus` (Opus 5.5, `claude-opus-5-5`).
- Do not commit the untracked skill-install files (`.agents/`, `skills-lock.json`, `.claude/skills/design-taste-frontend`); commit only `docs/` if the human asks.

## Review Focus

- A system ignores the brief's "analysis only" rule and edits code → Task 6 `git status` check must catch it; revert nothing silently, report it.
- A system returns fewer than ~10 palettes, or `row-hover` equals `surface-alt` → orchestrator flags it in the ledger and the synthesis scores it down.
- A system's recommendations are generic aesthetic advice that never mention the Activity table hover bug → synthesis must record "missed the top complaint".
- An agent cannot invoke its skill (not visible to a subagent) → record as a system failure, do not substitute another system.
- Agents share evidence unequally → all six prompts come from one template with identical evidence paths.
- No screenshot shows row hover → agents must state what they saw vs inferred from CSS; the synthesis notes it.

---

## File Structure

| File | Responsibility |
|------|----------------|
| `docs/design-feedback/0-design-request.md` | Shared brief (already written) |
| `docs/design-feedback/1-impeccable-recommendations.md` | System 1 output |
| `docs/design-feedback/2-frontend-design-recommendations.md` | System 2 output |
| `docs/design-feedback/3-design-taste-frontend-recommendations.md` | System 3 output |
| `docs/design-feedback/4-awesome-refined-recommendations.md` | System 4a output |
| `docs/design-feedback/5-awesome-minimal-recommendations.md` | System 4b output |
| `docs/design-feedback/6-awesome-clean-recommendations.md` | System 4c output |
| `docs/design-feedback/metrics.md` | Orchestrator-recorded duration/tokens/tool-uses per agent |
| `docs/design-feedback/7-design-synthesis-and-recommendations.md` | Independent Opus comparison |

Evidence: `/Users/jamesjordan/Downloads/screenshots/ds-2026-09-23-desktop-*.png` (pre-captured, not copied into the repo). Scratchpad (not committed): `$SCRATCH/awesome-design-skills/` clone (already present) where `SCRATCH=/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize/60d62a5e-f586-4932-bd37-64c4d6393b23/scratchpad`.

---

### Task 1: Shared evidence set (pre-captured — do NOT capture new screenshots)

**Files:** none created. Evidence already exists at `/Users/jamesjordan/Downloads/screenshots/`.

**Interfaces:**
- Produces: the `{{EVIDENCE}}` set = `/Users/jamesjordan/Downloads/screenshots/ds-2026-09-23-desktop-*.png` (24 files: activity table with/without filters, detail views, perspective forms, header add-video popover, settings theme + custom colours, user menu, columns/sorts/search pickers, discover, compare, messages).

- [ ] **Step 1: Confirm the set is present**

Run: `ls /Users/jamesjordan/Downloads/screenshots/ | grep -c '^ds-2026-09-23-desktop-'`
Expected: `24`. No Chrome, no sign-in, no local app start.

- [ ] **Step 2: Note the gap for the agents**

There is no dedicated row-hover shot. Agents must judge the hover/zebra bug from `01-activity-no-filter`, `02`, `03` (zebra visible) plus the row-hover CSS in `ActivityTable.svelte`, and say what they saw vs inferred.

### Task 2: Prompt template and metrics ledger

**Files:**
- Create: `docs/design-feedback/metrics.md`

**Interfaces:**
- Produces: the exact prompt template below, used verbatim for all six agents with only `{{SYSTEM}}`, `{{HOW_TO_APPLY}}`, `{{OUTFILE}}` substituted.

- [ ] **Step 1: Create the ledger**

```markdown
# Bake-off metrics

Recorded by the orchestrator from each Agent tool result. Wall-clock = dispatch-to-notification.

| # | System | Wall-clock | Total tokens | Tool uses | Palettes | row-hover ≠ zebra? | Mentions hover bug? | Wrote only its file? |
|---|--------|-----------|--------------|-----------|----------|--------------------|---------------------|----------------------|
| 1 | impeccable | | | | | | | |
| 2 | frontend-design | | | | | | | |
| 3 | design-taste-frontend | | | | | | | |
| 4 | awesome/refined | | | | | | | |
| 5 | awesome/minimal | | | | | | | |
| 6 | awesome/clean | | | | | | | |
| 7 | synthesis (opus) | | | | – | – | – | |
```

- [ ] **Step 2: Fix the prompt template (used verbatim in Task 3)**

```text
You are one of six independent reviewers. You apply exactly ONE design system: {{SYSTEM}}.
{{HOW_TO_APPLY}}

Read /Users/jamesjordan/GitHub/perspectize/docs/design-feedback/0-design-request.md first — it is your brief and defines the required output.

Evidence you may use (same for every reviewer):
- Screenshots: /Users/jamesjordan/Downloads/screenshots/ds-2026-09-23-desktop-*.png, 24 files (view with the Read tool; start with 01, 02, 09, 10). No row-hover shot exists: say what you saw vs inferred from CSS.
- Source: frontend/src/lib/components/ActivityTable.svelte, frontend/src/lib/components/Header.svelte, frontend/src/lib/components/theme/, frontend/src/app.css (or the global stylesheet), frontend/docs/DESIGN_SPEC.md

Rules: ANALYSIS ONLY. Do not edit any file except the single output file
/Users/jamesjordan/GitHub/perspectize/docs/design-feedback/{{OUTFILE}}
Do not chain shell commands with &&. Do not read environment secret files. Do not include any deployment URL in your output.
Do not read the other reviewers' output files.
When finished, reply with one line: the output path and how many palettes you delivered.
```

### Task 3: Parallel analysis wave

**Files:**
- Create: the six `N-<system>-recommendations.md` files (by the agents)

**Interfaces:**
- Consumes: Task 1 screenshots, Task 2 template.
- Produces: six recommendation files + per-agent usage stats in each Agent result.

- [ ] **Step 1: Record the dispatch time**

Run: `date +%s` → note as T0.

- [ ] **Step 2: Dispatch all six agents in ONE message (parallel), `subagent_type: general-purpose`, default model**

`{{HOW_TO_APPLY}}` per agent:

| Agent | `{{SYSTEM}}` | `{{HOW_TO_APPLY}}` | `{{OUTFILE}}` |
|---|---|---|---|
| 1 | impeccable | Invoke the `impeccable` skill via the Skill tool and follow it (use its critique/audit/polish flows as it directs). It may ask for design context; use `.impeccable.md` in the repo root, do not interview the user. | `1-impeccable-recommendations.md` |
| 2 | frontend-design | Invoke the `frontend-design:frontend-design` skill via the Skill tool and follow it. | `2-frontend-design-recommendations.md` |
| 3 | design-taste-frontend | Invoke the `design-taste-frontend` skill via the Skill tool and follow it, including its audit-first redesign and pre-flight check. | `3-design-taste-frontend-recommendations.md` |
| 4 | awesome-design-skills / refined | Read `{{SCRATCH}}/awesome-design-skills/skills/refined/SKILL.md` and `DESIGN.md` and apply them as your design system. | `4-awesome-refined-recommendations.md` |
| 5 | awesome-design-skills / minimal | Same, `skills/minimal/`. | `5-awesome-minimal-recommendations.md` |
| 6 | awesome-design-skills / clean | Same, `skills/clean/`. | `6-awesome-clean-recommendations.md` |

If a skill cannot be invoked from a subagent, the agent must say so in its output file and proceed with whatever it could load; do not silently fall back to generic advice.

- [ ] **Step 3: Record metrics as each agent completes**

For each completion notice, copy total tokens, tool uses and duration from the result into `docs/design-feedback/metrics.md`. Wall-clock for the wave = last completion − T0 (`date +%s`).

- [ ] **Step 4: Fill the quality columns**

For each output file check: palette count (`grep -c` on the palette heading pattern it used), `row-hover` ≠ `surface-alt` in every palette, and whether the hover/zebra bug is addressed. Fill the ledger columns.

### Task 4: Completeness gate before synthesis

**Files:**
- Modify: `docs/design-feedback/metrics.md`

- [ ] **Step 1: Confirm all six files exist and are non-trivial**

Run: `wc -w docs/design-feedback/[1-6]-*-recommendations.md`
Expected: six files, each > 400 words. Any missing/short file → re-dispatch that single agent once (record both runs in the ledger).

### Task 5: Independent Opus synthesis

**Files:**
- Create: `docs/design-feedback/7-design-synthesis-and-recommendations.md`

**Interfaces:**
- Consumes: files 0–6 and `metrics.md`.

- [ ] **Step 1: Dispatch ONE fresh agent, `model: opus`, `subagent_type: general-purpose`**

Prompt:

```text
You are an independent design-review analyst. You have NOT seen the analyses being produced; you see only the files. Do not edit anything except your one output file.

Read, in /Users/jamesjordan/GitHub/perspectize/docs/design-feedback/: 0-design-request.md (the brief), 1- through 6-*-recommendations.md (six independent reviews by different design tools), and metrics.md (speed, token usage and quality checks recorded by the orchestrator).

Write 7-design-synthesis-and-recommendations.md containing:
1. Scorecard: for each of the six tools — usefulness of output, specificity (file/component-level evidence), coverage of the top complaint (Activity-table hover vs zebra), palette quality (count, hover≠zebra, contrast numbers stated and plausible), adherence to "analysis only", and cost (tokens, time). Rank them and say which gave the best out-of-the-box feedback and why; call out weak or generic output plainly.
2. Patterns and commonalities: findings that ≥3 tools independently raised (strongest signal), findings raised by exactly one tool (possible insight or noise), and where tools contradict each other — with your judgement.
3. Consolidated ranked recommendations under the owner's priorities (Clear, Calming, Beautiful, Interesting), each tagged with the tools that support it.
4. The consolidated hover/zebra fix.
5. A shortlist of ~10 palettes drawn from across the tools (credit the source), de-duplicated, each with the required tokens; verify hover≠zebra and spot-check contrast arithmetic yourself.
6. The smallest path from C- to B+, and what would push it beyond B+.
7. Which tool(s) to keep using, and for what.
No application code changes; this is analysis only. Reply with the output path in one line.
```

- [ ] **Step 2: Record its usage in `metrics.md` row 7**

### Task 6: No-changes verification

**Files:** none modified

- [ ] **Step 1: Confirm only docs changed**

Run: `git status --short`
Expected: only `docs/design-feedback/`, `docs/superpowers/plans/2026-09-24-design-system-feedback-bakeoff-plan.md`, and the pre-existing untracked skill-install files / `tools/gty-channel-survey/`. Anything under `frontend/` or `backend/` → report immediately and do not revert without asking.

- [ ] **Step 2: Report**

Give the human the ledger table, the top-ranked tool per the synthesis, and the links to files 1–7. Do not commit unless asked.
