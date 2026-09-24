# Bake-off metrics

Recorded by the orchestrator from each Agent tool result. Wall-clock = each agent's own reported duration; all six were dispatched together in one message (T0 = epoch 1790229178), so the wave took as long as the slowest agent (~117 s).

| # | System | Wall-clock | Total tokens | Tool uses | Output words | Palettes | row-hover ≠ zebra? | Mentions hover/zebra bug? (hover mentions) | Wrote only its file? |
|---|--------|-----------|--------------|-----------|--------------|----------|--------------------|-----------------------------------------|----------------------|
| 1 | impeccable | 117.2 s | 110,162 | 15 | 2,776 | 10 | Yes, all 10 (script-checked) | Yes (47) | Yes |
| 2 | frontend-design | 75.2 s | 83,304 | 12 | 1,692 | 10 | Yes, all 10 (script-checked) | Yes (32) | Yes |
| 3 | design-taste-frontend | 91.7 s | 114,519 | 14 | 2,044 | 10 | Yes, all 10 (script-checked) | Yes (18) | Yes |
| 4 | awesome/refined | 81.5 s | 82,687 | 13 | 1,844 | 10 | Yes, all 10 (script-checked) | Yes (18) | Yes |
| 5 | awesome/minimal | 83.1 s | 89,002 | 13 | 1,882 | 10 | Yes, all 10 (script-checked) | Yes (26) | Yes |
| 6 | awesome/clean | 84.9 s | 102,403 | 13 | 2,101 | 10 | Yes, all 10 (script-checked) | Yes (23) | Yes |
| 7 | synthesis (opus) | 520.8 s | 207,382 | 57 | – | – | – | – | Yes |

Wave totals (systems 1-6): 582,077 tokens, 80 tool uses, ~117 s wall-clock (sequential sum would be ~534 s).

## Self-reported caveats (from each agent's hand-back / output)

- **impeccable:** skipped its detector run, browser pass and full 10-heuristic table; single-context review.
- **design-taste-frontend:** skill loaded via Skill tool; its section 13 puts data tables out of scope, so the hover/zebra fix is the agent's own reasoning; opened only screenshots 01 and 09; row hover inferred from CSS.
- **All:** no row-hover screenshot exists, so hover behaviour was inferred from CSS by every reviewer.

## Checks run by the orchestrator

- `git status --short`: only `docs/design-feedback/` and the plan file are new; nothing under `frontend/` or `backend/` changed.
- Palette check: a script parsed each file's section 5 and compared `surface-alt` (zebra) to `row-hover` per palette: 0 collisions across all six files. Impeccable's parse returned 20 pairs though the file has exactly 10 palette headings (P1-P10); the cause of the double count was not investigated (likely the parser matching two table shapes), and no collision appeared in either count.
- "Mentions hover bug" is a keyword count, not a quality judgement; the synthesis agent judges quality.
