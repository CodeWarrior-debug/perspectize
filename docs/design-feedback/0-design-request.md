# 0 — Design Request

Shared brief given **identically** to every design system under evaluation. Each system reads this file, reviews the current Perspectize UI, and writes its own recommendations file. **Nothing in this exercise changes application code.**

## Ground rules

- **Analysis only.** Do not edit anything under `frontend/` or `backend/`. Write exactly one file: your own `N-<system>-recommendations.md` in this directory.
- Recommend; don't implement. Where a fix is concrete (a token value, a CSS rule), you may quote it as a suggestion inside your markdown.
- Evidence over taste-talk: cite the component/file (`frontend/src/lib/components/ActivityTable.svelte`, theme tokens under `frontend/src/lib/components/theme/`, `frontend/docs/DESIGN_SPEC.md`) or the screenshot you are reacting to.
- Do not include any deployment URL in your output file.

## Where the owner is today

The owner rates the current design a **C-** and wants it to reach **B+ or better**.

### Top complaint (fix-first)

**Activity table row hover shading.** On hover, the row highlight colour is the same as the every-other-row (zebra) stripe colour. Hovering an odd/even row is therefore indistinguishable from resting on a striped row, so hover gives no feedback. It also ignores the active theme.

### Priorities (ranked, in order)

1. **Clear**
2. **Calming**
3. **Beautiful**
4. **Interesting**

### Prior review context (verbatim, from an earlier design pass)

> **Perspectize: from correct to calm.**
> The bones are good. The token system is real, the Geist + Charter pairing is the right idea, the Activity table is powerful, and the hover tooltips work. What holds it back is weight: four heavy navy bands on one screen, borders around borders, saturated alert colours used for everyday data, and a table that ignores the theme you pick.

Treat this as one opinion to confirm, refine or challenge — not as ground truth.

## What to deliver (per system)

A single markdown file, `N-<system>-recommendations.md`, containing:

1. **Verdict** — a letter grade for the current UI as *this system* sees it, and one paragraph of why.
2. **Findings, ranked by the four priorities above** — each with: what's wrong, where (file/component/screen), why it matters under this system's principles, and the suggested fix.
3. **Activity table hover/zebra fix** — a specific recommendation (colours, states, focus/selected interplay, dark mode).
4. **Path from C- to B+ or better** — the smallest ordered set of changes that reaches B+, plus what would push it beyond, and what you would *not* touch.
5. **10 colour palettes to try in the theme picker** — see below.
6. **Self-report** — which of this system's own rules/checklists you applied, and anything the system could not help with.

### Palette requirements (10 or so)

- Roughly **10** palettes, each a candidate for the in-app **theme picker**.
- Each palette: a name, one-line intent, and hex values for at least: `background`, `surface`, `surface-alt` (zebra), `row-hover`, `border`, `text`, `text-muted`, `primary`, `primary-foreground`, `accent`, and status colours (`success`, `warning`, `danger`, `info`).
- Include **light and dark** variants where sensible, and mix of conservative and bolder options.
- `row-hover` must be **visibly distinct** from `surface-alt` in every palette (this is the top complaint).
- State WCAG contrast for `text` on `background` and `text` on `row-hover` (target ≥ 4.5:1).
- Weight the set toward the priorities: clear and calming first.
- Palettes must work with the existing Geist + Charter type pairing and existing token names where possible (`frontend/docs/DESIGN_SPEC.md`).

## Systems under evaluation

| # | System | Source |
|---|--------|--------|
| 1 | `impeccable` | pbakaus/impeccable, v4.3.1 (global skill) |
| 2 | `frontend-design` | Anthropic `frontend-design` plugin (updated 2026-09-24) |
| 3 | `design-taste-frontend` | Leonxlnx/taste-skill (project-installed) |
| 4 | awesome-design-skills pick(s) | bergside/awesome-design-skills |

## Metrics captured per run

Wall-clock duration, total tokens used, tool-call count, and output size (words / palettes delivered). Recorded by the orchestrator, not self-reported by the system.
