# Bible Passage Content — Answers Needed Before a Plan Can Be Written

Status: **all blockers resolved (2026-09-22) — ready for `superpowers:writing-plans`.** Q22 is consciously deferred; the ⚠️ items ride on their recommendations. Q22 is consciously deferred; the ⚠️ items ride on their recommendations.
Companion to: [`2026-09-19-bible-passage-frontend-design.md`](./2026-09-19-bible-passage-frontend-design.md) (PR #396)
Also reconciles: the `design_handoff_bible_passage_activity` HTML prototype + README (Activity-table interlinear design), and new product asks (passage-length cap, "% through Scripture", Bible Gateway version picker, historic commentary links).

## Why this document exists

The spec in PR #396 is a **backend-shaped data-model design**. The design handoff is a **frontend-shaped interaction design**. They were produced independently and they do not agree — the handoff assumes capabilities the spec never scoped (word-level Strong's interlinear, inline row expansion, per-type columns), and the spec assumes constraints the handoff ignores (BSB-only, no commentary, no translation switcher). Layered on top are four new product asks that neither document covers.

Writing an implementation plan now would mean inventing answers to ~30 open decisions and burying them in task steps where they are expensive to reverse. This document surfaces them instead. **Every question has a recommendation** — if you agree with all of them, reply "take the recs" and the plan gets written from them.

Questions are tagged:
- ✅ **ANSWERED** — decided; recorded here so the plan does not reopen it.
- 🚧 **BLOCKING** — the plan cannot be written without an answer.
- ⚠️ **SHAPING** — a default exists, but the answer changes task breakdown significantly.
- 🕒 **DEFERRED** — consciously postponed; the entry records why that is safe.
- 💬 **DEFERRABLE** — can be answered during implementation.

---

## 0. Decision summary

| # | Question | Recommendation | Tag |
|---|---|---|---|
| Q1 | How many PRs / what order? | **Answered** — 6 sequenced PRs (A, B, C, C2, D, E); plan covers A–C2 | ✅ |
| Q2 | Is Strong's interlinear in scope? | **Answered — YES.** Spike green: BSB publisher ships public-domain word alignment | ✅ |
| Q3 | Inline row expansion vs modal? | **Answered** — modal (`ActivityDetailsModal`); AG Grid Community has no master/detail | ✅ |
| Q4 | Per-content-type columns? | **Answered — one column set** *(for now; revisit if the mixed view proves awkward)* | ✅ |
| Q5 | How are passage rows deduped? | **Answered** — version-less Bible Gateway URL in `url` as the key, ordinals as identity | ✅ |
| Q6 | Who owns a lazily-created passage row? | **Answered** — the triggering user (mirror `CreateClaim`); no sentinel | ✅ |
| Q7 | Do we store verse ordinals as columns? | **Answered** — yes, + btree; `content_passage` deferred to the import work | ✅ |
| Q8 | Does the passage page/route ship now? | No. Modal only in this phase | ⚠️ |
| Q9 | Where does the shared book table live? | `data/bible/books.json` at repo root, consumed by Go and TS, test-asserted | ⚠️ |
| Q10 | Category + Tags for a passage — where from? | Tags derived from `bible_book` (testament + division); Category reuses existing user/Wikidata flow | ⚠️ |
| Q11 | "Length" for a passage? | Verse count, not word count. Reuse `length`/`length_units` columns | ⚠️ |
| Q12 | Perspectives count as a grid column? | No — it is lazy-loaded today for perf reasons; leave it in the modal | ⚠️ |
| Q13 | Soft/hard passage render caps? | **Answered** — two-tier 30 / 150, as configuration not constants | ✅ |
| Q14 | "% through Scripture" — unit and interactivity? | **Answered** — read-only bar + ordinal label; percentage only in the tooltip | ✅ |
| Q15 | Bible Gateway — which versions, persisted? | 10-version picker, preference in `localStorage`, `rel="noopener"` new tab | ⚠️ |
| Q16 | Versification mismatch on outbound links? | **Answered** — degrade to a chapter link with a note; never silently mis-link | ✅ |
| Q17 | Commentary links — which, per-verse or per-chapter? | Per-chapter links, 4–5 commentaries, static coverage table to hide dead links | ⚠️ |
| Q18 | Seed data: scripted fetch or manual download? | **Answered for A–C** (verse text 4.3 MB, committed). Alignment file **deferred to PR E** | ✅ |
| Q19 | How is seed data loaded into the DB? | **Answered** — a Go seeder command, not a migration | ✅ |
| Q20 | Mobile behaviour? | Card list already replaces the grid < 860px; passage modal must work there | ⚠️ |
| Q21 | Add-content: autodetect and/or type picker? | **Answered** — one input, autodetect, editable type chip. PR C2 | ✅ |
| Q22 | Separate Catholic content type for deuterocanon? | **Deferred**, leaning one-type-plus-`canon`. Safe to defer — see Q22 | 🕒 |
| Q23 | Optional passage title in the Item cell | **Answered** — `name` stays canonical; nullable `display_title`, **first-write-wins** while NULL | ✅ |

---

## 1. Scope and sequencing ✅

**Q1. How should this be split?**

As written, spec + handoff + new asks is somewhere around 8–12k lines of change across two stacks, two seed datasets (31,102 verses, plus ~10⁵–10⁶ word-alignment rows for the interlinear), and two stacks. That is not one PR and not one plan.

**Recommendation — five sequenced units, each independently shippable:**

| PR | Contents | Depends on |
|---|---|---|
| **A. Reference data** | `data/bible/` files + provenance README, `bible_book`/`bible_verse` migration, Go seeder command, TS `bibleStructure.ts`, parity test | — |
| **B. Backend content type** | `BIBLE_PASSAGE` enum, canonical-URL dedupe, verse-ordinal columns, `passageText`/`bibleBooks` queries, `createContentFromPassage` mutation | A |
| **C. Frontend display** | `parseReference`/`formatReference`, `PassagePicker`, `PassageText`, type icon in `typeCellRenderer` + `activityItemCellRenderer`, passage section in `ActivityDetailsModal` | B |
| **C2. Add-content flow** | Generalize `AddVideoPopover` → `AddContentPopover`: autodetect + editable type chip + passage controls (Q21) | C |
| **D. Outbound links** | Bible Gateway version picker, commentary links, "% through Scripture" bar | C |
| **E. Interlinear** | BSB word-alignment ingest + hover spans (Q2 spike **green**) | C |

**This document, and the plan it unblocks, should cover A–C2**, with D and E sequenced after. D is small and well-understood enough to fold into C if you prefer. E is no longer blocked — the Q2 spike resolved green — but it is still a large, separable body of work with its own dataset, so it stays a distinct unit.

C2 comes after C deliberately: the creation flow depends on the passage renderer and reference parser existing, and it also touches the working YouTube path, so it is better done against proven foundations than in parallel with them.

**Answer:** ☑ **take the rec** — A, B, C, C2, D, E as above.

---

## 2. Design handoff vs. spec — direct contradictions

### Q2. Is the Strong's interlinear in scope? ✅

> **Read the RESOLVED block at the end of this question first.** The analysis below is preserved as the reasoning that motivated the spike; its conclusion ("cut it") was **overturned** by the spike's findings.

The handoff's centrepiece — hover an English word, see its Hebrew/Greek lemma, transliteration, Strong's number and gloss; chips below; a dashed connector line between the English word and its chip — is **not mentioned anywhere in the spec**, which explicitly lists cross-references and commentary as out of scope.

The prototype hand-tagged **two passages** (Genesis 1:1–3, John 3:16–17) and prints an apology for the other three. That is the whole problem in miniature. Hovering an **English** word requires a **word-level alignment between the English translation and the original-language text**, and the source research (§6) came back clear on this:

> **No open dataset provides English-translation word alignment.** OpenScriptures/MorphHB (OSIS XML, CC BY 4.0) and STEPBible TAHOT/TAGNT (TSV, CC BY 4.0) both give original-language words in **original word order**, tagged with Strong's number, lemma, morphology and a short contextual **gloss**. Neither says "BSB word #7 in this verse is Greek word #4." That mapping does not exist in them.

So there are three genuinely different features hiding behind one mock:

1. **Original-language word list per verse** (the chips row) — **feasible today** from OSHB/STEPBible alone. No English alignment needed. This is most of the handoff's visual payload.
2. **Tap an English word → its Strong's entry** (the inline dotted underlines and the connector line) — **blocked** on alignment data.
3. **Strong's definitions** for the tooltip body — easy; the 1890 dictionary is public domain (`openscriptures/strongs`, JSON), though the repo's own packaging license needs a LICENSE-file check.

### ✅ RESOLVED — the spike came back GREEN (2026-09-22)

**The alignment exists, is published by the BSB's own publisher, and is public domain.** The recommendation above to cut the feature is **withdrawn**. Superseded by the findings below.

Two usable sources, both from the BSB publisher:

| Source | Shape | Use |
|---|---|---|
| **`bereanbible.com/bsb_tables.tsv`** (also `.xlsx`, ~55MB) | one row **per Hebrew/Greek source word**, whole Bible | primary — carries sort keys, morphology, transliteration |
| **`github.com/BSB-publishing/bsb2usfm`** releases — `BSB_strongs_usj.zip` (JSON), also USFM/USX | English words pre-tagged USFM 3.0 style: `\w gracious\|strong="G5485"\w*` | faster to ingest; use to **validate** the TSV phrase-grouping |

License: **public domain / CC0** — berean.bible/terms.htm: "officially dedicated to the public domain as of April 30, 2023. All uses are freely permitted." Conversion tooling in the repo is MIT.

**The three properties that made this look impossible are all explicitly handled by the data:**

1. **Phrase-level, not 1:1** — a source word can map to a multi-word English phrase (H7225 → "In the beginning"; the inseparable Hebrew prefix is not a separate token). **Hover targets must be spans, not words.**
2. **Continuation rows** — when several source words share one English phrase, only the **first** row carries text in the `BSB version` column; subsequent rows are blank there. Group before rendering.
3. **Word order differs** — the file carries **independent sort columns**: `Heb Sort` / `Greek Sort` (original order) and `BSB Sort` (English order). **Sort by `BSB Sort` for display; never assume file row order is reading order.** Keeping the original-order key also makes the handoff's chips row free.

Relevant columns (literal header names — they are not friendly): `Heb Sort`, `Greek Sort`, `BSB Sort`, `Verse`, `Language`, `WLC/Nestle Base`, `Translit`, `Parsing (short)`, `Parsing (full)`, `Str Heb`, `Str Grk`, `VerseId`, `BSB version`.

**Two constraints carried over from the spike — both matter:**
- **Do not scrape BibleHub's live interlinear pages.** That display layer references Lockman/NASB concordance data and is separately encumbered. Use the Berean tables / USFM / USJ files.
- **Do not substitute the Berean *Literal* Bible.** The tables are keyed to the smoothed BSB text via the `BSB version` column — which is exactly the text we display. (This resolves the BSB-vs-BLB granularity question the spike was written to settle: it is BSB-level.)

**One open item found while reading the column list ⚠️.** The spike states glosses derive from BDB (Hebrew) and Thayer's (Greek) and are "already embedded per-row" — but **no gloss/definition column appears in the published header list**. The table gives lemma, transliteration, morphology, Strong's number and the English rendering; the *definition* sentence in the tooltip mock may need a **join to a Strong's lexicon** (`openscriptures/strongs`, or MorphHB/STEPBible, all CC BY 4.0 — note the attribution obligation). **Verify before planning the tooltip payload**; it is a one-column check against a downloaded file, not a research project. Related: BDB/Thayer glosses are terse, whereas the prototype's glosses are editorial prose ("a plural form used with a singular verb, the 'plural of majesty'") — the shipped tooltip will read differently from the mock unless someone writes that copy.

**Consequences for the rest of this document:**
- **PR E is now plannable** and no longer gated. Sequence it after C, independent of C2/D.
- **Q18 needs revisiting (§6).** This is not a 31,102-row seed — it is roughly one row per source word for the whole Bible (order 10⁵–10⁶ rows). Whether that normalized output can be committed to git, or needs an LFS/release-asset strategy, is a **new open question**.
- **Q13's render cap matters more**, since every verse now carries span markup and hover targets rather than plain text.
- **Gen 1:1 and John 3:16 become required test fixtures** — the spike names them precisely because they exercise reordering and phrase-mapping (§8).

**Answer:** ☑ **build it — data confirmed** ☐ defer anyway

---

### Q3. Inline row expansion — not available ✅

The handoff's interaction is "click the Item cell → the row expands and a panel appears beneath it." **AG Grid Master/Detail is an Enterprise feature.** Verified: `frontend/package.json` pins `@ag-grid-community/*` at `32.3.9` with no `@ag-grid-enterprise/*` package anywhere, and `frontend/CLAUDE.md` forbids adding AG Grid packages ad hoc.

Options:
- **(a) Modal.** `ActivityDetailsModal.svelte` already opens on Item-cell click for every content type today. Add a passage section to it. Zero new interaction patterns, works in the mobile card list for free.
- **(b) Full-width row hack.** Inject a synthetic "detail" row into the row data on expand and give it a full-width cell renderer. Doable in Community, but it fights sorting, filtering, pagination and row IDs — every one of which this table uses heavily.
- **(c) Buy AG Grid Enterprise.** A licensing/cost decision, not an engineering one.

**Recommendation: (a) modal.** The handoff's visual design for the panel (typography, badges, spacing) transfers to the modal essentially unchanged; only the container differs. It also sidesteps the fact that the grid is replaced entirely by `ActivityCardList.svelte` below 860px, where an "expand the row" interaction has no host.

**Answer:** ☐ modal (rec) ☐ full-width row ☐ price out Enterprise ☐ other: ______

---

### Q4. Per-content-type columns ✅

The handoff's table replaces **Duration** with **Length (N words)** and **Views/Likes** with **Perspectives**. Every screenshot shows the table *filtered to Bible Passage*, which quietly dodges the real question: **what does the table look like when a YouTube video and a Bible passage are both on screen?** — which is the default, unfiltered view.

The table today has one global column set with a 4-tier responsive reveal, and column visibility is controlled in **two places that must stay in sync** (`hide:` in the colDef and the `setColumnsVisible()` responsive `$effect`, which wins on `gridReady`). Making visibility also depend on the row mix would be a third input into an already fragile mechanism.

**Recommendation: no per-type columns.** Keep one column set. Passage rows render empty in Views/Likes/Channel (exactly as `CLAIM` rows do today) and populate Duration via Q11. If a type-specific view is genuinely wanted later, the honest version is a saved view/preset, not row-dependent columns.

**Answer:** ☑ **one column set, for now** — passage rows leave Views/Likes/Channel empty as CLAIM rows already do. Recorded as a *deliberately revisitable* decision: if the mixed unfiltered view proves awkward in practice, the next step is a saved view/preset, **not** row-dependent column visibility.

---

### Q5–Q7 are in §3. Other handoff/spec mismatches, for the record:

| Handoff says | Spec says | Recommendation |
|---|---|---|
| Mixed BSB *and* KJV text across sample rows; a translation badge per row | BSB only, "the frontend does not expose a choice" | **BSB only on-platform**; every other translation is an *outbound Bible Gateway link* (Q15). This resolves the contradiction cleanly and is also the cheapest answer to your 10-version ask. |
| Translation badge pill "BSB · public domain (CC0)" | Copyright/attribution line required | Keep the badge; it *is* the attribution line. Make it non-optional in `PassageText`. |
| "37 words" in the screenshot, "24 words" in the README for the same passage | no length concept | See Q11 — use verse count, which is unambiguous and already computed from the model. |
| `Date Added` column | rows are created lazily | It means "when the first person wrote on this passage", which is defensible but reads oddly for Scripture. Keep the column (it is global), just do not draw attention to it. |
| Book-with-cross icon, hand-built SVG | — | Use the project's existing icon approach rather than the prototype's inline SVG. 💬 |

---

## 3. Backend gaps ✅

Verified against `main` (the spec's assumptions have drifted in a few places).

### Q5. How do two users writing on `John 3:16–18` land on the same row? ✅

`content_type` is a **plain `varchar`** — no Postgres enum, no CHECK constraint. Adding `bible_passage` needs **no DDL at all** for the type itself. That is the good news.

The bad news: dedupe. YouTube gets atomic find-or-create free via `GetOrCreateByURL` → `ON CONFLICT (url)` against the `content_unique_url` constraint. `url` is nullable and Postgres permits many NULLs, so passage rows with `url = NULL` would silently duplicate — two users picking the same range would get two content rows and their perspectives would never meet, which is the single thing this whole model exists to prevent.

Options:
- **(a) Synthetic canonical URL** in the existing `url` column. Reuses the existing unique index, `GetOrCreateByURL`, and the race-safety work already done there. **Zero new constraints.** Risk: normalization must be exact, or you get duplicates anyway.
- **(b) New unique constraint** on `(verse_start_id, verse_end_id)` + a new `GetOrCreateByVerseRange` repository method. Cleaner semantically, more code, needs a partial index (the pair is NULL for every non-passage row).
- **(c) Service-layer check-then-insert.** Race-prone. This is precisely what `GetOrCreateByURL` was built to avoid. Not recommended.

**Recommendation: (a), using a version-less Bible Gateway URL as the canonical string.**

This is the proposed refinement to (a), and it is a good one: the dedupe key doubles as the outbound link we need anyway for Q15, and it keeps `url` holding something that actually is a URL — so any generic "open the source link" UI keeps working instead of needing a `bible:`-scheme branch.

```
url = https://www.biblegateway.com/passage/?search=Genesis+1%3A1-5
                                                    ^ no &version=
```

**Three rules make this safe. All three are load-bearing:**

1. **The key carries no version.** Verified: a version-less Bible Gateway URL resolves fine — it defaults to whatever Bible Gateway prefers (NIV, as of this check). If a version were ever baked into the key, changing our default version would make every new row key differently from every existing row, and dedupe would break **silently** — no error, just a slowly growing pile of duplicate passages. Version is appended at **render** time from the reader's picker (Q15), never stored.

2. **The key is generated from the ordinals, never from user input.** One function, `ordinals → canonical URL`. Bible Gateway's `search=` parameter cheerfully accepts `Gen 1:1-5`, `Genesis 1.1-5`, `Genesis 1:1–5` (en dash), `Genesis 1:1-Genesis 1:5`, `%3A` vs `:`, `+` vs `%20` — all the same passage, all different strings, all different rows. The moment any code path stores a *pasted* Bible Gateway link, dedupe is gone. If passage-by-URL entry is ever wanted, it must parse the link to ordinals and then regenerate the canonical form.

3. **The ordinals remain the real identity.** `verse_start_id`/`verse_end_id` (Q7) are the source of truth; the URL is a *derived* unique key. This is what makes the third-party coupling acceptable — if Bible Gateway ever reshapes its URLs, every key can be regenerated from the ordinals in one migration. Without the ordinal columns, we would be storing our data's identity on someone else's domain, which is not a position to be in.

**Two caveats worth naming:**

- **⚠ Do not use the version-less URL as the displayed link.** It silently serves NIV while our on-platform text is BSB — the reader would see two different translations in one view, with no indication why. Render links as key + `&version={selected}`.
- **"Point at BSB" does not appear to be available.** Whether Bible Gateway carries the Berean Standard Bible at all is **unconfirmed** — BSB's homes look like BibleHub and YouVersion. Worth a 30-second check, but do not design around it; the version-less key plus a render-time picker does not need it.
- `content_unique_url` is global across content types, so this also means a Bible Gateway URL can exist only once in `content`. Harmless today (only YouTube and Claim exist), but if generic URL/article content is ever added, someone pasting a Bible Gateway link would collide with a passage row. That is the pre-existing cross-type uniqueness question in `ADDING_CONTENT_TYPE.md` Decision 4, not a new problem — just one this makes slightly more likely to be met.

**Answer:** ☑ (a) version-less Bible Gateway URL as key, ordinals as identity — *proposed and recommended* ☐ (b) range constraint ☐ other: ______

### Q6. Who is `added_by_user_id` on a lazily-created passage row? ✅

It is `NOT NULL`, and there is **no system/sentinel user anywhere in the schema**. "Lazily created" still requires an owner.

**Recommendation: the triggering user**, exactly as `CreateClaimInput` does. First person to write on `John 3:16` is recorded as having added it. Introducing a sentinel user is a schema-wide change with auth/permission blast radius, for cosmetic benefit.

Worth confirming there is no UI that says "added by X" in a way that would read as a claim of authorship over Scripture. 💬

**Answer:** ☑ **triggering user.**

### Q7. Verse ordinals as real columns? ✅

The spec's core promise — "a perspective on John 3:16 appears on the John 3:1–21 page and vice versa" — is a **range-overlap query**. That is not answerable from a synthetic URL string; it needs numeric columns.

**Recommendation: add `verse_start_id int NULL, verse_end_id int NULL` to `content`**, plus an index supporting overlap. (See also Q22: `bible_book` should carry a `canon` column from the start, and the ordinal space must leave room for a deuterocanonical block — both are decisions that cannot be revisited after seeding.) Two sub-questions:
- **Index type:** a plain btree on `(verse_start_id, verse_end_id)` handles the common "small range overlaps" case adequately at our scale; a GiST index on `int4range(verse_start_id, verse_end_id, '[]')` is the textbook answer and scales better. **Rec: btree now**, note GiST as the upgrade path — we will have far fewer passage rows than verses for a long time.
- **`content_passage` table:** the spec mentions it in one sentence for sermon→passage links, with no design. That is a *different* relationship (one sermon, many passages) from a passage row's own identity. **Rec: defer it to PR E/the sermon-import work** — nothing in A–C needs it, and designing it now without the import flow would be guesswork.

Also note: `ContentSortBy` contains YouTube-shaped keys (`VIEW_COUNT`, `PUBLISHED_AT`, `CHANNEL_TITLE`) with no type guarding — sorting a passage-filtered list by those returns nulls. Pre-existing wart shared with `CLAIM`; **not** in scope to fix, but the plan should not pretend it does not exist. 💬

**Migration number:** `000022` is claimed by the in-flight YouTube rename (PR #394, not yet merged). Take **`000023`** and re-check at execution time per CLAUDE.md. That PR also renames `YOUTUBE` → `YOUTUBE_VIDEO`; write the plan to rebase cleanly onto either state.

**Answer:** ☑ **ordinal columns + btree; `content_passage` deferred to the sermon-import work.**

---

## 4. Frontend gaps ⚠️

### Q8. Does a canonical passage route ship in this phase?

**No route in the app gives any content item its own URL today** — all content detail is modal-based; the only dynamic route in the entire app is `messages/[threadId]`. The spec's `/bible/[book]/[ref]/+page.svelte` would therefore be a genuinely new pattern, and its open question about colons in SvelteKit params is real.

**Recommendation: no route this phase.** Ship the modal (Q3). A shareable passage URL is a good idea and a clean follow-up, but it drags in SEO, server-side loading and a URL-shape decision that nothing in A–C depends on.

**Answer:** ☐ modal only (rec) ☐ route too ☐ other: ______

### Q9. Where does the shared book table live? ⚠️

The spec's strongest single idea: **one JSON file consumed by both the Go reference parser and the TS utilities, so they cannot drift.** It never says where.

**Recommendation: `data/bible/books.json` at the repo root** (not under `backend/` or `frontend/`, since neither owns it), with a `data/bible/README.md` recording provenance and license for every file in there. Go embeds it via `go:embed`; TS imports it directly. A test in each stack asserts parity with the seeded DB, as the spec already requires.

Also flagged by the spec: check whether `frontend/src/lib/utils/references.ts` collides. It is about perspective refs, not Scripture — name the new one `bible.ts` and there is no conflict. 💬

**Answer:** ☐ `data/bible/` (rec) ☐ other: ______

### Q10. Category and Tags for a passage ⚠️

The handoff shows Category = "Creation"/"Salvation" and Tags = "Old Testament, Torah". Neither has a source. `bible_book` as specced has only `id, name, testament, chapterCount, aliases` — no genre/division, so "Torah" is not derivable.

**Recommendation:**
- **Tags:** add a `division` column to `bible_book` (Torah / History / Wisdom / Major Prophets / Minor Prophets / Gospels / Acts / Pauline Epistles / General Epistles / Apocalyptic) and derive tags as `[testament, division]`. Cheap, static, and makes the Tags column meaningful immediately.
- **Category:** do **not** invent a Scripture taxonomy. Reuse the existing user/Wikidata category flow unchanged — a passage gets a category the same way a video does. "Creation"/"Salvation" in the mock are just categories a user picked.

**Answer:** ☐ derive tags from division, reuse category flow (rec) ☐ other: ______

### Q11. What is a passage's "Length"? ⚠️

The handoff says word count, and contradicts itself (37 words in the screenshot, 24 in the README, same passage). Word count is also translation-dependent, which conflicts with the spec's "content identity is translation-agnostic" decision — the *identity* would be stable but the *displayed length* would change if the translation ever did.

**Recommendation: verse count.** `length = verse_end_id - verse_start_id + 1`, `length_units = 'verses'`. Translation-independent, derivable from the model with no text at all, reuses the existing columns and the existing Duration column's formatter with a units branch. Genesis 1:1–3 → "3 verses".

**Answer:** ☐ verse count (rec) ☐ word count ☐ leave blank ☐ other: ______

### Q12. Perspectives as a grid column? ⚠️

`perspectiveCount` exists end-to-end already — but it is deliberately **not** in `LIST_CONTENT`. It lives only in `GET_CONTENT_AGGREGATES`, fetched lazily when the details modal opens, because it is an aggregate over the perspectives table. Putting it in the list query means computing it for every row of every page.

**Recommendation: leave it lazy.** The modal shows it (it already does). If a grid column is genuinely wanted, that is its own piece of work with its own perf story — batching/DataLoader on the resolver, measured — and it applies to all content types, not just passages.

**Answer:** ☐ leave lazy (rec) ☐ add to list query — accept the perf work ☐ other: ______

### Q20. Mobile ⚠️

Below 860px the AG Grid instance is **not rendered at all** — `ActivityCardList.svelte` replaces it. The handoff is desktop-only (min-width ~1040px with horizontal scroll) and says nothing about small screens.

**Recommendation:** the passage modal must work at phone width (it is the same modal that already works today), the card list gets the passage icon and reference as its title, and `PassagePicker` uses native `<select>` on small screens as the spec already says. The "% through Scripture" bar (Q14) needs a compact variant.

**Answer:** ☐ as above (rec) ☐ other: ______

---

## 5. New product asks

### Q13. Long-passage cap ✅

You asked: past a certain length, don't render the passage — link to Bible Gateway instead. The spec's version was softer (">~50 verses render collapsed with 'Show full passage'").

Both are right, for different lengths. Recommendation: **two thresholds, both configuration, not constants:**

| Range | Behaviour |
|---|---|
| ≤ 30 verses (roughly a chapter) | render in full |
| 31–150 verses | render collapsed to the first ~10 verses + "Show full passage" |
| > 150 verses (multi-chapter, whole books) | **do not render text at all** — show the reference, the verse count, the position bar, and an outbound link |

Why configuration rather than a hard-coded number: today BSB is CC0 and the cap is purely a UX/performance judgement. The moment anyone adds a licensed translation, the cap becomes a **legal** limit (typical publisher terms cap quotation at a few hundred verses and a percentage of the work). Building it as a policy value now means that change is a config edit rather than a re-architecture.

Open sub-question: for the 31–150 band, collapse to first-N-verses or a fixed pixel height? **Rec: first N verses** — a pixel height cuts mid-sentence.

**Answer:** ☑ **two-tier 30 / 150**, expressed as configuration rather than constants, so the cap can become a legal limit if a licensed translation is ever added.

### Q14. "% through Scripture" ✅

The model makes this almost free — the verse ordinal *is* the position. One correction worth making before it gets built into a label:

**The arithmetic in your example is off by about 30×.** With 31,102 verses, one verse is `1/31102` = **0.0032%**, not 0.0001%. Genesis 1:1–5 is **0.0032% → 0.0161%**. (0.0001 is roughly the *fraction* 1/31102 ≈ 0.0000322 misread as a percentage.)

That matters because it exposes the real problem: **at verse granularity the percentage is always a rounding artefact.** Any sane rounding shows "0.0%" for most of Genesis, and four decimal places on a UI label reads like a bug.

**Recommendation: keep the position idea, drop the percentage as the primary display.**
- A **read-only horizontal position bar** spanning all 31,102 verses, with the passage drawn as a highlighted segment. Mark the **OT/NT boundary** (OT = 23,145 verses, NT = 7,957 — to be confirmed against the seeded data rather than trusted from folklore) and tick the book boundaries. For a 3-verse passage the segment is sub-pixel, so enforce a minimum visible width with a marker.
- Text label in **ordinals, not percent**: `Verses 1–5 of 31,102 · Genesis (book 1 of 66)`. Ordinals are exact, human-meaningful, and never round to zero.
- If you want a percentage, put it in the tooltip at 2 decimals, and consider a **per-testament** denominator too (`0.02% through the Old Testament`), which is less vanishingly small.

**Two sub-questions:**
- **Interactive or decorative?** A draggable slider implies navigation — drag to jump to another passage. That is a genuinely nice feature and a much larger one (it needs ordinal→reference resolution, a preview affordance and its own mobile story). **Rec: read-only in this phase**, designed so a later drag handle is additive.
- **Where does it live?** **Rec: the passage modal only.** Not a grid column — it is a visualization, not a value, and the grid already has a column-visibility fragility problem (Q4).

**Answer:** ☑ **read-only position bar + ordinal label.** Percentage appears only in the tooltip, at 2 decimals. A draggable handle stays possible later — design the component so it is additive rather than a rewrite.

### Q15. Bible Gateway version picker ⚠️

You asked for a dynamic picker over the ~10 most popular versions including Catholic ones. This also resolves the BSB-only tension neatly: **we host exactly one public-domain translation and link out for everything else** — no licensing exposure, no text storage, and the reader gets every translation they actually want.

**Link shape (verified):** `https://www.biblegateway.com/passage/?search={reference}&version={code}`
e.g. Genesis 1:1–5 ESV → `https://www.biblegateway.com/passage/?search=Genesis+1%3A1-5&version=ESV`. Cross-chapter ranges use ordinary human syntax (`1 Corinthians 12:31-13:13`) and work. Bible Gateway's `robots.txt` was fetched directly: it constrains crawling only (15s crawl-delay, a few disallowed paths) and **says nothing about outbound linking** — which is expected, since we construct a URL rather than read the page.

**Version codes** (research flags NASB / AMP / DRA as needing one live spot-check before shipping — NASB in particular has `NASB1995` / `NASB2020` edition variants):

| Translation | Code | | Translation | Code |
|---|---|---|---|---|
| New International Version | `NIV` | | Amplified Bible | `AMP` ⚠ |
| English Standard Version | `ESV` | | The Message | `MSG` |
| King James Version | `KJV` | | New American Bible, Rev. Ed. *(Catholic)* | `NABRE` |
| New King James Version | `NKJV` | | NRSV Catholic Edition | `NRSVCE` |
| New Living Translation | `NLT` | | RSV Catholic Edition | `RSVCE` |
| New American Standard Bible | `NASB` ⚠ | | Douay-Rheims 1899 American | `DRA` ⚠ |
| Christian Standard Bible | `CSB` | | | |

Sub-questions and recommendations:
- **Which 10?** **Rec:** NIV, ESV, KJV, NKJV, NLT, NASB, CSB, AMP, MSG + **NABRE** (the mainstream Catholic choice; NRSVCE/RSVCE/DRA as alternates). Ship the list as data (`data/bible/translations.json`), not a hard-coded array, so changing it is not a code change — and add a **link-check script** that resolves every code once, so a silently-renamed code surfaces as a test failure rather than a 404 for readers.
- **Persisted?** **Rec: yes, `localStorage`** — a reader's translation preference is stable and per-device is fine. Not worth a user-preferences DB column yet. Default to ESV or NIV.
- **Link target?** **Rec:** new tab, `rel="noopener noreferrer"`.
- **Alternatives?** Worth offering one non-Bible-Gateway option (BibleHub or YouVersion) so we are not routing 100% of outbound Scripture traffic to a single site. 💬

### Q16. Versification mismatch on outbound links ✅

This one is a correctness trap, not a preference. Our ordinals are **KJV-style English versification**. Confirmed divergences that will bite:

| Where | What happens |
|---|---|
| **Psalms with superscriptions** | Hebrew/Masoretic numbering — which **NABRE follows** — counts the title as verse 1, so KJV/ESV/NIV run **one verse behind** for much of the Psalter. A "Psalm 51:10" link into NABRE lands on the wrong verse. |
| **Joel** | 3 chapters in KJV, **4 in NABRE**. |
| **Malachi** | 3 chapters in the Hebrew/Septuagint tradition, 4 in the Vulgate tradition that KJV/ESV/NIV follow; NAB/NABRE differs. Chapter-boundary references misalign. |
| **Deuterocanon** | Tobit, Judith, Wisdom, Sirach, Baruch, 1–2 Maccabees and the Greek additions to Esther/Daniel have **no ordinal slot at all** in a 66-book scheme. |
| 3 John 14/15, Rev 12:18, Rom 16:25–27 | Commonly-cited single-verse split variants; the research could **not** confirm the per-translation specifics — verify before encoding. |

Two things follow. First, **document the ordinal scheme as Protestant-canon-only by design** rather than treating deuterocanonical absence as a bug to fix later — retrofitting ordinal space for extra books after 31,102 rows are seeded and referenced by content rows is a migration nobody wants.

Second: **never silently mis-link.** Maintain a small static table of known-divergent (translation × book) pairs. For an affected combination, link to the **chapter** rather than the verse range and show a one-line note ("Psalm numbering differs in this translation"). That degrades gracefully instead of confidently sending someone to the wrong verse. It needs a test (§8), and it is small to build and embarrassing to skip.

**Answer:** ☑ **degrade to a chapter link with a one-line note** on known-divergent pairs.

### Q17. Historic commentary links ⚠️

You named Matthew Henry and Calvin. Verified templates:

| Commentary | Template | Granularity | Coverage |
|---|---|---|---|
| Matthew Henry (concise) | `biblehub.com/commentaries/mhc/{book}/{chapter}.htm` | chapter | whole Bible |
| Matthew Henry (complete) | `biblehub.com/commentaries/mhcw/{book}/{chapter}.htm` | chapter | whole Bible |
| **Multi-commentator aggregate** | `biblehub.com/commentaries/{book}/{chapter}-{verse}.htm` | **verse** | whole Bible |
| Gill's Exposition | StudyLight code `geb` | chapter | whole Bible |
| Barnes' Notes | StudyLight code `bnb` | chapter | whole Bible |
| Jamieson-Fausset-Brown | StudyLight code `jfb` (`jfu` unabridged) | chapter | whole Bible |
| Calvin's Commentaries | StudyLight code `cal` | chapter | **partial — see below** |
| Spurgeon, *Treasury of David* | biblehub `treasury` path ⚠ | chapter | **Psalms only** |

⚠ StudyLight's per-chapter slug pattern and the Spurgeon path could **not** be verified — a direct fetch returned HTTP 403 (bot protection, not evidence the pattern is wrong). The index pages (`studylight.org/commentaries/eng/{code}.html`) are confirmed to exist. **Spot-check the per-chapter pattern by hand before hardcoding it.**

**Calvin's gaps** (assembled from secondary sources — **confirm against StudyLight's own `cal.html` "books available" index**, which exists precisely for this): OT — Judges, Ruth, 1–2 Samuel, 1–2 Kings, 1–2 Chronicles, Ezra, Nehemiah, Esther, Job, Proverbs, Ecclesiastes, Song of Solomon. NT — 2 John, 3 John, Revelation.

Note the BibleHub multi-commentator aggregate is the **only verse-granular** option found, and it puts several commentators on one page. If per-verse precision matters more than per-commentator branding, one link to that page may beat five chapter links.

Recommendations:
- **Link out, do not host.** Hosting public-domain commentary text is a corpus-ingestion project of its own and adds no value over a link in v1.
- **Per-chapter links.** Most hosts key commentary by chapter, and our passages are verse ranges — so link the chapter containing the passage start.
- **Coverage matters.** Calvin's commentaries do not cover the whole Bible (notably no Revelation, and gaps across the historical books); Spurgeon's *Treasury of David* is Psalms-only. **A static coverage table per commentary is required** so the UI hides links that would 404. This is the same shape of work as Q16 — build them together.
- **How many?** **Rec: 4–5** — Henry, Calvin, Gill, Barnes, Jamieson-Fausset-Brown — rendered as a small "Commentaries" row in the modal, collapsed by default.

**Answer:** ☐ per-chapter links, 4–5 commentaries, coverage table (rec) ☐ other: ______

---

### Q21. Add-content flow: autodetect + explicit type picker ✅

Adding a second content type finally forces the question `ADDING_CONTENT_TYPE.md` Decision 5 has been deferring. Today's flow is single-type: `AddVideoPopover.svelte` (104 lines) — and `AddVideoDialog.svelte` alongside it — is one URL field, `placeholder="https://www.youtube.com/watch?v=..."`, validated by `validateYouTubeUrl`, submitted through `useAddVideo`. The name, the placeholder and the validator all assume YouTube.

The proposal is **both** paths: autodetect from what the user pastes, *and* an explicit type picker (YouTube as today; book + chapter + verse start/end for a passage).

**Recommendation: one input with autodetect, and the type shown as an editable chip — not two modes.**

```
┌─────────────────────────────────────────────┐
│  Paste a link or type a reference           │
│  ┌───────────────────────────────────────┐  │
│  │ John 3:16-18                          │  │
│  └───────────────────────────────────────┘  │
│  Detected: [Bible passage ▾]   ← changeable │
│  ┌──────────┬─────┬───────┬───────┐         │
│  │ John   ▾ │ 3 ▾ │ 16  ▾ │ 18  ▾ │         │
│  └──────────┴─────┴───────┴───────┘         │
└─────────────────────────────────────────────┘
```

Why one mode rather than two: a mode switch has to be *chosen before the user knows what they have*, doubles the component's state space, and means the picker and the paste field can disagree. Detection-as-a-default-with-override collapses that — the picker becomes the correction affordance, and selecting a type manually just pins the chip.

Detection rules, in priority order:

| Input | Detected as | Note |
|---|---|---|
| YouTube URL | YouTube | existing `validateYouTubeUrl` |
| **Bible Gateway URL** | Bible passage | falls out of Q5 for free — parse it back to ordinals, then **regenerate** the canonical key rather than storing what was pasted |
| Free text that `parseReference` accepts | Bible passage | `John 3:16-18`, `1 Jn 2`, `Psalm 23` |
| Anything else | nothing — chip reads "Select a type" | never guess |

Three sub-questions worth an explicit answer:

- **Never silently commit to a guess.** The chip must always be visible and changeable before submit. A misdetection that creates the wrong content type is not cheap to undo — it makes a row someone else may attach a perspective to.
- **Ambiguity:** can any input plausibly detect as two types? Today, no — the patterns are disjoint. That changes the moment generic URL/article content exists, so the detector should return a *list* of candidates internally even while the UI shows one. Cheap now, avoids a rewrite later.
- **Rename risk:** generalizing `AddVideoPopover` → `AddContentPopover` touches the working YouTube path. **Rec:** do the rename and the passage support as **one PR with the YouTube flow's tests green before and after**, rather than adding a second parallel component that duplicates the submit/error/toast logic. Note `AddVideoDialog.svelte` also exists and has a known flaky success-state test — check which is actually live before touching either.

**Backend impact: none.** Keep per-type mutations (`createContentFromYouTube`, `createContentFromPassage`). Detection is a presentational concern; a unified `createContent` with a type union would be schema churn for no gain, and gqlgen input-union handling is not worth inviting here.

**Scope:** this is big enough to be its own PR. **Rec:** insert it as **PR C2** after the passage display work (C), so the passage renderer is proven before the creation flow depends on it.

**States needing tests** (stateful component — all of these): empty/disabled, detecting, detected-YouTube, detected-passage-from-text, detected-passage-from-Bible-Gateway-URL, unparseable (no type), manual override of a detection, override then re-typing, invalid range (end before start), submit error.

**Answer:** ☑ **one input + editable detected-type chip.** The picker is the correction affordance, not a parallel mode.

### Q22. Deuterocanonical / apocryphal books — separate content type? 🕒

Raised as an FYI, but it is load-bearing for Q7 and needs deciding **now**, because the ordinal space is the one thing that cannot be changed after seeding.

The proposal was a separate `catholic_bible_passage` content type. **Recommendation: no — one `bible_passage` type, with canon as a property of the *book*, not of the content type.**

The objection is specific: **Genesis is in both canons.** If canon is a content-type discriminator, a Catholic user picking Genesis 1:1 gets a *different content row* from a Protestant user picking Genesis 1:1 — silently splitting the conversation on the ~66 books both traditions share. That is precisely the outcome the lazy find-or-create model exists to prevent. Canon differences are about *which books exist*, not about what a passage in a shared book is.

So instead:
- **One content type.** `bible_passage`.
- **`canon` column on `bible_book`** from day one, even while every row says `protestant`. Costs nothing now; means the picker can later filter by the reader's tradition without a migration.
- **Deuterocanonical books get their own ordinal block**, far above the protocanonical range (say 1,000,000+), *not* appended at 31,103.

That last point is the non-obvious one, and it is why this cannot be left until later. Deuterocanonical material is **not all appendable** — some of it is *interleaved into books we will already have numbered*:

| Material | Where it sits |
|---|---|
| Prayer of Azariah / Song of the Three | inside **Daniel 3** (commonly 3:24–90) |
| Susanna | **Daniel 13** |
| Bel and the Dragon | **Daniel 14** |
| Greek additions to Esther | scattered **through Esther** (lettered chapters in NRSV) |

In a contiguous 66-book numbering, Daniel 12's last verse is immediately followed by Hosea 1:1. There is no room for a Daniel 13. Giving these contiguous ordinals would require **renumbering every verse after Daniel** — rewriting the identity of already-created content rows and every perspective attached to them. A separate high ordinal block sidesteps this entirely, and overlap queries are unaffected because a range never spans the two blocks.

*(The exact versification of these additions varies by edition — confirm against the actual source before seeding, per the Appendix.)*

**What to do now:** nothing beyond three cheap precautions, since deuterocanon is not needed for PRs A–C.
1. Put the `canon` column on `bible_book` in the PR A migration.
2. Do **not** hard-code 31,102 as a maximum anywhere — treat it as "the current seeded count", and let the "% through Scripture" denominator (Q14) be computed per-canon rather than baked in.
3. Do **not** name things `protestant*` in code where `canon`-aware naming costs the same.

**Answer:** 🕒 **Deferred, leaning "one type + `canon` on the book".** Not decided now; recorded so PR A does not accidentally foreclose it.

**Deferral is genuinely safe here, and it is worth being precise about why** — the earlier framing in this section overstated the urgency:

- Adding a `canon` column to `bible_book` later is a trivial migration (`ADD COLUMN` plus a 66-row backfill). It does **not** need to be in PR A.
- The ordinal space cannot be *accidentally* spoiled, because PR A seeds only the 66 protocanonical books. Deuterocanonical ordinals are simply never allocated, so the reserved high block stays available by default.

**The one thing that would make deferral unsafe:** writing code that treats **31,102 as a hard maximum** or assumes ordinals are dense to that bound — a `CHECK (verse_id <= 31102)`, a hard-coded denominator in the Q14 position bar, a fixed-size array. Those would need unpicking later.

**So PR A takes exactly two zero-cost precautions:**
1. Treat 31,102 as "the current seeded count", read from the data — never a compile-time or schema-level maximum. (The Q14 position bar's denominator comes from the seeded count.)
2. Avoid `protestant*` naming where canon-neutral naming costs the same.

Everything else waits until deuterocanon is actually wanted.

### Q23. Optional passage title ✅

Requested: each passage may carry an **optional title**, occupying the slot the YouTube video's name uses in the Item cell.

The complication is that this field behaves differently from its YouTube counterpart. `content.name` for a video is the video's *actual* title — authoritative, externally sourced, not a matter of opinion. A passage has **no authoritative title**; "Genesis 1:1–3" might reasonably be called "Creation", "The Beginning", or "In the Beginning God Created". And per Q5 the passage row is **shared** — everyone who writes on that range gets the same row — so a title stored in `name` is shared mutable state with no owner. First-writer-wins silently decides what everyone else sees.

A second, quieter problem: `ContentSearchFieldTitle` searches `name`. If `name` becomes "Creation Account", searching "Genesis" no longer finds the passage.

**Recommendation: keep `name` canonical, add the title as a separate nullable column.**

| Field | Value | Why |
|---|---|---|
| `content.name` | the canonical reference, e.g. `Genesis 1:1–3`, **generated from the ordinals** | satisfies `NOT NULL`, keeps title-search working on book names, stable and identical for every user, never conflicts. Same generator family as the Q5 URL key. |
| `content.display_title` *(new, nullable)* | the optional user-supplied title | additive; absent for every other content type; no migration risk beyond one nullable column |

Item cell rendering:
- **title present** → `display_title` as the bold title, reference as the subtitle line
- **title absent** → reference as the title, first verse's text as the subtitle (the handoff's original design)

The reference is therefore **always visible**, whichever branch renders. That is the key property: it means a poor or idiosyncratic title can never hide what the passage actually is, which substantially de-risks letting the field be shared.

**Open sub-question — who may set or change it?** This is the part that genuinely needs a decision, because the row is shared:

- **(a) Creator + admins.** Whoever first created the passage row (`added_by_user_id`, per Q6) names it; others cannot change it. Predictable, but arbitrary — the first person to write on John 3:16 permanently names it for everyone.
- **(b) Anyone (wiki-style).** Any signed-in user can edit it. Self-correcting, and low-harm because the reference is always shown beneath. Needs no new permission concept.
- **(c) Per-user title.** Store it on the perspective rather than the content, so each person sees their own framing. No conflict at all, but it is then not really "the passage's title", and `Perspective` has no title field today (it has `labels`, `description`, `category`, `customFields` — none of them a title).

**Answer:** ☑ **Anyone may set it while it is empty; once populated it is locked.** A *challenge system* for contesting an already-set title is future work — logged in [`FEATURE_BACKLOG.md`](../../../FEATURE_BACKLOG.md), not in scope here.

This is first-write-wins, and it is a good fit: no new permission concept, no edit wars, and a clean seam for the challenge system to slot into later. Three implementation consequences the plan must carry:

1. **The write must be atomic and conditional**, or two users racing both believe they set it:
   ```sql
   UPDATE content SET display_title = $1
    WHERE id = $2 AND display_title IS NULL
   ```
   Zero rows affected means someone else won. **Return the winning title rather than an error** — the user's intent (this passage should have a title) was satisfied, just not with their words. A raw failure here would read as a bug. This is the same race-safety concern as the find-or-create in Q5.

2. **The affordance is state-dependent**, so the UI has two distinct modes: an "Add a title" control while `display_title IS NULL`, and plain read-only text once set. The control should say that titles are set once, or the lock will read as a bug the first time someone tries to correct a typo.

3. **Admin override ⚠️ — recommended, flag if unwanted.** Without one, a typo or an abusive title is permanent until the challenge system exists, which is unscheduled. Suggest allowing admins to clear `display_title` back to `NULL` (which reopens it to anyone) rather than granting them direct edit rights — a smaller privilege that composes with the first-write-wins rule instead of bypassing it.

**States needing tests:** empty + signed in (affordance shown), empty + submitting, populated (read-only, no affordance), **race lost** (another user set it between load and submit — the winning title is displayed), title set during creation via the C2 add flow, and admin clear-back-to-empty if adopted.

*Not recommended: putting the title directly in `name`.* It breaks title search on book names, makes the canonical identity mutable, and gives one user silent control over what everyone else sees.

---

## 6. Data acquisition — manual vs scripted ✅

You suspected manual steps may beat scripted downloads here. **Agreed, and the reasoning generalizes:** every one of these datasets is *static forever*. Scripture does not get a new release. A fetch script is machinery that runs once, then rots — and worse, it makes the build depend on a third-party host staying up and keeping its URL shape.

**Recommended pattern for all of it:**

1. A human downloads the source file once, by hand, from the canonical site.
2. A **one-off, committed normalizer script** converts it to our schema (this *is* worth checking in — it is the audit trail for how raw became normal, and it lets someone re-run it if the source is ever corrected).
3. The **normalized output is committed** to `data/bible/`, alongside a `README.md` recording, per file: source URL, download date, license text, SHA-256, and row count.
4. A **Go seeder command** loads it (Q19).

This gives reproducible builds, an offline-capable CI, a reviewable license trail, and no runtime dependency on anyone else's uptime.

A note on where this differs from the raw research: the source research recommended SCRIPTED FETCH for several datasets, on the grounds that the URLs are stable static files. That is true and worth knowing — it means step 1 above can be a `curl` rather than a browser download, whichever is easier. The recommendation here is not about *how the bytes arrive once*; it is that **the normalized result gets committed** rather than re-fetched at seed or build time.

### Q18. Per-dataset decisions ✅

| Dataset | Source | License | Recommendation |
|---|---|---|---|
| **BSB verse text** | `bereanbible.com/bsb_tables.xlsx` (also `.tsv`, USFM/USX) — direct static URL, no JS wall; >10MB | **Public domain** since 2023-04-30 per publisher; attribution requested as courtesy, not required ⚠ re-read the licensing page before making a legal claim in UI copy | Fetch once (script or by hand), normalize to TSV, **commit**. Prefer the **TSV** over xlsx — streaming a multi-MB spreadsheet is needless work. |
| **Versification / verse counts** | `BibleBot/RandomVersesData` (all 31,102 KJV verses) or hand-built and cross-checked | PD text | **Manual, committed.** Small, foundational, never changes. **Assert the row count equals 31,102 in a test** — the research notes editions disagree by a handful of verses, so pin our snapshot rather than trusting the folklore number. |
| **Book metadata** (names, aliases, chapter counts, testament, division) | hand-authored | n/a | **Hand-author `data/bible/books.json`** (Q9). 66 rows. Do not import this; the alias list is a product decision (`1 John` / `I John` / `1Jn`), not a dataset. |
| **Translation codes** | §Q15 table | n/a | **Commit as `data/bible/translations.json`** + a link-check script. |
| **Commentary URL templates + coverage** | §Q17 table | n/a | **Commit as config.** Hand-verify StudyLight's slug pattern and Calvin's book list first (both flagged ⚠ unverified). |
| **Strong's dictionary** (definitions) | `openscriptures/strongs` (JSON) | 1890 text is PD; ⚠ the repo's *packaging* license needs a LICENSE-file check | Only if Q2 goes ahead. Commit. |
| **OSHB / MorphHB** (Hebrew morphology) | `openscriptures/morphhb` — OSIS XML per book | **CC BY 4.0** (credit "Open Scriptures Hebrew Bible Project"); WLC text itself PD | Only if Q2 goes ahead. Commit, **and record the attribution requirement** — CC BY means the app must display credit somewhere. |
| **STEPBible TAHOT/TAGNT** | `STEPBible/STEPBible-Data` — tab-separated | **CC BY 4.0** (credit "STEP Bible") | Only if Q2 goes ahead. Easier ETL than OSHB (TSV vs XML). Same attribution obligation. |
| **Berean Interlinear** (English alignment) | official downloads are PDF/Word only; third-party e-Sword modules | unclear | **Spike first, do not plan an import** (Q2). No confirmed structured export exists. |
| **Matthew Henry / Calvin full text** | CCEL (PDF/HTML) | PD | **Do not ingest.** Link out (Q17). Listed only so nobody rediscovers it as a "quick win" — it is a parsing project. |

**✅ Resolved 2026-09-22 — measured, then split.** Actual sizes from the publisher:

| File | Size | Needed by |
|---|---|---|
| `bsb.txt` (verse text) | **4.3 MB** | PRs A–C |
| `bsb.xlsx` (verse text) | 2.4 MB | — |
| `bsb_tables.tsv` (word alignment) | **85.5 MB**, ~440k rows | **PR E only** |
| `bsb_tables.xlsx` | 55.5 MB | — |

**For PRs A–C the question is settled:** the verse text is 4.3 MB raw and smaller once normalized — normalize once and commit, exactly as the pattern above describes.

**The alignment file is deferred to PR E.** Both destinations are the same either way — the data becomes a Postgres table:

```
bible_word
  verse_id       FK → bible_verse          span_group    groups continuation rows
  bsb_sort       English reading order     source_word / translit / strongs
  source_sort    Hebrew/Greek order        parsing_short / parsing_full
  language       heb | grc                 english_span  (NULL on continuation rows)
```

~440k rows indexed on `verse_id` — unremarkable for Postgres, and the TSV is never read again after seeding. So the only open question is **how the source file travels from bereanbible.com to the seeder**: committed (needs pruning — dropping the ~20 unused variant/footnote/crossref columns and gzipping should land in single-digit MB), git-LFS, or a GitHub release asset fetched against a checked-in SHA-256. **Rejected:** having the seeder download live from bereanbible.com on every run, which makes environment setup depend on third-party uptime.

Decide this when PR E is planned, against a measured post-prune size rather than an estimate. Nothing in A–C2 touches it.

**Original note that prompted the measurement:** The interlinear alignment dataset is **not** verse-scale — it is roughly one row per Hebrew/Greek source word across the whole Bible (order 10⁵–10⁶ rows; the publisher's `.xlsx` is ~55MB). The "normalize once and commit" pattern above was sized for 31,102 verses and may not survive that. Decide before PR E: **commit the normalized file** (simplest, but a large blob in git forever), **git-LFS**, or **attach it to a GitHub release and have the seeder download it** (keeps the repo small, reintroduces a fetch step). Recommendation leans to a **release asset with a checked-in SHA-256**, since it preserves reproducibility without the repo cost — but this needs a real size measurement first, not a guess.

Two obligations fall out of this table that are easy to miss: **CC BY attribution** for any morphology data (needs a visible credit line, not just a code comment), and the fact that **BSB's public-domain status should be re-read from the source page** before we assert it in user-facing copy.

### Q19. Seeder vs migration ✅

The 31,102-row verse table has to get into the database somehow.

**Recommendation: a Go seeder command (`backend/cmd/seed-bible`), not a migration.**

Reasons, in order of weight:
1. **This repo applies migrations manually, per environment** (CLAUDE.md is emphatic: `DATABASE_URL` points at the *shared* Sevalla dev database; nothing auto-runs migrations). A 31k-row INSERT inside a hand-applied migration is an unpleasant thing to hand someone.
2. Migrations should describe **structure**; this is **content**.
3. A seeder can be **idempotent and re-runnable** (upsert by ordinal), which matters because we will get the data slightly wrong at least once.
4. Reference data for a new environment is a setup step, not a schema change.

The migration in PR A therefore creates the empty `bible_book` / `bible_verse` tables; the seeder fills them; a test asserts the seeded row counts and that `data/bible/books.json` matches the DB.

**Answer:** ☑ **Go seeder command.**

---

## 7. Verified facts (so the plan does not re-litigate them)

Checked against `main` and the PR branch on 2026-09-21.

**Backend**
- `content.content_type` is plain `varchar` — no enum type, no CHECK. Adding a type value needs **no DDL**.
- `contentTypeToDBValue`/`FromDBValue` do generic `ToLower`/`ToUpper`, so `BIBLE_PASSAGE` ↔ `bible_passage` works with no special-casing.
- `CLAIM` is the precedent for a URL-less, externally-unfetched content type (`content_service.go` `CreateClaim`): no adapter, `response` JSONB payload, plain `repo.Create`.
- `content_unique_url UNIQUE(url)` still exists; `content_unique_name` was dropped in `000010`. `url` is nullable, and Postgres allows many NULLs — hence Q5.
- `added_by_user_id` is `NOT NULL`; there is no system-user sentinel anywhere — hence Q6.
- `Content.contentType` is `String!` in GraphQL (not the enum); the `ContentType` enum is used for `ContentFilter` — so a new value is needed there for filtering.
- `perspectiveCount` and `averageRating` resolve via a shared aggregate loader and are exposed only through `GET_CONTENT_AGGREGATES` — hence Q12.
- Next migration number is `000023` (`000022` is claimed by unmerged PR #394; `000017` is a pre-existing gap, not an error).
- `make graphql-gen` leaves a stray colliding `resolvers/schema.resolvers.go` that must be removed after harvesting new stubs into `content.resolvers.go`.

**Frontend**
- AG Grid **Community 32.3.9**, no Enterprise package → **no master/detail row expansion** (Q3).
- Below 860px the grid is replaced wholesale by `ActivityCardList.svelte` (Q20).
- `typeCellRenderer` (`utils/formatting.ts`) renders a **hard-coded YouTube SVG** with no type branching — needs a real switch.
- The live Item renderer is `utils/activityItemCellRenderer.ts` (not `formatting.ts`'s `itemCellRenderer`, which appears unused — confirm before touching). It has **no `contentType` branching** and always builds a YouTube thumbnail URL, with `img.onerror` removing the image — so a passage row today would render a bare muted block.
- No GraphQL codegen; types are hand-written beside `gql` literals in `lib/queries/{domain}/index.ts`.
- Use the authenticated `graphqlRequest()` wrapper, never bare `graphqlClient`.
- TanStack `queryKey` must mirror **every** variable `queryFn` sends — a mismatch breaks cache invalidation silently (already caught once in `ActivityTable.svelte`).
- Column visibility is set in **two** places (colDef `hide:` and the responsive `setColumnsVisible()` `$effect`, which wins on `gridReady`) — both must change together.
- AG Grid does not render in jsdom; grid logic is tested through extracted pure functions, not by rendering the grid.
- Tests: `pnpm run test:run` (unit/jsdom) is the CI gate; the browser project is manual-only.

**Branch**
- `docs/bible-passage-content-design` is 2 commits ahead of `origin/main`, 0 behind.

---

## 8. Tests the answers imply

Recorded now so the plan can cite them (per the repo's testing principles: stateful components need every distinct state exercised; static single-state visuals do not need a unit test).

- `parseReference`/`formatReference` — table-driven: en/em dash, `1 John`/`I John`, `Psalm`/`Psalms`, chapter-only, cross-chapter, out-of-range verse, garbage. Plus round-trip over the real GTY title fixture.
- `PassageText` — loading, error, loaded, **collapsed (31–150)**, **expanded**, **over-cap link-out (>150)**, attribution line present. (Q13 adds two states beyond the spec's list.)
- `PassagePicker` — empty/disabled, free-text valid, free-text invalid, select-driven valid, book change resets chapter/verse, end-before-start rejected, chapter-only.
- Position bar (Q14) — first verse, last verse, OT/NT boundary crossing, sub-pixel minimum width, compact/mobile variant.
- Version picker (Q15) — default, persisted selection restored, **divergent-versification degradation (Q16)**.
- Commentary links (Q17) — covered book renders links, **uncovered book renders none**.
- `typeCellRenderer`/`activityItemCellRenderer` — a `BIBLE_PASSAGE` row gets the passage icon and reference, and **no** thumbnail request.
- Add-content flow (Q21) — empty/disabled, detecting, detected-YouTube, detected-passage-from-text, detected-passage-from-Bible-Gateway-URL, unparseable, manual type override, override then re-type, end-before-start, submit error. Plus: **the existing YouTube add path still passes unchanged** — that is the regression the rename risks.
- Canonical-key generation (Q5/Q21) — the same range reached by free text, by book/chapter/verse selects, and by a pasted Bible Gateway URL all produce the **identical** `url` value.
- Static-structure vs seeded-DB parity (both stacks).
- **Interlinear phrase-grouping (Q2)** — the spike names the fixtures, so use them verbatim:
  - **Genesis 1:1** — `H1254` (created) and `H430` (God) must **swap position** between the Hebrew-sorted and BSB-sorted views; `"In the beginning"` must be **one span** mapped to **one** Strong's number (`H7225`), not two or three.
  - **John 3:16** — the three-word English span `"one and only"` maps to the **single** Greek word `G3439`, and appears **before** `"Son"` in English while `G5207` precedes `G3439` in Greek.
  - Continuation rows (blank `BSB version` cell) group into the preceding span rather than rendering as empty.
  - Rendering order comes from `BSB Sort`, never from file row order.
- Not worth a test: the modal's static layout/spacing.

---

## 9. What happens next

**Done.** Every 🚧 item is resolved; the ⚠️ items ride on their recommendations; Q22 is deliberately deferred with its safety conditions recorded.

1. ✅ Q1–Q22 settled or consciously deferred.
2. → `superpowers:writing-plans` produces `docs/superpowers/plans/…-bible-passage-content-plan.md` covering **PRs A, B, C and C2** from §1.
3. D (outbound links) and E (interlinear) get planned after C lands. E is unblocked — the Q2 spike came back green — but carries its own dataset decision (§6 Q18).

**Carried into the plan as explicit verification steps, not assumptions:**
- the ⚠️-flagged unverified strings in the Appendix (Bible Gateway codes for NASB/AMP/DRA, StudyLight's per-chapter slug, Calvin's covered-book list, BSB licence wording);
- whether the BSB tables carry a gloss/definition column or the tooltip needs a Strong's lexicon join (Q2);
- the per-book verse counts reconciling to the seeded total, rather than to the commonly-cited 31,102 (Q14/Q22).

Open questions from the original spec are all folded in above: URL shape → Q5; multi-passage/`content_passage` → Q7; max displayable range → Q13; shared book-table location → Q9; passage page in-phase → Q8.

---

## Appendix: confidence and things to verify by hand

Codebase facts in §7 were read directly from `main` and this branch and are reliable. External facts came from web research and vary in confidence. Items marked ⚠ above were explicitly flagged **unverified** by that research and should be confirmed by a human before they are encoded:

- The exact BSB licensing wording (the "public domain" characterization is corroborated by several independent sources, but the literal license sentence was not fetched — confirm before putting a license claim in UI copy).
- Bible Gateway codes for **NASB, AMP, DRA** (NASB has edition variants).
- StudyLight's per-chapter URL slug pattern, and the Spurgeon/BibleHub path (direct fetch was blocked by HTTP 403 — bot protection, not evidence the pattern is wrong).
- Calvin's exact list of covered books (assembled from secondary summaries; StudyLight's own `cal.html` index is the primary source and exists for this purpose).
- The 3 John 14/15, Revelation 12:18 and Romans 16:25–27 versification variants.
- `openscriptures/strongs`' own LICENSE file (the 1890 text is public domain; the JSON packaging may carry CC BY).
- Per-book verse counts reconciling exactly to 31,102, and the OT/NT split — verify against whatever dataset we actually seed, not against the commonly-cited numbers.

None of these block answering the questions; they block *shipping* the specific strings, and each is a few minutes of manual checking. The plan should carry them as explicit verification steps rather than assuming them.
