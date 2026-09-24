# Bible Passage Content — Frontend Connection & Display Design

Status: draft for review. **Design only — nothing is built.** Roadmap: GSD Phase 20 (`.planning/ROADMAP.md`). Implementation plan comes later via `superpowers:writing-plans`.

> **Blocked on open decisions.** See [`2026-09-21-bible-passage-ANSWERS-NEEDED.md`](./2026-09-21-bible-passage-ANSWERS-NEEDED.md), which reconciles this spec with the Activity-table design handoff and the later product asks (passage-length cap, "% through Scripture", Bible Gateway version picker, commentary links). The five open questions at the bottom of this document are folded in there. A plan should not be written until its 🚧 items are answered.

## Problem

Users should write perspectives on Bible verses and passages, and passages should connect to existing content (e.g. a Grace to You sermon on Mark 4:1-20). Today content is URL-based (`content` table, unique URL, `response` JSONB) and has no notion of Scripture. We need (a) a data model the frontend can query, (b) a way to display passage text, and (c) UI to create and browse passage content.

## Decisions already made (with why)

| Decision | Why |
|---|---|
| **Passage = a range over a verse ordinal**, not a content type per granularity | Chapter, book and testament are ranges of verse ordinals. One query shape ("overlaps this range") covers every granularity; no `bible_chapter`/`biblical_book` content types needed. |
| Reference tables are **seeded once, structure only** (`bible_book` 66 rows, `bible_verse` 31,102 rows, ordinal `id` in canonical order) | Static data; never changes. Testament is a column on `bible_book`, not an entity. |
| **Passage `content` rows are created lazily** on first perspective, keyed by a canonical (start, end) verse pair | No pre-seeding of ~31k content rows; two users writing on `John 3:16-18` land on the same row. |
| Content identity is **translation-agnostic**; text is a separate display layer | A perspective is about the passage, not the wording. Lets us add/switch translations without migrating content. |
| Text: **BSB (Berean Standard Bible, CC0/public domain) only** | Modern and readable; storable and redistributable without a license. Copyrighted translations (e.g. NIV: Biblica's 500-verse/<25% guideline and API.Bible's commercial restrictions don't fit a platform) are out of scope; if ever wanted, that needs a license conversation first. |
| One canonical **English (KJV-style) versification** | Psalm titles, Joel and Malachi number verses differently across traditions. Pick one. |
| **No scraping** of gty.org or oneplace.com | gty.org robots.txt blocks all crawlers except Google/Bing/Meta; Salem's terms §3(g)(iii) prohibit scraping. Use YouTube Data API + user-supplied data. |

## Evidence from the Grace to You channel survey

`tools/gty-channel-survey/` pulled `@gracetoyou` (`UCneKpMu9SFGlt2usTdAI75A`, 2,602 videos, 2026-09-19):
- 1,712 videos are 45-90 min (full sermons), 549 are 20-45 min, 293 are clips/shorts, 46 are testimonies/interviews.
- **1,291 titles (~50%) contain a parseable reference, 1,250 with verse ranges** (e.g. `(Mark 4:1-20)`, `(Galatians 5:16–26)`). Full sermons: 62% parse, 13% are "(Selected Scriptures)". Clips: ~0%.
- Only 172 descriptions (6.6%, all 2025-26) carry a `gty.org/sermons/NN-NNN` link. Prefix = canonical book number for 1-66 (Galatians 48, Revelation 66…); prefixes 70/80/81/82/90 are topical series (`81-158` is Revelation 1:9-20, so the prefix is **not** always the book).
- Title parsing caveats: first reference only per title; en dashes; 118 duplicate titles across 241 rows.

Implication: a title parser gets ~60% of full sermons automatically, with verse ranges. The rest need manual passage entry.

## Backend contract the frontend depends on (GraphQL sketch)

```graphql
type BibleBook { id: Int!  name: String!  testament: Testament!  chapterCount: Int!  aliases: [String!]! }
enum Testament { OLD  NEW }

type PassageRef { startVerseId: Int!  endVerseId: Int!  label: String! }   # label e.g. "Mark 4:1–20"
type PassageText { ref: PassageRef!  translation: String!  copyright: String!  verses: [VerseText!]! }
type VerseText { verseId: Int!  chapter: Int!  verse: Int!  text: String! }

extend type Query {
  bibleBooks: [BibleBook!]!                       # static; cache forever
  passageText(startVerseId: Int!, endVerseId: Int!): PassageText!   # BSB
  passagesForContent(contentId: ID!): [PassageRef!]!   # e.g. a sermon's passages
}
extend type Mutation {
  # find-or-create the passage content row; returns Content with contentType BIBLE_PASSAGE
  createContentFromPassage(input: CreateContentFromPassageInput!): Content!
}
```

Backend follows `.claude/docs/ADDING_CONTENT_TYPE.md` with two deviations: passage is **manual entry** (no URL adapter), and it needs a **canonical URL** for the `UNIQUE(url)` constraint (proposed `/bible/<book-slug>/<chapter>:<verses>`, normalised). Schema also needs `content_passage(content_id, start_verse_id, end_verse_id)` for sermon→passage links. Migrations are applied manually per environment; the PR must say so. Check in-flight branches before picking a migration number (latest on disk is 000021; 000017 is absent).

## Frontend design

### 1. Data layer (`frontend/src/lib/queries/bible/`)

- `bibleBooks` — `staleTime: Infinity`; also ship a **static `bibleStructure.ts`** (66 books + verses-per-chapter, ~1,189 numbers) so the picker validates and formats with zero network round-trips. The backend stays authoritative; a test asserts the static table equals the seeded data.
- `usePassageText(range)` — key `['bible','passage', start, end]`, `staleTime: Infinity` (text never changes). Follows the repo's TanStack function-wrapper pattern. BSB only for now; the backend keeps a `translation` column on the text table so adding one later is data, not a redesign, but the frontend does not expose a choice.
- `useCreatePassageContent()` — mutation using the authenticated `graphqlRequest()` wrapper, **not** bare `graphqlClient` (see memory: silent-failure bug).
- `usePassagesForContent(contentId)` — drives sermon → passage chips.
- Query keys added to `keys.ts`.

### 2. Reference utilities (`frontend/src/lib/utils/bible.ts`)

`parseReference(str) → {book, chapter, verseStart, verseEnd} | null`, `formatReference(range) → "Mark 4:1–20"`, `toVerseRange(ref) → {startVerseId, endVerseId}`, `fromVerseRange`. Handles en/em dash, `1 John`/`I John`, `Psalm`/`Psalms`, chapter-only refs, cross-chapter ranges. **Single source of truth:** the book/alias/verse-count table is one JSON file consumed by both the TS util and the Go parser (title import), so the two cannot drift. Check `utils/references.ts` first — it may be unrelated (perspective refs) but must not collide.

### 3. Components

| Component | Responsibility |
|---|---|
| `PassageText.svelte` | Renders a range: superscript verse numbers, paragraph-less flow, translation label, **copyright/attribution line** (required for any licensed translation; harmless for CC0). Loading / error / empty states. Large ranges (>~50 verses) render collapsed with "Show full passage". |
| `PassagePicker.svelte` | Create/select a passage. Free-text reference input (uses `parseReference`, inline error) **plus** Book → Chapter → From/To verse selects for users who don't know the syntax. Emits a range; disabled until valid. Used in the add-perspective flow. |
| `PassageChip.svelte` | Compact `Mark 4:1–20` link to the passage page; used on sermon rows/details. |
| `/bible/[book]/[ref]/+page.svelte` | Passage page: `PassageText`, then perspectives on this passage, then content whose passages overlap (sermons). |
| ActivityTable renderers | `typeCellRenderer` icon + `itemCellRenderer` for `BIBLE_PASSAGE` (label as title, first-line snippet instead of thumbnail). Per `ADDING_CONTENT_TYPE.md` steps K/L. |

### 4. Flows

1. **Write a perspective on a passage:** open add flow → choose "Bible passage" → `PassagePicker` → `createContentFromPassage` (find-or-create) → existing perspective form. Same content row for everyone who picks the same range.
2. **From a sermon:** sermon details show `PassageChip`s; tapping opens the passage page, where the overlapping sermons and perspectives are listed. Sermons without a parsed passage show none (no "unknown" chip).
3. **Overlap semantics:** a perspective on `John 3:16` appears on the `John 3:1-21` page and vice-versa (range overlap), labelled by its own range.

### 5. States that need tests (per testing principles)

- `PassageText`: loading, error, loaded, collapsed-large, expanded-large, copyright line present.
- `PassagePicker`: empty/disabled, free-text valid, free-text invalid (error), select-driven valid, book change resets chapter/verse, end-before-start rejected, chapter-only ref.
- `parseReference`/`formatReference`: table-driven, including en dash, `1 John`, Psalm 119:176, cross-chapter range, garbage input, and **round-trip on the 1,291 real GTY titles** (fixture from `tools/gty-channel-survey/out/rows.json`, checked in as a small sample).
- Static-structure vs backend seed equality.
- ActivityTable renderers: a `BIBLE_PASSAGE` row gets the passage icon and label, not a thumbnail.
- Static layout/spacing needs no unit test.

### 6. Mobile & a11y

Picker selects are native `<select>` on small screens; verse numbers use `<sup>` with `aria-hidden` and the text carries `aria-label` of the reference; passage page is a single-column reading layout; respects the theme picker tokens.

## Out of scope (this phase)

Importing Grace to You sermons (separate follow-on: title parser + YouTube import + manual passage entry queue), verse-of-the-day, cross-references, commentary, the Data Import Request feature, any translation other than BSB (including licensed ones like NIV), a translation switcher, Deuterocanon.

## Open questions

1. Canonical passage URL/route shape (`/bible/mark/4:1-20` vs `/bible/mark/4.1-20`; colons in SvelteKit params).
2. Does a perspective attach to a passage content row only, or can it also carry extra passages (multi-passage sermons)?
3. Max displayable range and behaviour for whole-book perspectives.
4. Is `utils/references.ts` related, and where does the shared book-table JSON live so Go and TS both consume it?
5. Does the passage page ship in this phase or only the picker + display components?

## Next steps

1. Review this spec.
2. `superpowers:writing-plans` → `docs/superpowers/plans/…-bible-passage-content-plan.md` (backend reference data + content type, then frontend).
3. Split into GSD roadmap plans only if useful; new work is planned in superpowers, not GSD.
