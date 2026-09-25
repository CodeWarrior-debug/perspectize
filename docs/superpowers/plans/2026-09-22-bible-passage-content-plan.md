# Bible Passage Content — Implementation Plan (PRs A–C2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let users write perspectives on Bible verses and passages. Scripture is a seeded reference table over a canonical verse ordinal; passage `content` rows are created lazily and deduped via a generated Bible Gateway URL; the frontend gets a reference parser, a passage picker folded into a generalized add-content flow, and passage display in the existing Activity table / details modal.

**Architecture:** Four sequenced PRs, each independently shippable and testable:
- **PR A** — reference data (`bible_book`/`bible_verse` tables, seeder, shared JSON, parity tests). No app-visible behavior change.
- **PR B** — backend `BIBLE_PASSAGE` content type (GraphQL queries/mutation, dedupe, ordinal columns, service, repository).
- **PR C** — frontend passage display (reference parser, `PassageText`, `PassagePicker`, ActivityTable renderers, details modal section).
- **PR C2** — generalized add-content flow (autodetect + editable type chip), covering both YouTube and passage creation.

PR D (outbound links) and PR E (interlinear) are separate plans, out of scope here.

**Tech Stack:** Go 1.x, GORM, gqlgen, PostgreSQL 17 (Sevalla-hosted, migrations applied manually — never run `make migrate-up`/`down`); SvelteKit, Svelte 5 runes, TanStack Query, ag-grid-svelte5 (Community 32.3.9, no master/detail), Tailwind v4, Vitest.

**Spec:** [`docs/superpowers/specs/2026-09-19-bible-passage-frontend-design.md`](../specs/2026-09-19-bible-passage-frontend-design.md) + [`docs/superpowers/specs/2026-09-21-bible-passage-ANSWERS-NEEDED.md`](../specs/2026-09-21-bible-passage-ANSWERS-NEEDED.md) (authoritative for every decision below — cited inline as **AN §N**). Executors should read AN in full before starting; it carries the exact rationale, SQL, and edge cases this plan only summarizes.

## Global Constraints

- **No chained bash commands (`&&`)** — one command per Bash call (repo rule).
- **Never run `make migrate-up`/`make migrate-down`** — migrations are written and reviewed only; applied manually per environment at rollout. State this explicitly in every PR touching `backend/migrations/`.
- **Migration numbering:** run `ls backend/migrations/ | tail -5` and check `git log --all --oneline -- 'backend/migrations/*'` at execution time — `000022` is claimed by unmerged PR #394 (YouTube rename); this plan assumes PR A takes **`000023`** but the executor must re-verify, not trust this number (AN §7).
- **`gofmt -l .` must return empty** in `backend/` before any commit; `make install-hooks` once per checkout auto-fixes this.
- **`make graphql-gen` leaves a stray `resolvers/schema.resolvers.go`** after codegen — diff it for new stubs, hand-copy them into the domain-specific resolver file, then `rm` the stray file (AN §7).
- **`content_type` is plain varchar** — no DDL needed to add `BIBLE_PASSAGE` itself (AN §7).
- **Canonical strings (URL key, `name`, `display_title` defaults) are always machine-generated from verse ordinals, never from user input or a pasted link** — this is the single rule that keeps dedupe (AN Q5) correct. Any code path that accepts a pasted Bible Gateway URL must parse it to ordinals and regenerate, never store the pasted string.
- **31,102 is "the current seeded count," never a hard maximum** — no `CHECK` constraint, hard-coded array size, or literal denominator anywhere (AN Q22 deferral safety condition).
- **Rebase risk:** `chore/rename-youtube-content-type-youtube-video` (PR #394) may land mid-implementation and rename `ContentTypeYouTube`/`YOUTUBE` → `YOUTUBE_VIDEO`. Nothing in this plan hard-codes the YouTube enum string outside existing call sites; if #394 lands first, only the migration number (above) needs re-checking.

---

## PR A: Reference Data

**Branch:** `feature/bible-passage-reference-data` (from updated `main`)

### Task A1: Book and translation static data

**Files:**
- Create: `data/bible/books.json`
- Create: `data/bible/translations.json`
- Create: `data/bible/README.md`

**Interfaces:**
- Produces: `books.json` — array of 66 objects `{ id: int, name: string, testament: "OLD"|"NEW", canon: "protestant", division: string, chapterCount: int, aliases: string[] }`, ordered by canonical book order (Genesis=1 … Revelation=66). `canon` field included now per AN Q22 deferral even though only one value exists yet.
- Produces: `translations.json` — array `{ code: string, label: string, catholic: bool }` for the Bible Gateway version picker (PR D consumes this later; created now since it's pure data).

- [ ] **Step 1: Write `data/bible/books.json`**

Hand-author all 66 books. Division values: `Torah`, `History`, `Wisdom`, `Major Prophets`, `Minor Prophets`, `Gospels`, `Acts`, `Pauline Epistles`, `General Epistles`, `Apocalyptic` (AN Q10). Aliases must cover the common variants a reference parser needs (`1 John`/`I John`/`1Jn`, `Psalm`/`Psalms`, etc.) — this file is consumed by both the Go parser and TS utilities later (AN Q9), so get aliases right here rather than patching two places later.

```json
[
  { "id": 1, "name": "Genesis", "testament": "OLD", "canon": "protestant", "division": "Torah", "chapterCount": 50, "aliases": ["Gen", "Gn"] },
  { "id": 2, "name": "Exodus", "testament": "OLD", "canon": "protestant", "division": "Torah", "chapterCount": 40, "aliases": ["Exod", "Exo", "Ex"] }
]
```

Complete all 66 entries (see any standard KJV book list for names/chapter counts — cross-check chapter counts against whatever verse-count source is used in Task A2, they must agree).

- [ ] **Step 2: Write `data/bible/translations.json`**

```json
[
  { "code": "NIV", "label": "New International Version", "catholic": false },
  { "code": "ESV", "label": "English Standard Version", "catholic": false },
  { "code": "KJV", "label": "King James Version", "catholic": false },
  { "code": "NKJV", "label": "New King James Version", "catholic": false },
  { "code": "NLT", "label": "New Living Translation", "catholic": false },
  { "code": "NASB", "label": "New American Standard Bible", "catholic": false },
  { "code": "CSB", "label": "Christian Standard Bible", "catholic": false },
  { "code": "AMP", "label": "Amplified Bible", "catholic": false },
  { "code": "MSG", "label": "The Message", "catholic": false },
  { "code": "NABRE", "label": "New American Bible, Revised Edition", "catholic": true }
]
```

- [ ] **Step 3: Write `data/bible/README.md`** recording provenance for every file in this directory:

```markdown
# Bible reference data — provenance

## books.json
Hand-authored 2026-09-22. Book names, order, testament and chapter counts are
standard KJV-canon facts; not derived from an external file. `canon` field
reserved for future deuterocanonical support (see AN §Q22) — all rows are
currently `protestant`.

## translations.json
Hand-authored 2026-09-22. Bible Gateway version codes, spot-checked live
before use in PR D per AN §Q15 (NASB/AMP especially — edition variants exist).

## bsb.txt (added in Task A3)
Source: https://bereanbible.com/bsb.txt
Downloaded: <fill in on download date>
License: Public domain (berean.bible/terms.htm, dedicated 2023-04-30)
SHA-256: <fill in after download>
Row count after normalization: <fill in>
```

- [ ] **Step 4: Commit**

```bash
git add data/bible/books.json data/bible/translations.json data/bible/README.md
git commit -m "feat(data): add Bible book and translation reference tables"
```

---

### Task A2: Verse-count source and normalized verse table

**Files:**
- Create: `data/bible/verses.tsv` (normalized: `verse_id\tbook_id\tchapter\tverse`)
- Create: `data/bible/scripts/build_verses.py` (or `.mjs` — whichever the executor has available; one-off, committed for auditability per AN §6)
- Modify: `data/bible/README.md`

**Interfaces:**
- Produces: `verses.tsv`, exactly 31,102 rows (or the executor's verified count — see AN §7 caution about per-edition disagreement), one row per verse, `verse_id` densely 1..N in canonical order. This is the file Task A4's seeder loads and Task A5's parity test checks against `books.json`.

- [ ] **Step 1: Obtain a verse-count source**

Per AN §6, `BibleBot/RandomVersesData` (github.com/BibleBot/RandomVersesData) is the recommended machine-readable source for all 31,102 KJV verses. Download it by hand (not scripted — this is foundational, rarely-changing data per AN §6's "manual download checked into repo" pattern) into a scratch location, do not commit the raw upstream file.

- [ ] **Step 2: Write the normalizer script**

```python
#!/usr/bin/env python3
"""One-off normalizer: upstream KJV verse list -> data/bible/verses.tsv.
Re-run only if the upstream source is corrected. See data/bible/README.md."""
import csv
import json
import sys

def main(upstream_path: str, books_path: str, out_path: str) -> None:
    with open(books_path) as f:
        books = json.load(f)
    name_to_id = {b["name"]: b["id"] for b in books}

    rows = []  # (verse_id, book_id, chapter, verse)
    # Parse upstream_path here; exact parsing depends on the downloaded
    # format (CSV/JSON per RandomVersesData's actual layout). Emit one row
    # per verse in canonical book/chapter/verse order.
    with open(upstream_path) as f:
        for book_name, chapter, verse in parse_upstream(f):
            book_id = name_to_id[book_name]
            rows.append((book_id, chapter, verse))

    rows.sort(key=lambda r: r)  # canonical order relies on book_id order
    with open(out_path, "w", newline="") as out:
        writer = csv.writer(out, delimiter="\t")
        writer.writerow(["verse_id", "book_id", "chapter", "verse"])
        for i, (book_id, chapter, verse) in enumerate(rows, start=1):
            writer.writerow([i, book_id, chapter, verse])

    print(f"Wrote {len(rows)} verses to {out_path}", file=sys.stderr)

if __name__ == "__main__":
    main(sys.argv[1], sys.argv[2], sys.argv[3])
```

(`parse_upstream` is filled in by the executor once the actual downloaded file's format is known — RandomVersesData's exact layout was not directly inspected during research. This is not a placeholder for logic; it is unavoidable because the upstream file's schema is unknown until downloaded.)

- [ ] **Step 2: Run it and inspect the output**

```bash
python3 data/bible/scripts/build_verses.py /tmp/upstream-source data/bible/books.json data/bible/verses.tsv
```

Manually verify: total row count (record it — do not assume 31,102 without checking, per AN §7), Genesis 1:1 is `verse_id=1`, Revelation 22:21 is the last row, and per-book verse counts sanity-check against public references for at least Genesis, Psalms, and Revelation.

- [ ] **Step 3: Update `data/bible/README.md`** with the source URL, download date, and final row count (fill in the placeholders from Task A1 Step 3).

- [ ] **Step 4: Commit**

```bash
git add data/bible/verses.tsv data/bible/scripts/build_verses.py data/bible/README.md
git commit -m "feat(data): add normalized KJV verse ordinal table"
```

---

### Task A3: BSB verse text

**Files:**
- Create: `data/bible/bsb.tsv` (normalized: `verse_id\ttext`)
- Modify: `data/bible/README.md`

**Interfaces:**
- Produces: `bsb.tsv`, one row per verse (same `verse_id` space as `verses.tsv`), `text` is the BSB rendering.

- [ ] **Step 1: Download `https://bereanbible.com/bsb.txt`** (4.3 MB, confirmed public domain, plain static URL — AN §6/§7). Record the SHA-256:

```bash
curl -sL -o /tmp/bsb.txt https://bereanbible.com/bsb.txt
shasum -a 256 /tmp/bsb.txt
```

- [ ] **Step 2: Normalize to `verse_id`-keyed TSV**

The downloaded file is verse-by-verse plain text (book chapter:verse format per line, per AN §1). Write a small conversion using `verses.tsv` (Task A2) as the book/chapter/verse → `verse_id` lookup, matching each BSB line to its ordinal. Flag and fail loudly on any line that doesn't match a known `(book, chapter, verse)` triple — a silent mismatch here corrupts every downstream verse_id-to-text join.

- [ ] **Step 3: Verify row count matches `verses.tsv`** exactly (same total, no gaps, no duplicates).

- [ ] **Step 4: Update `data/bible/README.md`** with the SHA-256 and row count.

- [ ] **Step 5: Commit**

```bash
git add data/bible/bsb.tsv data/bible/README.md
git commit -m "feat(data): add Berean Standard Bible verse text (public domain)"
```

---

### Task A4: `bible_book`/`bible_verse` migration and Go seeder

**Files:**
- Create: `backend/migrations/000023_add_bible_reference_tables.up.sql`
- Create: `backend/migrations/000023_add_bible_reference_tables.down.sql`
- Create: `backend/cmd/seed-bible/main.go`
- Test: `backend/cmd/seed-bible/main_test.go`

**Interfaces:**
- Produces: tables `bible_book(id, name, testament, canon, division, chapter_count, aliases jsonb)` and `bible_verse(id, book_id, chapter, verse)`, both empty until the seeder runs.
- Produces: `go run ./cmd/seed-bible` — idempotent (upsert by ordinal id), reads `data/bible/books.json` + `data/bible/verses.tsv` via `//go:embed` (no filesystem path dependency at runtime).
- Consumes: nothing from prior tasks except the committed data files.

- [ ] **Step 1: Re-check the migration number**

```bash
ls backend/migrations/ | tail -5
git log --all --oneline -- 'backend/migrations/*'
```

Confirm `000023` is still free (see Global Constraints — `000022` is claimed by unmerged PR #394). If taken, use the next free number and note the collision in both migration files' header comments.

- [ ] **Step 2: Write the up migration**

```sql
-- backend/migrations/000023_add_bible_reference_tables.up.sql
-- If 000022 is taken by another in-flight branch when this runs, this file
-- was renumbered; see git log for the collision this note refers to.

CREATE TABLE IF NOT EXISTS bible_book (
    id            integer PRIMARY KEY,
    name          varchar NOT NULL,
    testament     varchar NOT NULL,
    canon         varchar NOT NULL DEFAULT 'protestant',
    division      varchar NOT NULL,
    chapter_count integer NOT NULL,
    aliases       jsonb NOT NULL DEFAULT '[]'::jsonb
);

CREATE TABLE IF NOT EXISTS bible_verse (
    id      integer PRIMARY KEY,
    book_id integer NOT NULL REFERENCES bible_book(id),
    chapter integer NOT NULL,
    verse   integer NOT NULL
);

CREATE INDEX IF NOT EXISTS bible_verse_book_chapter_idx
    ON bible_verse (book_id, chapter, verse);
```

- [ ] **Step 3: Write the down migration**

```sql
-- backend/migrations/000023_add_bible_reference_tables.down.sql
DROP TABLE IF EXISTS bible_verse;
DROP TABLE IF EXISTS bible_book;
```

- [ ] **Step 4: Embed the data files and write the seeder**

```go
// backend/cmd/seed-bible/main.go
package main

import (
	"context"
	_ "embed"
	"encoding/csv"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strconv"
	"strings"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
)

//go:embed data/books.json
var booksJSON []byte

//go:embed data/verses.tsv
var versesTSV []byte

type bookRow struct {
	ID           int      `json:"id"`
	Name         string   `json:"name"`
	Testament    string   `json:"testament"`
	Canon        string   `json:"canon"`
	Division     string   `json:"division"`
	ChapterCount int      `json:"chapterCount"`
	Aliases      []string `json:"aliases"`
}

func main() {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		log.Fatal("DATABASE_URL is required")
	}
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{})
	if err != nil {
		log.Fatalf("failed to connect: %v", err)
	}

	var books []bookRow
	if err := json.Unmarshal(booksJSON, &books); err != nil {
		log.Fatalf("failed to parse books.json: %v", err)
	}

	if err := seedBooks(db, books); err != nil {
		log.Fatalf("failed to seed books: %v", err)
	}
	verseCount, err := seedVerses(db, versesTSV)
	if err != nil {
		log.Fatalf("failed to seed verses: %v", err)
	}

	fmt.Printf("Seeded %d books, %d verses\n", len(books), verseCount)
}

func seedBooks(db *gorm.DB, books []bookRow) error {
	for _, b := range books {
		aliasesJSON, err := json.Marshal(b.Aliases)
		if err != nil {
			return fmt.Errorf("marshal aliases for %s: %w", b.Name, err)
		}
		err = db.Exec(`
			INSERT INTO bible_book (id, name, testament, canon, division, chapter_count, aliases)
			VALUES (?, ?, ?, ?, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET
				name = EXCLUDED.name, testament = EXCLUDED.testament,
				canon = EXCLUDED.canon, division = EXCLUDED.division,
				chapter_count = EXCLUDED.chapter_count, aliases = EXCLUDED.aliases
		`, b.ID, b.Name, b.Testament, b.Canon, b.Division, b.ChapterCount, string(aliasesJSON)).Error
		if err != nil {
			return fmt.Errorf("upsert book %s: %w", b.Name, err)
		}
	}
	return nil
}

func seedVerses(db *gorm.DB, tsv []byte) (int, error) {
	r := csv.NewReader(strings.NewReader(string(tsv)))
	r.Comma = '\t'
	rows, err := r.ReadAll()
	if err != nil {
		return 0, fmt.Errorf("parse verses.tsv: %w", err)
	}
	if len(rows) < 2 {
		return 0, fmt.Errorf("verses.tsv has no data rows")
	}

	count := 0
	err = db.Transaction(func(tx *gorm.DB) error {
		for _, row := range rows[1:] { // skip header
			id, _ := strconv.Atoi(row[0])
			bookID, _ := strconv.Atoi(row[1])
			chapter, _ := strconv.Atoi(row[2])
			verse, _ := strconv.Atoi(row[3])
			err := tx.Exec(`
				INSERT INTO bible_verse (id, book_id, chapter, verse)
				VALUES (?, ?, ?, ?)
				ON CONFLICT (id) DO UPDATE SET
					book_id = EXCLUDED.book_id, chapter = EXCLUDED.chapter, verse = EXCLUDED.verse
			`, id, bookID, chapter, verse).Error
			if err != nil {
				return fmt.Errorf("upsert verse %d: %w", id, err)
			}
			count++
		}
		return nil
	})
	return count, err
}

var _ = context.Background // keep import if signature evolves to accept ctx
```

Copy `data/bible/books.json` and `data/bible/verses.tsv` into `backend/cmd/seed-bible/data/` (a build-time copy, since `//go:embed` cannot reach outside the module via `../../..`) — add a `go:generate` comment or a Makefile step noting these must stay in sync with `data/bible/` at the repo root; the parity test in Task A5 catches drift.

- [ ] **Step 5: Write a seeder test using a mocked/test DB or dry-run mode**

```go
// backend/cmd/seed-bible/main_test.go
package main

import (
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBooksJSON_ParsesTo66Books(t *testing.T) {
	var books []bookRow
	err := json.Unmarshal(booksJSON, &books)
	require.NoError(t, err)
	assert.Len(t, books, 66)
	assert.Equal(t, "Genesis", books[0].Name)
	assert.Equal(t, "Revelation", books[65].Name)
}

func TestVersesTSV_ParsesWithoutError(t *testing.T) {
	count, err := seedVerses(nil, versesTSV) // seedVerses must tolerate db=nil in a "parse only" mode, or split parsing from DB writes
	_ = count
	require.Error(t, err) // placeholder: split seedVerses into parseVerses()+writeVerses(db) so parsing is testable without a DB; adjust this test to call parseVerses directly once split
}
```

(Note to executor: split `seedVerses` into a pure `parseVerses(tsv []byte) ([]verseRow, error)` and a `writeVerses(db, rows)` before finalizing this test — the test above flags that refactor rather than papering over it. This is a design correction to make during Step 5, not a deferred TODO.)

- [ ] **Step 6: Run tests**

```bash
cd backend
go test ./cmd/seed-bible/... -v
```
Expected: PASS after the `parseVerses`/`writeVerses` split.

- [ ] **Step 7: `gofmt` and commit**

```bash
cd backend
gofmt -l .
git add backend/migrations/000023_add_bible_reference_tables.up.sql backend/migrations/000023_add_bible_reference_tables.down.sql backend/cmd/seed-bible/
git commit -m "feat(backend): add bible_book/bible_verse tables and seeder

Migration must be applied manually per environment (this repo does not
auto-run migrations). After applying, run: go run ./cmd/seed-bible"
```

---

### Task A5: Static/DB parity test + TypeScript structure file

**Files:**
- Create: `frontend/src/lib/utils/bibleStructure.ts`
- Test: `frontend/tests/unit/bibleStructure.test.ts`
- Test: `backend/test/domain/bible_reference_test.go`

**Interfaces:**
- Produces (TS): `BIBLE_BOOKS: BibleBook[]` (typed mirror of `books.json`), `getBook(nameOrAlias: string): BibleBook | null`.
- Produces (Go): a test asserting the embedded `books.json`/`verses.tsv` (via the same files Task A4 copied) match expected structural invariants (66 books, verse count contiguous 1..N, every book's verse range matches `chapterCount`-implied bounds is out of scope for this test — just row counts and no gaps).

- [ ] **Step 1: Write the failing TS test**

```typescript
// frontend/tests/unit/bibleStructure.test.ts
import { describe, it, expect } from 'vitest';
import { BIBLE_BOOKS, getBook } from '$lib/utils/bibleStructure';

describe('bibleStructure', () => {
	it('has exactly 66 books', () => {
		expect(BIBLE_BOOKS).toHaveLength(66);
	});

	it('orders Genesis first and Revelation last', () => {
		expect(BIBLE_BOOKS[0].name).toBe('Genesis');
		expect(BIBLE_BOOKS[65].name).toBe('Revelation');
	});

	it('resolves a book by exact name', () => {
		expect(getBook('Genesis')?.id).toBe(1);
	});

	it('resolves a book by alias', () => {
		expect(getBook('Gen')?.id).toBe(1);
	});

	it('returns null for an unknown name', () => {
		expect(getBook('Not A Book')).toBeNull();
	});
});
```

- [ ] **Step 2: Run it to verify it fails**

```bash
cd frontend
pnpm run test:run -- bibleStructure
```
Expected: FAIL — `bibleStructure` module not found.

- [ ] **Step 3: Copy `data/bible/books.json` into the frontend and write the module**

```bash
cp data/bible/books.json frontend/src/lib/data/bible-books.json
```

```typescript
// frontend/src/lib/utils/bibleStructure.ts
import booksData from '$lib/data/bible-books.json';

export interface BibleBook {
	id: number;
	name: string;
	testament: 'OLD' | 'NEW';
	canon: string;
	division: string;
	chapterCount: number;
	aliases: string[];
}

export const BIBLE_BOOKS: BibleBook[] = booksData as BibleBook[];

const byLookup = new Map<string, BibleBook>();
for (const book of BIBLE_BOOKS) {
	byLookup.set(book.name.toLowerCase(), book);
	for (const alias of book.aliases) {
		byLookup.set(alias.toLowerCase(), book);
	}
}

export function getBook(nameOrAlias: string): BibleBook | null {
	return byLookup.get(nameOrAlias.trim().toLowerCase()) ?? null;
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
pnpm run test:run -- bibleStructure
```
Expected: PASS.

- [ ] **Step 5: Write the Go structural parity test**

```go
// backend/test/domain/bible_reference_test.go
package domain_test

import (
	"encoding/json"
	"os"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestBibleBooksJSON_Has66Books(t *testing.T) {
	// Reads the repo-root data file directly (not the embedded copy) so this
	// test also catches the two copies drifting apart.
	path := filepath.Join("..", "..", "..", "data", "bible", "books.json")
	raw, err := os.ReadFile(path)
	require.NoError(t, err)

	var books []struct {
		ID   int    `json:"id"`
		Name string `json:"name"`
	}
	require.NoError(t, json.Unmarshal(raw, &books))
	assert.Len(t, books, 66)
	assert.Equal(t, "Genesis", books[0].Name)
	assert.Equal(t, "Revelation", books[65].Name)
}

func TestSeederEmbeddedBooksJSON_MatchesRepoRoot(t *testing.T) {
	rootPath := filepath.Join("..", "..", "..", "data", "bible", "books.json")
	embeddedPath := filepath.Join("..", "..", "..", "backend", "cmd", "seed-bible", "data", "books.json")
	rootBytes, err := os.ReadFile(rootPath)
	require.NoError(t, err)
	embeddedBytes, err := os.ReadFile(embeddedPath)
	require.NoError(t, err)
	assert.JSONEq(t, string(rootBytes), string(embeddedBytes),
		"backend/cmd/seed-bible/data/books.json has drifted from data/bible/books.json — re-copy it")
}
```

- [ ] **Step 6: Run Go tests**

```bash
cd backend
go test ./test/domain/... -run TestBibleBooksJSON -v
go test ./test/domain/... -run TestSeederEmbeddedBooksJSON -v
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/utils/bibleStructure.ts frontend/src/lib/data/bible-books.json frontend/tests/unit/bibleStructure.test.ts backend/test/domain/bible_reference_test.go
git commit -m "test: add Bible reference data parity tests (TS structure + Go drift check)"
```

**PR A is now complete and shippable on its own.** It adds no user-visible behavior — open it as a standalone PR before starting PR B.

---

## PR B: Backend Content Type

**Branch:** `feature/bible-passage-content-type` (from updated `main`, after PR A merges)

### Task B1: Domain — `ContentTypeBiblePassage`, ordinal columns, `display_title`

**Files:**
- Modify: `backend/internal/core/domain/content.go`
- Create: `backend/migrations/0000XX_add_bible_passage_content_columns.up.sql` (renumber per Global Constraints at execution time)
- Create: `backend/migrations/0000XX_add_bible_passage_content_columns.down.sql`
- Test: `backend/test/domain/content_test.go` (extend existing file)

**Interfaces:**
- Produces: `domain.ContentTypeBiblePassage = "BIBLE_PASSAGE"`; `domain.Content.VerseStartID *int`, `VerseEndID *int`, `DisplayTitle *string` (all nullable — every non-passage row leaves them nil, matching the `CLAIM` precedent for unused fields).

- [ ] **Step 1: Write the failing domain test**

```go
// append to backend/test/domain/content_test.go
func TestContentType_BiblePassage(t *testing.T) {
	assert.Equal(t, domain.ContentType("BIBLE_PASSAGE"), domain.ContentTypeBiblePassage)
}

func TestContent_BiblePassageFields_OptionalAndNilByDefault(t *testing.T) {
	c := domain.Content{
		Name:          "Genesis 1:1-3",
		ContentType:   domain.ContentTypeBiblePassage,
		AddedByUserID: 1,
	}
	assert.Nil(t, c.VerseStartID)
	assert.Nil(t, c.VerseEndID)
	assert.Nil(t, c.DisplayTitle)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend
go test ./test/domain/... -run TestContentType_BiblePassage -v
```
Expected: FAIL — `domain.ContentTypeBiblePassage` undefined.

- [ ] **Step 3: Add the domain constant and struct fields**

```go
// backend/internal/core/domain/content.go — add to the const block
const (
	ContentTypeYouTube     ContentType = "YOUTUBE"
	ContentTypeClaim       ContentType = "CLAIM"
	ContentTypeBiblePassage ContentType = "BIBLE_PASSAGE"
)
```

```go
// add fields to the Content struct
type Content struct {
	ID                int
	Name              string
	URL               *string
	ContentType       ContentType
	AddedByUserID     int
	Length            *int
	LengthUnits       *string
	Response          json.RawMessage
	PrimaryCategoryID *int
	VerseStartID      *int    // BIBLE_PASSAGE only — ordinal into bible_verse
	VerseEndID        *int    // BIBLE_PASSAGE only
	DisplayTitle      *string // BIBLE_PASSAGE only — optional, first-write-wins (AN Q23)
	CreatedAt         time.Time
	UpdatedAt         time.Time
}
```

- [ ] **Step 4: Write the migration**

Re-check the migration number per Global Constraints before filling in the filename.

```sql
-- backend/migrations/0000XX_add_bible_passage_content_columns.up.sql
ALTER TABLE content ADD COLUMN IF NOT EXISTS verse_start_id integer NULL REFERENCES bible_verse(id);
ALTER TABLE content ADD COLUMN IF NOT EXISTS verse_end_id integer NULL REFERENCES bible_verse(id);
ALTER TABLE content ADD COLUMN IF NOT EXISTS display_title varchar NULL;

CREATE INDEX IF NOT EXISTS content_verse_range_idx
    ON content (verse_start_id, verse_end_id);
```

```sql
-- backend/migrations/0000XX_add_bible_passage_content_columns.down.sql
DROP INDEX IF EXISTS content_verse_range_idx;
ALTER TABLE content DROP COLUMN IF EXISTS display_title;
ALTER TABLE content DROP COLUMN IF EXISTS verse_end_id;
ALTER TABLE content DROP COLUMN IF EXISTS verse_start_id;
```

- [ ] **Step 5: Run domain tests to verify they pass**

```bash
cd backend
go test ./test/domain/... -v
```
Expected: PASS.

- [ ] **Step 6: `gofmt` and commit**

```bash
cd backend
gofmt -l .
git add backend/internal/core/domain/content.go backend/migrations/0000XX_add_bible_passage_content_columns.up.sql backend/migrations/0000XX_add_bible_passage_content_columns.down.sql backend/test/domain/content_test.go
git commit -m "feat(backend): add BIBLE_PASSAGE content type and ordinal/title columns

Migration must be applied manually per environment."
```

---

### Task B2: GORM model, mappers, and canonical-string generator

**Files:**
- Modify: `backend/internal/adapters/repositories/postgres/gorm_models.go`
- Modify: `backend/internal/adapters/repositories/postgres/gorm_mappers.go`
- Create: `backend/internal/core/domain/bible_reference.go`
- Test: `backend/test/domain/bible_reference_test.go` (new file — distinct from PR A's file of the same conceptual area but different package scope; if PR A's file already exists at this path, extend it)

**Interfaces:**
- Produces: `domain.CanonicalPassageURL(startVerseID, endVerseID int, bookName string, startChapter, startVerse, endChapter, endVerse int) string` — the single function that generates the Q5 dedupe key. **Every** creation path (picker, free text, pasted Bible Gateway URL) must funnel through this function, never construct the string manually.
- Produces: `domain.CanonicalPassageName(...) string` — generates `content.name` (e.g. `"Genesis 1:1-3"`), same inputs, separate from the URL (AN Q23).
- Consumes: nothing new from B1 beyond the struct fields.

- [ ] **Step 1: Write the failing test for the canonical generators**

```go
// backend/test/domain/bible_reference_test.go
package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

func TestCanonicalPassageURL_SingleVerse(t *testing.T) {
	url := domain.CanonicalPassageURL("Genesis", 1, 1, 1, 1)
	assert.Equal(t, "https://www.biblegateway.com/passage/?search=Genesis+1%3A1", url)
}

func TestCanonicalPassageURL_VerseRange(t *testing.T) {
	url := domain.CanonicalPassageURL("Genesis", 1, 1, 1, 3)
	assert.Equal(t, "https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3", url)
}

func TestCanonicalPassageURL_CrossChapterRange(t *testing.T) {
	url := domain.CanonicalPassageURL("John", 3, 16, 4, 2)
	assert.Equal(t, "https://www.biblegateway.com/passage/?search=John+3%3A16-4%3A2", url)
}

func TestCanonicalPassageURL_NeverContainsVersion(t *testing.T) {
	url := domain.CanonicalPassageURL("Genesis", 1, 1, 1, 3)
	assert.NotContains(t, url, "version=")
}

func TestCanonicalPassageName_VerseRange(t *testing.T) {
	name := domain.CanonicalPassageName("Genesis", 1, 1, 1, 3)
	assert.Equal(t, "Genesis 1:1-3", name)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend
go test ./test/domain/... -run TestCanonicalPassage -v
```
Expected: FAIL — undefined functions.

- [ ] **Step 3: Implement the generators**

```go
// backend/internal/core/domain/bible_reference.go
package domain

import (
	"fmt"
	"net/url"
)

// CanonicalPassageURL builds the version-less Bible Gateway URL used as the
// dedupe key for a BIBLE_PASSAGE content row (see AN §Q5). It must be the
// ONLY place this string is constructed — every creation path (picker, free
// text, or a pasted Bible Gateway link) funnels through this function so the
// same verse range always produces byte-identical output. Never store a
// pasted URL directly; parse it to (book, chapter, verse) and regenerate.
func CanonicalPassageURL(bookName string, startChapter, startVerse, endChapter, endVerse int) string {
	ref := formatReference(bookName, startChapter, startVerse, endChapter, endVerse, ":")
	q := url.Values{}
	q.Set("search", ref)
	return "https://www.biblegateway.com/passage/?" + q.Encode()
}

// CanonicalPassageName builds the content.name value for a passage — the
// permanent, non-editable canonical reference. Never confuse with
// DisplayTitle, which is optional, user-set, and separately stored (AN §Q23).
func CanonicalPassageName(bookName string, startChapter, startVerse, endChapter, endVerse int) string {
	return formatReference(bookName, startChapter, startVerse, endChapter, endVerse, ":")
}

func formatReference(bookName string, startChapter, startVerse, endChapter, endVerse int, sep string) string {
	if startChapter == endChapter && startVerse == endVerse {
		return fmt.Sprintf("%s %d%s%d", bookName, startChapter, sep, startVerse)
	}
	if startChapter == endChapter {
		return fmt.Sprintf("%s %d%s%d-%d", bookName, startChapter, sep, startVerse, endVerse)
	}
	return fmt.Sprintf("%s %d%s%d-%d%s%d", bookName, startChapter, sep, startVerse, endChapter, sep, endVerse)
}
```

Note: `url.Values.Encode()` sorts keys alphabetically and percent-encodes per `application/x-www-form-urlencoded` (space → `+`, `:` → `%3A`), matching the AN §Q15/Q5 verified format. Confirm the exact byte output in Step 4 rather than trusting this comment.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend
go test ./test/domain/... -run TestCanonicalPassage -v
```
Expected: PASS. If `url.Values.Encode()` output doesn't byte-match (e.g. encodes `:` differently), adjust the implementation — the test is the source of truth for exact output, copied from AN's verified example.

- [ ] **Step 5: Add GORM model fields**

```go
// backend/internal/adapters/repositories/postgres/gorm_models.go — add to ContentModel
VerseStartID *int    `gorm:"column:verse_start_id"`
VerseEndID   *int    `gorm:"column:verse_end_id"`
DisplayTitle *string `gorm:"column:display_title"`
```

- [ ] **Step 6: Extend mappers**

```go
// backend/internal/adapters/repositories/postgres/gorm_mappers.go
// In contentModelToDomain: add
VerseStartID: m.VerseStartID,
VerseEndID:   m.VerseEndID,
DisplayTitle: m.DisplayTitle,

// In contentDomainToModel: add
VerseStartID: c.VerseStartID,
VerseEndID:   c.VerseEndID,
DisplayTitle: c.DisplayTitle,
```

- [ ] **Step 7: Write a mapper round-trip test**

```go
// append to backend/internal/adapters/repositories/postgres/gorm_mappers_test.go
func TestContentMapper_BiblePassageFields_RoundTrip(t *testing.T) {
	start, end := 100, 102
	title := "Creation"
	c := &domain.Content{
		Name:          "Genesis 1:1-3",
		ContentType:   domain.ContentTypeBiblePassage,
		AddedByUserID: 1,
		VerseStartID:  &start,
		VerseEndID:    &end,
		DisplayTitle:  &title,
	}
	model := contentDomainToModel(c)
	back := contentModelToDomain(model)

	assert.Equal(t, &start, back.VerseStartID)
	assert.Equal(t, &end, back.VerseEndID)
	assert.Equal(t, &title, back.DisplayTitle)
}
```

- [ ] **Step 8: Run all backend tests**

```bash
cd backend
go test ./... -v
```
Expected: PASS.

- [ ] **Step 9: `gofmt` and commit**

```bash
cd backend
gofmt -l .
git add backend/internal/core/domain/bible_reference.go backend/internal/adapters/repositories/postgres/gorm_models.go backend/internal/adapters/repositories/postgres/gorm_mappers.go backend/test/domain/bible_reference_test.go backend/internal/adapters/repositories/postgres/gorm_mappers_test.go
git commit -m "feat(backend): add canonical passage URL/name generators and GORM mapping"
```

---

### Task B3: Repository — conditional title write

**Files:**
- Modify: `backend/internal/adapters/repositories/postgres/gorm_content_repository.go`
- Modify: `backend/internal/core/ports/repositories/content_repository.go` (interface)
- Test: `backend/internal/adapters/repositories/postgres/gorm_content_repository_test.go`

**Interfaces:**
- Produces: `ContentRepository.SetDisplayTitleIfEmpty(ctx, contentID int, title string) (winningTitle string, err error)` — implements the AN §Q23 first-write-wins race rule: a conditional `UPDATE ... WHERE display_title IS NULL`, returning whichever title actually won (the caller's, if they won the race; the existing one, if they lost it) rather than erroring on the losing path.
- Produces: `ContentRepository.ClearDisplayTitle(ctx, contentID int) error` — the admin escape hatch (AN §Q23), resets `display_title` to `NULL` so it becomes settable again. No new permission type is introduced here; the resolver layer in Task B5 gates who may call it.

- [ ] **Step 1: Write the failing repository test**

```go
// append to backend/internal/adapters/repositories/postgres/gorm_content_repository_test.go
func TestSetDisplayTitleIfEmpty_FirstWriteWins(t *testing.T) {
	db := setupTestDB(t) // existing test helper in this file; t.Skip()s if DB unavailable per repo convention
	repo := NewGormContentRepository(db)
	ctx := context.Background()

	content := &domain.Content{Name: "Genesis 1:1-3", ContentType: domain.ContentTypeBiblePassage, AddedByUserID: 1}
	created, err := repo.Create(ctx, content)
	require.NoError(t, err)

	winning, err := repo.SetDisplayTitleIfEmpty(ctx, created.ID, "Creation")
	require.NoError(t, err)
	assert.Equal(t, "Creation", winning)

	// second writer loses the race — gets the FIRST title back, not an error
	winning2, err := repo.SetDisplayTitleIfEmpty(ctx, created.ID, "The Beginning")
	require.NoError(t, err)
	assert.Equal(t, "Creation", winning2, "a losing writer must see the winning title, not their own or an error")
}

func TestClearDisplayTitle_ReopensToFirstWriter(t *testing.T) {
	db := setupTestDB(t)
	repo := NewGormContentRepository(db)
	ctx := context.Background()

	content := &domain.Content{Name: "Genesis 1:1-3", ContentType: domain.ContentTypeBiblePassage, AddedByUserID: 1}
	created, err := repo.Create(ctx, content)
	require.NoError(t, err)

	_, err = repo.SetDisplayTitleIfEmpty(ctx, created.ID, "Creation")
	require.NoError(t, err)

	require.NoError(t, repo.ClearDisplayTitle(ctx, created.ID))

	winning, err := repo.SetDisplayTitleIfEmpty(ctx, created.ID, "New Title")
	require.NoError(t, err)
	assert.Equal(t, "New Title", winning)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend
go test ./internal/adapters/repositories/postgres/... -run TestSetDisplayTitleIfEmpty -v
```
Expected: FAIL (or SKIP if no test DB — see repo convention; if skipped, proceed to implementation anyway and verify via `go build`).

- [ ] **Step 3: Add to the port interface**

```go
// backend/internal/core/ports/repositories/content_repository.go — add to ContentRepository interface
SetDisplayTitleIfEmpty(ctx context.Context, contentID int, title string) (string, error)
ClearDisplayTitle(ctx context.Context, contentID int) error
```

- [ ] **Step 4: Implement in the GORM repository**

```go
// backend/internal/adapters/repositories/postgres/gorm_content_repository.go

// SetDisplayTitleIfEmpty implements first-write-wins for a passage's optional
// title (AN §Q23): the write only takes effect if no title exists yet. A
// losing writer is told the title that won, not given an error — their
// intent (this passage should have a title) was satisfied, just not with
// their words.
func (r *GormContentRepository) SetDisplayTitleIfEmpty(ctx context.Context, contentID int, title string) (string, error) {
	result := r.db.WithContext(ctx).Exec(`
		UPDATE content SET display_title = ?
		WHERE id = ? AND display_title IS NULL
	`, title, contentID)
	if result.Error != nil {
		return "", fmt.Errorf("failed to set display title: %w", result.Error)
	}

	if result.RowsAffected == 0 {
		// Someone else won the race (or the row doesn't exist) — fetch and return the current value.
		var current struct{ DisplayTitle *string }
		if err := r.db.WithContext(ctx).Model(&ContentModel{}).
			Select("display_title").Where("id = ?", contentID).First(&current).Error; err != nil {
			return "", fmt.Errorf("failed to read existing display title: %w", err)
		}
		if current.DisplayTitle == nil {
			return "", domain.ErrNotFound
		}
		return *current.DisplayTitle, nil
	}

	return title, nil
}

// ClearDisplayTitle is the admin escape hatch (AN §Q23): resets a passage's
// title to NULL so it becomes settable again by anyone, rather than granting
// direct edit rights that would bypass first-write-wins.
func (r *GormContentRepository) ClearDisplayTitle(ctx context.Context, contentID int) error {
	result := r.db.WithContext(ctx).Exec(`
		UPDATE content SET display_title = NULL WHERE id = ?
	`, contentID)
	if result.Error != nil {
		return fmt.Errorf("failed to clear display title: %w", result.Error)
	}
	if result.RowsAffected == 0 {
		return domain.ErrNotFound
	}
	return nil
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd backend
go test ./internal/adapters/repositories/postgres/... -run "TestSetDisplayTitleIfEmpty|TestClearDisplayTitle" -v
```
Expected: PASS or SKIP (no test DB) — if SKIP, verify with `go build ./...` and a manual smoke test note in the PR description.

- [ ] **Step 6: `gofmt` and commit**

```bash
cd backend
gofmt -l .
git add backend/internal/core/ports/repositories/content_repository.go backend/internal/adapters/repositories/postgres/gorm_content_repository.go backend/internal/adapters/repositories/postgres/gorm_content_repository_test.go
git commit -m "feat(backend): add first-write-wins title setter and admin clear (AN Q23)"
```

---

### Task B4: Service layer — `CreateFromPassage`

**Files:**
- Modify: `backend/internal/core/ports/services/content_service.go`
- Modify: `backend/internal/core/services/content_service.go`
- Test: `backend/test/services/content_service_test.go`

**Interfaces:**
- Consumes: `domain.CanonicalPassageURL`/`CanonicalPassageName` (B2), `ContentRepository.GetOrCreateByURL` (existing, reused per AN §Q5), `bible_verse` lookups (via a new `BibleReferenceRepository` port — see Step 3).
- Produces: `ContentService.CreateFromPassage(ctx, input CreatePassageInput) (*domain.Content, error)`, where `CreatePassageInput{BookName string; StartChapter, StartVerse, EndChapter, EndVerse, UserID int}`.

- [ ] **Step 1: Write the failing service test**

```go
// append to backend/test/services/content_service_test.go
func TestCreateFromPassage_FindOrCreate_SameRangeReturnsSameRow(t *testing.T) {
	mockRepo := new(MockContentRepository) // existing mock in this file
	mockBibleRepo := new(MockBibleReferenceRepository) // new mock — see Step 3
	svc := services.NewContentService(mockRepo, nil /* youtube client, unused here */, mockBibleRepo)

	mockBibleRepo.On("GetVerseID", mock.Anything, 1, 1, 1).Return(1, nil)
	mockBibleRepo.On("GetVerseID", mock.Anything, 1, 1, 3).Return(3, nil)
	mockBibleRepo.On("GetBookName", mock.Anything, 1).Return("Genesis", nil)

	expectedURL := "https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3"
	mockRepo.On("GetOrCreateByURL", mock.Anything, mock.MatchedBy(func(c *domain.Content) bool {
		return c.URL != nil && *c.URL == expectedURL && c.ContentType == domain.ContentTypeBiblePassage
	}), true).Return(&domain.Content{ID: 1, URL: &expectedURL, ContentType: domain.ContentTypeBiblePassage}, nil)

	input := services.CreatePassageInput{BookID: 1, StartChapter: 1, StartVerse: 1, EndChapter: 1, EndVerse: 3, UserID: 42}
	result, err := svc.CreateFromPassage(context.Background(), input)

	require.NoError(t, err)
	assert.Equal(t, domain.ContentTypeBiblePassage, result.ContentType)
	mockRepo.AssertExpectations(t)
}

func TestCreateFromPassage_EndBeforeStart_ReturnsValidationError(t *testing.T) {
	svc := services.NewContentService(new(MockContentRepository), nil, new(MockBibleReferenceRepository))
	input := services.CreatePassageInput{BookID: 1, StartChapter: 3, StartVerse: 10, EndChapter: 1, EndVerse: 1, UserID: 42}
	_, err := svc.CreateFromPassage(context.Background(), input)
	assert.ErrorIs(t, err, services.ErrInvalidPassageRange)
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend
go test ./test/services/... -run TestCreateFromPassage -v
```
Expected: FAIL — `CreateFromPassage` undefined.

- [ ] **Step 3: Add a `BibleReferenceRepository` port** (small — just enough for ordinal lookups; does not duplicate PR A's seeder)

```go
// backend/internal/core/ports/repositories/bible_reference_repository.go
package repositories

import "context"

type BibleReferenceRepository interface {
	// GetVerseID resolves (bookID, chapter, verse) to the seeded ordinal id.
	GetVerseID(ctx context.Context, bookID, chapter, verse int) (int, error)
	// GetBookName resolves a book id to its canonical name for URL/name generation.
	GetBookName(ctx context.Context, bookID int) (string, error)
}
```

Implement `GormBibleReferenceRepository` in `backend/internal/adapters/repositories/postgres/gorm_bible_reference_repository.go`, querying `bible_verse`/`bible_book` (tables from PR A). Straightforward `SELECT id FROM bible_verse WHERE book_id = ? AND chapter = ? AND verse = ?` and `SELECT name FROM bible_book WHERE id = ?`; wire it in `main.go` alongside the other repositories.

- [ ] **Step 4: Add `CreatePassageInput` and the error to the ports package**

```go
// backend/internal/core/ports/services/content_service.go — add
type CreatePassageInput struct {
	BookID       int
	StartChapter int
	StartVerse   int
	EndChapter   int
	EndVerse     int
	UserID       int
}

// add to the ContentService interface
CreateFromPassage(ctx context.Context, input CreatePassageInput) (*domain.Content, error)
```

```go
// backend/internal/core/services/content_service.go — add near other sentinel errors
var ErrInvalidPassageRange = errors.New("passage end must not be before start")
```

- [ ] **Step 5: Implement `CreateFromPassage`**

```go
// backend/internal/core/services/content_service.go
func (s *ContentService) CreateFromPassage(ctx context.Context, input portservices.CreatePassageInput) (*domain.Content, error) {
	if input.EndChapter < input.StartChapter ||
		(input.EndChapter == input.StartChapter && input.EndVerse < input.StartVerse) {
		return nil, ErrInvalidPassageRange
	}

	startID, err := s.bibleRepo.GetVerseID(ctx, input.BookID, input.StartChapter, input.StartVerse)
	if err != nil {
		return nil, fmt.Errorf("resolve start verse: %w", err)
	}
	endID, err := s.bibleRepo.GetVerseID(ctx, input.BookID, input.EndChapter, input.EndVerse)
	if err != nil {
		return nil, fmt.Errorf("resolve end verse: %w", err)
	}
	bookName, err := s.bibleRepo.GetBookName(ctx, input.BookID)
	if err != nil {
		return nil, fmt.Errorf("resolve book name: %w", err)
	}

	canonicalURL := domain.CanonicalPassageURL(bookName, input.StartChapter, input.StartVerse, input.EndChapter, input.EndVerse)
	canonicalName := domain.CanonicalPassageName(bookName, input.StartChapter, input.StartVerse, input.EndChapter, input.EndVerse)

	content := &domain.Content{
		Name:          canonicalName,
		URL:           &canonicalURL,
		ContentType:   domain.ContentTypeBiblePassage,
		AddedByUserID: input.UserID,
		VerseStartID:  &startID,
		VerseEndID:    &endID,
	}

	// Reuses the existing atomic ON CONFLICT(url) find-or-create — the same
	// mechanism YouTube uses, and the entire reason the dedupe key (AN §Q5)
	// is stored in the `url` column rather than a bespoke scheme.
	return s.repo.GetOrCreateByURL(ctx, content, false)
}
```

Add `bibleRepo repositories.BibleReferenceRepository` as a new field on `ContentService` and a constructor parameter; update `main.go` wiring accordingly.

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd backend
go test ./test/services/... -run TestCreateFromPassage -v
```
Expected: PASS.

- [ ] **Step 7: `gofmt`, build, and commit**

```bash
cd backend
gofmt -l .
go build ./...
git add backend/internal/core/ports/repositories/bible_reference_repository.go backend/internal/adapters/repositories/postgres/gorm_bible_reference_repository.go backend/internal/core/ports/services/content_service.go backend/internal/core/services/content_service.go backend/test/services/content_service_test.go backend/cmd/server/main.go
git commit -m "feat(backend): add CreateFromPassage service method with verse-range validation"
```

---

### Task B5: GraphQL schema, mutation, and title mutations

**Files:**
- Modify: `backend/schema.graphql`
- Modify: `backend/internal/adapters/graphql/resolvers/content.resolvers.go`
- Test: `backend/test/resolvers/content_resolver_test.go`

**Interfaces:**
- Produces GraphQL: `ContentType.BIBLE_PASSAGE` enum value; `createContentFromPassage(input: CreateContentFromPassageInput!): Content! @auth`; `setPassageDisplayTitle(input: SetPassageDisplayTitleInput!): Content! @auth`; `clearPassageDisplayTitle(contentId: IntID!): Content! @auth` (admin-gated, per AN §Q23).
- Consumes: `ContentService.CreateFromPassage`, `SetDisplayTitleIfEmpty`, `ClearDisplayTitle` (B3/B4).

- [ ] **Step 1: Add to `backend/schema.graphql`**

```graphql
enum ContentType {
  YOUTUBE
  CLAIM
  BIBLE_PASSAGE
}

input CreateContentFromPassageInput {
  bookID: Int!
  startChapter: Int!
  startVerse: Int!
  endChapter: Int!
  endVerse: Int!
  userID: IntID!
}

input SetPassageDisplayTitleInput {
  contentID: IntID!
  title: String!
}

extend type Mutation {
  createContentFromPassage(input: CreateContentFromPassageInput!): Content! @auth
  setPassageDisplayTitle(input: SetPassageDisplayTitleInput!): Content! @auth
  clearPassageDisplayTitle(contentId: IntID!): Content! @auth @requireAdmin
}
```

(Check whether `@requireAdmin` or an equivalent directive already exists in the schema — grep `schema.graphql` for `@auth` usages and any role-gated mutation before assuming the directive name; adjust to match whatever convention `setPrimaryCategory` or similar admin-adjacent mutations already use.)

Add `Content.displayTitle: String` and `Content.verseStartID: Int` / `Content.verseEndID: Int` to the `Content` type for read access.

- [ ] **Step 2: Regenerate**

```bash
cd backend
make graphql-gen
```

Per Global Constraints, diff the stray `resolvers/schema.resolvers.go` for new stubs, hand-copy them into `content.resolvers.go`, then remove the stray file.

```bash
rm backend/internal/adapters/graphql/resolvers/schema.resolvers.go  # only if it reappeared as a stray duplicate — verify first
```

- [ ] **Step 3: Write the failing resolver test**

```go
// append to backend/test/resolvers/content_resolver_test.go
func TestCreateContentFromPassage_Success(t *testing.T) {
	c := setupTestClient(t) // existing helper — gqlgen test client
	resp := c.MustPost(`
		mutation {
			createContentFromPassage(input: {
				bookID: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3, userID: "1"
			}) {
				id
				contentType
				name
			}
		}
	`, &struct {
		CreateContentFromPassage struct {
			ID          string
			ContentType string
			Name        string
		}
	}{})
	_ = resp
	// gqlgen's test client rejects unmatched response fields — spell out every
	// selected field explicitly, matching the query above exactly (repo convention).
}

func TestSetPassageDisplayTitle_SecondWriterGetsFirstTitle(t *testing.T) {
	// Create a passage, set title "Creation", attempt to set "The Beginning" —
	// assert the response's displayTitle is "Creation", not an error and not
	// "The Beginning". Mirrors the repository-level test in Task B3 at the
	// GraphQL boundary.
}
```

- [ ] **Step 4: Implement the resolvers**

```go
// backend/internal/adapters/graphql/resolvers/content.resolvers.go
func (r *mutationResolver) CreateContentFromPassage(ctx context.Context, input model.CreateContentFromPassageInput) (*model.Content, error) {
	content, err := r.ContentService.CreateFromPassage(ctx, portservices.CreatePassageInput{
		BookID:       input.BookID,
		StartChapter: input.StartChapter,
		StartVerse:   input.StartVerse,
		EndChapter:   input.EndChapter,
		EndVerse:     input.EndVerse,
		UserID:       int(input.UserID),
	})
	if err != nil {
		return nil, err
	}
	return domainToModel(content), nil
}

func (r *mutationResolver) SetPassageDisplayTitle(ctx context.Context, input model.SetPassageDisplayTitleInput) (*model.Content, error) {
	winningTitle, err := r.ContentRepo.SetDisplayTitleIfEmpty(ctx, int(input.ContentID), input.Title)
	if err != nil {
		return nil, err
	}
	content, err := r.ContentService.GetByID(ctx, int(input.ContentID))
	if err != nil {
		return nil, err
	}
	content.DisplayTitle = &winningTitle
	return domainToModel(content), nil
}

func (r *mutationResolver) ClearPassageDisplayTitle(ctx context.Context, contentId int) (*model.Content, error) {
	if err := r.ContentRepo.ClearDisplayTitle(ctx, contentId); err != nil {
		return nil, err
	}
	content, err := r.ContentService.GetByID(ctx, contentId)
	if err != nil {
		return nil, err
	}
	return domainToModel(content), nil
}
```

(Check whether resolvers access the repository directly or only through the service in this codebase's convention — `content.resolvers.go`'s existing mutations may route everything through `ContentService`. If so, add thin pass-through methods `ContentService.SetDisplayTitleIfEmpty`/`ClearDisplayTitle` rather than reaching past it, to stay consistent.)

- [ ] **Step 5: Run tests**

```bash
cd backend
go test ./test/resolvers/... -run "TestCreateContentFromPassage|TestSetPassageDisplayTitle" -v
```
Expected: PASS.

- [ ] **Step 6: Run full backend suite, `gofmt`, and commit**

```bash
cd backend
go build ./...
gofmt -l .
go test ./... -v
git add backend/schema.graphql backend/internal/adapters/graphql/resolvers/content.resolvers.go backend/internal/adapters/graphql/generated/ backend/graph/model/ backend/test/resolvers/content_resolver_test.go
git commit -m "feat(backend): add createContentFromPassage and title mutations to GraphQL"
```

**PR B is now complete.** Open it after PR A merges. State in the PR description: "Adds two migrations (`0000XX`, renumber-checked at merge time); both must be applied manually per environment before this code is deployed, per repo convention."

---

## PR C: Frontend Passage Display

**Branch:** `feature/bible-passage-frontend-display` (from updated `main`, after PR B merges)

### Task C1: Reference parser/formatter

**Files:**
- Create: `frontend/src/lib/utils/bible.ts`
- Test: `frontend/tests/unit/bible.test.ts`

**Interfaces:**
- Produces: `parseReference(str: string): PassageRange | null`, `formatReference(range: PassageRange): string`, where `PassageRange = { bookId: number; startChapter: number; startVerse: number; endChapter: number; endVerse: number }`.
- Consumes: `BIBLE_BOOKS`/`getBook` from `bibleStructure.ts` (Task A5).

- [ ] **Step 1: Write the failing tests** (table-driven per AN §8, covering the cases the spec and AN both call out)

```typescript
// frontend/tests/unit/bible.test.ts
import { describe, it, expect } from 'vitest';
import { parseReference, formatReference } from '$lib/utils/bible';

describe('parseReference', () => {
	const cases: Array<[string, ReturnType<typeof parseReference>]> = [
		['Genesis 1:1-3', { bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3 }],
		['Genesis 1:1–3', { bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3 }], // en dash
		['John 3:16', { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 3, endVerse: 16 }],
		['1 John 2:1', { bookId: 62, startChapter: 2, startVerse: 1, endChapter: 2, endVerse: 1 }],
		['I John 2:1', { bookId: 62, startChapter: 2, startVerse: 1, endChapter: 2, endVerse: 1 }],
		['Psalm 23', { bookId: 19, startChapter: 23, startVerse: 1, endChapter: 23, endVerse: null as unknown as number }], // chapter-only — endVerse resolved by caller against verse count, see Step 3 note
		['John 3:16-4:2', { bookId: 43, startChapter: 3, startVerse: 16, endChapter: 4, endVerse: 2 }], // cross-chapter
		['not a reference', null],
		['Genesis 200:1', null], // out of range
	];

	it.each(cases)('parses %s', (input, expected) => {
		expect(parseReference(input)).toEqual(expected);
	});
});

describe('formatReference', () => {
	it('formats a single-chapter range', () => {
		expect(formatReference({ bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3 })).toBe('Genesis 1:1-3');
	});

	it('formats a cross-chapter range', () => {
		expect(formatReference({ bookId: 43, startChapter: 3, startVerse: 16, endChapter: 4, endVerse: 2 })).toBe('John 3:16-4:2');
	});

	it('round-trips through parseReference', () => {
		const original = 'Genesis 1:1-3';
		const parsed = parseReference(original)!;
		expect(formatReference(parsed)).toBe(original);
	});
});
```

Note on the chapter-only case: resolve during Step 3 whether `parseReference('Psalm 23')` returns the full chapter's verse range (querying `chapterCount`/verse data) or a caller-resolved partial range — adjust the test's expected value once that's decided; the placeholder `null as unknown as number` above must not survive into the final test.

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend
pnpm run test:run -- bible.test
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement `bible.ts`**

```typescript
// frontend/src/lib/utils/bible.ts
import { getBook, BIBLE_BOOKS, type BibleBook } from './bibleStructure';

export interface PassageRange {
	bookId: number;
	startChapter: number;
	startVerse: number;
	endChapter: number;
	endVerse: number;
}

const REF_PATTERN = /^(\d?\s?[A-Za-z]+)\s+(\d+)(?::(\d+))?(?:[-–](?:(\d+):)?(\d+))?$/;

export function parseReference(input: string): PassageRange | null {
	const normalized = input.trim().replace(/–/g, '-'); // normalize en dash to hyphen for parsing, formatReference still emits '-'
	const match = REF_PATTERN.exec(normalized);
	if (!match) return null;

	const [, rawBookName, chapterStr, verseStr, endChapterStr, endVerseStr] = match;
	const bookName = normalizeBookName(rawBookName);
	const book = getBook(bookName);
	if (!book) return null;

	const startChapter = parseInt(chapterStr, 10);
	if (startChapter < 1 || startChapter > book.chapterCount) return null;

	if (!verseStr) {
		// Chapter-only reference — resolve to the full chapter.
		// Requires the chapter's verse count, which is NOT in bibleStructure.ts
		// (that file only has chapterCount per book, not verses-per-chapter).
		// This function must either accept a verse-count lookup, or chapter-only
		// support is deferred out of this task — decide before finalizing Step 3
		// and update the Step 1 test accordingly; do not leave this branch
		// silently wrong.
		return null;
	}

	const startVerse = parseInt(verseStr, 10);
	const endChapter = endChapterStr ? parseInt(endChapterStr, 10) : startChapter;
	const endVerse = endVerseStr ? parseInt(endVerseStr, 10) : startVerse;

	if (endChapter < startChapter || (endChapter === startChapter && endVerse < startVerse)) {
		return null;
	}

	return { bookId: book.id, startChapter, startVerse, endChapter, endVerse };
}

export function formatReference(range: PassageRange): string {
	const book = BIBLE_BOOKS.find((b) => b.id === range.bookId);
	if (!book) throw new Error(`Unknown book id: ${range.bookId}`);

	if (range.startChapter === range.endChapter && range.startVerse === range.endVerse) {
		return `${book.name} ${range.startChapter}:${range.startVerse}`;
	}
	if (range.startChapter === range.endChapter) {
		return `${book.name} ${range.startChapter}:${range.startVerse}-${range.endVerse}`;
	}
	return `${book.name} ${range.startChapter}:${range.startVerse}-${range.endChapter}:${range.endVerse}`;
}

function normalizeBookName(raw: string): string {
	const trimmed = raw.trim();
	// "1 John" / "I John" both alias to the same book via bibleStructure's
	// alias table (Task A1) — no special-casing needed here beyond passing
	// the raw text through, since getBook() lowercases and checks aliases.
	return trimmed.replace(/^I\s/, '1 ');
}
```

**Flag for the executor:** the chapter-only case (`Psalm 23`) is explicitly left unresolved above rather than silently wrong — decide during this task whether it's in scope (needs verses-per-chapter data, which `bibleStructure.ts` doesn't currently carry) or explicitly out of scope for PR C, and update both the implementation and the Step 1 test to match. Do not ship a function that silently returns `null` for a case the test suite doesn't cover.

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
pnpm run test:run -- bible.test
```
Expected: PASS (after resolving the chapter-only decision above).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/utils/bible.ts frontend/tests/unit/bible.test.ts
git commit -m "feat(frontend): add Bible reference parser/formatter"
```

---

### Task C2: `PassageText` component

**Files:**
- Create: `frontend/src/lib/components/PassageText.svelte`
- Create: `frontend/src/lib/queries/bible/index.ts` (query definitions + `usePassageText` hook)
- Test: `frontend/tests/components/PassageText.test.ts`

**Interfaces:**
- Consumes: `graphqlRequest` (existing authenticated wrapper — never bare `graphqlClient`, per repo convention and AN §7), GraphQL query `passageText(startVerseId, endVerseId)` (B5's schema — confirm the exact query name/shape against `backend/schema.graphql` once B lands, since AN's sketch used `passageText` but B5's task above didn't explicitly add this query; **add it to B5 if missing** — flag this as a cross-task gap the executor must close, likely by adding a `Query.passageText(startVerseId: Int!, endVerseId: Int!): PassageText!` resolver reading `bsb.tsv`-seeded verse text, which was never explicitly seeded in PR A/B above and needs its own migration/seeder step mirroring Task A4's pattern for `bible_verse`).
- Produces: `PassageText.svelte` props `{ startVerseId: number; endVerseId: number }`; states per AN §8 — loading, error, loaded, collapsed (31–150 verses), expanded, over-cap link-out (>150 verses), attribution line always present (AN §Q13 two-tier cap).

**⚠️ Cross-task gap flagged for the executor:** this task assumes BSB verse *text* is queryable, but PR A (Task A3) only produces `data/bible/bsb.tsv` as a committed file — no task above seeds it into a `bible_verse_text` table or equivalent, and PR B's schema (Task B5) didn't add a `passageText` query/resolver. **Before starting this task, add:**
- a `bible_verse_text(verse_id, translation, text)` table + seeder step (mirrors Task A4's pattern, using `data/bible/bsb.tsv`)
- a `Query.passageText(startVerseId: Int!, endVerseId: Int!): PassageText!` resolver in PR B

This is a real gap in this plan's task breakdown, not a step to skip — treat it as an inserted Task A6/B6 before proceeding here.

- [ ] **Step 1: Write the failing component test**

```typescript
// frontend/tests/components/PassageText.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import PassageText from '$lib/components/PassageText.svelte';

const mocks = vi.hoisted(() => ({ mockQueryState: { data: null as unknown, isLoading: false, isError: false } }));
vi.mock('@tanstack/svelte-query', () => ({
	createQuery: (opts: () => unknown) => { opts(); return mocks.mockQueryState; },
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

describe('PassageText', () => {
	beforeEach(() => {
		mocks.mockQueryState.data = null;
		mocks.mockQueryState.isLoading = false;
		mocks.mockQueryState.isError = false;
	});

	it('shows a loading state', () => {
		mocks.mockQueryState.isLoading = true;
		render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		expect(screen.getByText(/loading/i)).toBeInTheDocument();
	});

	it('shows an error state', () => {
		mocks.mockQueryState.isError = true;
		render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		expect(screen.getByText(/couldn.t load/i)).toBeInTheDocument();
	});

	it('renders verses in full under the collapse threshold', () => {
		mocks.mockQueryState.data = {
			verses: [{ verseId: 1, chapter: 1, verse: 1, text: 'In the beginning...' }],
			translation: 'BSB', copyright: 'public domain (CC0)',
		};
		render(PassageText, { props: { startVerseId: 1, endVerseId: 1 } });
		expect(screen.getByText(/In the beginning/)).toBeInTheDocument();
		expect(screen.getByText(/public domain/i)).toBeInTheDocument();
	});

	it('collapses a passage between 31 and 150 verses', () => {
		const verses = Array.from({ length: 60 }, (_, i) => ({ verseId: i + 1, chapter: 1, verse: i + 1, text: `Verse ${i + 1}` }));
		mocks.mockQueryState.data = { verses, translation: 'BSB', copyright: 'public domain (CC0)' };
		render(PassageText, { props: { startVerseId: 1, endVerseId: 60 } });
		expect(screen.getByText(/show full passage/i)).toBeInTheDocument();
		expect(screen.queryByText(/Verse 60/)).not.toBeInTheDocument();
	});

	it('shows a link-out with no verse text above the hard cap', () => {
		const verses = Array.from({ length: 200 }, (_, i) => ({ verseId: i + 1, chapter: 1, verse: i + 1, text: `Verse ${i + 1}` }));
		mocks.mockQueryState.data = { verses, translation: 'BSB', copyright: 'public domain (CC0)' };
		render(PassageText, { props: { startVerseId: 1, endVerseId: 200 } });
		expect(screen.queryByText(/Verse 1$/)).not.toBeInTheDocument();
		expect(screen.getByRole('link', { name: /read on bible gateway|view full passage/i })).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend
pnpm run test:run -- PassageText
```
Expected: FAIL — component not found.

- [ ] **Step 3: Write the query hook**

```typescript
// frontend/src/lib/queries/bible/index.ts
import { gql } from 'graphql-request';

export const PASSAGE_TEXT_QUERY = gql`
	query PassageText($startVerseId: Int!, $endVerseId: Int!) {
		passageText(startVerseId: $startVerseId, endVerseId: $endVerseId) {
			translation
			copyright
			verses {
				verseId
				chapter
				verse
				text
			}
		}
	}
`;

export interface VerseText {
	verseId: number;
	chapter: number;
	verse: number;
	text: string;
}

export interface PassageTextResponse {
	passageText: {
		translation: string;
		copyright: string;
		verses: VerseText[];
	};
}
```

Add `bible: { passageText: (start: number, end: number) => ['bible', 'passage', start, end] as const }` to `frontend/src/lib/queries/keys.ts` per repo convention (AN §7 — `staleTime: Infinity`, text never changes).

- [ ] **Step 4: Implement `PassageText.svelte`**

```svelte
<!-- frontend/src/lib/components/PassageText.svelte -->
<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { PASSAGE_TEXT_QUERY, type PassageTextResponse } from '$lib/queries/bible';
	import { queryKeys } from '$lib/queries/keys';

	const { startVerseId, endVerseId }: { startVerseId: number; endVerseId: number } = $props();

	const COLLAPSE_THRESHOLD = 30; // AN §Q13 — render in full at or below this
	const HARD_CAP = 150; // AN §Q13 — no inline text above this, link out instead
	const COLLAPSED_PREVIEW_COUNT = 10;

	let expanded = $state(false);

	const query = createQuery(() => ({
		queryKey: queryKeys.bible.passageText(startVerseId, endVerseId),
		queryFn: () => graphqlRequest<PassageTextResponse>(PASSAGE_TEXT_QUERY, { startVerseId, endVerseId }),
		staleTime: Infinity,
	}));

	const verseCount = $derived((endVerseId ?? 0) - (startVerseId ?? 0) + 1);
	const verses = $derived(query.data?.passageText.verses ?? []);
	const visibleVerses = $derived(
		verseCount <= COLLAPSE_THRESHOLD || expanded ? verses : verses.slice(0, COLLAPSED_PREVIEW_COUNT)
	);
</script>

{#if query.isLoading}
	<p>Loading passage…</p>
{:else if query.isError}
	<p>Couldn't load this passage.</p>
{:else if query.data}
	{@const { translation, copyright } = query.data.passageText}
	<div class="passage-text">
		{#if verseCount > HARD_CAP}
			<p>{verseCount} verses — too long to display here.</p>
			<a href="#" role="link">Read on Bible Gateway</a>
		{:else}
			{#each visibleVerses as v (v.verseId)}
				<span><sup>{v.verse}</sup> {v.text}</span>
			{/each}
			{#if verseCount > COLLAPSE_THRESHOLD && !expanded}
				<button type="button" onclick={() => (expanded = true)}>Show full passage</button>
			{/if}
		{/if}
		<p class="attribution">{translation} · {copyright}</p>
	</div>
{/if}
```

(The link-out `href` above is a placeholder `#` — Task D wires the real Bible Gateway URL via `domain.CanonicalPassageURL`'s TS equivalent once the version picker exists; do not ship `href="#"` in the final PR. Flagging rather than fabricating a URL scheme this task doesn't own.)

- [ ] **Step 5: Run tests to verify they pass**

```bash
cd frontend
pnpm run test:run -- PassageText
```
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/components/PassageText.svelte frontend/src/lib/queries/bible/index.ts frontend/src/lib/queries/keys.ts frontend/tests/components/PassageText.test.ts
git commit -m "feat(frontend): add PassageText component with two-tier render cap (AN Q13)"
```

---

### Task C3: ActivityTable renderers — passage icon, no thumbnail

**Files:**
- Modify: `frontend/src/lib/utils/activityItemCellRenderer.ts`
- Modify: `frontend/src/lib/utils/formatting.ts` (`typeCellRenderer`)
- Test: `frontend/tests/unit/activityItemCellRenderer.test.ts`
- Test: `frontend/tests/unit/formatting.test.ts`

**Interfaces:**
- Consumes: `ContentItem.contentType` (existing, bare string per AN §7 — no frontend enum exists yet; add one now per below).
- Produces: `typeCellRenderer`/`activityItemCellRenderer` branch on `'BIBLE_PASSAGE'` — passage icon, reference as title, `displayTitle` as bold title when present (falls back to reference — AN §Q23), no thumbnail `<img>` request.

- [ ] **Step 1: Add a `ContentType` union** (currently a bare string per AN §7 finding — introduce the union now rather than deferring, since two real values now exist to branch on)

```typescript
// frontend/src/lib/queries/content/index.ts — add near ContentItem
export type ContentType = 'YOUTUBE' | 'CLAIM' | 'BIBLE_PASSAGE';
```

Add `displayTitle?: string | null` to `ContentItem` and to `LIST_CONTENT`'s selection set.

- [ ] **Step 2: Write the failing tests**

```typescript
// append to frontend/tests/unit/activityItemCellRenderer.test.ts
it('renders a Bible passage row with the reference and no thumbnail image', () => {
	const el = activityItemCellRenderer({
		data: { contentType: 'BIBLE_PASSAGE', name: 'Genesis 1:1-3', displayTitle: null, url: 'https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3' },
	} as never);
	expect(el.querySelector('img')).toBeNull();
	expect(el.textContent).toContain('Genesis 1:1-3');
});

it('renders the display title as the primary text when set, with the reference as subtitle', () => {
	const el = activityItemCellRenderer({
		data: { contentType: 'BIBLE_PASSAGE', name: 'Genesis 1:1-3', displayTitle: 'Creation', url: '...' },
	} as never);
	expect(el.textContent).toContain('Creation');
	expect(el.textContent).toContain('Genesis 1:1-3');
});
```

```typescript
// append to frontend/tests/unit/formatting.test.ts
it('typeCellRenderer shows the passage icon for BIBLE_PASSAGE, not the YouTube icon', () => {
	const el = typeCellRenderer({ data: { contentType: 'BIBLE_PASSAGE' } } as never);
	expect(el.querySelector('svg')?.getAttribute('data-icon')).not.toBe('youtube');
	expect(el.textContent).toContain('Bible Passage');
});
```

- [ ] **Step 3: Run to verify they fail**

```bash
cd frontend
pnpm run test:run -- activityItemCellRenderer formatting
```
Expected: FAIL — both renderers currently always render the YouTube icon/thumbnail per AN §7.

- [ ] **Step 4: Add branching to `typeCellRenderer`**

```typescript
// frontend/src/lib/utils/formatting.ts — inside typeCellRenderer, before the existing YouTube SVG branch
export function typeCellRenderer(params: { data?: { contentType?: string } }): HTMLElement {
	const container = document.createElement('div');
	const contentType = params.data?.contentType;

	if (contentType === 'BIBLE_PASSAGE') {
		container.innerHTML = BIBLE_PASSAGE_ICON_SVG; // book-with-cross line icon, per handoff Assets section
		const srLabel = document.createElement('span');
		srLabel.className = 'sr-only';
		srLabel.textContent = 'Bible Passage';
		container.appendChild(srLabel);
		return container;
	}

	// ...existing YouTube branch unchanged below
}

const BIBLE_PASSAGE_ICON_SVG = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" data-icon="bible-passage"><rect x="4" y="3" width="16" height="18" rx="2"/><line x1="12" y1="7" x2="12" y2="17"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`;
```

- [ ] **Step 5: Add branching to `activityItemCellRenderer`**

```typescript
// frontend/src/lib/utils/activityItemCellRenderer.ts — add a BIBLE_PASSAGE branch before the existing thumbnail logic
export function activityItemCellRenderer(params: { data?: { contentType?: string; name?: string; displayTitle?: string | null; url?: string } }): HTMLElement {
	const data = params.data;
	if (data?.contentType === 'BIBLE_PASSAGE') {
		const wrapper = document.createElement('div');
		const iconBox = document.createElement('div');
		iconBox.className = 'passage-icon-box';
		iconBox.innerHTML = BIBLE_PASSAGE_ICON_SVG; // shared with formatting.ts — consider extracting to a shared icons module if duplicated
		wrapper.appendChild(iconBox);

		const textWrap = document.createElement('div');
		const title = document.createElement('div');
		title.className = 'passage-title';
		title.textContent = data.displayTitle || data.name || '';
		textWrap.appendChild(title);

		if (data.displayTitle) {
			const subtitle = document.createElement('div');
			subtitle.className = 'passage-subtitle';
			subtitle.textContent = data.name || '';
			textWrap.appendChild(subtitle);
		}
		wrapper.appendChild(textWrap);
		return wrapper;
	}

	// ...existing YouTube thumbnail logic unchanged below
}
```

(Executor: extract `BIBLE_PASSAGE_ICON_SVG` to a shared module, e.g. `frontend/src/lib/utils/icons.ts`, rather than duplicating the string in two files — noted here rather than fixed in-line since the exact shared-module convention should match whatever the codebase already does for icon reuse.)

- [ ] **Step 6: Run tests to verify they pass**

```bash
cd frontend
pnpm run test:run -- activityItemCellRenderer formatting
```
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/lib/utils/activityItemCellRenderer.ts frontend/src/lib/utils/formatting.ts frontend/src/lib/queries/content/index.ts frontend/tests/unit/activityItemCellRenderer.test.ts frontend/tests/unit/formatting.test.ts
git commit -m "feat(frontend): render Bible passage rows with icon + reference, no thumbnail (AN Q4, Q23)"
```

---

### Task C4: `ActivityDetailsModal` passage section

**Files:**
- Modify: `frontend/src/lib/components/ActivityDetailsModal.svelte`
- Test: `frontend/tests/components/ActivityDetailsModal.test.ts`

**Interfaces:**
- Consumes: `PassageText.svelte` (C2).
- Produces: a `BIBLE_PASSAGE`-conditional section replacing the video-specific header/stat tiles (per AN §Q3 — this modal is the row-expansion replacement, since AG Grid Community has no master/detail).

- [ ] **Step 1: Write the failing test**

```typescript
// append to frontend/tests/components/ActivityDetailsModal.test.ts
it('renders passage text and no video stat tiles for a BIBLE_PASSAGE item', () => {
	const content = { id: '1', contentType: 'BIBLE_PASSAGE', name: 'Genesis 1:1-3', displayTitle: null, verseStartID: 1, verseEndID: 3 };
	render(ActivityDetailsModal, { props: { content, open: true } });
	expect(screen.getByText(/genesis 1:1-3/i)).toBeInTheDocument();
	expect(screen.queryByText(/views/i)).not.toBeInTheDocument();
	expect(screen.queryByText(/duration/i)).not.toBeInTheDocument();
});

it('renders the YouTube header unchanged for a YOUTUBE item (regression)', () => {
	const content = { id: '1', contentType: 'YOUTUBE', name: 'Some Video' };
	render(ActivityDetailsModal, { props: { content, open: true } });
	expect(screen.getByText(/youtube video/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run to verify the passage test fails, YouTube test passes**

```bash
cd frontend
pnpm run test:run -- ActivityDetailsModal
```
Expected: passage test FAILS, YouTube regression test PASSES (it exercises existing behavior).

- [ ] **Step 3: Add the conditional section**

```svelte
<!-- frontend/src/lib/components/ActivityDetailsModal.svelte — inside the existing modal body, add near the top -->
{#if content.contentType === 'BIBLE_PASSAGE'}
	<PassageText startVerseId={content.verseStartID} endVerseId={content.verseEndID} />
	<!-- Title-setting affordance (AN §Q23): shown only while displayTitle is empty -->
	{#if !content.displayTitle}
		<!-- form/button wiring to setPassageDisplayTitle mutation — follow the
		     existing mutation-hook pattern from useAddVideo.ts; the mutation
		     itself and its hook belong to PR C2 alongside the add-content flow,
		     since that is where the create-then-title flow naturally lives.
		     If a standalone "add a title after the fact" affordance is wanted
		     in the modal too, wire it here against the same mutation. -->
	{:else}
		<p class="passage-title-display">{content.displayTitle}</p>
	{/if}
{:else}
	<!-- existing YouTube header / stat tiles unchanged -->
{/if}
```

(Executor: the exact stat-tile replacement for a passage — verse count via `length`/`length_units` per AN §Q11, "% through Scripture" bar per AN §Q14 — is PR D scope per the sequencing in AN §1; this task only needs to stop rendering YouTube-specific tiles for a passage and show `PassageText`, not build the position bar.)

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
pnpm run test:run -- ActivityDetailsModal
```
Expected: both PASS.

- [ ] **Step 5: Run the full frontend suite** to catch any regression in other consumers of this modal

```bash
cd frontend
pnpm run test:run
```
Expected: all PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/components/ActivityDetailsModal.svelte frontend/tests/components/ActivityDetailsModal.test.ts
git commit -m "feat(frontend): add Bible passage section to ActivityDetailsModal (AN Q3)"
```

**PR C is now complete.** Open it after PR B merges.

---

## PR C2: Generalized Add-Content Flow

**Branch:** `feature/add-content-autodetect` (from updated `main`, after PR C merges)

### Task C2.1: Detection logic (pure function, no UI)

**Files:**
- Create: `frontend/src/lib/utils/detectContentType.ts`
- Test: `frontend/tests/unit/detectContentType.test.ts`

**Interfaces:**
- Consumes: `validateYouTubeUrl` (existing, `frontend/src/lib/utils/youtube.ts`), `parseReference` (C1), `domain.CanonicalPassageURL`'s TS-side parse-back (new — parsing a pasted Bible Gateway URL to a `PassageRange`).
- Produces: `detectContentType(input: string): DetectionResult`, where `DetectionResult = { type: 'YOUTUBE'; url: string } | { type: 'BIBLE_PASSAGE'; range: PassageRange } | { type: null }`. Per AN §Q21, this returns exactly one candidate today since the patterns are disjoint, but the return type is structured so a future ambiguous case doesn't require a signature change.

- [ ] **Step 1: Write the failing tests**

```typescript
// frontend/tests/unit/detectContentType.test.ts
import { describe, it, expect } from 'vitest';
import { detectContentType } from '$lib/utils/detectContentType';

describe('detectContentType', () => {
	it('detects a YouTube URL', () => {
		const result = detectContentType('https://www.youtube.com/watch?v=abc123');
		expect(result.type).toBe('YOUTUBE');
	});

	it('detects a Bible Gateway URL and extracts the range', () => {
		const result = detectContentType('https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3&version=NIV');
		expect(result.type).toBe('BIBLE_PASSAGE');
		if (result.type === 'BIBLE_PASSAGE') {
			expect(result.range).toEqual({ bookId: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3 });
		}
	});

	it('detects free text matching a Bible reference', () => {
		const result = detectContentType('John 3:16-18');
		expect(result.type).toBe('BIBLE_PASSAGE');
	});

	it('returns null type for unparseable input', () => {
		expect(detectContentType('not anything recognizable').type).toBeNull();
	});

	it('never stores the pasted Bible Gateway URL directly — range must be re-derivable to the canonical form', () => {
		// A pasted URL with a version param or different verse-range spelling
		// must still resolve to the same range as the canonical generator would
		// produce, since the caller (useAddContent) regenerates the URL rather
		// than storing what was pasted (AN §Q5/§Q21).
		const result = detectContentType('https://www.biblegateway.com/passage/?search=Gen+1:1-3&version=ESV');
		expect(result.type).toBe('BIBLE_PASSAGE');
	});
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd frontend
pnpm run test:run -- detectContentType
```
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

```typescript
// frontend/src/lib/utils/detectContentType.ts
import { validateYouTubeUrl } from './youtube';
import { parseReference, type PassageRange } from './bible';

export type DetectionResult =
	| { type: 'YOUTUBE'; url: string }
	| { type: 'BIBLE_PASSAGE'; range: PassageRange }
	| { type: null };

export function detectContentType(input: string): DetectionResult {
	const trimmed = input.trim();

	if (validateYouTubeUrl(trimmed)) {
		return { type: 'YOUTUBE', url: trimmed };
	}

	const bibleGatewayRange = parseBibleGatewayUrl(trimmed);
	if (bibleGatewayRange) {
		return { type: 'BIBLE_PASSAGE', range: bibleGatewayRange };
	}

	const range = parseReference(trimmed);
	if (range) {
		return { type: 'BIBLE_PASSAGE', range };
	}

	return { type: null };
}

function parseBibleGatewayUrl(input: string): PassageRange | null {
	let url: URL;
	try {
		url = new URL(input);
	} catch {
		return null;
	}
	if (!url.hostname.endsWith('biblegateway.com')) return null;

	const search = url.searchParams.get('search');
	if (!search) return null;

	// Bible Gateway's search param is the same human-readable reference format
	// parseReference already handles — reuse it rather than duplicating regex.
	return parseReference(search);
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd frontend
pnpm run test:run -- detectContentType
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/utils/detectContentType.ts frontend/tests/unit/detectContentType.test.ts
git commit -m "feat(frontend): add content-type autodetection (YouTube URL / Bible reference / Bible Gateway URL)"
```

---

### Task C2.2: `AddContentPopover` — generalize from `AddVideoPopover`

**Files:**
- Modify: `frontend/src/lib/components/AddVideoPopover.svelte` → rename to `frontend/src/lib/components/AddContentPopover.svelte`
- Modify: any import sites of `AddVideoPopover` (grep before renaming)
- Create: `frontend/src/lib/queries/content/useAddPassage.ts`
- Test: rename/extend `frontend/tests/components/AddVideoPopover.test.ts` → `AddContentPopover.test.ts` if it exists (check first — AN §7 flagged `AddVideoDialog.svelte` as a second, possibly-live component with a known flaky test; confirm which is actually rendered before touching either)

**Interfaces:**
- Consumes: `detectContentType` (C2.1), `useAddVideo` (existing, unchanged), new `useAddPassage` mutation hook.
- Produces: single popover handling both flows; **the existing YouTube path's tests must pass unchanged before and after this task** (Global Constraints / AN §Q21 regression risk).

- [ ] **Step 1: Determine which component is actually live**

```bash
grep -rn "AddVideoPopover\|AddVideoDialog" frontend/src --include="*.svelte"
```

Confirm which one is rendered from `ActivityTable.svelte` or wherever the "add content" entry point lives, per AN §7's flag that `AddVideoDialog.svelte` exists alongside `AddVideoPopover.svelte` with a known-flaky test. Generalize whichever is actually live; leave the other alone if unused (or flag it for removal in the PR description if it's dead code — do not silently delete it in this task).

- [ ] **Step 2: Run the existing YouTube test suite to establish the baseline**

```bash
cd frontend
pnpm run test:run -- AddVideoPopover
```
Record: PASS (this is the regression baseline this task must not break).

- [ ] **Step 3: Write the failing tests for the new detection behavior**, added to the renamed test file

```typescript
// frontend/tests/components/AddContentPopover.test.ts — new cases appended after the rename
it('shows an editable type chip once a YouTube URL is detected', async () => {
	render(AddContentPopover, { props: { open: true } });
	const input = screen.getByPlaceholderText(/paste a link or type a reference/i);
	await fireEvent.input(input, { target: { value: 'https://www.youtube.com/watch?v=abc123' } });
	expect(screen.getByText(/detected: youtube/i)).toBeInTheDocument();
});

it('shows book/chapter/verse selects once a Bible reference is detected', async () => {
	render(AddContentPopover, { props: { open: true } });
	const input = screen.getByPlaceholderText(/paste a link or type a reference/i);
	await fireEvent.input(input, { target: { value: 'John 3:16-18' } });
	expect(screen.getByText(/detected: bible passage/i)).toBeInTheDocument();
	expect(screen.getByLabelText(/book/i)).toBeInTheDocument();
});

it('allows overriding a detected type manually', async () => {
	render(AddContentPopover, { props: { open: true } });
	const input = screen.getByPlaceholderText(/paste a link or type a reference/i);
	await fireEvent.input(input, { target: { value: 'John 3:16-18' } });
	await fireEvent.click(screen.getByRole('button', { name: /change type/i }));
	// ... select a different type from whatever override UI is built; assert the chip updates
});

it('shows no type chip for unparseable input, and disables submit', async () => {
	render(AddContentPopover, { props: { open: true } });
	const input = screen.getByPlaceholderText(/paste a link or type a reference/i);
	await fireEvent.input(input, { target: { value: 'garbage input' } });
	expect(screen.getByText(/select a type/i)).toBeInTheDocument();
	expect(screen.getByRole('button', { name: /add/i })).toBeDisabled();
});

it('rejects an end-before-start verse range', async () => {
	render(AddContentPopover, { props: { open: true } });
	// ... fill book/chapter/verse selects with end < start, assert inline error and disabled submit
});
```

(Full coverage per AN §5/§8's stated states — empty/disabled, detecting, detected-YouTube, detected-passage-from-text, detected-passage-from-Bible-Gateway-URL, unparseable, manual override, override-then-retype, invalid range, submit error — the executor should ensure every one of these has a corresponding test, not just the illustrative subset above.)

- [ ] **Step 4: Run to verify the new tests fail and the YouTube regression tests still pass**

```bash
cd frontend
pnpm run test:run -- AddContentPopover
```
Expected: new tests FAIL, pre-existing YouTube-path tests still PASS.

- [ ] **Step 5: Implement the generalized component**

```svelte
<!-- frontend/src/lib/components/AddContentPopover.svelte -->
<script lang="ts">
	import { detectContentType, type DetectionResult } from '$lib/utils/detectContentType';
	import { useAddVideo } from '$lib/queries/content/useAddVideo';
	import { useAddPassage } from '$lib/queries/content/useAddPassage';
	import { BIBLE_BOOKS } from '$lib/utils/bibleStructure';

	let { open = $bindable(false) }: { open: boolean } = $props();

	let inputValue = $state('');
	let manualType = $state<'YOUTUBE' | 'BIBLE_PASSAGE' | null>(null);
	let manualRange = $state<{ bookId: number; startChapter: number; startVerse: number; endChapter: number; endVerse: number } | null>(null);

	const detected = $derived(inputValue ? detectContentType(inputValue) : { type: null } as DetectionResult);
	const effectiveType = $derived(manualType ?? detected.type);

	const addVideo = useAddVideo();
	const addPassage = useAddPassage();

	const canSubmit = $derived.by(() => {
		if (effectiveType === 'YOUTUBE') return detected.type === 'YOUTUBE' || inputValue.length > 0;
		if (effectiveType === 'BIBLE_PASSAGE') {
			const range = manualRange ?? (detected.type === 'BIBLE_PASSAGE' ? detected.range : null);
			return !!range && (range.endChapter > range.startChapter ||
				(range.endChapter === range.startChapter && range.endVerse >= range.startVerse));
		}
		return false;
	});

	async function handleSubmit() {
		if (effectiveType === 'YOUTUBE' && detected.type === 'YOUTUBE') {
			await addVideo.mutateAsync({ url: detected.url });
		} else if (effectiveType === 'BIBLE_PASSAGE') {
			const range = manualRange ?? (detected.type === 'BIBLE_PASSAGE' ? detected.range : null);
			if (range) await addPassage.mutateAsync(range);
		}
		open = false;
	}
</script>

<div>
	<input
		placeholder="Paste a link or type a reference"
		bind:value={inputValue}
		oninput={() => (manualType = null)}
	/>

	{#if effectiveType}
		<span>Detected: {effectiveType === 'YOUTUBE' ? 'YouTube' : 'Bible Passage'}</span>
		<button type="button" onclick={() => (manualType = effectiveType === 'YOUTUBE' ? 'BIBLE_PASSAGE' : 'YOUTUBE')}>
			Change type
		</button>
	{:else}
		<span>Select a type</span>
	{/if}

	{#if effectiveType === 'BIBLE_PASSAGE'}
		<!-- Book -> Chapter -> Verse start/end selects, per spec's PassagePicker
		     (docs/superpowers/specs/2026-09-19-bible-passage-frontend-design.md
		     §3). Bind to manualRange, pre-filled from detected.range if present
		     so a detected reference is editable rather than locked. -->
		<label>
			Book
			<select bind:value={manualRange!.bookId}>
				{#each BIBLE_BOOKS as book (book.id)}
					<option value={book.id}>{book.name}</option>
				{/each}
			</select>
		</label>
		<!-- Chapter/verse-start/verse-end selects follow the same pattern —
		     omitted here for brevity; wire them to manualRange fields and to
		     the invalid-range test above (Step 3). -->
	{/if}

	<button type="button" onclick={handleSubmit} disabled={!canSubmit}>Add</button>
</div>
```

(This is a structural skeleton, not a finished component — the executor fills in the chapter/verse-start/verse-end selects following the same `bind:value={manualRange!.bookId}` pattern shown for Book, and wires `manualRange` initialization from `detected.range` so a detected reference pre-fills the selects rather than requiring re-entry. The skeleton is complete enough that every test in Step 3 has a real implementation path — it is not standing in for logic the tests don't exercise.)

- [ ] **Step 6: Create `useAddPassage.ts`** mirroring `useAddVideo.ts`'s structure

```typescript
// frontend/src/lib/queries/content/useAddPassage.ts
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '$lib/queries/client';
import { queryKeys } from '$lib/queries/keys';
import { gql } from 'graphql-request';

const CREATE_CONTENT_FROM_PASSAGE = gql`
	mutation CreateContentFromPassage($input: CreateContentFromPassageInput!) {
		createContentFromPassage(input: $input) {
			id
			name
			contentType
			displayTitle
		}
	}
`;

export function useAddPassage() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: (range: { bookId: number; startChapter: number; startVerse: number; endChapter: number; endVerse: number }) =>
			graphqlRequest(CREATE_CONTENT_FROM_PASSAGE, {
				input: {
					bookID: range.bookId,
					startChapter: range.startChapter,
					startVerse: range.startVerse,
					endChapter: range.endChapter,
					endVerse: range.endVerse,
					userID: /* current user id — follow useAddVideo.ts's existing pattern for sourcing this */ '',
				},
			}),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.content.list._def, refetchType: 'none' });
		},
	}));
}
```

(Executor: copy `useAddVideo.ts`'s exact pattern for sourcing the current user ID and for the optimistic-cache-insert-on-success behavior — this hook should match its sibling's conventions exactly rather than reinventing them.)

- [ ] **Step 7: Update import sites**

```bash
grep -rln "AddVideoPopover" frontend/src --include="*.svelte" --include="*.ts"
```
Update each to import `AddContentPopover` instead.

- [ ] **Step 8: Run the full test suite**

```bash
cd frontend
pnpm run test:run
```
Expected: all PASS, including every pre-existing YouTube-path test (the regression check) and all new detection/passage tests.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/components/AddContentPopover.svelte frontend/src/lib/queries/content/useAddPassage.ts frontend/tests/components/AddContentPopover.test.ts
git rm frontend/src/lib/components/AddVideoPopover.svelte frontend/tests/components/AddVideoPopover.test.ts
git commit -m "feat(frontend): generalize AddVideoPopover into AddContentPopover with type autodetection (AN Q21)

Existing YouTube add flow is unchanged in behavior; all its tests pass
unmodified alongside new Bible passage detection/creation tests."
```

**PR C2 is now complete.** Open it after PR C merges.

---

## Cross-Task Gaps Flagged During Planning

Two real gaps surfaced while writing this plan, both called out inline at the task where they matter, repeated here so they aren't missed:

1. **BSB verse text was never seeded into a queryable table.** PR A (Task A3) only commits `data/bible/bsb.tsv`. Task C2 requires a `bible_verse_text` table, a seeder step, and a `Query.passageText` resolver that this plan's PR A/B task list does not explicitly include. **Insert this as Task A6 (seeder) and extend Task B5 (resolver) before starting PR C.**
2. **Chapter-only references** (`Psalm 23`) are explicitly unresolved in Task C1 — needs a decision on whether they're in scope for PR C, and if so, a verses-per-chapter data source that `bibleStructure.ts` doesn't currently carry.

Both are structural gaps in this plan, not implementation details to improvise silently — resolve them before or during the relevant task, and update this plan's checkboxes to reflect what was actually decided.
