# Feel-Wheel: Emoji Feeling Picker for Perspectives — Design

## Summary

Add an emoji "feel-wheel" to the perspective data model: a curated 20-emoji circular
picker (opposite feelings placed 180° apart) plus a searchable extended set of ~150-200
curated emoji for feelings not on the wheel. Each selected feeling carries an intensity
(0-10000, matching the existing `Quality`/`Agreement`/etc. rating domain) and an optional
free-text note.

## Scientific grounding

The wheel's opposite-pair structure and the extended set's category coverage are based
on two established emotion models, not picked arbitrarily:

- **Plutchik's Wheel of Emotions** (Robert Plutchik, 1980) — 8 primary emotions in 4
  opposite pairs (joy↔sadness, trust↔disgust, fear↔anger, anticipation↔surprise), each
  with 3 intensity levels radiating from the wheel's center.
  https://en.wikipedia.org/wiki/Contrasting_and_categorization_of_emotions#Plutchik's_wheel_of_emotions
- **Cowen & Keltner, "Self-report captures 27 distinct categories of emotion bridged by
  continuous gradients"**, PNAS 2017 — empirical study finding emotions form a
  continuous, high-dimensional space (not discrete opposite pairs), surfacing categories
  like awkwardness, boredom, confusion, and aesthetic pleasure that don't fit Plutchik's
  4 axes. https://www.pnas.org/doi/10.1073/pnas.1702247114

Practical split: the 20-emoji core wheel follows Plutchik's opposite-pair geometry
(rows 1-4 below); rows 5-10 fill in Cowen & Keltner categories that have no clean
Plutchik opposite (awkward, bored, confused, nostalgic) but are placed at their
best-fit thematic opposite for wheel symmetry. The extended searchable set (150-200
emoji) is organized by these same families rather than flat/alphabetical.

## The 20-emoji core wheel

20 positions at 18° increments around a circle, 0° = 12 o'clock, increasing clockwise.
**Table 1** starts at Love (top, 0°) and proceeds clockwise down the right side.
**Table 2** starts at Hate (bottom, 180°) and proceeds clockwise up the left side.
Row *N* in Table 1 and row *N* in Table 2 are direct 180°-opposite pairs — read the
tables side by side to see each opposition.

| Row | Table 1 — right side (° clockwise from top) | Emoji | Feeling | | Row | Table 2 — left side (° clockwise from bottom) | Emoji | Feeling |
|---|---|---|---|---|---|---|---|---|
| 1 | 0° | 🥰 | Love | | 1 | 180° | 🤬 | Hate |
| 2 | 18° | 😄 | Joyful | | 2 | 198° | 😢 | Sad |
| 3 | 36° | 🤗 | Trusting | | 3 | 216° | 🤢 | Disgusted |
| 4 | 54° | 🤞 | Anticipation/Hopeful | | 4 | 234° | 😲 | Surprised |
| 5 | 72° | 😎 | Cool | | 5 | 252° | 😐 | Bored |
| 6 | 90° | 🤯 | Mind-blown | | 6 | 270° | 😑 | Meh |
| 7 | 108° | 😅 | Sweat-smile | | 7 | 288° | 😬 | Awkward |
| 8 | 126° | 😏 | Confident | | 8 | 306° | 😟 | Insecure |
| 9 | 144° | 😌 | Peaceful | | 9 | 324° | 😰 | Anxious |
| 10 | 162° | 🥹 | Nostalgic | | 10 | 342° | 😕 | Confused |

Rows 1-4 are Plutchik's 4 opposite pairs (Love standing in for the "positive
attachment" end of the joy/trust cluster at the wheel's apex, per the user's
top-most request). Rows 5-7 are the user-specified mild-negative-left /
quirky-positive-right examples (meh/bored/awkward vs. cool/mind-blown/sweat-smile).
Rows 8-10 round out the circle with Cowen & Keltner categories at their best
thematic opposite.

## Data model

Departs from a closed `Feeling` enum (the original brainstorm) because the extended
search must accept any curated emoji, not just the 20 on the wheel:

```go
// backend/internal/core/domain/perspective.go

// FeelingEntry represents one emoji feeling attached to a perspective.
type FeelingEntry struct {
	Emoji     string  `json:"emoji"`           // literal emoji grapheme, e.g. "🥰"
	Label     string  `json:"label,omitempty"` // human label, prefilled for curated entries
	Intensity int     `json:"intensity"`       // 0-10000, see RatingMin/RatingMax
	Note      *string `json:"note,omitempty"`  // freeform why/nuance
}
```

Add `Feelings []FeelingEntry` to `Perspective` (new JSONB column — check
`ls backend/migrations | tail -5` at implementation time for the next free number).
Reuse `ValidateRating`/`RatingMin`/`RatingMax` for intensity validation. Cap array
length app-level (suggest 10, consistent with the existing `RelatedPerspectiveIDs`
50-cap pattern) so the picker doesn't turn into an unbounded log.

GraphQL: `FeelingEntry` / `FeelingInput` types, `feelings: [FeelingEntry!]` on
`Perspective`, `feelings: [FeelingInput!]` on create/update inputs. No new enum
binding needed in `gqlgen.yml` since emoji/label are plain strings, not a closed set.

## Extended searchable set

- ~150-200 curated emoji (not the full ~1,800+ Unicode emoji set), organized by the
  families above, each tagged with keywords for search (e.g. `🥹` → `["nostalgic",
  "moved", "tearful-happy"]`).
- Stored as static JSON at `frontend/src/lib/data/feelings.json`.
- Estimated payload at 100 entries: ~9-11KB raw JSON, ~2.5-3.5KB gzipped. At the
  full 150-200 curated entries: ~4-6KB gzipped. Negligible vs. `emoji-mart`'s
  150-250KB+ full CLDR dataset.
- **No protobuf** — binary encoding overhead (schema, generated decoder) costs more
  than it saves at this size; gzip already exploits the JSON's repeated-key/keyword
  redundancy.
- **No third-party CDN** — ships as a same-origin static asset, already served from
  the edge by the app's own host (Vercel/Sevalla), versioned with the app, no extra
  DNS/TLS round trip or external uptime dependency.

## Frontend

- One Svelte component renders the 20-emoji wheel as native `<span>` text nodes
  positioned via `transform: translate(...)` computed from the table above (no
  image assets, no icon font).
- Dynamic-`import()` the wheel component itself behind the "add feeling" affordance
  (not shipped in the initial bundle for read-only perspective views).
- A "search more" action within the wheel UI separately dynamic-imports
  `feelings.json` only when opened, and filters client-side by keyword substring
  match, grouped by family header rather than a flat list.
- Selecting an emoji (from wheel or search) creates a chip with an intensity slider
  (0-10000, stepped by 100 in the UI) and an optional textarea for notes. Selected
  wheel emoji dim/scale slightly so the wheel stays legible with multiple picks.
- Pure CSS/SVG layout, no canvas, no per-frame JS — static positions, a few click
  handlers.

## Open items for implementation planning

- Finalize the 150-200 extended curated list and family groupings.
- Decide max feelings per perspective (recommend 10).
- Confirm GraphQL schema additions and run `make graphql-gen`.
- Migration number (check latest at implementation time).
