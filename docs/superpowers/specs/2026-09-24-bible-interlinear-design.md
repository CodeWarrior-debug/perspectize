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
- **Verified 2026-09-24 (own scripts on the downloaded file):** ~85.5 MB, 754,647 lines; **437,587 word rows carry a Strong's number** (299,456 Hebrew + 138,131 Greek), which matches the ANSWERS doc's ~440k — the other ~317k lines have no Strong's number (not inspected further). **Strong's numbers are plain digits with no letter suffixes** (`1254`, `7225`). Column indices: `Str Heb` = 10, `Str Grk` = 11, `VerseId` = 12, ` BSB version ` = 18. Every one of the 13,876 distinct numbers has at least one STEPBible lexicon row.
- Reported by the research spike, **not independently re-verified**: `Verse` is a global verse counter (John 3:16 = 26137); `VerseId` is filled only on each verse's first row and needs forward-filling; `-` marks untranslated words; a `vvv` placeholder appears in John 3:16 and must be filtered; continuation rows leave ` BSB version ` blank and belong to the preceding phrase; display order comes from `BSB Sort`, never file order. (Seen directly for John 3:16: `Greek Sort` gives original order; the `vvv` row is the word "mē".)
- No gloss/definition column exists.
- **Plain numbers are ambiguous (verified).** 34.7% of word rows (151,687 of 437,587) carry a number that has more than one STEPBible lexicon entry, and 22.2% (97,067) map to genuinely different entries. Examples: `H1254` (55 occurrences) covers `H1254A` "to create" (incl. Piel "clear" at Joshua 17:15, 17:18) and `H1254B` "to fatten" (1 Samuel 2:29 only); `H3068` ×6,522 = LORD / The Lord / …; `H430` ×2,600 = God / (LORD)-Elohe / …; `H834`, `H1004` (10 entries), `H4428`. Taking "the first lexicon row" would sometimes give a wrong or odd meaning, so v1 disambiguates (next section).

**STEPBible lexicons** — `STEPBible/STEPBible-Data`, `Lexicons/TBESH…txt` (Hebrew, 3.3 MB) and `TBESG…txt` (Greek, 4.7 MB). **Verified by download 2026-09-24.**
- Tab-separated; Hebrew columns: `eStrong#, dStrong, uStrong, Hebrew, Transliteration, Morph, Gloss, Meaning`. 11,682 Hebrew rows all have a Gloss; 11,034 of 11,035 Greek rows do.
- Examples: `H1254A` "to create" (`H1254B` "to fatten"), `H7225G` "first: beginning", `G3439` "unique", `G5207` "son".
- License: **CC BY 4.0** (Tyndale House). README (fetched 2026-09-24): credit it to **"STEP Bible" linked to www.STEPBible.org**; "refer others to this repository as the source"; "You are welcome to make a mirror, so long as it is kept up-to-date and has a link back here." (So a mirror is allowed; the pinned-commit fetch plus a link back is the conservative choice.)
- **Use the Gloss column only.** The Hebrew `Meaning` paragraph is derived from Online Bible's abridged BDB and the file header says permission from Online Bible is required before using it. The Greek `Meaning` column is messy HTML (Abbott-Smith with citations) and is not needed.
- Consequence: the popover meaning is a short phrase ("to create"), not the mock's editorial sentence.

**STEPBible tagged texts (disambiguation source)** — `Translators Amalgamated OT+NT/`: TAHOT (Hebrew OT, 4 files, ~70 MB) and TAGNT (Greek NT, 2 files, ~30 MB). **Verified by download 2026-09-24.**
- Every word carries its exact disambiguated Strong's tag (`dStrong`), designed to be backward-compatible with plain Strong's. Examples: Genesis 1:1 "he created" = `H1254A`, "God" = `H0430G`, "in beginning" = `H9003/{H7225G}` (lexical tag in braces); **1 Samuel 2:29 #12 "by fattening yourselves" = `H1254B`**; John 3:16 `G3439`, `G5207`.
- References use English (NRSV) versification; Psalm titles are verse `.0` (e.g. `Psa.139.0(139.1)`), with word numbers continuing into verse 1. The BSB prints the title inside its verse 1, so the join folds `.0` words into verse 1. Book abbreviations differ from the obvious (`Ezk`, `Nam`, `Sng`, `Jol`, `Php`, `Jhn`, `Jas`…).
- **Join measured over the whole Bible (own script, per verse, in-order match on plain number, tolerant of inserted/missing words):** 98.82% of 437,474 word rows aligned; **99.30% of the ambiguous rows** (150,612 of 151,673). Spot checks all correct (`H1254B` at 1 Samuel 2:29, `H1254A` at Genesis 1:1, `H0430G`, `G3439`, `G5207`). By testament: OT 99.72%, NT 96.87% (Greek variants). Psalm verse 1 only 84.16% (66 of 150 psalms, mostly long titles; in 53 of them the word counts are equal but the order differs).
- Not aligned (about 1.2% of rows), and 8 verses with no tagged verse at all (Romans 16:25–27, 2 Corinthians 13:13–14, Philippians 1:16–17, John 7:53): fall back to the primary lexicon entry for that number.
- 627 aligned rows (0.14%) carry one of 22 tags that have no gloss in the lexicons (e.g. `H0430J` ×215, `G2453` ×192, `H3064` ×75, `G3708` ×60): fall back to the main entry for the same plain number.

## Provenance and versioning

- A committed manifest (e.g. `data/bible/sources.json`) records, per source: upstream URL, upstream version (STEPBible commit SHA; Berean download date and SHA-256 of the raw file), our derived file's SHA-256, row count, and the release asset name.
- Release assets are **never overwritten**; a new version gets a new name (e.g. `bsb-alignment-v2.tsv.gz`).
- The seeder verifies the fingerprint against the manifest and refuses to load a mismatch.
- A one-row table records which manifest version each environment has loaded.
- A test asserts the manifest and shipped files agree.
- The Berean data is normalized **once, at data-preparation time** (unused columns dropped, continuation rows resolved, padding removed, **and the disambiguated tag attached by joining to TAHOT/TAGNT**) and uploaded to our release. The join script is committed as the normalizer (audit trail). Nothing joins at runtime.
- The manifest records STEPBible's commit SHA for the lexicons **and** for TAHOT/TAGNT (the ~100 MB of tagged texts are needed only when preparing data, not to run the app). STEPBible files are fetched from STEPBible's GitHub at that pinned commit with checked-in SHA-256s rather than re-hosted.
- **Keep the original (owner request, 2026-09-24):** wherever the normalizer overrides a source value, the original is kept in a column with an `orig_` prefix so the change can be reverted without re-fetching anything (see Database).
- Rejected: the seeder downloading from bereanbible.com live on every run (setup would depend on a third party); committing the data to git (permanent multi-MB blob).

## Database (new migration, next free number is 000026 — re-check at plan time)

- `bible_word`: one row per source word — verse id (FK `bible_verse`), `source_sort`, `bsb_sort`, `language` (`heb`/`grc`), source word, transliteration, **`orig_strongs`** (Berean's plain number, exactly as in the source file, never modified), **`strongs`** (the disambiguated tag, e.g. `H1254B`, or the main entry for the plain number when the join could not align the word), **`strongs_source`** (`tagged` or `fallback`), parsing (short/full), `span_group` (groups continuation rows), English phrase (NULL on continuation rows), punctuation/quote fields. Indexed on verse id. Reverting the disambiguation = read `orig_strongs` instead of `strongs`.
- `bible_lexicon`: disambiguated tag (PK, e.g. `H1254B`), plain number, language, gloss (~23k rows).
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
- **Credit line, shown only while on:** "Word alignment: BSB (public domain). Meanings and word tags: [STEP Bible](https://www.stepbible.org), Tyndale House, CC BY 4.0." (STEPBible's README asks for the credit "STEP Bible" linked to www.STEPBible.org.)
- **Caps:** original-language mode applies to the verses actually rendered.
- The prototype's hover targets are single words; real spans are phrases ("In the beginning" is one span mapped to `H7225`).

## Tests (stateful UI — each state covered)

Button: off / loading / error+retry / on. Popover: idle, hover, pinned, closed by double-click, closed by Escape, focus-opened. Chips row shown vs connector present; connector absent when off; popover position (beneath chips; beneath text fallback); the pointer-travel gap between phrase and popover must not close it; touch tap-open and tap-away close; plain-text fallback for a mismatched or omitted verse; credit line present only when on. Seeder: idempotent re-run, refuses a fingerprint mismatch. Data: the consistency guard above.

**Normalizer/join tests:** the join is deterministic and reproducible; `orig_strongs` always equals Berean's source value; an unaligned word gets `strongs_source = fallback` and the main entry for its number; a tag with no gloss falls back to the plain number's main entry; the 8 verses with no tagged verse fall back cleanly.

**Required fixtures:**
- **1 Samuel 2:29** — `1254` becomes `H1254B` ("to fatten"), not `H1254A`; and "from the choicest of" is `H7225H` ("best"), not `H7225G`.
- **Genesis 1:1** — `1254` becomes `H1254A`; `430` becomes `H0430G`.
- **Genesis 1:1** — `H1254` (created) and `H430` (God) swap position between original order and English order; "In the beginning" is one span mapped to one number (`H7225`).
- **John 3:16** — "one and only" is one phrase mapping to the single Greek word `G3439`, before "Son" (`G5207`) in English but after it in Greek order; the `vvv` placeholder row is filtered; continuation rows group into the preceding phrase.

## Out of scope for v1

Hand-written editorial definitions; STEPBible's longer `Meaning` text; per-device memory of the toggle; per-testament or per-book loading; interlinear on the grid rows or on a standalone route (ANSWERS Q8).

## Open items to verify during planning (not assumptions)

**Resolved 2026-09-24 (evidence in Data sources):**
- Berean plain numbers map to *multiple* STEPBible entries (owner's hunch confirmed): 34.7% of word rows; disambiguation by joining to TAHOT/TAGNT recovers the exact tag for 99.30% of the ambiguous rows.
- Row count: 437,587 word rows have a Strong's number (matches ~440k); the 754,647 figure counts lines without one.
- `openscriptures/strongs` is not used, so its unclear license is moot.

**Still open for planning:**
1. Psalm verse 1 (title + first verse): 84% aligned; find why word order differs in the 53 same-count psalms (long titles: 51, 52, 54, 56, 60, 34, 57, 88…) and fix the fold, or accept the fallback.
2. New Testament alignment is 96.87% (Greek variants); check whether filtering TAGNT to the NA28 words raises it.
3. The 22 tags with no gloss (`H0430J` ×215, `G2453` ×192, `H3064`, `G3708`…): confirm the fallback to the plain number's main entry gives an acceptable meaning, or add a small manual mapping.
4. Whether the Berean `Verse` counter equals our verse ordinal (John 3:16 should be 26137).
5. Whether every alignment verse's rebuilt text matches `bsb.tsv`; list the mismatches.
6. The exact BSB public-domain wording (the berean.bible downloads page carries no license text; the terms page has not been read) and STEPBible's CC BY wording for the credit line.
7. Post-normalization size of the release asset (drop unused columns; measure gzip).
