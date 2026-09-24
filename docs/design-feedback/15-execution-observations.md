# Observations from executing each system's recommendations

Written after building the four `option/*` branches (2026-09-24). These are what turned up when the recommendations met the real code, tests and a live browser, not a re-ranking of the research docs. See `7-design-synthesis-and-recommendations.md` and `14-drive-synthesis.md` for the earlier analysis.

## Per system

**impeccable** (`option/impeccable-suggestions`)
- Strongest on interaction detail: soft-tint segmented toggles, `aria-pressed`, a hover fade-in.
- The hover fade could not be a CSS `transition`. AG Grid's hover layer is a `::before` with `content: none` until hover, so nothing exists to transition from. It needed a `@keyframes` animation.
- The fade cannot be seen in clips on this Mac, because OS Reduce Motion is on. It was verified only by emulating `no-preference`.
- Its palettes were the most task-aware (Mist, Slate Dark, Dusk Plum, Saffron Paper). Two shipped names collided with existing presets and had to be renamed (Midnight Indigo, Terminal Green).

**frontend-design** (`option/frontend-design-suggestions`)
- Best unique catch across all four: presets flattened muted text to pure white or black, so there was no real secondary text level. Fixed with `deriveMutedForeground`.
- The most aesthetic-leaning system: Charter page titles, and Discover cards leading with real description text instead of "SUBSCRIBE: http://…". Both are taste calls; only the muted-text fix is a defect.

**design-taste-frontend** (`option/design-taste-suggestions`)
- The most opinionated and the only one that changed the default: the warm paper `#fbfaf7`, which the "Reading Room" description already promised. That makes it the branch to review first, since it alters what every user sees.
- Found a real inconsistency: the Columns and Sort pickers used labels different from the grid headers and omitted Category. Fixed, with a label-parity test.
- A near-zero zebra plus hairlines only works because hover was fixed first. Its suggested "Reading Room" palette became a duplicate of the new default and was dropped.

**awesome-design-skills** (`option/awesome-design-suggestions`)
- The refined, minimal and clean packs share almost the same rule text. Treating them as three independent votes would have overstated agreement, so they are pooled into one branch.
- The only system to catch an accessibility defect: the focus ring and perspective icon were invisible on Midnight and Terminal. Fixed with `deriveRing` (at least 3:1, else foreground).
- Generated the most palettes (30 candidates); de-duplication in OKLab left 12. Many were near-identical, so raw palette counts are a poor quality signal.

## Cross-cutting

- **Palettes were never self-validated.** None of the systems checked their own palettes against the hover-vs-zebra gate. Blush failed it by 0.001 and was dropped. A per-preset test gate caught this. The recommendations alone would not have.
- **Claims that clips cannot show.** Toolbar height, hover fade, and the Columns and Sort pickers cannot be judged from the table clips. They were checked with numeric probes and screenshots. Recommendations phrased as "feels calmer" need a measurable proxy before they can be verified.
- **Universal fixes had to go first.** Every branch's zebra and hover choices depended on the shared row tokens from PR #417. Without them the four branches would have collided.
- **Themed type icon** appeared in three of the four reviews and was implemented three times. It is a candidate to merge to main once, not per branch.
- **Live-driving found more than static review.** The defects that mattered most (grid ignoring the theme, invisible titles on dark, 52px clipped Tags column) only showed up in the running app.

## Caveats

- These are observations from one session on one codebase. They describe how each system's output held up here, not general quality.
- Mobile clips cannot be YouTube-filtered (the card list ignores the URL filter), so mobile comparisons include Bible items.
