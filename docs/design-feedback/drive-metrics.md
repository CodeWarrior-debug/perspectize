# Drive metrics (round 2)

Baseline: pages = [1: 127.0.0.1:8765 (unrelated), 2: localhost:5173]; theme localStorage `perspectize-theme` = null.

| Run | System | Duration | Tokens | Tool uses | Screenshots (self-reported) | Baseline restored? |
|-----|--------|----------|--------|-----------|-----------------------------|--------------------|
| 1 | impeccable | 140.8 s | 120,687 | 53 | (in output) | Yes |
| 2 | frontend-design | 157.1 s | 132,314 | 57 | (in output) | Yes (agent cleared applied-theme cache; app regenerated it, verified equal to baseline) |
| 3 | awesome/refined | 149.4 s | 129,175 | 58 | (in output) | Yes |
| 4 | design-taste-frontend | 150.8 s | 147,232 | 54 | (in output) | Yes |
| 5 | control (no system) | 126.0 s | 105,264 | 50 | ~11 (output says 13; agent's own correction) | Yes |

Wave totals (runs 1-5): 634,672 tokens, 272 tool uses, 724.5 s sequential (avg 144.9 s per run, 126.9k tokens per run).
Round-1 comparison (per tool, from metrics.md): tokens rose roughly 1.2-1.6x for the same tools; tool uses rose from 12-15 to 50-58.

## Integrity audit (run after all five runs finished, after quarantine restore)

- Quarantine: round-1 files were absent from the repo tree for the whole sequence; `shasum -c` on restore: 11/11 OK.
- Sequential order fixed: impeccable, frontend-design, refined, design-taste-frontend, control. Each run was a fresh agent with the identical prompt template; no output was opened until all five were done.
- Contamination grep on all five outputs (`docs/design-feedback`, `ds-2026-09-23`, round 1, bake-off, Downloads/screenshots, recommendations.md, other reviewers, drive-protocol): 0 hits.
- Write grep (clicked/pressed save/add/create/delete/submit/post/send, sign out): 0 hits.
- Browser baseline (2 pages; theme key null; applied-theme cache equal to baseline; 0 open dialogs) verified after every run.

## Self-reported caveats

- impeccable: no PRODUCT.md, so no context-based critique; hover values computed from theme values rather than measured with a cursor; grid-cell focus, user menu and Messages not checked; its own "3 snapshots" line is wrong.
- frontend-design: grid keyboard focus checked programmatically only; Messages and user menu not opened; cleared the derived applied-theme cache (app regenerated it, verified equal to baseline).
- refined: grid-cell focus, user menu and Messages not verified.
- design-taste-frontend: none stated beyond its findings.
- control: output states 13 screenshots but about 11 were taken.

Synthesis (opus, 14-drive-synthesis.md): 296.4 s, 198,593 tokens, 50 tool uses.
