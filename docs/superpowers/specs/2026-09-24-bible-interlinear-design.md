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

**Berean word alignment** — `bereanbible.com/bsb_tables.tsv`. **Verified 2026-09-24 against `berean.bible/terms.htm`:** "The Berean Bible and Majority Bible texts are officially dedicated to the public domain as of April 30, 2023." / "All uses are freely permitted." Attribution is "appreciated but not required" ("The Holy Bible, Berean Standard Bible, BSB is produced in cooperation with Bible Hub, Discovery Bible, OpenBible.com, and the Berean Bible Translation Committee. This text of God's Word has been dedicated to the public domain."). They request that derivative works differing from the official text not use the Berean name. **The page says nothing separate about the tables/Strong's/interlinear files; treating them as covered by the same dedication is an inference, not a stated fact.**
- One row per Hebrew/Greek source word. Header (23 columns) includes `Heb Sort`, `Greek Sort`, `BSB Sort`, `Verse`, `Language`, `Translit`, two `Parsing` columns, `Str Heb`, `Str Grk`, `VerseId`, ` BSB version `, punctuation/quote columns (`pnc`, `begQ`, `endQ`, `Space`).
- **Verified 2026-09-24 (own scripts on the downloaded file):** ~85.5 MB, 754,647 lines; **437,587 word rows carry a Strong's number** (299,456 Hebrew + 138,131 Greek), which matches the ANSWERS doc's ~440k. **Line census (verified):** 311,917 lines are completely empty padding (41%); 4,640 lines have English but no source word (added English words, some are `-`/`. . .` markers); the rest have a Strong's number. 1,104 word rows have blank English. **Strong's numbers are plain digits with no letter suffixes** (`1254`, `7225`). Column indices: `Str Heb` = 10, `Str Grk` = 11, `VerseId` = 12, ` BSB version ` = 18. Every one of the 13,876 distinct numbers has at least one STEPBible lexicon row.
- **Verified (own scripts):**
  - **The `Verse` column equals our verse ordinal for all 31,102 verses (0 mismatches)**, so the seeder joins on it directly (John 3:16 = 26137). `VerseId` is filled only on each verse's first row and needs forward-filling.
  - `-` (29,695 rows) marks a source word with no English; `vvv` (4,849 rows) is a placeholder for a word whose English sits elsewhere; `. . .` is an ellipsis marker. None of these belong in display text.
  - Supplied English words are wrapped in `[ ]` or `{ }`; some cells contain HTML (`<p class=|indent2|>`, `<span class=|reftext|>…`).
  - **Closing quotes and dashes can live in the `End text` column** (e.g. `” `, ` —`), not just `endQ`; an `End text` value in square brackets (`[’’]`) is a duplicate hint and is ignored.
  - **Continuation rows** (source word, blank English; 1,104): 1,050 (95%) have a `BSB Sort` exactly 1 after the preceding word row and belong to that phrase. The other 54 (mostly `H1961` "to be") sit far away after the padding rows and belong to **no** phrase: they are chips with no connector.
  - Display order comes from `BSB Sort`; original order from `Heb Sort` (Hebrew) or `Greek Sort` (Greek; Hebrew sort is `999999` on Greek rows).
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
- References use English (NRSV) versification; Psalm titles are verse `.0` (e.g. `Psa.139.0(139.1)`). The BSB prints the title inside its verse 1, so the join folds `.0` words into verse 1. **TAHOT word numbers restart at every Hebrew verse** (Psalm 51's title plus verse 1 has three runs numbered 1…), so the words must be kept in **file order**, never sorted by word number (sorting was the cause of an earlier 84% Psalm-verse-1 result). Book abbreviations differ from the obvious (`Ezk`, `Nam`, `Sng`, `Jol`, `Php`, `Jhn`, `Jas`…).
- **Join measured over the whole Bible** (own script; per verse; in-order longest-common-subsequence on the plain number, tolerant of inserted or missing words): **98.88% of 437,474 word rows aligned; 99.37% of the ambiguous rows** (150,721 of 151,673). Old Testament 99.81%; **New Testament 96.87%**; Psalm verse 1 (title + first verse) 99.69% (5 of 150 psalms still have an unaligned word). Spot checks correct: `H1254B` at 1 Samuel 2:29 (and `H7225H` "best" there), `H1254A`/`H0430G`/`H7225G` at Genesis 1:1, `G3439`, `G5207`.
- **Why rows fail to align:** the two datasets sometimes use different numbers for the same word (Genesis 1:4 "good": Berean `H2896`, tagged `H2895`; Greek pronoun `G1473` ×1,940 where TAGNT uses form-specific numbers). 4,886 rows are unaligned; **only 952 of them (0.22% of all rows) have an ambiguous number** (672 are the Greek "see" verbs `G3708`, `G1492`); the other 3,934 have a single lexicon entry, so the fallback gives exactly the right meaning. Eight verses have no tagged verse at all (Romans 16:25–27, 2 Corinthians 13:13–14, Philippians 1:16–17, John 7:53).
- **Do not pair unaligned words by position.** It would "recover" 4,321 rows but a sample shows wrong meanings (e.g. `H3588` "for" paired with `H3541` "thus"; `H168` "tent" with `H0428` "these").
- **Fallback rule (measured):** for an unaligned or gloss-less row use the plain number's **most common tag across the Bible** (from the join itself), and if that tag has no gloss, the next most common that has one, then the first lexicon row. On the aligned ambiguous rows this rule is right **79.0%** of the time, versus 71.1% for "first lexicon row" (which picks `H5892A` "excitement" instead of "city"). Expected wrong-sense rows ≈ 200 (0.05% of all rows), each marked `strongs_source = fallback`.
- 627 aligned rows (0.14%) carry one of 22 tags that have no gloss in the lexicons (`H0430J` ×215, `G2453` ×192, `H3064` ×75, `G3708` ×60, proper names…); the fallback chain above gives sensible meanings for all of them ("God", "Jew", the same name).

## Provenance and versioning

- A committed manifest (e.g. `data/bible/sources.json`) records, per source: upstream URL, upstream version (STEPBible commit SHA; Berean download date and SHA-256 of the raw file), our derived file's SHA-256, row count, and the release asset name.
- Release assets are **never overwritten**; a new version gets a new name (e.g. `bsb-alignment-v2.tsv.gz`).
- The seeder verifies the fingerprint against the manifest and refuses to load a mismatch.
- A one-row table records which manifest version each environment has loaded.
- A test asserts the manifest and shipped files agree.
- The Berean data is normalized **once, at data-preparation time** (unused columns dropped, continuation rows resolved, padding removed, **and the disambiguated tag attached by joining to TAHOT/TAGNT**) and uploaded to our release. The join script is committed as the normalizer (audit trail). Nothing joins at runtime.
- The manifest records STEPBible's commit SHA for the lexicons **and** for TAHOT/TAGNT (the ~100 MB of tagged texts are needed only when preparing data, not to run the app). STEPBible files are fetched from STEPBible's GitHub at that pinned commit with checked-in SHA-256s rather than re-hosted.
- **Keep the original (owner request, 2026-09-24):** wherever the normalizer overrides a source value, the original is kept in a column with an `orig_` prefix so the change can be reverted without re-fetching anything (see Database).
- **Measured release-asset size (normalizer prototype, 2026-09-24):** 442,340 rows, 61.9 MB as TSV, **12.9 MB gzipped** (`gzip -9`). No column dominates (largest: source word 1.7 MB, translit 1.2 MB, English 1.2 MB); dropping `parse_full` (determined by `parse_short` in all but 3 of 3,804 values) would save ~1.4 MB, not worth the complexity. Fine as a GitHub release asset. **Database size is not measured** (no local Postgres, and the shared dev database must not be used for experiments): expect on the order of 100 MB with indexes — confirm the Sevalla plan's headroom before seeding.
- Rejected: the seeder downloading from bereanbible.com live on every run (setup would depend on a third party); committing the data to git (permanent multi-MB blob).

## Database (new migration, next free number is 000026 — re-check at plan time)

- `bible_word`: one row per source word — verse id (FK `bible_verse`), `source_sort`, `bsb_sort`, `language` (`heb`/`grc`), source word, transliteration, **`orig_strongs`** (Berean's plain number, exactly as in the source file, never modified), **`strongs`** (the disambiguated tag, e.g. `H1254B`, or the main entry for the plain number when the join could not align the word), **`strongs_source`** (`tagged` or `fallback`), parsing (short/full), `span_head` (the `BSB Sort` of the first row of the phrase this word belongs to; NULL for a source word that belongs to no phrase), English phrase (NULL on continuation rows), `pre`/`post` punctuation and quote strings (already cleaned). English words with no source word (about 4,700 rows) are stored as rows with no source-word columns so the rebuilt text is complete. Prototype size: 442,340 rows. **Primary key `(verse_id, bsb_sort)` is the only index** (owner request 2026-09-24: no indexes beyond the bare minimum); this pair is unique across all 442,340 prototype rows, and verse-range reads use it directly. No FK index, no secondary indexes. Reverting the disambiguation = read `orig_strongs` instead of `strongs`.
- `bible_lexicon`: disambiguated tag (PK, e.g. `H1254B`), plain number, language, gloss (~23k rows).
- `bible_data_version`: one row, the loaded manifest version.
- Seeded by extending the existing `backend/cmd/seed-bible` command; idempotent (upsert). **Migrations are applied by hand per environment — never `make migrate-*`; the PR states this.**

## API

One new query, `passageInterlinear(startVerseId, endVerseId)`:
- Returns, per verse, the English phrases in reading order (with punctuation), each with its source word(s): Strong's number, source word, transliteration, parsing, language, original-order index, and the **gloss already joined in**. Also returns the credit-line text so it lives in one place.
- Not fetched over the 150-verse hard cap; over the 31–150 collapsed range only the visible verses matter.
- Reuses the authenticated `graphqlRequest()` wrapper. `queryKey` mirrors every variable sent. `staleTime: Infinity` (data never changes).
- Read-only and public, like `passageText`: works for signed-out readers.

**Text-consistency guard (verified achievable).** The normalizer rebuilds each verse's text from the alignment rows and a test asserts it equals `bsb.tsv`. With rules taken from the data, **31,100 of 31,102 verses rebuild exactly (99.994%)**, including the 16 BSB-omitted verses (empty in both, issue #410). Rebuild rules: order rows by `BSB Sort`; per row emit `begQ + English + pnc + endQ + End text`; drop `-`, `vvv` and `. . .` (also when embedded in a phrase); strip `[ ]`, `{ }` and HTML; drop `begQ` values that are `reftext` verse-number spans; ignore an `End text` in square brackets; join pieces with a space, then remove spaces before closing punctuation and after opening quotes, and around em dashes. The two exceptions: **verse 2662** (alignment lacks "of silver"; it has `. . .`) and **verse 6964** (a missing space after "web."). A verse that fails the check renders as plain text (the interlinear is not offered for it). The guard is a test in CI, so future data changes cannot silently break it.

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
- **John 3:16** — "one and only" is one phrase mapping to the single Greek word `G3439`, before "Son" (`G5207`) in English but after it in Greek order; the `vvv` placeholder row is filtered. Continuation rows (blank English, `BSB Sort` exactly +1) group into the preceding phrase; a blank-English word that is not adjacent (e.g. `H1961` at Genesis 39:5) belongs to no phrase. **Also:** Psalm 51:1 (title folded into verse 1, three TAHOT word-number runs) aligns fully; Genesis 1:4 "good" (`H2896` vs `H2895`) is a known unaligned word that falls back; verse 2662 fails the rebuild guard and renders plain.

## Out of scope for v1

Hand-written editorial definitions; STEPBible's longer `Meaning` text; per-device memory of the toggle; per-testament or per-book loading; interlinear on the grid rows or on a standalone route (ANSWERS Q8).

## Open items to verify during planning (not assumptions)

**Resolved 2026-09-24 (evidence in Data sources; the throwaway prototype scripts are saved beside this spec in `interlinear-prototype/` (they hard-code scratch paths; the plan must port them as the real, committed normalizer):**
- Berean plain numbers map to *multiple* STEPBible entries (owner's hunch confirmed): 34.7% of word rows; the join to TAHOT/TAGNT recovers the exact tag for 99.37% of the ambiguous rows.
- Row count: 437,587 word rows (matches ~440k); of the other 317,060 lines, 311,917 are empty padding and about 5,100 are English-only or heading lines.
- The `Verse` column equals our verse ordinal for all 31,102 verses.
- Rebuilt text equals `bsb.tsv` for 31,100 of 31,102 verses; the 16 BSB-omitted verses are empty in both.
- Psalm titles: fixed (was my sort bug); Psalm verse 1 aligns 99.69%.
- Fallback rule chosen and measured (79.0% vs 71.1% for first-row); positional pairing rejected.
- The 22 gloss-less tags: fallback gives sensible meanings.
- BSB public-domain wording read at source; STEPBible CC BY wording read from its README and lexicon headers.
- Release-asset size measured: 12.9 MB gzip.
- `openscriptures/strongs` is not used, so its unclear license is moot.

**Still open (cannot be settled from here):**
1. **Database size on Sevalla** (~100 MB estimated, not measured): the owner should confirm the plan's headroom before the seeder runs anywhere.
2. **Tables' license coverage:** the BSB terms page does not mention the tables/Strong's/morphology files separately; treating them as covered by the public-domain dedication is an inference. The underlying Hebrew/Greek text and Strong's numbering carry their own upstream terms that the BSB page does not address. If that matters, ask the publisher.
3. **New Testament alignment stays 96.87%** (number disagreements such as `G1473` and the Greek "see" verbs). The impact is small (only 952 unaligned rows are ambiguous), but a small hand-made equivalence table (e.g. `G3708`↔`G1492`/`G3700`) could recover most of them; decide in planning whether it is worth it.
4. **Verse 2662 and 6964** render plain (or need a one-line normalizer fix for 6964); confirm with a fresh look when the normalizer is ported.
5. ~~TAHOT/TAGNT pinned commit~~ **Settled 2026-09-24:** the tested files are unchanged since these commits (all older than the download): `Translators Amalgamated OT+NT/` last changed at `0f60797c170f11a1f8dc75c5f7617973e2e66b0d` (2025-09-02); `Lexicons/` last changed at `48b7cfbda441adb6445ea565b4ed23dd98dfdf2e` (2026-03-22); repo `master` was `b99716b0cddb648ddb95cc786a197180f2f97d48` (2026-09-18). Record these plus per-file SHA-256s in the manifest.
