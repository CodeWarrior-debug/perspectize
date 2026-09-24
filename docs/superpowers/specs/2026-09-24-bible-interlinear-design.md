# Bible Passage Interlinear ("Show original language") — Design

Status: **draft for review (2026-09-24)** — brainstormed section by section with the product owner; not yet planned.
Unit: **E** of the Bible passage feature (A–C2 merged, D in PR #416). Companion to `2026-09-21-bible-passage-ANSWERS-NEEDED.md` (Q2, Q3, Q18, Q19) on the docs branch (PR #396).
Prototype reference: `design_handoff_bible_passage_activity` (README + `.dc.html`; renders with the generic `support.js` runtime).

## Goal

In the passage details modal, a reader can turn on **original language** for a passage: English phrases become hover/tap targets that show the Hebrew or Greek source word behind them, a chips row shows the source words in original order, and a dashed connector ties each phrase to its chip. Whole Bible (BSB alignment), read-only, no sign-in needed.

## Decisions (with source)

| # | Decision | Source |
|---|---|---|
| 1 | Lives in `ActivityDetailsModal` (AG Grid Community has no master/detail) | ANSWERS Q3 |
| 2 | v1 = full prototype: hover/tap popover + chips row + connector | owner, 2026-09-24 |
| 3 | **One merged button, "Show original language"**, turns on underlines + chips row + connector together; the prototype's separate "Verse Translation Details" toggle is dropped | owner, 2026-09-24 |
| 4 | **Lazy**: nothing extra is fetched or rendered until the button is pressed; default is off on every open (remembering the choice per device is a later, additive change) | owner, 2026-09-24 |
| 5 | Popover is anchored **beneath the chips row**, aligned to the hovered chip and clamped to the modal edges; it floats over content below (no layout shift). With the chips row not shown it anchors beneath the passage text | owner, 2026-09-24 |
| 6 | v1 popover includes the **short meaning (gloss)** from STEPBible, with a visible credit line | owner, 2026-09-24 |
| 7 | Data reaches the seeder as a **release asset + checked-in SHA-256**, tracked by a manifest (see Provenance) | owner, 2026-09-24 |
| 8 | Seeded by a Go seeder, not a migration (tables come from a migration) | ANSWERS Q19 |

## Data sources

**Berean word alignment** — `bereanbible.com/bsb_tables.tsv`. Public domain per the publisher (ANSWERS Q2; wording to be re-read from the source page before it appears in UI copy).
- One row per Hebrew/Greek source word. Header (23 columns) includes `Heb Sort`, `Greek Sort`, `BSB Sort`, `Verse`, `Language`, `Translit`, two `Parsing` columns, `Str Heb`, `Str Grk`, `VerseId`, ` BSB version `, punctuation/quote columns (`pnc`, `begQ`, `endQ`, `Space`).
- Facts reported by the research spike (**not independently re-verified**): ~85.5 MB, **754,647 data rows** (the ANSWERS doc says ~440k — many rows are empty padding, to be confirmed); `Verse` is a global verse counter (John 3:16 = 26137); `VerseId` is filled only on each verse's first row and needs forward-filling; `-` marks untranslated words; a `vvv` placeholder appears in John 3:16 and must be filtered; continuation rows leave ` BSB version ` blank and belong to the preceding phrase; display order comes from `BSB Sort`, never file order.
- No gloss/definition column exists.

**STEPBible lexicons** — `STEPBible/STEPBible-Data`, `Lexicons/TBESH…txt` (Hebrew, 3.3 MB) and `TBESG…txt` (Greek, 4.7 MB). **Verified by download 2026-09-24.**
- Tab-separated; Hebrew columns: `eStrong#, dStrong, uStrong, Hebrew, Transliteration, Morph, Gloss, Meaning`. 11,682 Hebrew rows all have a Gloss; 11,034 of 11,035 Greek rows do.
- Examples: `H1254A` "to create" (`H1254B` "to fatten"), `H7225G` "first: beginning", `G3439` "unique", `G5207` "son".
- License: **CC BY 4.0** (Tyndale House). Attribution is required. Requests that others do not re-host the files and instead refer to the GitHub repo.
- **Use the Gloss column only.** The Hebrew `Meaning` paragraph is derived from Online Bible's abridged BDB and the file header says permission from Online Bible is required before using it. The Greek `Meaning` column is messy HTML (Abbott-Smith with citations) and is not needed.
- Consequence: the popover meaning is a short phrase ("to create"), not the mock's editorial sentence.

## Provenance and versioning

- A committed manifest (e.g. `data/bible/sources.json`) records, per source: upstream URL, upstream version (STEPBible commit SHA; Berean download date and SHA-256 of the raw file), our derived file's SHA-256, row count, and the release asset name.
- Release assets are **never overwritten**; a new version gets a new name (e.g. `bsb-alignment-v2.tsv.gz`).
- The seeder verifies the fingerprint against the manifest and refuses to load a mismatch.
- A one-row table records which manifest version each environment has loaded.
- A test asserts the manifest and shipped files agree.
- The Berean data is normalized once (unused columns dropped, continuation rows resolved, padding removed) and uploaded to our release. STEPBible's Gloss data is **fetched from STEPBible's GitHub at a pinned commit** with a checked-in SHA-256 rather than re-hosted.
- Rejected: the seeder downloading from bereanbible.com live on every run (setup would depend on a third party); committing the data to git (permanent multi-MB blob).

## Database (new migration, next free number is 000026 — re-check at plan time)

- `bible_word`: one row per source word — verse id (FK `bible_verse`), `source_sort`, `bsb_sort`, `language` (`heb`/`grc`), source word, transliteration, Strong's number, parsing (short/full), `span_group` (groups continuation rows), English phrase (NULL on continuation rows), punctuation/quote fields. Indexed on verse id.
- `bible_lexicon`: Strong's number (PK), language, gloss (~23k rows).
- `bible_data_version`: one row, the loaded manifest version.
- Seeded by extending the existing `backend/cmd/seed-bible` command; idempotent (upsert). **Migrations are applied by hand per environment — never `make migrate-*`; the PR states this.**

## API

One new query, `passageInterlinear(startVerseId, endVerseId)`:
- Returns, per verse, the English phrases in reading order (with punctuation), each with its source word(s): Strong's number, source word, transliteration, parsing, language, original-order index, and the **gloss already joined in**. Also returns the credit-line text so it lives in one place.
- Not fetched over the 150-verse hard cap; over the 31–150 collapsed range only the visible verses matter.
- Reuses the authenticated `graphqlRequest()` wrapper. `queryKey` mirrors every variable sent. `staleTime: Infinity` (data never changes).
- Read-only and public, like `passageText`: works for signed-out readers.

**Text-consistency guard.** Interlinear text is rebuilt from the alignment rows (its punctuation and quote columns). A test asserts it equals the plain BSB verse text verse by verse. Where it doesn't match, or the verse is absent from the alignment file (the 16 BSB-omitted verses, issue #410), that verse renders as plain text.

## UI

Components (names indicative): a "Show original language" button in the passage section; interlinear text with underlined phrases; a source-word chips row (original order); a word popover; a connector overlay; a credit line.
- **Off (default):** identical to today. No request.
- **Loading / error:** button shows a loading state; on error, a message with retry.
- **On:** phrases with source words are underlined; chips row is shown; **hover** shows the popover, **click/tap** pins it, **double-click or Escape** closes it; hovering a phrase or its chip draws the connector between them (measured with `getBoundingClientRect`, recomputed on resize/scroll).
- **Popover contents:** Strong's number, language, source word, transliteration, gloss, parsing, and the English phrase it renders here.
- **Keyboard/a11y (added; the prototype has none):** phrases and chips are focusable, focus opens the popover, Escape closes it.
- **Phone (< 860px):** tap replaces hover; the popover keeps the same beneath-the-chips slot; the chips row scrolls sideways.
- **Credit line, shown only while on:** "Word alignment: BSB (public domain). Meanings: STEPBible, Tyndale House, CC BY 4.0."
- **Caps:** original-language mode applies to the verses actually rendered.
- The prototype's hover targets are single words; real spans are phrases ("In the beginning" is one span mapped to `H7225`).

## Tests (stateful UI — each state covered)

Button: off / loading / error+retry / on. Popover: idle, hover, pinned, closed by double-click, closed by Escape, focus-opened. Chips row shown vs connector present; connector absent when off; popover position (beneath chips; beneath text fallback); the pointer-travel gap between phrase and popover must not close it; touch tap-open and tap-away close; plain-text fallback for a mismatched or omitted verse; credit line present only when on. Seeder: idempotent re-run, refuses a fingerprint mismatch. Data: the consistency guard above.

**Required fixtures:**
- **Genesis 1:1** — `H1254` (created) and `H430` (God) swap position between original order and English order; "In the beginning" is one span mapped to one number (`H7225`).
- **John 3:16** — "one and only" is one phrase mapping to the single Greek word `G3439`, before "Son" (`G5207`) in English but after it in Greek order; the `vvv` placeholder row is filtered; continuation rows group into the preceding phrase.

## Out of scope for v1

Hand-written editorial definitions; STEPBible's longer `Meaning` text; per-device memory of the toggle; per-testament or per-book loading; interlinear on the grid rows or on a standalone route (ANSWERS Q8).

## Open items to verify during planning (not assumptions)

1. Mapping from the Berean `H1254` to STEPBible's disambiguated `H1254A`/`H1254B` (and the Greek equivalents).
2. Real row count and post-prune size of the alignment data (754,647 vs ~440k) to size the release asset.
3. Whether the Berean `Verse` counter equals our verse ordinal (John 3:16 should be 26137).
4. Whether every alignment verse's rebuilt text matches `bsb.tsv`; list the mismatches.
5. The exact BSB and STEPBible license wording to quote in the credit line.
6. `openscriptures/strongs` was **not** used, so its unclear license is moot.
