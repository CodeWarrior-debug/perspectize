# Perspective Depth Metric — Design (Stage 1: Completeness)

Status: **draft for review (2026-09-26)** — brainstormed with the product owner; not yet planned.
Scope of this doc: **Stage 1 only** (per-perspective completeness score). Stages 2–4 (topic breadth,
connectivity, AI-graded substance, spaced revisit) are recorded at the end as forward-looking ideas,
not specced for build yet.

## Goal

Score how thoroughly a user has filled out **one `Perspective`** on **one content item**, as a single
explainable number, to power (a) an opt-in "Depth" column on the activity grid today, and (b) a future
review/revisit page that surfaces under-developed or stale perspectives.

## Decisions (with source)

| # | Decision | Source |
|---|---|---|
| 1 | Stage 1 unit is **one perspective**, not a topic/content rollup | owner, 2026-09-26 |
| 2 | Surface: an **opt-in column on the activity grid** (off by default, user turns it on via the column picker) | owner, 2026-09-26 |
| 3 | Field weights: **intelligent default**, plus a **user-customizable weighting system** | owner, 2026-09-26 |
| 4 | Future review/revisit page: **ideas only, recorded below**, not designed in this doc | owner, 2026-09-26 |

## Score shape

Every stage (this one included) returns the same shape so the grid column, a future review page, and
later AI-assisted stages never need a different contract:

```go
type DepthScore struct {
    Score       int                // 0-100
    Band        DepthBand          // SURFACE | EXPLORED | CONSIDERED | DEEP
    Components  []DepthComponent   // always explainable — one row per scored field
    Version     string             // "v1-completeness" — score provenance, see Versioning
}

type DepthComponent struct {
    FieldKey string  // e.g. "review", "quality", "feelings"
    Value    float64 // 0-1, this field's own fill/quality signal
    Weight   float64 // 0-1, this field's share of the total (user's effective weight)
    Filled   bool
}

type DepthBand string
const (
    DepthSurface    DepthBand = "SURFACE"    // 0-24
    DepthExplored   DepthBand = "EXPLORED"   // 25-49
    DepthConsidered DepthBand = "CONSIDERED" // 50-74
    DepthDeep       DepthBand = "DEEP"       // 75-100
)
```

`score = round(100 * Σ(weightᵢ · valueᵢ) / Σweightᵢ)`. Computed on read (or cached — see
Performance), never stored as a fact about the perspective, since weights and the formula version can
change under a user at any time.

## Field manifest — what counts as "filled" and how much

Every candidate field already exists on `domain.Perspective` (`backend/internal/core/domain/perspective.go`).
Two kinds of fill signal:

- **Binary fields** (`Filled = true/false`): a rating either has a value or doesn't. `Value = 1.0` if
  filled, `0.0` if not.
- **Saturating text fields** (`Description`, `Review`, `Like`, feeling `Note`s): fifty thoughtful words
  should score close to what five hundred do, so padding doesn't pay. Use
  `Value = min(1.0, log(1+words) / log(1+target))` with a per-field `target` word count (see table).
  A field with `nil`/empty text is `Value = 0, Filled = false`.

| Field | Kind | Target (saturating only) | Notes |
|---|---|---|---|
| `Review` | saturating text | 40 words | The "why" — reasoned justification. Weighted highest. |
| `Description` | saturating text | 30 words | |
| `Quality` | binary rating | — | |
| `Agreement` | binary rating | — | |
| `Importance` | binary rating | — | |
| `Confidence` | binary rating | — | |
| `CategorizedRatings` | binary + count bonus | — | `Filled` if len > 0; `Value` saturates toward 1 as more categories are rated (`min(1, n/3)`), rewarding rating on more than one axis. |
| `Feelings` | binary + note bonus | 12 words (per note) | `Filled` if len > 0; `Value` = fraction with a non-empty `Note`, so an emoji-only feeling counts less than one with a note. |
| `Labels` | binary | — | `Filled` if len > 0. |
| `Category` | binary | — | |
| `Like` | saturating text | 15 words | Freeform "what stood out." |
| `PrimaryPerspectiveID` / `RelatedPerspectiveIDs` | binary | — | Either non-nil/non-empty counts as filled — this is the one field that hints at Stage 2 (connectivity) without needing the topic rollup yet. |

`CustomFields` (JSONB) is **excluded** from v1 scoring — schema-less, so no generic fill/quality rule is
safe. Revisit once real usage shows a pattern worth scoring.

## Intelligent default weights

Proposed default, out of 100, chosen so that reasoned text (the strongest signal of actual thought)
dominates, structured ratings are the bulk of the "easy" score, and purely decorative fields (labels,
category) are worth little on their own:

| Field | Weight | Rationale |
|---|---|---|
| `Review` | 18 | The clearest evidence of reasoning — why, not just what. |
| `Description` | 14 | Second-strongest "explain yourself" signal. |
| `Quality` | 9 | |
| `Agreement` | 9 | |
| `Importance` | 9 | |
| `Confidence` | 9 | Four core ratings, equal weight — no field-specific assumption about which rating matters more. |
| `CategorizedRatings` | 10 | Structured, per-axis ratings — rewards granularity beyond the four core fields. |
| `Feelings` | 8 | Emotional register is real signal, but easy to game with a single tap — bonus for a note is what actually adds depth. |
| `Like` | 6 | |
| `Labels` | 4 | |
| `Category` | 4 | |
| `Related/Primary link` | ~~n/a in sum~~ | See below — not in the 100. |

Sum of the 10 scored fields above = 100.

**`Related/Primary link` is a bonus, not a weighted field**: it adds up to **+5 on top of the 0–100
score** (capped at 100), rather than taking a slice of the pie. Rationale: linking is genuinely Stage-2
territory (connectivity across perspectives), but it's cheap to compute now and shouldn't be diluted by
being just another 1/11th slice — a small bonus rewards it without pretending it belongs at the same
level as "did you write a review."

## Custom weighting system

Let users override the default weights, opt-in, per user (not per perspective).

### Storage

A new table, one row per (user, optionally content-type):

```sql
CREATE TABLE depth_weight_prefs (
    id           SERIAL PRIMARY KEY,
    user_id      INT NOT NULL REFERENCES users(id),
    content_type TEXT NULL,  -- NULL = applies to all content types; a specific ContentType overrides it
    weights      JSONB NOT NULL,  -- {"review": 18, "description": 14, ...} — raw, not required to sum to 100
    version      TEXT NOT NULL DEFAULT 'v1-completeness',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (user_id, content_type)
);
```

Raw weights are stored un-normalized and **normalized at read time** (`weightᵢ / Σweights`), so the UI
never has to force sliders to add up to exactly 100 while dragging.

### UI: budget sliders, not free-form numbers

Borrow the "point allocation" pattern from character-build UIs — a fixed budget bar made of the 10
field weights stacked as colored segments, each with a slider. Moving one slider redistributes the
*remaining* budget proportionally across the others (or the user can lock fields they don't want to
move). This guarantees the visual always sums to a full bar without the user doing arithmetic.

- **Presets** to start from, then fine-tune:
  - **Balanced** (the default above)
  - **Narrative-focused** — `Review`/`Description`/`Like` weighted up, ratings weighted down (for users
    who mostly write, rarely rate)
  - **Ratings-focused** — the four core ratings + `CategorizedRatings` weighted up (for users who
    quantify more than they narrate)
  - **Custom** — whatever the sliders currently show, saved as the user's own preset
- Reset-to-default is always one click.
- **Per-content-type override** is optional/advanced (e.g. a `BIBLE_PASSAGE` perspective might reasonably
  weight `Feelings` differently than a `YOUTUBE` one) — collapsed behind an "advanced" toggle so most
  users only ever set one global set of weights.

### Resolution order at compute time

1. `depth_weight_prefs` row for `(user_id, content.content_type)` if it exists
2. `depth_weight_prefs` row for `(user_id, NULL)` if it exists
3. Built-in default weights table above

### Versioning

`Version` on `DepthScore` and `version` on the stored prefs row both track the **formula**, not the
weights — if Stage 1's fill/saturation rules change (e.g. a different saturation curve, a field added
or dropped), bump `v1-completeness` → `v2-completeness`. A user's chosen weights carry forward
unchanged; only the score they're a coefficient of might shift meaning. Surface the version in the
column tooltip so a sudden jump in everyone's score after a formula change is explainable rather than
mysterious.

## Surfacing: opt-in activity grid column

Per `.claude/docs/ADDING_AG_GRID_COLUMN.md`, this is a **computed** column (no new DB column, no
migration) — the score is derived from fields already on `Perspective`/`Content` at read time:

- Add `depth` (or `depthScore`) to the GraphQL `Content`/`Perspective` type as a resolver-computed
  `Int!` (0–100) plus `depthBand: DepthBand!`; the resolver calls the Stage 1 scorer, resolving the
  viewer's weight prefs.
- Add a `ColumnMeta` entry to `frontend/src/lib/utils/grid-config.ts`, marking it **hidden by default**
  in `DATA_COLUMNS` (existing "opt-in" column pattern — user turns it on via `ColumnPickerDialog`).
  `valueGetter` reads the resolved `depthScore`; a small cell renderer in `formatting.ts` renders the
  band as a compact meter/pill (see the `dataviz` skill for the meter component pattern) rather than a
  bare number, with the component breakdown as a hover tooltip via `activityTooltipSpecs.ts`.
- Sortable (`SORTABLE_COLUMNS`) — sorting by depth is itself a useful "what's shallow" view even before
  a dedicated review page exists.
- GraphQL query changes: add the field to `LIST_CONTENT`'s selection set and the `ContentItem` TS
  interface only when the column is actually built (no need to always fetch it if hidden — check
  whether the grid already lazy-requests hidden-column fields or fetches everything up front before
  deciding whether this needs to be conditional).

No backend migration needed for Stage 1. `depth_weight_prefs` is the only new table, and it's optional
(defaults apply with zero rows).

## Performance

Stage 1 is pure arithmetic over fields already loaded with the perspective — cheap enough to compute
per-row in the resolver with no caching required at this stage. Revisit if profiling on a large grid
page shows otherwise; a per-perspective cache keyed on `(perspective.UpdatedAt, weights version)` would
be the first lever.

---

## Recorded for later: future review/revisit page (ideas, not specced)

Captured here so they aren't lost, per the owner's request — **not designed or planned yet**:

- **Stage 2 (topic breadth/connectivity)**: roll Stage 1 scores up across all perspectives in a
  category (Wikidata QID), adding breadth (distinct content items touched), connectivity
  (`RelatedPerspectiveIDs`/`PrimaryPerspectiveID` graph density), calibration (e.g. rating without a
  `Review` vs. rating with one), recency decay, and adjacent-topic awareness via Wikidata
  subclass/part-of relations.
- **Review page surfaces** once Stage 2 exists:
  - "High importance, low depth" — you said this matters but the perspective is SURFACE/EXPLORED.
  - "Stale and deep" — a CONSIDERED/DEEP perspective untouched for N months; prompt to revisit whether
    the view still holds.
  - "Unlinked cluster" — several perspectives in one category with zero cross-links to each other.
  - "New content in a topic you've gone deep on."
- **Stage 3 (AI-assisted)**: rubric-grade `Review`/`Description` text with a small model (e.g.
  `claude-haiku-4-5`) for claim-made / cites-specifics / considers-a-counterpoint / explains-the-rating,
  feeding into `Components` as additional AI-sourced entries; semantic/embedding-based topic clustering
  as an alternative to manual `Category`; AI-generated revisit prompts ("you rated X high with low
  confidence — what would change your mind?"). Needs an explicit per-perspective privacy opt-in before
  any AI call, async/debounced scoring, caching by `(content hash, rubric version)`, and a hard fallback
  to the Stage 2 score if the model call fails.
- **Stage 4 (longitudinal)**: spaced-repetition-style revisit scheduling (SM-2-ish) keyed on
  `Importance × (1 − Confidence)`; scoring relative to the user's own historical percentile rather than
  an absolute number, so casual users aren't nagged; tracking whether a revisit actually changed a
  rating, as the strongest available evidence of real depth growth.
- **Cross-cutting for all future stages**: keep scores private by default (a public "depth leaderboard"
  invites gaming — padding text, spam links); always show the component breakdown, never a bare number;
  keep every stored/derived score tagged with its formula `Version`.

## Open questions for whoever picks this up for planning

1. Does the activity-grid GraphQL query currently fetch all columns' data up front, or only
   visible/opted-in ones? Determines whether `depthScore` needs to be conditionally requested.
2. Preset names/count are a strawman (Balanced / Narrative-focused / Ratings-focused) — worth validating
   against how real users currently fill out perspectives once there's usage data.
3. Per-content-type weight overrides (`BIBLE_PASSAGE` vs `YOUTUBE`) — worth building in v1 of the
   custom-weights UI, or defer until someone actually asks for it?
