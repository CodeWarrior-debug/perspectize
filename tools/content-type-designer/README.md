# Content Type Designer

A deterministic decision form for adding a new content type to Perspectize.

Open `index.html` in a browser. Nothing is fetched, no model is called, and the
same answers always produce the same output text — the emitted spec is pure
string assembly over the form state.

```bash
# Only needed if you change the TypeScript. dist/ is committed so the tool
# works from a plain file:// open with no toolchain.
npm install
npm run build     # tsc -p tsconfig.json  →  dist/
```

## Why it exists

Every content decision in the codebase so far — columns, tooltips, sort rules,
enrichment — was made with YouTube in mind. Adding a second type surfaces the
questions that were never asked: what is "Channel" for a book, what is "Length"
for a claim, what does the Views column render for a purchase.

## The model

The core idea is that **grid columns are generic, and each content type *binds*
a column with its own label, unit, source and tooltip.**

```
column "creator"  ──┬── youtube    → "Channel"     (api,  response->>'channelTitle')
                    ├── book       → "Author"      (api,  response->>'author')
                    ├── purchase   → "Merchant"    (user, response->>'merchant')
                    └── claim      → "Claimant"    (user, response->>'claimant')
```

That binding is what makes mixed-type views survivable:

- **One type selected** → the header shows that type's own label ("Channel"),
  so the table reads as if it were built for that type alone.
- **Several types selected** → the header falls back to the generic label
  ("Creator"), and every selected type has something real to put in the cell.

A column is on by default according to a **visibility rule** over the selection
(`any` / `majority` / `all` of the selected types default it on), and every
column declares a **gap policy** (`em-dash`, `blank`, `substitute`,
`hide-column`) for the types that do not bind it.

## What it checks for you

Given a selection of types, the preview flags:

- **Sparse columns** — a default column populated for under half the selection.
- **Mixed units** — e.g. Length across video seconds, book pages and Bible
  passage words (BSB), which must never be sorted as one numeric axis. The
  sample table shows the policy. Sorting such a column is never blocked. Rows
  are grouped by unit (`length_units`), each group is ordered within itself,
  and a divider row names each unit. A dismissible note explains the grouping
  and offers a "Show only <type>" shortcut per type. The spec emits the
  backend (two-key Length sort rule) and frontend (comparator, full-width
  divider rows) steps it needs.
- **Mixed provenance** — a column that is fetched for some types and
  user-entered for others (Rating is the standing example).
- **Lost required fields** — a type declaring a field required and
  default-visible while the rule hides the column. This is the real design
  hole; the fix is either relaxing the field or pinning the column when that
  type is filtered in.
- **Header collisions** and **column crowding** (>10 defaults).

## Seeded types

Thirteen deliberately dissimilar types ship as seed data, so the catalog is not
quietly YouTube-shaped:

YouTube video · Movie · Book · Blog article · Podcast episode · Music track ·
Propositional truth claim · Joke · Purchase · Another person's perspective ·
Place visit · Research paper · Bible passage

They differ on every axis that matters: API-enriched vs scraped vs manual vs
internal-reference; URL-identified vs ISBN/DOI/GUID-identified vs text-hash
identified; with and without duration, audience counts, money, and stance.

A fresh open (or **Reset form**) lands on the Bible passage seed, the type
currently being designed. Its bindings mirror `feature/bible-outbound-links`,
where every passage field is a real `content` column (`name`,
`display_title`, `verse_start_id`/`verse_end_id`) or a `bible_book` join. Fields
not written by `CreateFromPassage` yet are tagged `PLANNED (Qn)` in their
tooltip, citing the question in the bible-passage ANSWERS doc.

Types with sample rows (Bible passage ships ten, one per canonical division)
render them under the header strip in section 4. That way a column choice is
judged on real-looking cells, not just its header. Hover a header or cell for
its tooltip. Each binding can also carry a free-text **cell appearance** (font,
icon, subtitle, sort comparator), which goes into the spec next to its tooltip.

Pick any of them in section 1 to seed the form, then edit — the seeds are a
starting point, not a constraint. Loading YouTube alone reproduces the column
set the app ships today, which is the tool's sanity check.

## Output

Two deterministic documents, copyable or downloadable:

1. **Spec + checklist** — identity, ingestion, per-field decisions with storage
   and migration implications, the resolved default grid, per-type header
   aliases, the consistency review, and an implementation checklist keyed to
   the files in `.claude/docs/ADDING_CONTENT_TYPE.md`.
2. **Column × content type matrix** — every column against every type, marking
   default-visible / available / not applicable. Useful on its own for spotting
   a column that only one type will ever fill.

## Files

| File | Purpose |
|---|---|
| `src/catalog.ts` | The 13 seeded type profiles, the generic column catalog with per-type bindings, and sample rows |
| `src/model.ts` | State shape, visibility resolution, gap analysis |
| `src/emit.ts` | Deterministic markdown generation |
| `src/main.ts` | Form rendering and localStorage persistence |
