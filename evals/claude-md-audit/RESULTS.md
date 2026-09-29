# Results — 2026-09-29

`claude plugin eval`, skill v1.0.0, judge Opus, 3 runs per arm per case (54 runs, ~$33 including judging). Scores exclude the since-removed `r5-cors` grader, whose ground truth was wrong.

## Mean score (with skill / without skill)

| Case | Haiku | Sonnet | Opus |
|---|---|---|---|
| planted-defects | 0.67 / 0.79 | **1.00** / 0.91 | **1.00** / 0.91 |
| subtle-defects | 0.82 / 0.91 | **1.00** / 0.91 | **1.00** / 0.91 |
| real-repo-snapshot | 0.48 / 0.30 | 0.91 / 0.88 | **1.00** / 0.91 |
| Sweep cost | $7 | $11 | $15 |

## Findings

- **Opus + skill is the only perfect run** (18/18 graders on every run). Sonnet + skill is perfect except `r3-helpers-path` (0/3), which Sonnet *without* the skill caught 2/3. The skill's checklist seems to trade some path-by-path checking for section scoring.
- **For Sonnet and Opus, the skill's measurable gain is the report format**: `scores-reported` is 3/3 with, 0/3 without. Defect recall is already near-ceiling without the skill.
- **The skill hurts Haiku's recall** on both synthetic cases (planted −0.12, subtle −0.09): Haiku misses the planted contradiction (0/3), the stale prose path (1/3) and the renamed constructor (0/3) with the skill, but catches most of them without. On the real repo Haiku finds almost nothing either way (R1, R2, R3, R4, R7 all 0/3).
- **The skill makes Haiku safe to run**: without it, Haiku wrote files 3/3 and edited a CLAUDE.md 1/3 on the real repo without asking. With the skill: never. Sonnet and Opus never wrote either way.
- **Haiku early stops are intermittent**: in the initial single runs, 2 of 4 with-skill runs ended after loading the skill ("the skill is running now…") with no audit. None of the 18 sweep runs did.
- **No false positives** from Sonnet or Opus on any case, including the `make db-reset`-via-`include` trap. Haiku made false claims in 1/3 planted runs per arm.

## Recommendation

Use Sonnet + skill for routine audits (matches Opus except one path check, ~25% cheaper). Use Opus when an audit must be exhaustive. Don't use Haiku for this task.

## Eval bugs found while building it

- Regex defect graders passed reports that only *mentioned* a string → replaced with llm graders.
- `subtle-defects` trap `make db-reset` pointed at a missing `scripts/reset.sql`; Sonnet correctly reported it broken → fixture fixed.
- `r5-cors` ground truth was wrong (`CORS_ORIGINS` defaults to `*`) → grader removed, turned into a false-positive trap.
- `r7-middleware-path` was not in the original ground truth; a Sonnet run found it.
