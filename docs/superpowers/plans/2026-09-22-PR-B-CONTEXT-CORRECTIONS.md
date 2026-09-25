# PR B: corrections to the plan's stale assumptions

Read this before dispatching any PR B task (B1-B5) from
`docs/superpowers/plans/2026-09-22-bible-passage-content-plan.md`. That plan
was written before a rework landed on PR A (`feature/bible-passage-reference-data`,
now #403) that changes the data model PR B builds on. The plan's task text for
B1-B5 still describes the old model verbatim — treat every mention below as
superseded, not as an alternative to weigh.

## What changed (see PR A commit `ab5674d` and its PR description)

**There is no `bible_verse` table.** The plan's Task B1 migration
(`0000XX_add_bible_passage_content_columns`) still references
`REFERENCES bible_verse(id)` for `content.verse_start_id`/`verse_end_id` —
this FK target does not exist. `verse_start_id`/`verse_end_id` must be plain
`integer` columns with no FK.

**Verse ordinals are computed, not looked up.** `bible_book` now has a
`verses_per_chapter jsonb` column: an array of integers, one per chapter,
giving that chapter's verse count. The global ordinal for `(book_id, chapter,
verse)` is:

```
ordinal = (sum of total verses in every book with id < book_id)
        + (sum of verses_per_chapter[0..chapter-2] for this book)
        + verse
```

Task B4's plan text describes a `BibleReferenceRepository.GetVerseID(ctx,
bookID, chapter, verse)` doing a row lookup against `bible_verse`. Replace
this with a function that:
1. Fetches all 66 `bible_book` rows once (cheap, static, could even be
   cached process-wide — same shape as the frontend's `bibleStructure.ts`).
2. Computes the ordinal via the formula above.
3. Validates `chapter`/`verse` are in range (`chapter <= chapterCount`,
   `verse <= versesPerChapter[chapter-1]`) — this replaces whatever
   existence-check the old `GetVerseID` DB lookup gave you for free.

The equivalent Go computation was already written and verified (independently,
twice) during the rework — see `data/bible/scripts/build_verses_per_chapter.py`
for the reference algorithm, and `backend/cmd/seed-bible/main_test.go`'s
`TestBooksJSON_VersesPerChapterMatchesChapterCountAndTotal` for the invariant
it must satisfy. Port the same cumulative-sum logic into the PR B repository
function rather than re-deriving it from scratch.

**Task B4's `BibleReferenceRepository.GetBookName`** is still valid as
written — `bible_book` still has a `name` column, unaffected by the rework.

**PR A's final verse-text gap is still open and still PR B/C's job.** Per the
plan's own "Cross-Task Gaps" section: BSB verse text (`data/bible/bsb.tsv`,
committed in PR A) was never seeded into a queryable table or exposed via a
resolver. `bsb.tsv`'s `verse_id` column matches the ordinal formula above
exactly (proven during the rework, zero mismatches across all 31,102 rows) —
so a `bible_verse_text(verse_id, translation, text)` table keyed by the same
computed ordinal will join correctly. This still needs to be added (as Task
A6/B6, per the plan's own flag) before Task C2 can query passage text.

## What did NOT change

Everything else in the PR B task list — `ContentTypeBiblePassage`,
`display_title`/first-write-wins (Task B3), `CanonicalPassageURL`/
`CanonicalPassageName` generators (Task B2), the GraphQL schema/mutations
(Task B5) — is unaffected by the rework and can be implemented from the
plan's text as written.

## Branching

PR B branches from PR A's branch tip (`feature/bible-passage-reference-data`,
now pushed as #403), not from `main` — PR A is not yet merged, and PR B needs
`bible_book`/its seeder to exist somewhere. Worktree: `.claude/worktrees/3`,
branch `feature/bible-passage-content-type`.
