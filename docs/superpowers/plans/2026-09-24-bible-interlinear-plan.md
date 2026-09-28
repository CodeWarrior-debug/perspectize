# Bible Passage Interlinear ("Show original language") — Implementation Plan (Unit E)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** In the passage details modal, a "Show original language" button lazily loads word alignment so English phrases become hover/tap targets showing the Hebrew or Greek source word (with a short STEPBible meaning), a chips row lists the source words in original order, and a dashed connector ties each phrase to its chip.

**Architecture:** Three sequenced PRs stacked into the long-running integration branch. **E1** prepares the data once (a committed Python normalizer joins the Berean word-alignment table to STEPBible's tagged texts, keeps Berean's original number in `orig_strongs`, and writes versioned release files plus a committed manifest with SHA-256s). **E2** adds the backend (migration for `bible_word` / `bible_lexicon` / `bible_data_version` with primary-key-only indexing, a seeder step that verifies and loads the files, and a `passageInterlinear` GraphQL query). **E3** adds the frontend (lazy query, pure state/geometry helpers, popover, chips, connector, and the wiring into `PassageText`).

**Tech Stack:** Python 3 standard library only (`unittest`, `gzip`, `csv`) for the normalizer; Go + GORM + gqlgen + PostgreSQL 17 (Sevalla-hosted, migrations applied manually) for the backend; SvelteKit, Svelte 5 runes, TanStack Query, Tailwind v4, Vitest for the frontend.

**Spec:** [`docs/superpowers/specs/2026-09-24-bible-interlinear-design.md`](../specs/2026-09-24-bible-interlinear-design.md) (authoritative; it records every measurement this plan relies on) and the prototype scripts in [`docs/superpowers/specs/interlinear-prototype/`](../specs/interlinear-prototype/). Executors read both before starting. Parent decisions: [`2026-09-21-bible-passage-ANSWERS-NEEDED.md`](../specs/2026-09-21-bible-passage-ANSWERS-NEEDED.md) (**AN §N**).

## Global Constraints

- **No chained bash commands (`&&`)** — one command per Bash call (repo rule).
- **Never run `make migrate-up` / `make migrate-down` / `migrate ...`** — `DATABASE_URL` is the shared Sevalla dev database. Migrations are written and reviewed only; applied by a human, per environment. Every PR touching `backend/migrations/` says so in its description. **Never run the seeder against a shared database yourself**; it is a human step.
- **Migration number:** next free is `000026` (23–25 exist). Re-check with `ls backend/migrations | tail -5` and `git log --all --oneline -- 'backend/migrations/*'` at execution time.
- **Indexes: the primary key only** (owner request 2026-09-24). No secondary indexes, no FK indexes, on `bible_word`, `bible_lexicon` or `bible_data_version`.
- **`gofmt -l .` returns empty** in `backend/` and `pnpm exec prettier --write` is run on touched frontend files before each commit.
- **`make graphql-gen` leaves a stray `resolvers/schema.resolvers.go`** — diff it for new stubs, hand-copy them into `content.resolvers.go`, then delete the stray file (AN §7).
- **31,102 is "the current seeded count," never a hard maximum** — no literal denominators (AN Q22).
- **STEPBible attribution is mandatory:** credit "STEP Bible" linked to `www.STEPBible.org` (Tyndale House, CC BY 4.0), visible whenever STEPBible-derived data is on screen. **Use the Gloss column only** — the `Meaning` paragraph in the Hebrew lexicon needs Online Bible's permission (spec, Data sources).
- **Berean's original Strong's number is never modified**: it lives in `orig_strongs`; the disambiguated tag is a separate column `strongs`. Any other value the normalizer overrides keeps its original under an `orig_` name (owner request 2026-09-24).
- **Data files are not committed to git.** Release assets (`bible-word-vN.tsv.gz`, `bible-lexicon-vN.tsv.gz`) live on a GitHub release and are fetched by hand into `data/bible/interlinear/` (gitignored). Only `data/bible/sources.json` (the manifest) is committed. Release assets are **never overwritten**; a new version gets a new name.
- **Long-running feature branch:** stacked PRs into `feature/add-bible-content-types` merge with `gh pr merge N --merge` (a merge commit, not squash). PRs are created with `gh api` (not `gh pr create`) using the templates in `.github/PULL_REQUEST_TEMPLATE/`; no `Closes #N` unless the issue pre-existed. Commit messages end with `Claude-Session: https://claude.ai/code/session_01Kfkcc2ZaZcXxVXajeHS9Uz`.
- **Never read `.env` files.** Secrets are the human's.
- **Testing principle:** stateful UI needs every distinct state exercised; static single-state visuals do not need a unit test.

## Spec adjustments made while planning (review these)

These refine the approved spec without changing behavior; the spec is updated to match in the same PR that lands this plan.

1. **No foreign key.** The spec said `bible_word.verse_id` is an FK to `bible_verse`. There is no `bible_verse` table (ordinals are computed; `bible_verse_text` also has no FK). `bible_word` uses a plain integer, like `bible_verse_text`.
2. **`chunk_text` + `space_before` instead of `pre`/`post`.** The normalizer precomputes each row's final text chunk and whether a space precedes it, so the text-assembly rules live in exactly one place (Python) and Go/TypeScript only concatenate. The rebuilt text must equal `bsb.tsv` (the spec's consistency guard), enforced in the normalizer.
3. **Credit line is rendered by the frontend** (a small component with the required `STEP Bible` link) rather than returned by the API; the text is static.
4. **Truncate-and-load, not upsert.** The seeder truncates and reloads the two data tables inside one transaction so the table always equals the file (an upsert would leave stale rows when a new data version drops a verse). Still idempotent.
5. **The popover is not interactive**, so the spec's "pointer-travel gap must not close it" test does not apply: hover shows it, click pins it, leaving un-pins nothing but the hover.
6. **The chips row is always shown while original-language mode is on** (the merged button), so the popover always anchors beneath the active chip; there is no separate "beneath the text" anchor.

## Review Focus

Input classes and failure modes the spec implies but that are easy to miss. Each has a test in the named task.

1. **A verse with no alignment data** (unseeded environment, the two verses that fail the text guard, the 16 BSB-omitted verses): that verse renders as today's plain text while its neighbors show interlinear; a whole passage with no data shows "Original-language data isn't available for this passage" — not an error, not a retry. → **E2.3, E2.5, E3.5**
2. **A phrase with several source words, and source words with no phrase.** Hovering a phrase activates its first source word in original order; a source word with no phrase (`H1961`, untranslated `-` words) still shows a chip and popover but no connector. → **E2.3, E3.4**
3. **Long passages (31–150 verses, up to ~2,000 words).** The query is skipped until the button is pressed, is never sent over the 150-verse cap, and hover changes must not re-render every chip (event delegation on the containers). → **E3.5, E3.4**
4. **The Genesis 1:1 word-order swap and Psalm titles.** "God" (2nd in English) maps to the 3rd chip and "created" to the 2nd; Psalm 51:1 (title folded into verse 1, three restarting TAHOT word-number runs) aligns fully. → **E1.3, E1.5, E2.3, E3.4**
5. **Right-to-left text and long strings.** Hebrew chips render `dir="rtl"` with combining marks intact; a long parsing string wraps inside the popover instead of overflowing the modal at 375px. → **E3.3**
6. **Loading toggled off mid-request, retry after an error, and a stale pin** (pinned word whose verse then disappears because the passage was collapsed). → **E3.5, E3.2**

## File Structure

**E1 (data):**
- Create `data/bible/scripts/interlinear/` — Python package: `books.py` (verse ordinals), `berean.py` (read table, text chunks, phrase spans), `tagged.py` (TAHOT/TAGNT reader), `lexicon.py` (STEPBible lexicon reader), `align.py` (in-order alignment + fallback), `build.py` (pipeline, TSV writers), `manifest.py` (hashes + `sources.json`).
- Create `data/bible/scripts/normalize_interlinear.py` — command-line entry point.
- Create `data/bible/scripts/interlinear/tests/` — `unittest` tests, `make_fixtures.py`, `fixtures/` (tiny excerpts of the real files).
- Create `data/bible/sources.json` (manifest); modify `data/bible/README.md`, `.gitignore`.

**E2 (backend):**
- Create `backend/migrations/000026_add_bible_interlinear_tables.{up,down}.sql`.
- Create `backend/cmd/seed-bible/interlinear.go` + `interlinear_test.go`; modify `backend/cmd/seed-bible/main.go`.
- Create `backend/internal/core/domain/bible_interlinear.go`; test `backend/test/domain/bible_interlinear_test.go`.
- Modify `backend/internal/core/ports/repositories/bible_reference_repository.go`, `backend/internal/adapters/repositories/postgres/gorm_bible_reference_repository.go` (+ its test).
- Modify `backend/internal/core/ports/services/content_service.go`, `backend/internal/core/services/content_service.go` (+ `backend/test/services/content_service_test.go`).
- Modify `backend/schema.graphql`, `backend/internal/adapters/graphql/resolvers/content.resolvers.go`; regenerate `generated/` and `model/`; extend `backend/test/resolvers/passage_resolver_test.go` and `backend/internal/adapters/graphql/directives/auth_test.go` (mock).

**E3 (frontend):**
- Modify `frontend/src/lib/queries/bible/index.ts`, `frontend/src/lib/queries/keys.ts`.
- Create `frontend/src/lib/utils/interlinear.ts` (+ `frontend/tests/unit/interlinear.test.ts`).
- Create `frontend/src/lib/components/interlinear/{WordPopover,InterlinearPassage,OriginalLanguage,InterlinearCredit}.svelte` (+ tests under `frontend/tests/components/interlinear/`).
- Modify `frontend/src/lib/components/PassageText.svelte` (+ its test).

---

# PR E1: Data preparation (normalizer + manifest)

**Branch:** `feature/bible-interlinear-data` (from updated `feature/add-bible-content-types`). No app-visible behavior change. Python standard library only.

**How to run the tests for this whole PR** (from the repo root; each is one Bash call):

```bash
python3 -m unittest discover -s data/bible/scripts -t data/bible/scripts -v
```

### Task E1.1: Package scaffold, books helper, fixtures, Berean reader and text chunks

**Files:**
- Create: `data/bible/scripts/interlinear/__init__.py` (empty), `data/bible/scripts/interlinear/tests/__init__.py` (empty)
- Create: `data/bible/scripts/interlinear/books.py`
- Create: `data/bible/scripts/interlinear/berean.py`
- Create: `data/bible/scripts/interlinear/tests/make_fixtures.py`
- Create: `data/bible/scripts/interlinear/tests/fixtures/README.md` and the generated fixture files (Step 2)
- Test: `data/bible/scripts/interlinear/tests/test_berean.py`

**Interfaces:**
- Produces `books.load_books(path) -> list[dict]` and `books.verse_ordinal(books, book_id, chapter, verse) -> int`.
- Produces `berean.BereanRow` (frozen dataclass: `verse:int, bsb_sort:int, source_sort:int|None, lang:'heb'|'grc'|None, source:str, translit:str, parse_short:str, parse_full:str, strongs:int|None, english:str, begq:str, pnc:str, endq:str, endtext:str`).
- Produces `berean.read_berean(path) -> dict[int, list[BereanRow]]` (verse ordinal → rows sorted by `bsb_sort`, padding rows removed), `berean.read_bsb(path) -> dict[int, str]`, `berean.piece(row) -> str`, `berean.space_between(prev, nxt) -> bool`, `berean.Chunk(bsb_sort:int, text:str, space_before:bool)`, `berean.build_chunks(rows) -> list[Chunk]`, `berean.render(chunks) -> str`.

- [ ] **Step 1: Write `books.py` and `berean.py`**

```python
# data/bible/scripts/interlinear/books.py
"""Verse ordinals from data/bible/books.json (the same formula the Go and TS code use)."""
import json


def load_books(path):
    with open(path, encoding="utf-8") as fh:
        return sorted(json.load(fh), key=lambda b: b["id"])


def verse_ordinal(books, book_id, chapter, verse):
    """1-based global verse ordinal. Raises KeyError for an unknown book,
    ValueError when the chapter/verse does not exist."""
    offset = 0
    for b in books:
        if b["id"] == book_id:
            vpc = b["versesPerChapter"]
            if not 1 <= chapter <= len(vpc) or not 1 <= verse <= vpc[chapter - 1]:
                raise ValueError(f"{b['name']} {chapter}:{verse} does not exist")
            return offset + sum(vpc[: chapter - 1]) + verse
        offset += sum(b["versesPerChapter"])
    raise KeyError(book_id)
```

```python
# data/bible/scripts/interlinear/berean.py
"""Reads bereanbible.com/bsb_tables.tsv and rebuilds display text from it.

Column indexes were verified against the real file on 2026-09-24 (23 columns).
Rules for text assembly are documented in
docs/superpowers/specs/2026-09-24-bible-interlinear-design.md ("Text-consistency guard").
"""
from __future__ import annotations

import csv
import re
from dataclasses import dataclass

csv.field_size_limit(10**9)

C_HEB_SORT, C_GRK_SORT, C_BSB_SORT, C_VERSE = 0, 1, 2, 3
C_SOURCE, C_TRANSLIT, C_PARSE_SHORT, C_PARSE_FULL = 5, 7, 8, 9
C_STR_HEB, C_STR_GRK = 10, 11
C_BEGQ, C_ENGLISH, C_PNC, C_ENDQ, C_ENDTEXT = 17, 18, 19, 20, 22
N_COLS = 23


@dataclass(frozen=True)
class BereanRow:
    verse: int
    bsb_sort: int
    source_sort: int | None
    lang: str | None  # 'heb', 'grc', or None for an English-only row
    source: str
    translit: str
    parse_short: str
    parse_full: str
    strongs: int | None  # Berean's plain number, exactly as in the file
    english: str  # raw cell (blank vs "-" matters for phrase grouping)
    begq: str
    pnc: str
    endq: str
    endtext: str


def _int(s):
    s = s.strip()
    return int(s) if s.isdigit() else None


def read_berean(path):
    """verse ordinal -> rows sorted by BSB Sort. Padding rows (no Strong's number
    and no text) are dropped. The file's `Verse` column equals our verse ordinal
    for all 31,102 verses (verified)."""
    verses: dict[int, list[BereanRow]] = {}
    with open(path, encoding="utf-8", newline="") as fh:
        reader = csv.reader(fh, delimiter="\t", quotechar=None)
        next(reader)  # header
        for r in reader:
            if len(r) < N_COLS:
                continue
            verse, bsb = _int(r[C_VERSE]), _int(r[C_BSB_SORT])
            if verse is None or bsb is None:
                continue
            heb, grk = _int(r[C_STR_HEB]), _int(r[C_STR_GRK])
            if heb is not None:
                lang, strongs, sort = "heb", heb, _int(r[C_HEB_SORT])
            elif grk is not None:
                lang, strongs, sort = "grc", grk, _int(r[C_GRK_SORT])
            else:
                lang, strongs, sort = None, None, None
            text_cells = (r[C_ENGLISH], r[C_BEGQ], r[C_PNC], r[C_ENDQ], r[C_ENDTEXT])
            if strongs is None and not any(c.strip() for c in text_cells):
                continue  # padding
            verses.setdefault(verse, []).append(
                BereanRow(
                    verse, bsb, sort, lang, r[C_SOURCE], r[C_TRANSLIT],
                    r[C_PARSE_SHORT], r[C_PARSE_FULL], strongs,
                    r[C_ENGLISH], r[C_BEGQ], r[C_PNC], r[C_ENDQ], r[C_ENDTEXT],
                )
            )
    for rows in verses.values():
        rows.sort(key=lambda x: x.bsb_sort)
    return verses


def read_bsb(path):
    """data/bible/bsb.tsv (verse_id<TAB>text) -> {verse_id: text}. Subsets are fine."""
    out = {}
    with open(path, encoding="utf-8") as fh:
        lines = fh.read().split("\n")
    for line in lines[1:]:
        if line.strip() == "" and "\t" not in line:
            continue
        vid, _, text = line.partition("\t")
        out[int(vid)] = text
    return out


_TAG = re.compile(r"<[^>]+>")


def _clean(x):
    return _TAG.sub("", x).replace("[", "").replace("]", "").replace("{", "").replace("}", "")


def scrub_english(e):
    """Drop `vvv` (word translated elsewhere), `. . .` (ellipsis marker) and lone
    `-` (untranslated word), including when embedded in a longer cell."""
    e = re.sub(r"\bvvv\b", " ", e)
    e = re.sub(r"(?:\. ){2}\.", " ", e)
    e = re.sub(r"(^|\s)-(?=\s|$)", " ", e)
    return re.sub(r"\s+", " ", e).strip()


def scrubbed_english(row):
    return scrub_english(_clean(row.english))


def _tidy(s):
    """Some English cells contain stray spaces (' Likewise , every ', ' 1 ,700 ', ' he — Jerubbaal '):
    no space around an em dash, after an opening quote, or before closing punctuation."""
    s = re.sub(r"\s*—\s*", "—", s)
    s = re.sub(r"([“‘(]) ", r"\1", s)
    s = re.sub(r" ([,.;:?!”’)])", r"\1", s)
    return s.strip()


def piece(row):
    """The row's contribution to the verse text: begQ + English + pnc + endQ + End text."""
    beg = "" if "reftext" in row.begq else _clean(row.begq).strip()
    endtext = row.endtext.strip()
    extra = "" if endtext.startswith("[") else _clean(endtext).strip()  # bracketed End text is a duplicate hint
    return _tidy(beg + scrubbed_english(row) + _clean(row.pnc).strip() + _clean(row.endq).strip() + extra)


_OPENERS = "“‘(—"
_NO_SPACE_BEFORE = ",.;:?!”’)—"


def space_between(prev, nxt):
    """Whether a space separates two adjacent non-empty pieces."""
    return not (prev[-1] in _OPENERS or nxt[0] in _NO_SPACE_BEFORE)


@dataclass(frozen=True)
class Chunk:
    bsb_sort: int
    text: str
    space_before: bool


def build_chunks(rows):
    chunks, prev = [], None
    for r in rows:
        t = piece(r)
        if not t:
            continue
        chunks.append(Chunk(r.bsb_sort, t, prev is not None and space_between(prev, t)))
        prev = t
    return chunks


def render(chunks):
    return "".join((" " if c.space_before else "") + c.text for c in chunks)
```

- [ ] **Step 2: Write the fixture generator and generate the fixtures**

The fixtures are tiny excerpts (about 10 verses) of the real files. Download the inputs first (they are not committed; download them with the commands in Task E1.6 Step 5).

```python
# data/bible/scripts/interlinear/tests/make_fixtures.py
#!/usr/bin/env python3
"""Cut small excerpts of the real source files into tests/fixtures/. Run by hand once:

  python3 data/bible/scripts/interlinear/tests/make_fixtures.py \
    --berean bsb_tables.tsv --tahot 'TAHOT Gen-Deu ....txt' 'TAHOT Jos-Est ....txt' 'TAHOT Job-Sng ....txt' \
    --tagnt 'TAGNT Mat-Jhn ....txt' --lex-heb 'TBESH ....txt' --lex-grk 'TBESG ....txt'
"""
import argparse
import csv
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parents[1]))  # data/bible/scripts

from interlinear.books import load_books, verse_ordinal  # noqa: E402

csv.field_size_limit(10**9)
BIBLE = HERE.parents[2]  # data/bible
FIX = HERE / "fixtures"

# (book id, chapter, verse): word-order swap, quotes, em dash, adjacent and
# non-adjacent continuation rows, fattening (H1254B), Psalm title fold, Greek.
VERSES = [(1, 1, 1), (1, 1, 3), (1, 1, 4), (1, 1, 5), (1, 16, 6), (1, 39, 5), (9, 2, 29), (19, 51, 1), (43, 3, 16)]
TAHOT_REFS = {("Gen", 1, 1), ("Gen", 1, 3), ("Gen", 1, 4), ("Gen", 1, 5), ("Gen", 16, 6), ("Gen", 39, 5),
              ("1Sa", 2, 29), ("Psa", 51, 0), ("Psa", 51, 1)}
TAGNT_REFS = {("Jhn", 3, 16)}
REF = re.compile(r"^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)(?:\([^)]*\))?#(\d+)=")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--berean", required=True)
    ap.add_argument("--tahot", nargs="+", required=True)
    ap.add_argument("--tagnt", nargs="+", required=True)
    ap.add_argument("--lex-heb", required=True)
    ap.add_argument("--lex-grk", required=True)
    a = ap.parse_args()

    books = load_books(BIBLE / "books.json")
    ordinals = {verse_ordinal(books, *v) for v in VERSES}
    FIX.mkdir(exist_ok=True)

    numbers = set()  # plain Strong's numbers seen in the Berean excerpt, by language
    with open(a.berean, encoding="utf-8", newline="") as fh, open(FIX / "berean_excerpt.tsv", "w", encoding="utf-8") as out:
        reader = csv.reader(fh, delimiter="\t", quotechar=None)
        header = next(reader)
        out.write("\t".join(header) + "\n")
        for r in reader:
            if len(r) < 23 or not r[3].strip().isdigit() or int(r[3]) not in ordinals:
                continue
            if not (r[10].strip() or r[11].strip() or any(r[i].strip() for i in (17, 18, 19, 20, 22))):
                continue  # padding
            out.write("\t".join(r) + "\n")
            if r[10].strip().isdigit():
                numbers.add(("H", int(r[10])))
            if r[11].strip().isdigit():
                numbers.add(("G", int(r[11])))

    def excerpt(paths, refs, dest):
        with open(FIX / dest, "w", encoding="utf-8") as out:
            for p in paths:
                for line in open(p, encoding="utf-8-sig"):
                    m = REF.match(line)
                    if m and (m.group(1), int(m.group(2)), int(m.group(3))) in refs:
                        out.write(line)

    excerpt(a.tahot, TAHOT_REFS, "tahot_excerpt.txt")
    excerpt(a.tagnt, TAGNT_REFS, "tagnt_excerpt.txt")

    for path, dest, lang in ((a.lex_heb, "lexicon_heb_excerpt.txt", "H"), (a.lex_grk, "lexicon_grk_excerpt.txt", "G")):
        with open(FIX / dest, "w", encoding="utf-8") as out:
            for line in open(path, encoding="utf-8-sig"):
                cols = line.split("\t")
                m = re.match(r"^([HG])(\d+)", cols[0])
                if m and len(cols) >= 8 and m.group(1) == lang and (lang, int(m.group(2))) in numbers:
                    # Keep only the columns through Gloss: the `Meaning` paragraph is not used
                    # (Online Bible permission) and is deliberately not committed.
                    out.write("\t".join(cols[:7] + [""]) + "\n")

    bsb = {}
    with open(BIBLE / "bsb.tsv", encoding="utf-8") as fh:
        for line in fh.read().split("\n")[1:]:
            vid, _, text = line.partition("\t")
            if vid.isdigit() and int(vid) in ordinals:
                bsb[int(vid)] = text
    with open(FIX / "bsb_excerpt.tsv", "w", encoding="utf-8") as out:
        out.write("verse_id\ttext\n")
        for vid in sorted(bsb):
            out.write(f"{vid}\t{bsb[vid]}\n")
    print("wrote fixtures to", FIX)


if __name__ == "__main__":
    main()
```

Run it (one Bash call; download the real inputs first using Task E1.6 Step 5), then confirm the files exist and are small:

```bash
ls -la data/bible/scripts/interlinear/tests/fixtures/
```
Expected: `berean_excerpt.tsv`, `tahot_excerpt.txt`, `tagnt_excerpt.txt`, `lexicon_heb_excerpt.txt`, `lexicon_grk_excerpt.txt`, `bsb_excerpt.tsv` — about 45 KB in total (the fixtures are **committed permanently**; they are the tests' inputs, not temporary files).

Create `fixtures/README.md`:

```markdown
# Test fixtures

Tiny excerpts (about ten verses) of third-party data, used only by the normalizer tests.
Regenerate with `../make_fixtures.py`.

- `berean_excerpt.tsv`, `bsb_excerpt.tsv`: Berean Standard Bible tables/text (public domain; berean.bible/terms.htm).
- `tahot_excerpt.txt`, `tagnt_excerpt.txt`: STEPBible-Data (Tyndale House), CC BY 4.0, credit "STEP Bible" (www.STEPBible.org). Excerpted unchanged.
- `lexicon_*_excerpt.txt`: the same source, cut down to the columns through `Gloss` (the `Meaning` paragraph is intentionally not committed). This is a modification of the data for test use; the gloss values are unchanged.
```

- [ ] **Step 3: Write the failing tests**

```python
# data/bible/scripts/interlinear/tests/test_berean.py
import unittest
from pathlib import Path

from interlinear.berean import (
    BereanRow, build_chunks, piece, read_berean, read_bsb, render, space_between,
)
from interlinear.books import load_books, verse_ordinal

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
BOOKS = load_books(HERE.parents[2] / "books.json")


def row(**kw):
    base = dict(verse=1, bsb_sort=1, source_sort=None, lang=None, source="", translit="",
                parse_short="", parse_full="", strongs=None, english="", begq="", pnc="",
                endq="", endtext="")
    base.update(kw)
    return BereanRow(**base)


class BooksTests(unittest.TestCase):
    def test_known_ordinals(self):
        self.assertEqual(verse_ordinal(BOOKS, 1, 1, 1), 1)
        self.assertEqual(verse_ordinal(BOOKS, 43, 3, 16), 26137)  # John 3:16 (matches the file's Verse column)
        self.assertEqual(verse_ordinal(BOOKS, 66, 22, 21), 31102)

    def test_rejects_nonexistent_verse(self):
        with self.assertRaises(ValueError):
            verse_ordinal(BOOKS, 1, 1, 99)


class PieceTests(unittest.TestCase):
    def test_untranslated_and_moved_markers_produce_no_text(self):
        self.assertEqual(piece(row(strongs=853, english=" - ")), "")
        self.assertEqual(piece(row(strongs=3361, english=" vvv ")), "")
        self.assertEqual(piece(row(english=" . . . ")), "")

    def test_markers_embedded_in_a_phrase_are_removed(self):
        self.assertEqual(piece(row(english=" named vvv him ")), "named him")
        self.assertEqual(piece(row(english=" - There ")), "There")
        self.assertEqual(piece(row(english=" numbered . . . 40,500 ")), "numbered 40,500")

    def test_supplied_word_brackets_and_html_are_stripped(self):
        self.assertEqual(piece(row(english=" [was] good ")), "was good")
        self.assertEqual(piece(row(english=" fifty {each} ", endtext="”</span>")), "fifty each”")

    def test_closing_quote_can_live_in_end_text_but_bracketed_end_text_is_ignored(self):
        self.assertEqual(piece(row(english=" his heel ", pnc=".", endtext="” ")), "his heel.”")
        self.assertEqual(piece(row(english=" on it ", pnc=".", endq="’", endtext="[’’]")), "on it.’")

    def test_stray_spaces_inside_a_cell_are_tidied(self):
        self.assertEqual(piece(row(english=" Likewise , every ")), "Likewise, every")
        self.assertEqual(piece(row(english=" 1 ,700 shekels ")), "1,700 shekels")
        self.assertEqual(piece(row(english=" he — Jerubbaal ")), "he—Jerubbaal")
        self.assertEqual(piece(row(english=" “No , ”", pnc="")), "“No,”")

    def test_reftext_verse_number_spans_are_dropped(self):
        self.assertEqual(piece(row(begq="<span class=|reftext|><a href=|#|><b>1</b></a></span>", english=" Blessed ")), "Blessed")


class SpaceTests(unittest.TestCase):
    def test_rules(self):
        self.assertTrue(space_between("said,", "“Let"))
        self.assertFalse(space_between("“", "Let"))          # after an opening quote
        self.assertFalse(space_between("light", ",”"))       # before closing punctuation
        self.assertFalse(space_between("morning—", "the"))   # after an em dash
        self.assertFalse(space_between("you", "—birds"))     # before an em dash
        self.assertTrue(space_between("the", "earth"))


class FixtureTextTests(unittest.TestCase):
    """The consistency guard: text rebuilt from the alignment equals bsb.tsv."""

    @classmethod
    def setUpClass(cls):
        cls.verses = read_berean(FIX / "berean_excerpt.tsv")
        cls.bsb = read_bsb(FIX / "bsb_excerpt.tsv")

    def test_every_fixture_verse_rebuilds_exactly(self):
        self.assertGreaterEqual(len(self.bsb), 9)
        for verse, text in self.bsb.items():
            self.assertEqual(render(build_chunks(self.verses[verse])), text, f"verse {verse}")

    def test_padding_rows_are_not_read(self):
        for rows in self.verses.values():
            for r in rows:
                self.assertTrue(r.strongs is not None or r.english.strip() or r.begq.strip() or r.pnc.strip()
                                or r.endq.strip() or r.endtext.strip())

    def test_verse_column_is_the_ordinal(self):
        self.assertIn(verse_ordinal(BOOKS, 43, 3, 16), self.verses)
        self.assertIn(verse_ordinal(BOOKS, 9, 2, 29), self.verses)

    def test_greek_rows_use_greek_sort_and_hebrew_rows_hebrew_sort(self):
        john = self.verses[verse_ordinal(BOOKS, 43, 3, 16)]
        self.assertTrue(all(r.lang == "grc" for r in john if r.strongs is not None))
        gen = self.verses[1]
        self.assertTrue(all(r.lang == "heb" for r in gen if r.strongs is not None))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 4: Run the tests and see them pass** (the implementation was written in Step 1; if any assertion fails, fix the rule in `berean.py`, not the test — the expected strings come from real data)

Run: `python3 -m unittest discover -s data/bible/scripts -t data/bible/scripts -v`
Expected: all tests in `test_berean.py` PASS. If `test_every_fixture_verse_rebuilds_exactly` fails, print the differing verse and compare with the spec's rebuild rules before changing anything.

- [ ] **Step 5: Commit**

```bash
git add data/bible/scripts/interlinear
git commit -m "feat(data): interlinear normalizer scaffold — Berean reader and text chunks"
```

### Task E1.2: Phrase spans (`span_head`)

**Files:**
- Modify: `data/bible/scripts/interlinear/berean.py`
- Test: `data/bible/scripts/interlinear/tests/test_spans.py`

**Interfaces:**
- Consumes `BereanRow`, `scrubbed_english` from Task E1.1.
- Produces `berean.assign_span_heads(rows) -> list[int | None]` — for each row (same order), the `bsb_sort` of the first row of the English phrase it belongs to, or `None` when it belongs to no phrase.

Rules (verified on the real file): a row with English text starts a phrase (`head = its own bsb_sort`). A word row whose English cell is truly blank (not `-`, not `vvv`) and whose `bsb_sort` is exactly 1 after the previous row continues that row's phrase (1,050 of 1,104 cases). Any other word row (untranslated `-`, `vvv`, or a blank-English row that is not adjacent, such as `H1961` at Genesis 39:5) belongs to no phrase.

- [ ] **Step 1: Write the failing test**

```python
# data/bible/scripts/interlinear/tests/test_spans.py
import unittest
from pathlib import Path

from interlinear.berean import assign_span_heads, read_berean
from interlinear.books import load_books, verse_ordinal

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
BOOKS = load_books(HERE.parents[2] / "books.json")


def rows_for(verses, book, ch, v):
    return verses[verse_ordinal(BOOKS, book, ch, v)]


def find(rows, strongs, **where):
    hits = [(i, r) for i, r in enumerate(rows) if r.strongs == strongs and all(getattr(r, k) == val for k, val in where.items())]
    assert hits, (strongs, where)
    return hits[0]


class SpanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.verses = read_berean(FIX / "berean_excerpt.tsv")

    def test_a_row_with_english_heads_its_own_phrase(self):
        rows = rows_for(self.verses, 43, 3, 16)
        heads = assign_span_heads(rows)
        i, r = find(rows, 3439)  # "one and only"
        self.assertEqual(heads[i], r.bsb_sort)

    def test_untranslated_and_moved_words_belong_to_no_phrase(self):
        rows = rows_for(self.verses, 43, 3, 16)
        heads = assign_span_heads(rows)
        i, _ = find(rows, 3361)  # `vvv`
        self.assertIsNone(heads[i])
        i, _ = find(rows, 3588, english=" - ")  # untranslated article
        self.assertIsNone(heads[i])

    def test_adjacent_blank_english_row_continues_the_previous_phrase(self):
        rows = rows_for(self.verses, 1, 16, 6)
        heads = assign_span_heads(rows)
        i_cont, cont = find(rows, 5869)
        i_prev, prev = find(rows, 2896)  # "whatever you want"
        self.assertEqual(cont.bsb_sort, prev.bsb_sort + 1)
        self.assertEqual(heads[i_cont], prev.bsb_sort)

    def test_non_adjacent_blank_english_row_belongs_to_no_phrase(self):
        rows = rows_for(self.verses, 1, 39, 5)
        heads = assign_span_heads(rows)
        i, r = find(rows, 1961, bsb_sort=26888)  # H1961 far after the padding rows
        self.assertEqual(r.english.strip(), "")
        self.assertIsNone(heads[i])

    def test_english_only_rows_do_not_crash_and_head_themselves_when_they_have_text(self):
        rows = rows_for(self.verses, 1, 1, 1)
        heads = assign_span_heads(rows)
        self.assertEqual(len(heads), len(rows))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails**

Run: `python3 -m unittest interlinear.tests.test_spans -v` (from `data/bible/scripts`) — or the discover command above.
Expected: FAIL (`ImportError: cannot import name 'assign_span_heads'`).

- [ ] **Step 3: Implement**

Append to `berean.py`:

```python
def assign_span_heads(rows):
    """For each row, the bsb_sort of the first row of its English phrase, or None."""
    heads: list[int | None] = []
    prev = None
    prev_head = None
    for r in rows:
        if scrubbed_english(r):
            head = r.bsb_sort
        elif (
            r.strongs is not None
            and r.english.strip() == ""
            and prev is not None
            and prev_head is not None
            and r.bsb_sort == prev.bsb_sort + 1
        ):
            head = prev_head
        else:
            head = None
        heads.append(head)
        prev, prev_head = r, head
    return heads
```

- [ ] **Step 3: Run to verify it passes**

Run: `python3 -m unittest discover -s data/bible/scripts -t data/bible/scripts -v`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add data/bible/scripts/interlinear
git commit -m "feat(data): assign phrase heads for interlinear source words"
```

### Task E1.3: STEPBible tagged texts and lexicon readers

**Files:**
- Create: `data/bible/scripts/interlinear/tagged.py`, `data/bible/scripts/interlinear/lexicon.py`
- Test: `data/bible/scripts/interlinear/tests/test_tagged.py`

**Interfaces:**
- Produces `tagged.read_tagged(paths, books) -> tuple[dict[int, list[list[str]]], list[str]]` — verse ordinal → per-word lists of lexical tags **in file order**, plus the list of refs skipped (out-of-range). Hebrew: tags are the `{…}` items in column 4; Greek: the tag before `=` in column 3.
- Produces `lexicon.LexEntry(tag, plain, language, gloss)` and `lexicon.read_lexicon(paths) -> list[LexEntry]` in file order (Gloss column only).

- [ ] **Step 1: Write the failing test**

```python
# data/bible/scripts/interlinear/tests/test_tagged.py
import unittest
from pathlib import Path

from interlinear.books import load_books, verse_ordinal
from interlinear.lexicon import read_lexicon
from interlinear.tagged import read_tagged

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
BOOKS = load_books(HERE.parents[2] / "books.json")


def num(tag):
    import re
    return int(re.match(r"[HG](\d+)", tag).group(1))


class TaggedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tagged, cls.skipped = read_tagged([FIX / "tahot_excerpt.txt", FIX / "tagnt_excerpt.txt"], BOOKS)

    def test_no_reference_is_skipped(self):
        self.assertEqual(self.skipped, [])

    def test_genesis_1_1_tags_are_disambiguated(self):
        words = self.tagged[1]
        self.assertEqual([w[0] for w in words], ["H7225G", "H1254A", "H0430G", "H0853", "H8064", "H0853", "H0776G"])

    def test_1_samuel_2_29_fattening_is_H1254B(self):
        words = self.tagged[verse_ordinal(BOOKS, 9, 2, 29)]
        self.assertEqual(words[11][0], "H1254B")   # word #12
        self.assertEqual(words[12][0], "H7225H")   # "from the choicest of" — the sub-meaning

    def test_psalm_title_is_folded_into_verse_one_in_file_order(self):
        # TAHOT word numbers restart at each Hebrew verse (title = 51.1-51.2, then English 51.1 = Hebrew 51.3):
        # they must NOT be sorted by word number.
        words = self.tagged[verse_ordinal(BOOKS, 19, 51, 1)]
        self.assertEqual([num(w[0]) for w in words],
                         [5329, 4210, 1732, 935, 413, 5416, 5030, 834, 935, 413, 1339, 1339, 2603, 430, 2617, 7230, 7356, 4229, 6588])

    def test_greek_tags_come_from_the_dstrong_column(self):
        words = self.tagged[verse_ordinal(BOOKS, 43, 3, 16)]
        tags = [w[0] for w in words]
        self.assertIn("G3439", tags)
        self.assertIn("G5207", tags)
        self.assertEqual(len(words), 26)  # includes the NA28-absent variant word #11


class LexiconTests(unittest.TestCase):
    def test_reads_gloss_only_and_plain_number(self):
        entries = read_lexicon([FIX / "lexicon_heb_excerpt.txt", FIX / "lexicon_grk_excerpt.txt"])
        by_tag = {e.tag: e for e in entries}
        self.assertEqual(by_tag["H1254A"].gloss, "to create")
        self.assertEqual(by_tag["H1254B"].gloss, "to fatten")
        self.assertEqual(by_tag["H1254A"].plain, "H1254")
        self.assertEqual(by_tag["H1254A"].language, "heb")
        self.assertEqual(by_tag["G3439"].gloss, "unique")
        self.assertEqual(by_tag["G3439"].language, "grc")
        self.assertEqual(by_tag["H7225H"].gloss, "first: best")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL (`ModuleNotFoundError: interlinear.tagged`).

- [ ] **Step 3: Implement**

```python
# data/bible/scripts/interlinear/tagged.py
"""STEPBible TAHOT (Hebrew OT) / TAGNT (Greek NT) readers.

Every word carries its exact disambiguated Strong's tag. English (NRSV) references
are used; a Psalm title is verse .0 and is folded into verse 1 (the BSB prints the
title inside its verse 1). Word numbers restart at every Hebrew verse, so words are
kept in FILE order and never sorted by number.
"""
import re

from .books import verse_ordinal

ABBR = ["Gen", "Exo", "Lev", "Num", "Deu", "Jos", "Jdg", "Rut", "1Sa", "2Sa", "1Ki", "2Ki", "1Ch", "2Ch", "Ezr", "Neh",
        "Est", "Job", "Psa", "Pro", "Ecc", "Sng", "Isa", "Jer", "Lam", "Ezk", "Dan", "Hos", "Jol", "Amo", "Oba", "Jon",
        "Mic", "Nam", "Hab", "Zep", "Hag", "Zec", "Mal", "Mat", "Mrk", "Luk", "Jhn", "Act", "Rom", "1Co", "2Co", "Gal",
        "Eph", "Php", "Col", "1Th", "2Th", "1Ti", "2Ti", "Tit", "Phm", "Heb", "Jas", "1Pe", "2Pe", "1Jn", "2Jn", "3Jn",
        "Jud", "Rev"]
_ABBR_ID = {a: i + 1 for i, a in enumerate(ABBR)}
_REF = re.compile(r"^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)(?:\([^)]*\))?#(\d+)=")
_BRACED = re.compile(r"\{([HG]\d+[A-Za-z]?)\}")
_LEADING = re.compile(r"^([HG]\d+[A-Za-z]?)")


def _tags(cols):
    if len(cols) > 4:
        braced = _BRACED.findall(cols[4])
        if braced:
            return braced
    if len(cols) > 3:
        m = _LEADING.match(cols[3])
        if m:
            return [m.group(1)]
    return []


def read_tagged(paths, books):
    out: dict[int, list[list[str]]] = {}
    skipped: list[str] = []
    for path in paths:
        with open(path, encoding="utf-8-sig") as fh:
            for line in fh:
                m = _REF.match(line)
                if not m or m.group(1) not in _ABBR_ID:
                    continue
                cols = line.rstrip("\n").split("\t")
                tags = _tags(cols)
                if not tags:
                    continue
                book, chapter, verse = _ABBR_ID[m.group(1)], int(m.group(2)), int(m.group(3))
                if verse == 0:
                    verse = 1
                try:
                    ordinal = verse_ordinal(books, book, chapter, verse)
                except (ValueError, KeyError):
                    skipped.append(f"{m.group(1)}.{chapter}.{m.group(3)}")
                    continue
                out.setdefault(ordinal, []).append(tags)
    return out, skipped
```

```python
# data/bible/scripts/interlinear/lexicon.py
"""STEPBible brief lexicons (TBESH / TBESG). Gloss column ONLY: the Hebrew `Meaning`
paragraph derives from Online Bible's abridged BDB and needs their permission."""
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class LexEntry:
    tag: str      # disambiguated, e.g. H1254B
    plain: str    # plain Strong's key, e.g. H1254
    language: str  # 'heb' | 'grc'
    gloss: str


def read_lexicon(paths):
    entries = []
    for path in paths:
        with open(path, encoding="utf-8-sig") as fh:
            for line in fh:
                cols = line.rstrip("\n").split("\t")
                if len(cols) < 8:
                    continue
                e = re.match(r"^([HG])(\d+)", cols[0])
                d = re.match(r"^([HG]\d+[A-Za-z]?)", cols[1])
                if not e or not d:
                    continue
                entries.append(LexEntry(
                    tag=d.group(1),
                    plain=f"{e.group(1)}{int(e.group(2))}",
                    language="heb" if e.group(1) == "H" else "grc",
                    gloss=cols[6].strip(),
                ))
    return entries
```

- [ ] **Step 4: Run to verify it passes**

Run: `python3 -m unittest discover -s data/bible/scripts -t data/bible/scripts -v`
Expected: PASS. (`test_greek_tags…` expects 26 words because TAGNT lists the variant `αὐτοῦ` that Berean omits; the alignment in E1.4 tolerates it.)

- [ ] **Step 5: Commit**

```bash
git add data/bible/scripts/interlinear
git commit -m "feat(data): read STEPBible tagged texts and lexicons"
```

### Task E1.4: In-order alignment and fallback

**Files:**
- Create: `data/bible/scripts/interlinear/align.py`
- Test: `data/bible/scripts/interlinear/tests/test_align.py`

**Interfaces:**
- Produces `align.tag_number(tag) -> int`, `align.plain_key(lang, number) -> str` (`'heb', 1254 -> 'H1254'`), `align.lcs_align(numbers: list[int], words: list[list[str]]) -> dict[int, str]` (index into `numbers` → chosen tag), and `align.Fallback(lexicon)` with `.observe(plain, tag)` and `.choose(plain) -> str`.

Do **not** pair unaligned words by position (measured: it produces wrong meanings). Unaligned words use `Fallback.choose`: the plain number's most common tag across the Bible that has a gloss, then the first lexicon tag for that number, else `""`.

- [ ] **Step 1: Write the failing test**

```python
# data/bible/scripts/interlinear/tests/test_align.py
import unittest
from pathlib import Path

from interlinear.align import Fallback, lcs_align, plain_key, tag_number
from interlinear.books import load_books, verse_ordinal
from interlinear.lexicon import LexEntry, read_lexicon
from interlinear.tagged import read_tagged

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
BOOKS = load_books(HERE.parents[2] / "books.json")


class LcsTests(unittest.TestCase):
    def test_tag_number_and_plain_key(self):
        self.assertEqual(tag_number("H0430G"), 430)
        self.assertEqual(tag_number("G3439"), 3439)
        self.assertEqual(plain_key("heb", 1254), "H1254")
        self.assertEqual(plain_key("grc", 3439), "G3439")

    def test_tolerates_an_inserted_tagged_word(self):
        # the tagged text has one extra word (a variant the BSB omits)
        got = lcs_align([1, 2, 3], [["H0001"], ["H0009"], ["H0002"], ["H0003"]])
        self.assertEqual(got, {0: "H0001", 1: "H0002", 2: "H0003"})

    def test_a_word_whose_number_differs_is_left_unaligned_not_guessed(self):
        # Genesis 1:4 "good": Berean uses 2896, the tagged text H2895 (same word, same position)
        tagged, _ = read_tagged([FIX / "tahot_excerpt.txt"], BOOKS)
        numbers = [7200, 430, 853, 216, 3588, 2896, 914, 430, 996, 216, 996, 2822]
        got = lcs_align(numbers, tagged[4])
        self.assertEqual(len(got), 11)
        self.assertNotIn(5, got)   # index of 2896
        self.assertEqual(got[4], "H3588A")

    def test_genesis_1_1_word_order_swap_is_aligned_by_source_order(self):
        # Berean rows sorted by Heb Sort: 7225, 1254, 430, 853, 8064, 853, 776
        tagged, _ = read_tagged([FIX / "tahot_excerpt.txt"], BOOKS)
        got = lcs_align([7225, 1254, 430, 853, 8064, 853, 776], tagged[1])
        self.assertEqual(got[1], "H1254A")
        self.assertEqual(got[2], "H0430G")
        self.assertEqual(len(got), 7)

    def test_psalm_51_verse_1_aligns_completely(self):
        tagged, _ = read_tagged([FIX / "tahot_excerpt.txt"], BOOKS)
        numbers = [5329, 4210, 1732, 935, 413, 5416, 5030, 834, 935, 413, 1339, 1339, 2603, 430, 2617, 7230, 7356, 4229, 6588]
        self.assertEqual(len(lcs_align(numbers, tagged[verse_ordinal(BOOKS, 19, 51, 1)])), len(numbers))


class FallbackTests(unittest.TestCase):
    LEX = [
        LexEntry("H5892A", "H5892", "heb", "excitement"),
        LexEntry("H5892B", "H5892", "heb", "city"),
        LexEntry("G3708G", "G3708", "grc", "to see: see"),
    ]

    def test_uses_the_most_common_tag_not_the_first_lexicon_row(self):
        fb = Fallback(self.LEX)
        for _ in range(3):
            fb.observe("H5892", "H5892B")
        fb.observe("H5892", "H5892A")
        self.assertEqual(fb.choose("H5892"), "H5892B")

    def test_skips_a_most_common_tag_that_has_no_gloss(self):
        fb = Fallback(self.LEX)
        for _ in range(5):
            fb.observe("G3708", "G3708")     # in the tagged text but absent from the lexicon
        fb.observe("G3708", "G3708G")
        self.assertEqual(fb.choose("G3708"), "G3708G")

    def test_falls_back_to_first_lexicon_row_then_empty(self):
        fb = Fallback(self.LEX)
        self.assertEqual(fb.choose("H5892"), "H5892A")   # never observed
        self.assertEqual(fb.choose("H9999"), "")

    def test_real_lexicon_fixture_loads(self):
        fb = Fallback(read_lexicon([FIX / "lexicon_heb_excerpt.txt", FIX / "lexicon_grk_excerpt.txt"]))
        self.assertTrue(fb.choose("H1254").startswith("H1254"))


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL (`ModuleNotFoundError: interlinear.align`).

- [ ] **Step 3: Implement**

```python
# data/bible/scripts/interlinear/align.py
"""In-order alignment of Berean word rows to STEPBible tagged words, plus the fallback rule."""
import re
from collections import Counter, defaultdict


def tag_number(tag):
    return int(re.match(r"[HG](\d+)", tag).group(1))


def plain_key(lang, number):
    return ("H" if lang == "heb" else "G") + str(number)


def lcs_align(numbers, words):
    """Longest in-order match between Berean numbers (source order) and tagged words.
    Returns {index into numbers: chosen tag}. A word whose number differs between the two
    datasets stays unaligned (see the spec: positional pairing gives wrong meanings)."""
    n, m = len(numbers), len(words)

    def ok(i, j):
        return any(tag_number(t) == numbers[i] for t in words[j])

    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            dp[i][j] = dp[i + 1][j + 1] + 1 if ok(i, j) else max(dp[i + 1][j], dp[i][j + 1])
    out, i, j = {}, 0, 0
    while i < n and j < m:
        if ok(i, j) and dp[i][j] == dp[i + 1][j + 1] + 1:
            out[i] = next(t for t in words[j] if tag_number(t) == numbers[i])
            i += 1
            j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]:
            i += 1
        else:
            j += 1
    return out


class Fallback:
    """Meaning for a word the join could not align: the plain number's most common tag across
    the Bible that has a gloss (right 79.0% of the time when measured; first-lexicon-row was 71.1%),
    then the first lexicon tag for that number, else empty."""

    def __init__(self, lexicon):
        self._gloss = {e.tag: e.gloss for e in lexicon}
        self._first = {}
        for e in lexicon:
            self._first.setdefault(e.plain, e.tag)
        self._freq = defaultdict(Counter)

    def observe(self, plain, tag):
        self._freq[plain][tag] += 1

    def choose(self, plain):
        for tag, _ in self._freq[plain].most_common():
            if self._gloss.get(tag):
                return tag
        return self._first.get(plain, "")
```

- [ ] **Step 4: Run to verify it passes**

Run: `python3 -m unittest discover -s data/bible/scripts -t data/bible/scripts -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add data/bible/scripts/interlinear
git commit -m "feat(data): in-order alignment and fallback rule for interlinear tags"
```

### Task E1.5: Build pipeline and TSV writers

**Files:**
- Create: `data/bible/scripts/interlinear/build.py`
- Test: `data/bible/scripts/interlinear/tests/test_build.py`

**Interfaces:**
- Consumes everything from E1.1–E1.4.
- Produces `build.WORD_HEADER` (14 columns, in this exact order — the Go seeder parses the same), `build.LEXICON_HEADER`, `build.WordRow`, `build.BuildReport`, `build.build(berean, tagged, lexicon, bsb) -> tuple[list[WordRow], BuildReport]`, `build.write_word_tsv_gz(rows, path)`, `build.write_lexicon_tsv_gz(entries, path)`, `build.sha256_of(path) -> str`.

**File formats (the contract with E2):**
- `bible-word-vN.tsv.gz`: header `verse\tbsb_sort\tlanguage\tsource_sort\tsource\ttranslit\tparse_short\tparse_full\torig_strongs\tstrongs\tstrongs_source\tspan_head\tchunk_text\tspace_before`. `verse` is the verse ordinal; `language` is `heb`/`grc` or empty for an English-only row; integers empty when NULL; `strongs_source` is `tagged` or `fallback` (empty for English-only rows); `space_before` is `1` or `0`. No field may contain a tab or newline (the writer raises).
- `bible-lexicon-vN.tsv.gz`: header `tag\tplain\tlanguage\tgloss`.
- Gzip is deterministic (`mtime=0`, no filename) so the SHA-256 is reproducible.

- [ ] **Step 1: Write the failing test**

```python
# data/bible/scripts/interlinear/tests/test_build.py
import gzip
import tempfile
import unittest
from pathlib import Path

from interlinear.berean import read_berean, read_bsb
from interlinear.books import load_books, verse_ordinal
from interlinear.build import WORD_HEADER, build, sha256_of, write_lexicon_tsv_gz, write_word_tsv_gz
from interlinear.lexicon import read_lexicon
from interlinear.tagged import read_tagged

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
BOOKS = load_books(HERE.parents[2] / "books.json")


def load(bsb=None):
    berean = read_berean(FIX / "berean_excerpt.tsv")
    tagged, _ = read_tagged([FIX / "tahot_excerpt.txt", FIX / "tagnt_excerpt.txt"], BOOKS)
    lex = read_lexicon([FIX / "lexicon_heb_excerpt.txt", FIX / "lexicon_grk_excerpt.txt"])
    return build(berean, tagged, lex, bsb if bsb is not None else read_bsb(FIX / "bsb_excerpt.tsv")), lex


def words(rows, verse, orig):
    return [r for r in rows if r.verse == verse and r.orig_strongs == orig]


class BuildTests(unittest.TestCase):
    def test_genesis_1_1_tags(self):
        (rows, _), _ = load()
        self.assertEqual(words(rows, 1, 1254)[0].strongs, "H1254A")
        self.assertEqual(words(rows, 1, 430)[0].strongs, "H0430G")
        self.assertEqual(words(rows, 1, 7225)[0].strongs, "H7225G")
        self.assertEqual(words(rows, 1, 1254)[0].strongs_source, "tagged")

    def test_1_samuel_2_29_is_the_fattening_sense(self):
        (rows, _), _ = load()
        v = verse_ordinal(BOOKS, 9, 2, 29)
        self.assertEqual(words(rows, v, 1254)[0].strongs, "H1254B")
        self.assertEqual(words(rows, v, 7225)[0].strongs, "H7225H")

    def test_john_3_16(self):
        (rows, _), _ = load()
        v = verse_ordinal(BOOKS, 43, 3, 16)
        self.assertEqual(words(rows, v, 3439)[0].strongs, "G3439")
        self.assertEqual(words(rows, v, 5207)[0].strongs, "G5207")

    def test_original_number_is_never_modified(self):
        (rows, _), _ = load()
        berean = read_berean(FIX / "berean_excerpt.tsv")
        for verse, brows in berean.items():
            want = sorted(r.strongs for r in brows if r.strongs is not None)
            got = sorted(r.orig_strongs for r in rows if r.verse == verse and r.orig_strongs is not None)
            self.assertEqual(got, want, f"verse {verse}")

    def test_unaligned_word_falls_back_and_is_marked(self):
        (rows, _), _ = load()
        good = words(rows, 4, 2896)[0]   # Genesis 1:4 "good": Berean 2896 vs tagged H2895
        self.assertEqual(good.strongs_source, "fallback")
        self.assertTrue(good.strongs.startswith("H2896"))

    def test_the_god_created_swap_is_in_source_order_via_source_sort(self):
        (rows, _), _ = load()
        by_sort = sorted(words(rows, 1, 1254) + words(rows, 1, 430), key=lambda r: r.source_sort)
        self.assertEqual([r.orig_strongs for r in by_sort], [1254, 430])   # Hebrew order: created, then God
        english = sorted(words(rows, 1, 1254) + words(rows, 1, 430), key=lambda r: r.bsb_sort)
        self.assertEqual([r.orig_strongs for r in english], [430, 1254])   # English order: God, then created

    def test_phrase_heads_and_chunks_ride_along(self):
        (rows, _), _ = load()
        beginning = words(rows, 1, 7225)[0]
        self.assertEqual(beginning.span_head, beginning.bsb_sort)
        self.assertEqual(beginning.chunk_text, "In the beginning")
        self.assertFalse(beginning.space_before)

    def test_a_verse_that_fails_the_text_guard_is_skipped_entirely(self):
        bsb = read_bsb(FIX / "bsb_excerpt.tsv")
        bsb[1] = bsb[1] + " EXTRA"
        (rows, report), _ = load(bsb)
        self.assertNotIn(1, {r.verse for r in rows})
        self.assertEqual(report.skipped_verses, [1])

    def test_no_row_lacks_content(self):
        (rows, _), _ = load()
        for r in rows:
            self.assertTrue(r.language or r.chunk_text)


class WriterTests(unittest.TestCase):
    def test_word_tsv_round_trips_and_gzip_is_deterministic(self):
        (rows, _), lex = load()
        with tempfile.TemporaryDirectory() as d:
            a, b, lx = Path(d) / "a.tsv.gz", Path(d) / "b.tsv.gz", Path(d) / "lex.tsv.gz"
            write_word_tsv_gz(rows, a)
            write_word_tsv_gz(rows, b)
            self.assertEqual(sha256_of(a), sha256_of(b))
            lines = gzip.decompress(a.read_bytes()).decode("utf-8").rstrip("\n").split("\n")
            self.assertEqual(lines[0], "\t".join(WORD_HEADER))
            self.assertEqual(len(lines) - 1, len(rows))
            self.assertTrue(all(len(l.split("\t")) == 14 for l in lines))
            write_lexicon_tsv_gz(lex, lx)
            llines = gzip.decompress(lx.read_bytes()).decode("utf-8").rstrip("\n").split("\n")
            self.assertEqual(llines[0], "tag\tplain\tlanguage\tgloss")

    def test_a_tab_inside_a_field_is_rejected(self):
        (rows, _), _ = load()
        bad = rows[0].__class__(**{**rows[0].__dict__, "source": "bad\tvalue"})
        with tempfile.TemporaryDirectory() as d:
            with self.assertRaises(ValueError):
                write_word_tsv_gz([bad], Path(d) / "x.tsv.gz")


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL (`ModuleNotFoundError: interlinear.build`).

- [ ] **Step 3: Implement**

```python
# data/bible/scripts/interlinear/build.py
"""Pipeline: Berean rows + STEPBible tags + lexicon -> bible_word / bible_lexicon TSVs."""
from __future__ import annotations

import gzip
import hashlib
from collections import Counter
from dataclasses import dataclass, field

from .align import Fallback, lcs_align, plain_key
from .berean import assign_span_heads, build_chunks, render

WORD_HEADER = ["verse", "bsb_sort", "language", "source_sort", "source", "translit", "parse_short", "parse_full",
               "orig_strongs", "strongs", "strongs_source", "span_head", "chunk_text", "space_before"]
LEXICON_HEADER = ["tag", "plain", "language", "gloss"]


@dataclass
class WordRow:
    verse: int
    bsb_sort: int
    language: str          # 'heb' | 'grc' | '' (English-only row)
    source_sort: int | None
    source: str
    translit: str
    parse_short: str
    parse_full: str
    orig_strongs: int | None
    strongs: str
    strongs_source: str    # 'tagged' | 'fallback' | ''
    span_head: int | None
    chunk_text: str
    space_before: bool


@dataclass
class BuildReport:
    verses: int = 0
    rows: int = 0
    word_rows: int = 0
    tagged: int = 0
    fallback: int = 0
    skipped_verses: list = field(default_factory=list)

    def text(self):
        pct = 100 * self.tagged / self.word_rows if self.word_rows else 0
        return (f"verses: {self.verses}  rows: {self.rows}  word rows: {self.word_rows}  "
                f"tagged: {self.tagged} ({pct:.2f}%)  fallback: {self.fallback}  skipped verses: {self.skipped_verses}")


def build(berean, tagged, lexicon, bsb):
    fallback = Fallback(lexicon)
    report = BuildReport()
    plan = {}  # verse -> (rows, {row index: tag})

    # Pass 1: text guard + alignment; count tag frequency for the fallback rule.
    for verse in sorted(berean):
        rows = berean[verse]
        if render(build_chunks(rows)) != bsb.get(verse):
            report.skipped_verses.append(verse)
            continue
        words = [(i, r) for i, r in enumerate(rows) if r.strongs is not None]
        words.sort(key=lambda t: t[1].source_sort if t[1].source_sort is not None else 10**9)
        aligned = {}
        if verse in tagged and words:
            got = lcs_align([r.strongs for _, r in words], tagged[verse])
            for k, tag in got.items():
                idx, r = words[k]
                aligned[idx] = tag
                fallback.observe(plain_key(r.lang, r.strongs), tag)
        plan[verse] = (rows, aligned)

    # Pass 2: emit rows (fallback needs the full frequency table).
    out: list[WordRow] = []
    for verse in sorted(plan):
        rows, aligned = plan[verse]
        report.verses += 1
        heads = assign_span_heads(rows)
        chunk_by_sort = {c.bsb_sort: c for c in build_chunks(rows)}
        for idx, r in enumerate(rows):
            chunk = chunk_by_sort.get(r.bsb_sort)
            if r.strongs is None:
                if chunk is None:
                    continue
                out.append(WordRow(verse, r.bsb_sort, "", None, "", "", "", "", None, "", "", None, chunk.text, chunk.space_before))
                continue
            report.word_rows += 1
            if idx in aligned:
                strongs, source = aligned[idx], "tagged"
                report.tagged += 1
            else:
                strongs, source = fallback.choose(plain_key(r.lang, r.strongs)), "fallback"
                report.fallback += 1
            out.append(WordRow(verse, r.bsb_sort, r.lang, r.source_sort, r.source, r.translit, r.parse_short, r.parse_full,
                               r.strongs, strongs, source, heads[idx],
                               chunk.text if chunk else "", chunk.space_before if chunk else False))
    report.rows = len(out)
    return out, report


def _cell(v):
    s = "" if v is None else str(v)
    if "\t" in s or "\n" in s:
        raise ValueError(f"field contains a tab or newline: {s!r}")
    return s


def _write_gz(path, text):
    with open(path, "wb") as raw, gzip.GzipFile(filename="", mode="wb", fileobj=raw, mtime=0, compresslevel=9) as gz:
        gz.write(text.encode("utf-8"))


def write_word_tsv_gz(rows, path):
    lines = ["\t".join(WORD_HEADER)]
    for r in rows:
        lines.append("\t".join(_cell(v) for v in (
            r.verse, r.bsb_sort, r.language, r.source_sort, r.source, r.translit, r.parse_short, r.parse_full,
            r.orig_strongs, r.strongs, r.strongs_source, r.span_head, r.chunk_text, "1" if r.space_before else "0")))
    _write_gz(path, "\n".join(lines) + "\n")


def write_lexicon_tsv_gz(entries, path):
    lines = ["\t".join(LEXICON_HEADER)]
    for e in entries:
        lines.append("\t".join(_cell(v) for v in (e.tag, e.plain, e.language, e.gloss)))
    _write_gz(path, "\n".join(lines) + "\n")


def sha256_of(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()
```

- [ ] **Step 4: Run to verify it passes**

Run: `python3 -m unittest discover -s data/bible/scripts -t data/bible/scripts -v`
Expected: PASS. If `test_a_verse_that_fails_the_text_guard…` reports extra skipped verses, one of the other fixture verses does not rebuild exactly — that is a real finding; investigate `berean.piece`, do not loosen the guard.

- [ ] **Step 5: Commit**

```bash
git add data/bible/scripts/interlinear
git commit -m "feat(data): build bible_word and bible_lexicon rows with orig_strongs and text chunks"
```

### Task E1.6: Manifest, command-line entry point, real-data run, docs

**Files:**
- Create: `data/bible/scripts/interlinear/manifest.py`, `data/bible/scripts/normalize_interlinear.py`
- Create: `data/bible/sources.json` (generated by the tool)
- Modify: `data/bible/README.md`, `.gitignore`
- Test: `data/bible/scripts/interlinear/tests/test_manifest.py`

**Interfaces:**
- Produces `manifest.write_manifest(path, version, sources: dict, outputs: dict)` writing `data/bible/sources.json`:

```json
{
  "version": 1,
  "sources": {
    "berean_tables": {"url": "https://bereanbible.com/bsb_tables.tsv", "downloaded": "2026-09-24", "sha256": "…"},
    "step_lexicons": {"repo": "STEPBible/STEPBible-Data", "path": "Lexicons/", "commit": "48b7cfbda441adb6445ea565b4ed23dd98dfdf2e", "files": {"<name>": "<sha256>"}},
    "step_tagged": {"repo": "STEPBible/STEPBible-Data", "path": "Translators Amalgamated OT+NT/", "commit": "0f60797c170f11a1f8dc75c5f7617973e2e66b0d", "files": {"<name>": "<sha256>"}}
  },
  "outputs": {
    "bible_word": {"asset": "bible-word-v1.tsv.gz", "sha256": "…", "rows": 0},
    "bible_lexicon": {"asset": "bible-lexicon-v1.tsv.gz", "sha256": "…", "rows": 0}
  }
}
```
The Go seeder (E2.2) reads `version` and `outputs`.

- [ ] **Step 1: Write the failing test**

```python
# data/bible/scripts/interlinear/tests/test_manifest.py
import json
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

from interlinear.manifest import write_manifest

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
SCRIPT = HERE.parents[1] / "normalize_interlinear.py"


class ManifestTests(unittest.TestCase):
    def test_write_manifest_shape(self):
        with tempfile.TemporaryDirectory() as d:
            p = Path(d) / "sources.json"
            write_manifest(p, 3, {"berean_tables": {"sha256": "aa"}},
                           {"bible_word": {"asset": "bible-word-v3.tsv.gz", "sha256": "bb", "rows": 5},
                            "bible_lexicon": {"asset": "bible-lexicon-v3.tsv.gz", "sha256": "cc", "rows": 2}})
            m = json.loads(p.read_text())
            self.assertEqual(m["version"], 3)
            self.assertEqual(m["outputs"]["bible_word"]["rows"], 5)
            self.assertTrue(p.read_text().endswith("\n"))

    def test_cli_runs_on_fixtures_and_writes_versioned_outputs(self):
        with tempfile.TemporaryDirectory() as d:
            out = Path(d)
            proc = subprocess.run(
                [sys.executable, str(SCRIPT),
                 "--berean", str(FIX / "berean_excerpt.tsv"),
                 "--tahot", str(FIX / "tahot_excerpt.txt"), "--tagnt", str(FIX / "tagnt_excerpt.txt"),
                 "--lex-heb", str(FIX / "lexicon_heb_excerpt.txt"), "--lex-grk", str(FIX / "lexicon_grk_excerpt.txt"),
                 "--bsb", str(FIX / "bsb_excerpt.tsv"), "--out-dir", str(out), "--manifest", str(out / "sources.json"),
                 "--version", "1", "--berean-downloaded", "2026-09-24",
                 "--step-tagged-commit", "0f60797c170f11a1f8dc75c5f7617973e2e66b0d",
                 "--step-lexicon-commit", "48b7cfbda441adb6445ea565b4ed23dd98dfdf2e"],
                capture_output=True, text=True)
            self.assertEqual(proc.returncode, 0, proc.stderr)
            self.assertTrue((out / "bible-word-v1.tsv.gz").exists())
            self.assertTrue((out / "bible-lexicon-v1.tsv.gz").exists())
            m = json.loads((out / "sources.json").read_text())
            self.assertEqual(m["outputs"]["bible_word"]["asset"], "bible-word-v1.tsv.gz")
            self.assertEqual(len(m["outputs"]["bible_word"]["sha256"]), 64)
            self.assertIn("tagged", proc.stdout)


if __name__ == "__main__":
    unittest.main()
```

- [ ] **Step 2: Run to verify it fails** — Expected: FAIL (`ModuleNotFoundError: interlinear.manifest`).

- [ ] **Step 3: Implement**

```python
# data/bible/scripts/interlinear/manifest.py
import json
from pathlib import Path


def write_manifest(path, version, sources, outputs):
    doc = {"version": version, "sources": sources, "outputs": outputs}
    Path(path).write_text(json.dumps(doc, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
```

```python
#!/usr/bin/env python3
# data/bible/scripts/normalize_interlinear.py
"""Build the interlinear release files and the manifest.

Inputs are downloaded by hand (see data/bible/README.md, "Interlinear data").
Outputs go in --out-dir (gitignored): bible-word-vN.tsv.gz and bible-lexicon-vN.tsv.gz.
Only --manifest (data/bible/sources.json) is committed.
"""
import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from interlinear.berean import read_berean, read_bsb  # noqa: E402
from interlinear.books import load_books  # noqa: E402
from interlinear.build import build, sha256_of, write_lexicon_tsv_gz, write_word_tsv_gz  # noqa: E402
from interlinear.lexicon import read_lexicon  # noqa: E402
from interlinear.manifest import write_manifest  # noqa: E402
from interlinear.tagged import read_tagged  # noqa: E402

BIBLE = Path(__file__).resolve().parents[1]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--berean", required=True)
    ap.add_argument("--tahot", nargs="+", required=True)
    ap.add_argument("--tagnt", nargs="+", required=True)
    ap.add_argument("--lex-heb", required=True)
    ap.add_argument("--lex-grk", required=True)
    ap.add_argument("--bsb", default=str(BIBLE / "bsb.tsv"))
    ap.add_argument("--books", default=str(BIBLE / "books.json"))
    ap.add_argument("--out-dir", default=str(BIBLE / "interlinear"))
    ap.add_argument("--manifest", default=str(BIBLE / "sources.json"))
    ap.add_argument("--version", type=int, required=True)
    ap.add_argument("--berean-downloaded", required=True, help="YYYY-MM-DD")
    ap.add_argument("--step-tagged-commit", required=True)
    ap.add_argument("--step-lexicon-commit", required=True)
    a = ap.parse_args()

    books = load_books(a.books)
    berean = read_berean(a.berean)
    tagged, skipped = read_tagged([*a.tahot, *a.tagnt], books)
    lexicon = read_lexicon([a.lex_heb, a.lex_grk])
    rows, report = build(berean, tagged, lexicon, read_bsb(a.bsb))

    out = Path(a.out_dir)
    out.mkdir(parents=True, exist_ok=True)
    word_path = out / f"bible-word-v{a.version}.tsv.gz"
    lex_path = out / f"bible-lexicon-v{a.version}.tsv.gz"
    write_word_tsv_gz(rows, word_path)
    write_lexicon_tsv_gz(lexicon, lex_path)

    sources = {
        "berean_tables": {"url": "https://bereanbible.com/bsb_tables.tsv", "downloaded": a.berean_downloaded,
                          "sha256": sha256_of(a.berean)},
        "step_lexicons": {"repo": "STEPBible/STEPBible-Data", "path": "Lexicons/", "commit": a.step_lexicon_commit,
                          "files": {Path(p).name: sha256_of(p) for p in (a.lex_heb, a.lex_grk)}},
        "step_tagged": {"repo": "STEPBible/STEPBible-Data", "path": "Translators Amalgamated OT+NT/",
                        "commit": a.step_tagged_commit, "files": {Path(p).name: sha256_of(p) for p in (*a.tahot, *a.tagnt)}},
    }
    outputs = {
        "bible_word": {"asset": word_path.name, "sha256": sha256_of(word_path), "rows": len(rows)},
        "bible_lexicon": {"asset": lex_path.name, "sha256": sha256_of(lex_path), "rows": len(lexicon)},
    }
    write_manifest(a.manifest, a.version, sources, outputs)
    print(report.text())
    if skipped:
        print("tagged-text refs skipped (out of range):", skipped)


if __name__ == "__main__":
    main()
```

- [ ] **Step 4: Run to verify it passes**

Run: `python3 -m unittest discover -s data/bible/scripts -t data/bible/scripts -v`
Expected: PASS (all E1 tests).

- [ ] **Step 5: Download the real inputs (human-runnable; ~230 MB, not committed)**

Into a scratch folder outside the repo, one Bash call each. Pinned commits are from the spec:

```bash
mkdir -p /tmp/interlinear-src
curl -L -o /tmp/interlinear-src/bsb_tables.tsv https://bereanbible.com/bsb_tables.tsv
curl -L -o "/tmp/interlinear-src/TAHOT Gen-Deu.txt" "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/0f60797c170f11a1f8dc75c5f7617973e2e66b0d/Translators%20Amalgamated%20OT%2BNT/TAHOT%20Gen-Deu%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt"
curl -L -o "/tmp/interlinear-src/TAHOT Jos-Est.txt" "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/0f60797c170f11a1f8dc75c5f7617973e2e66b0d/Translators%20Amalgamated%20OT%2BNT/TAHOT%20Jos-Est%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt"
curl -L -o "/tmp/interlinear-src/TAHOT Job-Sng.txt" "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/0f60797c170f11a1f8dc75c5f7617973e2e66b0d/Translators%20Amalgamated%20OT%2BNT/TAHOT%20Job-Sng%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt"
curl -L -o "/tmp/interlinear-src/TAHOT Isa-Mal.txt" "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/0f60797c170f11a1f8dc75c5f7617973e2e66b0d/Translators%20Amalgamated%20OT%2BNT/TAHOT%20Isa-Mal%20-%20Translators%20Amalgamated%20Hebrew%20OT%20-%20STEPBible.org%20CC%20BY.txt"
curl -L -o "/tmp/interlinear-src/TAGNT Mat-Jhn.txt" "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/0f60797c170f11a1f8dc75c5f7617973e2e66b0d/Translators%20Amalgamated%20OT%2BNT/TAGNT%20Mat-Jhn%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt"
curl -L -o "/tmp/interlinear-src/TAGNT Act-Rev.txt" "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/0f60797c170f11a1f8dc75c5f7617973e2e66b0d/Translators%20Amalgamated%20OT%2BNT/TAGNT%20Act-Rev%20-%20Translators%20Amalgamated%20Greek%20NT%20-%20STEPBible.org%20CC-BY.txt"
curl -L -o "/tmp/interlinear-src/TBESH.txt" "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/48b7cfbda441adb6445ea565b4ed23dd98dfdf2e/Lexicons/TBESH%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Hebrew%20-%20STEPBible.org%20CC%20BY.txt"
curl -L -o "/tmp/interlinear-src/TBESG.txt" "https://raw.githubusercontent.com/STEPBible/STEPBible-Data/48b7cfbda441adb6445ea565b4ed23dd98dfdf2e/Lexicons/TBESG%20-%20Translators%20Brief%20lexicon%20of%20Extended%20Strongs%20for%20Greek%20-%20STEPBible.org%20CC%20BY.txt"
```

If the fixture files from Task E1.1 have not been generated yet, generate them now with these paths (Task E1.1 Step 2), then re-run the tests.

- [ ] **Step 6: Run the normalizer on the real data and check the numbers**

```bash
python3 data/bible/scripts/normalize_interlinear.py --berean /tmp/interlinear-src/bsb_tables.tsv --tahot "/tmp/interlinear-src/TAHOT Gen-Deu.txt" "/tmp/interlinear-src/TAHOT Jos-Est.txt" "/tmp/interlinear-src/TAHOT Job-Sng.txt" "/tmp/interlinear-src/TAHOT Isa-Mal.txt" --tagnt "/tmp/interlinear-src/TAGNT Mat-Jhn.txt" "/tmp/interlinear-src/TAGNT Act-Rev.txt" --lex-heb /tmp/interlinear-src/TBESH.txt --lex-grk /tmp/interlinear-src/TBESG.txt --version 1 --berean-downloaded 2026-09-24 --step-tagged-commit 0f60797c170f11a1f8dc75c5f7617973e2e66b0d --step-lexicon-commit 48b7cfbda441adb6445ea565b4ed23dd98dfdf2e
```

Expected (from the prototype; accept these **ranges**, investigate outside them):
- `rows` between 440,000 and 445,000; `word rows` ≈ 437,559.
- `tagged` ≥ 98.5% of word rows (measured: 98.86%).
- `skipped verses` **exactly `[2662, 6964]`** (verified: verse 2662's alignment lacks "of silver"; verse 6964 loses a space after "web."). Any other skipped verse is a finding — print its rebuilt vs plain text before proceeding. Measured on 2026-09-24: `verses: 31084  rows: 442312  word rows: 437559  tagged: 432559 (98.86%)  fallback: 5000`.
- `data/bible/interlinear/bible-word-v1.tsv.gz` about 13 MB; `bible-lexicon-v1.tsv.gz` well under 1 MB.

- [ ] **Step 7: Docs and gitignore**

Append to `.gitignore`:

```
# Interlinear release files are fetched by hand, not committed (data/bible/README.md)
data/bible/interlinear/
```

Append to `data/bible/README.md` a section **"Interlinear data"** covering: what the two release files are, the manifest (`sources.json`), how they are produced (`normalize_interlinear.py` with the download commands above), `orig_strongs` vs `strongs`, the license lines verbatim from the spec (BSB: "The Berean Bible and Majority Bible texts are officially dedicated to the public domain as of April 30, 2023." / "All uses are freely permitted."; STEPBible: CC BY 4.0, credit "STEP Bible" linked to www.STEPBible.org, modifications noted — the normalizer keeps only the Gloss column and attaches disambiguated tags), and the statement that release assets are never overwritten.

- [ ] **Step 8: Commit and open the PR (upload is a separate, authorized step)**

```bash
git add data/bible/scripts data/bible/sources.json data/bible/README.md .gitignore
git commit -m "feat(data): interlinear normalizer, manifest and docs"
```

**Do not upload release assets or push without asking the owner.** After approval, create the release once and upload (`gh release create bible-data --title "Bible data assets" --notes "Versioned data files fetched by the seeder; see data/bible/README.md." --prerelease`, then `gh release upload bible-data data/bible/interlinear/bible-word-v1.tsv.gz data/bible/interlinear/bible-lexicon-v1.tsv.gz`). PR body (`chore.md` template): summary, the report numbers from Step 6, and "no runtime change; no migration".

---

# PR E2: Backend (migration, seeder, `passageInterlinear` query)

**Branch:** `feature/bible-interlinear-backend` (from updated `feature/add-bible-content-types`; needs E1's manifest format, not its data). **This PR adds a migration: it must be applied by hand per environment, then the seeder run by a human against each environment — never run either against the shared database from an agent session.** Backend commands below use `go -C backend ...` (one command; it does not change the shell's directory).

### Task E2.1: Migration `000026`

**Files:**
- Create: `backend/migrations/000026_add_bible_interlinear_tables.up.sql`
- Create: `backend/migrations/000026_add_bible_interlinear_tables.down.sql`

**Interfaces:**
- Produces tables read by E2.2 (writes) and E2.4 (reads): `bible_word`, `bible_lexicon`, `bible_data_version`. Column names and order match the E1 file contract exactly.

- [ ] **Step 1: Re-verify the number**

Run: `ls backend/migrations | tail -5` and `git log --all --oneline -- 'backend/migrations/*'`
Expected: highest existing is `000025`. If another open PR claims `000026`, take the next free number and rename these files and every reference below.

- [ ] **Step 2: Write the up migration** (mirrors `000025`: `IF NOT EXISTS`, comment header, no FK, no indexes beyond the primary key)

```sql
-- Interlinear (original-language) word data for BSB passages. See
-- docs/superpowers/specs/2026-09-24-bible-interlinear-design.md.
--
-- bible_word: one row per Berean source word, plus rows for English words that
-- have no source word (so the verse text can be rebuilt exactly). chunk_text /
-- space_before are the precomputed text of the row; span_head is the bsb_sort of
-- the first row of the English phrase the word belongs to (NULL = no phrase).
-- orig_strongs is Berean's plain Strong's number exactly as published; strongs
-- is the disambiguated STEPBible tag (e.g. H1254B). Populated only by
-- `go run ./cmd/seed-bible` from the versioned release files.
--
-- Indexes: the primary key ONLY (owner decision 2026-09-24). No FK to a verse
-- table: verse ordinals are computed (see migration 000023), like bible_verse_text.
--
-- Manual application required: this repo does not auto-run migrations.
-- Apply per environment, then run the seeder.

CREATE TABLE IF NOT EXISTS bible_word (
    verse_id       integer NOT NULL,
    bsb_sort       integer NOT NULL,
    language       varchar NOT NULL DEFAULT '',
    source_sort    integer,
    source         varchar NOT NULL DEFAULT '',
    translit       varchar NOT NULL DEFAULT '',
    parse_short    varchar NOT NULL DEFAULT '',
    parse_full     varchar NOT NULL DEFAULT '',
    orig_strongs   integer,
    strongs        varchar NOT NULL DEFAULT '',
    strongs_source varchar NOT NULL DEFAULT '',
    span_head      integer,
    chunk_text     varchar NOT NULL DEFAULT '',
    space_before   boolean NOT NULL DEFAULT false,
    PRIMARY KEY (verse_id, bsb_sort)
);

-- Short meaning (STEPBible "Gloss" column, CC BY 4.0) per disambiguated tag.
CREATE TABLE IF NOT EXISTS bible_lexicon (
    tag      varchar PRIMARY KEY,
    plain    varchar NOT NULL,
    language varchar NOT NULL,
    gloss    varchar NOT NULL
);

-- One row recording which data version an environment has loaded.
CREATE TABLE IF NOT EXISTS bible_data_version (
    id               integer PRIMARY KEY CHECK (id = 1),
    manifest_version integer NOT NULL,
    word_sha256      varchar NOT NULL,
    lexicon_sha256   varchar NOT NULL,
    loaded_at        timestamptz NOT NULL DEFAULT now()
);
```

- [ ] **Step 3: Write the down migration**

```sql
DROP TABLE IF EXISTS bible_data_version;
DROP TABLE IF EXISTS bible_lexicon;
DROP TABLE IF EXISTS bible_word;
```

- [ ] **Step 4: Check the SQL parses (no database needed)**

Run: `python3 -c "import re,sys; s=open('backend/migrations/000026_add_bible_interlinear_tables.up.sql').read(); print(len(re.findall(r'CREATE TABLE IF NOT EXISTS', s)), 'tables;', 'PRIMARY KEY' in s)"`
Expected: `3 tables; True`. (Real application happens by hand; do not run `migrate`.)

- [ ] **Step 5: Commit**

```bash
git add backend/migrations/000026_add_bible_interlinear_tables.up.sql backend/migrations/000026_add_bible_interlinear_tables.down.sql
git commit -m "feat(db): add bible_word, bible_lexicon and bible_data_version tables (manual apply)"
```

### Task E2.2: Seeder — verify and load the interlinear files

**Files:**
- Create: `backend/cmd/seed-bible/interlinear.go`
- Modify: `backend/cmd/seed-bible/main.go` (flags + one call after the verse-text step)
- Test: `backend/cmd/seed-bible/interlinear_test.go`

**Interfaces:**
- Consumes the manifest and the two file formats from E1.5/E1.6.
- Produces `seedInterlinear(db *gorm.DB, manifestPath, dir string) (loaded bool, err error)` — returns `(false, nil)` and does nothing when the release files are not present (existing environments keep working); verifies SHA-256 and row counts against the manifest before touching the database; truncates and reloads both data tables plus records the version, in **one transaction**.
- Produces pure, tested helpers: `loadManifest`, `readVerified`, `parseWordTSV`, `parseLexiconTSV`, `buildWordInsert`, `buildLexiconInsert`.

- [ ] **Step 1: Write the failing tests**

```go
// backend/cmd/seed-bible/interlinear_test.go
package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func gz(t *testing.T, s string) []byte {
	t.Helper()
	var buf bytes.Buffer
	zw := gzip.NewWriter(&buf)
	_, err := zw.Write([]byte(s))
	require.NoError(t, err)
	require.NoError(t, zw.Close())
	return buf.Bytes()
}

func sum(b []byte) string {
	h := sha256.Sum256(b)
	return hex.EncodeToString(h[:])
}

const wordHeaderLine = "verse\tbsb_sort\tlanguage\tsource_sort\tsource\ttranslit\tparse_short\tparse_full\torig_strongs\tstrongs\tstrongs_source\tspan_head\tchunk_text\tspace_before"

func TestParseWordTSV_ParsesRowsAndNulls(t *testing.T) {
	data := gz(t, wordHeaderLine+"\n"+
		"1\t100\theb\t1\tרֵאשִׁית\tre.shit\tN\tNoun\t7225\tH7225G\ttagged\t100\tIn the beginning\t0\n"+
		"1\t104\t\t\t\t\t\t\t\t\t\t\tthe earth.\t1\n")
	rows, err := parseWordTSV(data)
	require.NoError(t, err)
	require.Len(t, rows, 2)

	w := rows[0]
	assert.Equal(t, 1, w.VerseID)
	assert.Equal(t, 100, w.BSBSort)
	assert.Equal(t, "heb", w.Language)
	require.NotNil(t, w.SourceSort)
	assert.Equal(t, 1, *w.SourceSort)
	require.NotNil(t, w.OrigStrongs)
	assert.Equal(t, 7225, *w.OrigStrongs)
	assert.Equal(t, "H7225G", w.Strongs)
	require.NotNil(t, w.SpanHead)
	assert.False(t, w.SpaceBefore)

	e := rows[1] // an English-only row
	assert.Equal(t, "", e.Language)
	assert.Nil(t, e.SourceSort)
	assert.Nil(t, e.OrigStrongs)
	assert.Nil(t, e.SpanHead)
	assert.Equal(t, "the earth.", e.ChunkText)
	assert.True(t, e.SpaceBefore)
}

func TestParseWordTSV_RejectsBadHeaderAndBadRows(t *testing.T) {
	_, err := parseWordTSV(gz(t, "wrong\theader\n"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "header")

	_, err = parseWordTSV(gz(t, wordHeaderLine+"\n1\t2\t3\n"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "14 columns")

	_, err = parseWordTSV(gz(t, wordHeaderLine+"\nx\t100\t\t\t\t\t\t\t\t\t\t\t\t0\n"))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "verse")

	_, err = parseWordTSV([]byte("not gzip"))
	require.Error(t, err)
}

func TestParseLexiconTSV(t *testing.T) {
	rows, err := parseLexiconTSV(gz(t, "tag\tplain\tlanguage\tgloss\nH1254A\tH1254\theb\tto create\nG3439\tG3439\tgrc\tunique\n"))
	require.NoError(t, err)
	assert.Equal(t, []lexiconRow{
		{Tag: "H1254A", Plain: "H1254", Language: "heb", Gloss: "to create"},
		{Tag: "G3439", Plain: "G3439", Language: "grc", Gloss: "unique"},
	}, rows)

	_, err = parseLexiconTSV(gz(t, "tag\tplain\tlanguage\tgloss\nonly\ttwo\n"))
	require.Error(t, err)
}

func TestBuildWordInsert_ArgCountAndNulls(t *testing.T) {
	src := 3
	rows := []wordRow{
		{VerseID: 1, BSBSort: 100, Language: "heb", SourceSort: &src, Strongs: "H1254A", ChunkText: "created", SpaceBefore: true},
		{VerseID: 1, BSBSort: 104, ChunkText: "the earth."},
	}
	sql, args := buildWordInsert(rows)
	assert.Len(t, args, 2*wordColumns)
	assert.Equal(t, 2, strings.Count(sql, "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)"))
	assert.Contains(t, sql, "INSERT INTO bible_word")
	assert.NotContains(t, sql, "ON CONFLICT", "load is truncate+insert, so a duplicate key must fail loudly")
	assert.Nil(t, args[3+wordColumns].(*int), "an English-only row's source_sort binds as a nil pointer (NULL)")
}

func TestReadVerified_RejectsShaMismatchAndReportsMissing(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "f.tsv.gz")
	content := gz(t, "hello")
	require.NoError(t, os.WriteFile(path, content, 0o644))

	got, err := readVerified(path, sum(content))
	require.NoError(t, err)
	assert.Equal(t, content, got)

	_, err = readVerified(path, strings.Repeat("0", 64))
	require.Error(t, err)
	assert.Contains(t, err.Error(), "sha256 mismatch")

	_, err = readVerified(filepath.Join(dir, "missing"), "x")
	require.Error(t, err)
	assert.True(t, os.IsNotExist(unwrapPathError(err)))
}

func TestLoadManifest(t *testing.T) {
	path := filepath.Join(t.TempDir(), "sources.json")
	require.NoError(t, os.WriteFile(path, []byte(`{"version":2,"sources":{},"outputs":{
	  "bible_word":{"asset":"bible-word-v2.tsv.gz","sha256":"aa","rows":5},
	  "bible_lexicon":{"asset":"bible-lexicon-v2.tsv.gz","sha256":"bb","rows":2}}}`), 0o644))
	m, err := loadManifest(path)
	require.NoError(t, err)
	assert.Equal(t, 2, m.Version)
	assert.Equal(t, "bible-word-v2.tsv.gz", m.Outputs.BibleWord.Asset)
	assert.Equal(t, 2, m.Outputs.BibleLexicon.Rows)

	require.NoError(t, os.WriteFile(path, []byte(`{"version":0}`), 0o644))
	_, err = loadManifest(path)
	require.Error(t, err, "a manifest with no outputs is unusable")
}

func TestSeedInterlinear_SkipsCleanlyWhenFilesAreNotDownloaded(t *testing.T) {
	dir := t.TempDir()
	manifestPath := filepath.Join(dir, "sources.json")
	require.NoError(t, os.WriteFile(manifestPath, []byte(`{"version":1,"outputs":{
	  "bible_word":{"asset":"bible-word-v1.tsv.gz","sha256":"aa","rows":1},
	  "bible_lexicon":{"asset":"bible-lexicon-v1.tsv.gz","sha256":"bb","rows":1}}}`), 0o644))
	loaded, err := seedInterlinear(nil, manifestPath, filepath.Join(dir, "interlinear")) // nil DB: must not be touched
	require.NoError(t, err)
	assert.False(t, loaded)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go -C backend test ./cmd/seed-bible/ -run 'Interlinear|WordTSV|Lexicon|Verified|Manifest|BuildWordInsert' -v`
Expected: FAIL to compile (`undefined: parseWordTSV`, etc.).

- [ ] **Step 3: Implement `interlinear.go`**

```go
// backend/cmd/seed-bible/interlinear.go
package main

import (
	"bytes"
	"compress/gzip"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"gorm.io/gorm"
)

// The interlinear files are produced by data/bible/scripts/normalize_interlinear.py
// (see data/bible/README.md) and fetched by hand into data/bible/interlinear/.
// The committed manifest (data/bible/sources.json) pins their SHA-256 and row counts.

const (
	wordColumns      = 14
	wordBatchSize    = 1000 // 14 params/row = 14,000 params, far under Postgres' 65,535 limit
	lexiconBatchSize = 1000 // 4 params/row

	wordHeader    = "verse\tbsb_sort\tlanguage\tsource_sort\tsource\ttranslit\tparse_short\tparse_full\torig_strongs\tstrongs\tstrongs_source\tspan_head\tchunk_text\tspace_before"
	lexiconHeader = "tag\tplain\tlanguage\tgloss"
)

type outputFile struct {
	Asset  string `json:"asset"`
	SHA256 string `json:"sha256"`
	Rows   int    `json:"rows"`
}

type manifest struct {
	Version int `json:"version"`
	Outputs struct {
		BibleWord    outputFile `json:"bible_word"`
		BibleLexicon outputFile `json:"bible_lexicon"`
	} `json:"outputs"`
}

type wordRow struct {
	VerseID       int
	BSBSort       int
	Language      string
	SourceSort    *int
	Source        string
	Translit      string
	ParseShort    string
	ParseFull     string
	OrigStrongs   *int
	Strongs       string
	StrongsSource string
	SpanHead      *int
	ChunkText     string
	SpaceBefore   bool
}

type lexiconRow struct {
	Tag      string
	Plain    string
	Language string
	Gloss    string
}

func loadManifest(path string) (manifest, error) {
	var m manifest
	raw, err := os.ReadFile(path)
	if err != nil {
		return m, err
	}
	if err := json.Unmarshal(raw, &m); err != nil {
		return m, fmt.Errorf("parse manifest %s: %w", path, err)
	}
	if m.Outputs.BibleWord.Asset == "" || m.Outputs.BibleLexicon.Asset == "" {
		return m, fmt.Errorf("manifest %s has no bible_word/bible_lexicon outputs", path)
	}
	return m, nil
}

// readVerified returns the file's bytes after checking its SHA-256. A missing
// file yields an error wrapping the os error so callers can detect it.
func readVerified(path, wantSHA string) ([]byte, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, err
	}
	h := sha256.Sum256(data)
	if got := hex.EncodeToString(h[:]); got != wantSHA {
		return nil, fmt.Errorf("sha256 mismatch for %s: manifest %s, file %s", filepath.Base(path), wantSHA, got)
	}
	return data, nil
}

func unwrapPathError(err error) error {
	var pe *os.PathError
	if errors.As(err, &pe) {
		return pe
	}
	return err
}

func gunzipLines(data []byte) ([]string, error) {
	zr, err := gzip.NewReader(bytes.NewReader(data))
	if err != nil {
		return nil, fmt.Errorf("not a gzip file: %w", err)
	}
	raw, err := io.ReadAll(zr)
	if err != nil {
		return nil, fmt.Errorf("gunzip: %w", err)
	}
	return strings.Split(strings.TrimRight(string(raw), "\n"), "\n"), nil
}

func optInt(s string) (*int, error) {
	if s == "" {
		return nil, nil
	}
	n, err := strconv.Atoi(s)
	if err != nil {
		return nil, err
	}
	return &n, nil
}

func parseWordTSV(data []byte) ([]wordRow, error) {
	lines, err := gunzipLines(data)
	if err != nil {
		return nil, err
	}
	if len(lines) < 1 || lines[0] != wordHeader {
		return nil, fmt.Errorf("unexpected word file header (want %q)", wordHeader)
	}
	rows := make([]wordRow, 0, len(lines)-1)
	for i, line := range lines[1:] {
		c := strings.Split(line, "\t")
		if len(c) != wordColumns {
			return nil, fmt.Errorf("line %d: want %d columns, got %d", i+2, wordColumns, len(c))
		}
		verse, err := strconv.Atoi(c[0])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad verse %q", i+2, c[0])
		}
		sort, err := strconv.Atoi(c[1])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad bsb_sort %q", i+2, c[1])
		}
		srcSort, err := optInt(c[3])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad source_sort %q", i+2, c[3])
		}
		orig, err := optInt(c[8])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad orig_strongs %q", i+2, c[8])
		}
		head, err := optInt(c[11])
		if err != nil {
			return nil, fmt.Errorf("line %d: bad span_head %q", i+2, c[11])
		}
		rows = append(rows, wordRow{
			VerseID: verse, BSBSort: sort, Language: c[2], SourceSort: srcSort, Source: c[4], Translit: c[5],
			ParseShort: c[6], ParseFull: c[7], OrigStrongs: orig, Strongs: c[9], StrongsSource: c[10],
			SpanHead: head, ChunkText: c[12], SpaceBefore: c[13] == "1",
		})
	}
	return rows, nil
}

func parseLexiconTSV(data []byte) ([]lexiconRow, error) {
	lines, err := gunzipLines(data)
	if err != nil {
		return nil, err
	}
	if len(lines) < 1 || lines[0] != lexiconHeader {
		return nil, fmt.Errorf("unexpected lexicon file header (want %q)", lexiconHeader)
	}
	rows := make([]lexiconRow, 0, len(lines)-1)
	for i, line := range lines[1:] {
		c := strings.Split(line, "\t")
		if len(c) != 4 {
			return nil, fmt.Errorf("line %d: want 4 columns, got %d", i+2, len(c))
		}
		rows = append(rows, lexiconRow{Tag: c[0], Plain: c[1], Language: c[2], Gloss: c[3]})
	}
	return rows, nil
}

// buildWordInsert returns one multi-row INSERT. There is deliberately no ON CONFLICT:
// the tables are truncated first, so a duplicate (verse_id, bsb_sort) means a bad file.
func buildWordInsert(rows []wordRow) (string, []any) {
	ph := make([]string, 0, len(rows))
	args := make([]any, 0, len(rows)*wordColumns)
	for _, r := range rows {
		ph = append(ph, "(?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
		args = append(args, r.VerseID, r.BSBSort, r.Language, r.SourceSort, r.Source, r.Translit,
			r.ParseShort, r.ParseFull, r.OrigStrongs, r.Strongs, r.StrongsSource, r.SpanHead, r.ChunkText, r.SpaceBefore)
	}
	return "INSERT INTO bible_word (verse_id, bsb_sort, language, source_sort, source, translit, parse_short, parse_full, " +
		"orig_strongs, strongs, strongs_source, span_head, chunk_text, space_before) VALUES " + strings.Join(ph, ", "), args
}

func buildLexiconInsert(rows []lexiconRow) (string, []any) {
	ph := make([]string, 0, len(rows))
	args := make([]any, 0, len(rows)*4)
	for _, r := range rows {
		ph = append(ph, "(?,?,?,?)")
		args = append(args, r.Tag, r.Plain, r.Language, r.Gloss)
	}
	return "INSERT INTO bible_lexicon (tag, plain, language, gloss) VALUES " + strings.Join(ph, ", "), args
}

// seedInterlinear loads the verified files. It returns (false, nil) without touching
// the database when the files have not been downloaded.
func seedInterlinear(db *gorm.DB, manifestPath, dir string) (bool, error) {
	m, err := loadManifest(manifestPath)
	if err != nil {
		return false, err
	}
	wordData, err := readVerified(filepath.Join(dir, m.Outputs.BibleWord.Asset), m.Outputs.BibleWord.SHA256)
	if err != nil {
		if os.IsNotExist(unwrapPathError(err)) {
			return false, nil
		}
		return false, err
	}
	lexData, err := readVerified(filepath.Join(dir, m.Outputs.BibleLexicon.Asset), m.Outputs.BibleLexicon.SHA256)
	if err != nil {
		if os.IsNotExist(unwrapPathError(err)) {
			return false, nil
		}
		return false, err
	}
	words, err := parseWordTSV(wordData)
	if err != nil {
		return false, fmt.Errorf("parse %s: %w", m.Outputs.BibleWord.Asset, err)
	}
	lexicon, err := parseLexiconTSV(lexData)
	if err != nil {
		return false, fmt.Errorf("parse %s: %w", m.Outputs.BibleLexicon.Asset, err)
	}
	if len(words) != m.Outputs.BibleWord.Rows || len(lexicon) != m.Outputs.BibleLexicon.Rows {
		return false, fmt.Errorf("row count mismatch: manifest %d/%d, files %d/%d",
			m.Outputs.BibleWord.Rows, m.Outputs.BibleLexicon.Rows, len(words), len(lexicon))
	}

	err = db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Exec("TRUNCATE bible_word, bible_lexicon").Error; err != nil {
			return fmt.Errorf("truncate: %w", err)
		}
		for start := 0; start < len(words); start += wordBatchSize {
			sql, args := buildWordInsert(words[start:min(start+wordBatchSize, len(words))])
			if err := tx.Exec(sql, args...).Error; err != nil {
				return fmt.Errorf("insert bible_word batch at %d: %w", start, err)
			}
		}
		for start := 0; start < len(lexicon); start += lexiconBatchSize {
			sql, args := buildLexiconInsert(lexicon[start:min(start+lexiconBatchSize, len(lexicon))])
			if err := tx.Exec(sql, args...).Error; err != nil {
				return fmt.Errorf("insert bible_lexicon batch at %d: %w", start, err)
			}
		}
		return tx.Exec(`
			INSERT INTO bible_data_version (id, manifest_version, word_sha256, lexicon_sha256)
			VALUES (1, ?, ?, ?)
			ON CONFLICT (id) DO UPDATE SET manifest_version = EXCLUDED.manifest_version,
				word_sha256 = EXCLUDED.word_sha256, lexicon_sha256 = EXCLUDED.lexicon_sha256, loaded_at = now()
		`, m.Version, m.Outputs.BibleWord.SHA256, m.Outputs.BibleLexicon.SHA256).Error
	})
	if err != nil {
		return false, err
	}
	fmt.Printf("Seeded %d interlinear word rows and %d lexicon entries (manifest v%d)\n", len(words), len(lexicon), m.Version)
	return true, nil
}
```

- [ ] **Step 4: Wire it into `main.go`**

Add the flags next to the existing `bsbPath` flag:

```go
	interlinearDir := flag.String("interlinear-dir", "../data/bible/interlinear", "directory holding the interlinear release files (see data/bible/README.md)")
	manifestPath := flag.String("manifest", "../data/bible/sources.json", "path to the data manifest (data/bible/sources.json)")
```

And after `fmt.Printf("Seeded %d %s verses\n", ...)` at the end of `main`:

```go
	loaded, err := seedInterlinear(db, *manifestPath, *interlinearDir)
	if err != nil {
		log.Fatalf("failed to seed interlinear data: %v", err)
	}
	if !loaded {
		fmt.Printf("Interlinear files not found in %s — skipped (see data/bible/README.md to download them)\n", *interlinearDir)
	}
```

- [ ] **Step 5: Run to verify it passes**

Run: `go -C backend test ./cmd/seed-bible/ -v`
Expected: PASS (the new tests and the existing seeder tests).
Run: `gofmt -l backend/cmd/seed-bible`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add backend/cmd/seed-bible
git commit -m "feat(seed-bible): verify and load interlinear data from the manifest"
```

### Task E2.3: Domain — assemble phrases and words for a verse

**Files:**
- Create: `backend/internal/core/domain/bible_interlinear.go`
- Test: `backend/test/domain/bible_interlinear_test.go`

**Interfaces:**
- Consumes `domain.BibleBook` and `domain.BibleVerseFromOrdinal(books, ordinal) (bookID, chapter, verse int, err error)` (existing, `bible_reference.go`).
- Produces:
  - `domain.InterlinearWordRow` — a `bible_word` row joined with its lexicon gloss (fields below).
  - `domain.InterlinearSegment{Text string; SpaceBefore bool}`
  - `domain.InterlinearWord{ID int; Language, Source, Translit, Parsing, Strongs, Gloss, TagSource string; SourceOrder int; Segment *int}`
  - `domain.InterlinearVerse{VerseID, Chapter, Verse int; Segments []InterlinearSegment; Words []InterlinearWord}`
  - `domain.PassageInterlinear{Verses []InterlinearVerse}`
  - `domain.BuildInterlinearVerses(books []BibleBook, rows []InterlinearWordRow) ([]InterlinearVerse, error)` — `rows` must be ordered by `VerseID`, then `BSBSort` (the repository guarantees this).

`Words` are in **original (source) order**; a word's `ID` is its index in that slice; `Segment` is the index into `Segments` of the English phrase it belongs to, or `nil` when it belongs to no phrase.

- [ ] **Step 1: Write the failing test**

```go
// backend/test/domain/bible_interlinear_test.go
package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func intp(n int) *int { return &n }

func genesisBooks() []domain.BibleBook {
	return []domain.BibleBook{{ID: 1, Name: "Genesis", VersesPerChapter: []int{31, 25}}}
}

// Genesis 1:1 in English order: In-the-beginning (H7225), God (H430), [untranslated object marker H853],
// created (H1254), then English-only "the heavens and the earth." Hebrew order is
// beginning, created, God, marker.
func genesis11Rows() []domain.InterlinearWordRow {
	return []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 100, Language: "heb", SourceSort: intp(1), Source: "רֵאשִׁית", Translit: "re.shit", ParseFull: "Noun", OrigStrongs: intp(7225), Strongs: "H7225G", StrongsSource: "tagged", SpanHead: intp(100), ChunkText: "In the beginning", Gloss: "first: beginning"},
		{VerseID: 1, BSBSort: 101, Language: "heb", SourceSort: intp(3), Source: "אֱלֹהִים", Translit: "'E.lo.Him", ParseFull: "Noun", OrigStrongs: intp(430), Strongs: "H0430G", StrongsSource: "tagged", SpanHead: intp(101), ChunkText: "God", SpaceBefore: true, Gloss: "God"},
		{VerseID: 1, BSBSort: 102, Language: "heb", SourceSort: intp(4), Source: "אֵת", Translit: "'et", OrigStrongs: intp(853), Strongs: "H0853", StrongsSource: "tagged", Gloss: "[Obj.]"},
		{VerseID: 1, BSBSort: 103, Language: "heb", SourceSort: intp(2), Source: "בָּרָא", Translit: "ba.Ra'", ParseFull: "Verb", OrigStrongs: intp(1254), Strongs: "H1254A", StrongsSource: "tagged", SpanHead: intp(103), ChunkText: "created", SpaceBefore: true, Gloss: "to create"},
		{VerseID: 1, BSBSort: 104, ChunkText: "the heavens and the earth.", SpaceBefore: true},
	}
}

func TestBuildInterlinearVerses_GenesisOneOneWordOrderSwap(t *testing.T) {
	verses, err := domain.BuildInterlinearVerses(genesisBooks(), genesis11Rows())
	require.NoError(t, err)
	require.Len(t, verses, 1)
	v := verses[0]
	assert.Equal(t, 1, v.VerseID)
	assert.Equal(t, 1, v.Chapter)
	assert.Equal(t, 1, v.Verse)

	// Segments are in English (bsb_sort) order.
	texts := make([]string, len(v.Segments))
	for i, s := range v.Segments {
		texts[i] = s.Text
	}
	assert.Equal(t, []string{"In the beginning", "God", "created", "the heavens and the earth."}, texts)
	assert.False(t, v.Segments[0].SpaceBefore)
	assert.True(t, v.Segments[1].SpaceBefore)

	// Words are in original (source) order: beginning, created, God, marker.
	require.Len(t, v.Words, 4)
	assert.Equal(t, []string{"H7225G", "H1254A", "H0430G", "H0853"},
		[]string{v.Words[0].Strongs, v.Words[1].Strongs, v.Words[2].Strongs, v.Words[3].Strongs})
	for i, w := range v.Words {
		assert.Equal(t, i, w.ID)
		assert.Equal(t, i, w.SourceOrder)
	}

	// "created" (2nd word) points at the 3rd segment; "God" (3rd word) at the 2nd segment: the swap.
	require.NotNil(t, v.Words[1].Segment)
	assert.Equal(t, 2, *v.Words[1].Segment)
	require.NotNil(t, v.Words[2].Segment)
	assert.Equal(t, 1, *v.Words[2].Segment)
	require.NotNil(t, v.Words[0].Segment)
	assert.Equal(t, 0, *v.Words[0].Segment)

	// The untranslated object marker belongs to no phrase.
	assert.Nil(t, v.Words[3].Segment)
	assert.Equal(t, "[Obj.]", v.Words[3].Gloss)
	assert.Equal(t, "to create", v.Words[1].Gloss)
	assert.Equal(t, "tagged", v.Words[1].TagSource)
	assert.Equal(t, "Verb", v.Words[1].Parsing)
}

func TestBuildInterlinearVerses_PhraseWithTwoSourceWords(t *testing.T) {
	rows := []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 10, Language: "heb", SourceSort: intp(2), Source: "a", Strongs: "H0001A", StrongsSource: "tagged", SpanHead: intp(10), ChunkText: "whatever you want"},
		{VerseID: 1, BSBSort: 11, Language: "heb", SourceSort: intp(1), Source: "b", Strongs: "H0002", StrongsSource: "tagged", SpanHead: intp(10)}, // continuation: no chunk of its own
	}
	verses, err := domain.BuildInterlinearVerses(genesisBooks(), rows)
	require.NoError(t, err)
	require.Len(t, verses[0].Segments, 1)
	require.Len(t, verses[0].Words, 2)
	assert.Equal(t, "b", verses[0].Words[0].Source) // source order first
	require.NotNil(t, verses[0].Words[0].Segment)
	require.NotNil(t, verses[0].Words[1].Segment)
	assert.Equal(t, 0, *verses[0].Words[0].Segment)
	assert.Equal(t, 0, *verses[0].Words[1].Segment)
}

func TestBuildInterlinearVerses_GroupsByVerseAndComputesChapterAndVerse(t *testing.T) {
	rows := []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 1, ChunkText: "one"},
		{VerseID: 1, BSBSort: 2, ChunkText: "two", SpaceBefore: true},
		{VerseID: 32, BSBSort: 5, ChunkText: "next chapter"}, // ordinal 32 = Genesis 2:1
	}
	verses, err := domain.BuildInterlinearVerses(genesisBooks(), rows)
	require.NoError(t, err)
	require.Len(t, verses, 2)
	assert.Len(t, verses[0].Segments, 2)
	assert.Equal(t, 2, verses[1].Chapter)
	assert.Equal(t, 1, verses[1].Verse)
	assert.Empty(t, verses[1].Words, "an English-only verse has segments but no words")
}

func TestBuildInterlinearVerses_SpanHeadThatMatchesNoSegmentBecomesNoPhrase(t *testing.T) {
	rows := []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 10, Language: "heb", SourceSort: intp(1), Source: "a", Strongs: "H0001", StrongsSource: "fallback", SpanHead: intp(999)},
	}
	verses, err := domain.BuildInterlinearVerses(genesisBooks(), rows)
	require.NoError(t, err)
	assert.Nil(t, verses[0].Words[0].Segment)
}

func TestBuildInterlinearVerses_EmptyInputAndBadOrdinal(t *testing.T) {
	verses, err := domain.BuildInterlinearVerses(genesisBooks(), nil)
	require.NoError(t, err)
	assert.NotNil(t, verses)
	assert.Empty(t, verses)

	_, err = domain.BuildInterlinearVerses(genesisBooks(), []domain.InterlinearWordRow{{VerseID: 9999, BSBSort: 1, ChunkText: "x"}})
	require.Error(t, err)
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go -C backend test ./test/domain/ -run BuildInterlinear -v`
Expected: FAIL to compile (`undefined: domain.InterlinearWordRow`).

- [ ] **Step 3: Implement**

```go
// backend/internal/core/domain/bible_interlinear.go
package domain

import "sort"

// InterlinearWordRow is one bible_word row joined with its lexicon gloss.
// Rows are ordered by (VerseID, BSBSort). A row with an empty Language is an
// English word that has no source word.
type InterlinearWordRow struct {
	VerseID       int
	BSBSort       int
	Language      string // "heb" | "grc" | "" (English-only)
	SourceSort    *int
	Source        string
	Translit      string
	ParseShort    string
	ParseFull     string
	OrigStrongs   *int
	Strongs       string
	StrongsSource string // "tagged" | "fallback"
	SpanHead      *int   // BSBSort of the first row of this word's English phrase; nil = no phrase
	ChunkText     string
	SpaceBefore   bool
	Gloss         string
}

// InterlinearSegment is one run of the verse text; concatenating the segments
// (a space before each with SpaceBefore) reproduces the plain BSB verse.
type InterlinearSegment struct {
	Text        string
	SpaceBefore bool
}

// InterlinearWord is one source word. Words are in original order and ID is the
// index in that order. Segment is the index of its English phrase, or nil.
type InterlinearWord struct {
	ID          int
	Language    string
	Source      string
	Translit    string
	Parsing     string
	Strongs     string
	Gloss       string
	TagSource   string
	SourceOrder int
	Segment     *int
}

type InterlinearVerse struct {
	VerseID  int
	Chapter  int
	Verse    int
	Segments []InterlinearSegment
	Words    []InterlinearWord
}

type PassageInterlinear struct {
	Verses []InterlinearVerse
}

// BuildInterlinearVerses groups rows (ordered by VerseID, then BSBSort) into verses.
// Only verses that have rows are returned; callers treat a missing verse as "no
// alignment data" and show plain text.
func BuildInterlinearVerses(books []BibleBook, rows []InterlinearWordRow) ([]InterlinearVerse, error) {
	verses := []InterlinearVerse{}
	for start := 0; start < len(rows); {
		end := start
		for end < len(rows) && rows[end].VerseID == rows[start].VerseID {
			end++
		}
		verse, err := buildInterlinearVerse(books, rows[start:end])
		if err != nil {
			return nil, err
		}
		verses = append(verses, verse)
		start = end
	}
	return verses, nil
}

func buildInterlinearVerse(books []BibleBook, rows []InterlinearWordRow) (InterlinearVerse, error) {
	_, chapter, verse, err := BibleVerseFromOrdinal(books, rows[0].VerseID)
	if err != nil {
		return InterlinearVerse{}, err
	}

	segments := []InterlinearSegment{}
	segmentBySort := map[int]int{} // bsb_sort of a row with text -> index in segments
	sources := []InterlinearWordRow{}
	for _, r := range rows {
		if r.ChunkText != "" {
			segmentBySort[r.BSBSort] = len(segments)
			segments = append(segments, InterlinearSegment{Text: r.ChunkText, SpaceBefore: r.SpaceBefore})
		}
		if r.Language != "" {
			sources = append(sources, r)
		}
	}
	sort.SliceStable(sources, func(i, j int) bool { return sortKey(sources[i].SourceSort) < sortKey(sources[j].SourceSort) })

	words := make([]InterlinearWord, len(sources))
	for i, r := range sources {
		w := InterlinearWord{
			ID: i, Language: r.Language, Source: r.Source, Translit: r.Translit, Parsing: r.ParseFull,
			Strongs: r.Strongs, Gloss: r.Gloss, TagSource: r.StrongsSource, SourceOrder: i,
		}
		if r.SpanHead != nil {
			if idx, ok := segmentBySort[*r.SpanHead]; ok {
				seg := idx
				w.Segment = &seg
			}
		}
		words[i] = w
	}
	return InterlinearVerse{VerseID: rows[0].VerseID, Chapter: chapter, Verse: verse, Segments: segments, Words: words}, nil
}

func sortKey(p *int) int {
	if p == nil {
		return 1 << 30
	}
	return *p
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `go -C backend test ./test/domain/ -v`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/internal/core/domain/bible_interlinear.go backend/test/domain/bible_interlinear_test.go
git commit -m "feat(domain): assemble interlinear phrases and source words per verse"
```

### Task E2.4: Repository — read interlinear rows

**Files:**
- Modify: `backend/internal/core/ports/repositories/bible_reference_repository.go`
- Modify: `backend/internal/adapters/repositories/postgres/gorm_bible_reference_repository.go`
- Modify (add a stub method to keep them compiling): `backend/test/resolvers/passage_resolver_test.go` (`stubBibleRepo`), `backend/test/services/content_service_test.go` (`mockBibleReferenceRepo`, near line 587)
- Test: `backend/internal/adapters/repositories/postgres/gorm_bible_reference_repository_test.go`

**Interfaces:**
- Produces on `repositories.BibleReferenceRepository`: `GetInterlinearWords(ctx context.Context, startID, endID int) ([]domain.InterlinearWordRow, error)` — rows for verse ordinals `startID..endID` inclusive, ordered by `(verse_id, bsb_sort)`, each joined with its lexicon gloss (empty when the tag has none). Missing verses are simply absent.

- [ ] **Step 1: Write the failing test** (append to the existing repository test file, mirroring `TestGormBibleReferenceRepository_GetVerseTexts`)

```go
func TestGormBibleReferenceRepository_GetInterlinearWords(t *testing.T) {
	ctx := context.Background()
	cols := []string{"verse_id", "bsb_sort", "language", "source_sort", "source", "translit", "parse_short", "parse_full",
		"orig_strongs", "strongs", "strongs_source", "span_head", "chunk_text", "space_before", "gloss"}

	t.Run("maps rows including NULLs and the joined gloss", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`bible_word`).
			WithArgs(1, 2).
			WillReturnRows(sqlmock.NewRows(cols).
				AddRow(1, 100, "heb", 1, "רֵאשִׁית", "re.shit", "N", "Noun", 7225, "H7225G", "tagged", 100, "In the beginning", false, "first: beginning").
				AddRow(1, 104, "", nil, "", "", "", "", nil, "", "", nil, "the earth.", true, ""))

		got, err := NewGormBibleReferenceRepository(db).GetInterlinearWords(ctx, 1, 2)
		require.NoError(t, err)
		require.Len(t, got, 2)
		assert.Equal(t, "H7225G", got[0].Strongs)
		assert.Equal(t, "first: beginning", got[0].Gloss)
		require.NotNil(t, got[0].SourceSort)
		assert.Equal(t, 1, *got[0].SourceSort)
		require.NotNil(t, got[0].SpanHead)
		assert.Nil(t, got[1].SourceSort)
		assert.Nil(t, got[1].OrigStrongs)
		assert.Nil(t, got[1].SpanHead)
		assert.True(t, got[1].SpaceBefore)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("no rows is an empty result, not an error (unseeded environment)", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`bible_word`).WillReturnRows(sqlmock.NewRows(cols))
		got, err := NewGormBibleReferenceRepository(db).GetInterlinearWords(ctx, 1, 2)
		require.NoError(t, err)
		assert.Empty(t, got)
	})

	t.Run("wraps query errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`bible_word`).WillReturnError(errors.New("boom"))
		_, err := NewGormBibleReferenceRepository(db).GetInterlinearWords(ctx, 1, 2)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "boom")
	})
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go -C backend test ./internal/adapters/repositories/postgres/ -run GetInterlinearWords -v`
Expected: FAIL to compile (`GetInterlinearWords undefined`).

- [ ] **Step 3: Implement**

Add to the port interface (`bible_reference_repository.go`), after `GetVerseTexts`:

```go
	// GetInterlinearWords returns the interlinear rows (each joined with its lexicon
	// gloss) for verse ordinals startID..endID inclusive, ordered by verse_id then
	// bsb_sort. Verses with no alignment data are simply absent.
	GetInterlinearWords(ctx context.Context, startID, endID int) ([]domain.InterlinearWordRow, error)
```

Add to `gorm_bible_reference_repository.go`:

```go
// GetInterlinearWords reads bible_word for an inclusive ordinal range, joined with
// bible_lexicon for the gloss. The primary key (verse_id, bsb_sort) serves the range.
func (r *GormBibleReferenceRepository) GetInterlinearWords(ctx context.Context, startID, endID int) ([]domain.InterlinearWordRow, error) {
	var rows []struct {
		VerseID       int    `gorm:"column:verse_id"`
		BSBSort       int    `gorm:"column:bsb_sort"`
		Language      string `gorm:"column:language"`
		SourceSort    *int   `gorm:"column:source_sort"`
		Source        string `gorm:"column:source"`
		Translit      string `gorm:"column:translit"`
		ParseShort    string `gorm:"column:parse_short"`
		ParseFull     string `gorm:"column:parse_full"`
		OrigStrongs   *int   `gorm:"column:orig_strongs"`
		Strongs       string `gorm:"column:strongs"`
		StrongsSource string `gorm:"column:strongs_source"`
		SpanHead      *int   `gorm:"column:span_head"`
		ChunkText     string `gorm:"column:chunk_text"`
		SpaceBefore   bool   `gorm:"column:space_before"`
		Gloss         string `gorm:"column:gloss"`
	}
	err := r.db.WithContext(ctx).
		Table("bible_word AS w").
		Select("w.verse_id", "w.bsb_sort", "w.language", "w.source_sort", "w.source", "w.translit", "w.parse_short",
			"w.parse_full", "w.orig_strongs", "w.strongs", "w.strongs_source", "w.span_head", "w.chunk_text",
			"w.space_before", "COALESCE(l.gloss, '') AS gloss").
		Joins("LEFT JOIN bible_lexicon AS l ON l.tag = w.strongs").
		Where("w.verse_id BETWEEN ? AND ?", startID, endID).
		Order("w.verse_id, w.bsb_sort").
		Scan(&rows).Error
	if err != nil {
		return nil, fmt.Errorf("failed to load interlinear words: %w", err)
	}
	out := make([]domain.InterlinearWordRow, len(rows))
	for i, x := range rows {
		out[i] = domain.InterlinearWordRow{
			VerseID: x.VerseID, BSBSort: x.BSBSort, Language: x.Language, SourceSort: x.SourceSort, Source: x.Source,
			Translit: x.Translit, ParseShort: x.ParseShort, ParseFull: x.ParseFull, OrigStrongs: x.OrigStrongs,
			Strongs: x.Strongs, StrongsSource: x.StrongsSource, SpanHead: x.SpanHead, ChunkText: x.ChunkText,
			SpaceBefore: x.SpaceBefore, Gloss: x.Gloss,
		}
	}
	return out, nil
}
```

Add a method to each existing test double so the packages still compile.

In `backend/test/resolvers/passage_resolver_test.go`, next to `stubBibleRepo.GetVerseTexts` (E2.6 replaces this body with canned rows):

```go
func (stubBibleRepo) GetInterlinearWords(ctx context.Context, startID, endID int) ([]domain.InterlinearWordRow, error) {
	return nil, nil
}
```

In `backend/test/services/content_service_test.go`, extend the existing struct and add the method beside `GetVerseTexts` (the mock is a plain struct with `books`, `err`, `texts`; add one field):

```go
type mockBibleReferenceRepo struct {
	books []domain.BibleBook
	err   error
	texts []domain.BibleVerseText
	words []domain.InterlinearWordRow
}

func (m *mockBibleReferenceRepo) GetInterlinearWords(ctx context.Context, startID, endID int) ([]domain.InterlinearWordRow, error) {
	var out []domain.InterlinearWordRow
	for _, w := range m.words {
		if w.VerseID >= startID && w.VerseID <= endID {
			out = append(out, w)
		}
	}
	return out, m.err
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `go -C backend test ./internal/adapters/repositories/postgres/ -v`
Expected: PASS. If the sqlmock regexp for `bible_word` does not match GORM's emitted SQL, loosen it to the table name only (as written) — do not change the query.
Run: `go -C backend build ./...`
Expected: compiles (all test doubles updated; if a compile error names another implementer of the interface, add the same method there).

- [ ] **Step 5: Commit**

```bash
git add backend/internal/core/ports/repositories/bible_reference_repository.go backend/internal/adapters/repositories/postgres backend/test
git commit -m "feat(repo): read interlinear words joined with lexicon glosses"
```

### Task E2.5: Service — `PassageInterlinear`

**Files:**
- Modify: `backend/internal/core/ports/services/content_service.go` (interface), `backend/internal/core/services/content_service.go`
- Modify: `backend/internal/adapters/graphql/directives/auth_test.go` (`mockContentService` gets the method)
- Test: `backend/test/services/content_service_test.go`

**Interfaces:**
- Consumes `repositories.BibleReferenceRepository.GetInterlinearWords`, `domain.BuildInterlinearVerses`, existing `MaxPassageTextVerses` (2500) and `domain.ErrInvalidPassage`.
- Produces on `ContentService`: `PassageInterlinear(ctx context.Context, startVerseID, endVerseID int) (*domain.PassageInterlinear, error)`. Same validation as `PassageText` (range, cap, "not configured"); **no rows is not an error** (returns an empty `Verses` slice) so an unseeded environment degrades gracefully.

- [ ] **Step 1: Write the failing tests** (append to `backend/test/services/content_service_test.go`; it already has `testBibleBooks()` — Genesis 31/25/24 verses, Exodus 22/25 — `mockBibleReferenceRepo` (extended in E2.4) and imports `errors`, `context`, `testify`; add any that are missing)

```go
func interlinearPtr(n int) *int { return &n }

func TestPassageInterlinear(t *testing.T) {
	ctx := context.Background()
	newSvc := func(repo *mockBibleReferenceRepo) *services.ContentService {
		return services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, services.WithBibleReference(repo))
	}
	words := []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 1, Language: "heb", SourceSort: interlinearPtr(1), Source: "a", Strongs: "H0001", StrongsSource: "tagged", SpanHead: interlinearPtr(1), ChunkText: "In", Gloss: "x"},
		{VerseID: 2, BSBSort: 9, ChunkText: "Now"},
		{VerseID: 40, BSBSort: 5, ChunkText: "outside the requested range"},
	}

	t.Run("builds verses from the repository rows inside the range", func(t *testing.T) {
		got, err := newSvc(&mockBibleReferenceRepo{books: testBibleBooks(), words: words}).PassageInterlinear(ctx, 1, 2)
		require.NoError(t, err)
		require.Len(t, got.Verses, 2)
		assert.Equal(t, "In", got.Verses[0].Segments[0].Text)
		assert.Equal(t, "x", got.Verses[0].Words[0].Gloss)
		assert.Empty(t, got.Verses[1].Words)
	})

	t.Run("no rows is an empty result, not an error", func(t *testing.T) {
		got, err := newSvc(&mockBibleReferenceRepo{books: testBibleBooks()}).PassageInterlinear(ctx, 1, 3)
		require.NoError(t, err)
		assert.NotNil(t, got.Verses)
		assert.Empty(t, got.Verses)
	})

	t.Run("rejects bad ranges and oversize requests", func(t *testing.T) {
		svc := newSvc(&mockBibleReferenceRepo{books: testBibleBooks()})
		_, err := svc.PassageInterlinear(ctx, 0, 1)
		assert.ErrorIs(t, err, domain.ErrInvalidPassage)
		_, err = svc.PassageInterlinear(ctx, 5, 4)
		assert.ErrorIs(t, err, domain.ErrInvalidPassage)
		_, err = svc.PassageInterlinear(ctx, 1, services.MaxPassageTextVerses+1)
		assert.ErrorIs(t, err, domain.ErrInvalidPassage)
	})

	t.Run("propagates repository errors", func(t *testing.T) {
		_, err := newSvc(&mockBibleReferenceRepo{books: testBibleBooks(), err: errors.New("db down")}).PassageInterlinear(ctx, 1, 2)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "db down")
	})

	t.Run("requires bible support to be configured", func(t *testing.T) {
		unconfigured := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{})
		_, err := unconfigured.PassageInterlinear(ctx, 1, 1)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "not configured")
	})
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go -C backend test ./test/services/ -run PassageInterlinear -v`
Expected: FAIL to compile (`svc.PassageInterlinear undefined`).

- [ ] **Step 3: Implement**

Add to the interface in `ports/services/content_service.go` after `PassageText`:

```go
	// PassageInterlinear returns word alignment for the verse-ordinal range startVerseID..endVerseID.
	// Verses without alignment data are absent from the result (not an error).
	PassageInterlinear(ctx context.Context, startVerseID, endVerseID int) (*domain.PassageInterlinear, error)
```

Add to `services/content_service.go` after `PassageText`:

```go
// PassageInterlinear returns the interlinear (original-language) data for a verse range.
// It applies the same range and size limits as PassageText. A range with no alignment
// rows (unseeded environment, omitted verses) yields an empty result, not an error, so
// the client can show plain text.
func (s *ContentService) PassageInterlinear(ctx context.Context, startVerseID, endVerseID int) (*domain.PassageInterlinear, error) {
	if s.bibleRepo == nil {
		return nil, errors.New("bible passage support is not configured")
	}
	if startVerseID < 1 || endVerseID < startVerseID {
		return nil, fmt.Errorf("%w: invalid verse range %d-%d", domain.ErrInvalidPassage, startVerseID, endVerseID)
	}
	if endVerseID-startVerseID+1 > MaxPassageTextVerses {
		return nil, fmt.Errorf("%w: passage exceeds %d verses", domain.ErrInvalidPassage, MaxPassageTextVerses)
	}

	books, err := s.bibleRepo.ListBooks(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to load bible reference data: %w", err)
	}
	rows, err := s.bibleRepo.GetInterlinearWords(ctx, startVerseID, endVerseID)
	if err != nil {
		return nil, fmt.Errorf("failed to load interlinear words: %w", err)
	}
	verses, err := domain.BuildInterlinearVerses(books, rows)
	if err != nil {
		return nil, err
	}
	return &domain.PassageInterlinear{Verses: verses}, nil
}
```

In `internal/adapters/graphql/directives/auth_test.go`, add to `mockContentService` next to its `PassageText`:

```go
func (m *mockContentService) PassageInterlinear(ctx context.Context, startVerseID, endVerseID int) (*domain.PassageInterlinear, error) {
	return nil, nil
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `go -C backend test ./test/services/ ./internal/adapters/graphql/directives/ -v`
Expected: PASS.
Run: `go -C backend build ./...`
Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add backend/internal backend/test
git commit -m "feat(service): add PassageInterlinear with the same limits as PassageText"
```

### Task E2.6: GraphQL query `passageInterlinear`

**Files:**
- Modify: `backend/schema.graphql`
- Modify: `backend/internal/adapters/graphql/resolvers/content.resolvers.go`
- Regenerate: `backend/internal/adapters/graphql/generated/generated.go`, `backend/internal/adapters/graphql/model/models_gen.go`
- Test: `backend/test/resolvers/passage_resolver_test.go`

**Interfaces:**
- Consumes `ContentService.PassageInterlinear` (E2.5).
- Produces the public GraphQL contract the frontend (E3) relies on:

```graphql
type InterlinearSegment {
  text: String!
  spaceBefore: Boolean!
}

type InterlinearWord {
  id: Int!
  language: String!
  source: String!
  translit: String!
  parsing: String!
  strongs: String!
  gloss: String!
  tagSource: String!
  sourceOrder: Int!
  segment: Int
}

type InterlinearVerse {
  verseId: Int!
  chapter: Int!
  verse: Int!
  segments: [InterlinearSegment!]!
  words: [InterlinearWord!]!
}

type PassageInterlinear {
  verses: [InterlinearVerse!]!
}
```
and `passageInterlinear(startVerseId: Int!, endVerseId: Int!): PassageInterlinear!` on `Query` (public, like `passageText`).

- [ ] **Step 1: Write the failing test** (extend the stub and add tests; `executeGraphQL` and `setupPassageTestServer` already exist)

Replace the E2.4 stub method with a real one returning canned rows for verses 1..3:

```go
func (stubBibleRepo) GetInterlinearWords(ctx context.Context, startID, endID int) ([]domain.InterlinearWordRow, error) {
	one, two, three := 1, 2, 3
	all := []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 100, Language: "heb", SourceSort: &one, Source: "רֵאשִׁית", Translit: "re.shit", ParseFull: "Noun", Strongs: "H7225G", StrongsSource: "tagged", SpanHead: &[]int{100}[0], ChunkText: "In the beginning", Gloss: "first: beginning"},
		{VerseID: 1, BSBSort: 101, Language: "heb", SourceSort: &three, Source: "אֱלֹהִים", Translit: "'E.lo.Him", Strongs: "H0430G", StrongsSource: "tagged", SpanHead: &[]int{101}[0], ChunkText: "God", SpaceBefore: true, Gloss: "God"},
		{VerseID: 1, BSBSort: 103, Language: "heb", SourceSort: &two, Source: "בָּרָא", Translit: "ba.Ra'", Strongs: "H1254A", StrongsSource: "tagged", SpanHead: &[]int{103}[0], ChunkText: "created", SpaceBefore: true, Gloss: "to create"},
	}
	var out []domain.InterlinearWordRow
	for _, r := range all {
		if r.VerseID >= startID && r.VerseID <= endID {
			out = append(out, r)
		}
	}
	return out, nil
}
```

```go
func TestPassageInterlinear_Query(t *testing.T) {
	server := setupPassageTestServer(&mockContentRepository{}, domain.UserRoleDefault)
	defer server.Close()

	result := executeGraphQL(t, server, `query { passageInterlinear(startVerseId: 1, endVerseId: 3) { verses { verseId chapter verse segments { text spaceBefore } words { id language source strongs gloss tagSource sourceOrder segment } } } }`)
	require.Empty(t, result.Errors)

	var data struct {
		PassageInterlinear struct {
			Verses []struct {
				VerseID  int `json:"verseId"`
				Chapter  int `json:"chapter"`
				Verse    int `json:"verse"`
				Segments []struct {
					Text        string `json:"text"`
					SpaceBefore bool   `json:"spaceBefore"`
				} `json:"segments"`
				Words []struct {
					ID          int    `json:"id"`
					Strongs     string `json:"strongs"`
					Gloss       string `json:"gloss"`
					TagSource   string `json:"tagSource"`
					SourceOrder int    `json:"sourceOrder"`
					Segment     *int   `json:"segment"`
				} `json:"words"`
			} `json:"verses"`
		} `json:"passageInterlinear"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	require.Len(t, data.PassageInterlinear.Verses, 1) // only verse 1 has data; verses 2-3 are simply absent
	v := data.PassageInterlinear.Verses[0]
	assert.Equal(t, 1, v.Verse)
	require.Len(t, v.Segments, 3)
	assert.Equal(t, "God", v.Segments[1].Text)
	require.Len(t, v.Words, 3)
	assert.Equal(t, []string{"H7225G", "H1254A", "H0430G"}, []string{v.Words[0].Strongs, v.Words[1].Strongs, v.Words[2].Strongs})
	assert.Equal(t, "to create", v.Words[1].Gloss)
	require.NotNil(t, v.Words[1].Segment)
	assert.Equal(t, 2, *v.Words[1].Segment) // created -> 3rd English phrase
	require.NotNil(t, v.Words[2].Segment)
	assert.Equal(t, 1, *v.Words[2].Segment) // God -> 2nd English phrase
}

func TestPassageInterlinear_Query_NoDataIsAnEmptyList(t *testing.T) {
	server := setupPassageTestServer(&mockContentRepository{}, domain.UserRoleDefault)
	defer server.Close()
	result := executeGraphQL(t, server, `query { passageInterlinear(startVerseId: 2, endVerseId: 3) { verses { verseId } } }`)
	require.Empty(t, result.Errors)
	assert.Contains(t, string(result.Data), `"verses":[]`)
}

func TestPassageInterlinear_Query_RejectsBadRange(t *testing.T) {
	server := setupPassageTestServer(&mockContentRepository{}, domain.UserRoleDefault)
	defer server.Close()
	result := executeGraphQL(t, server, `query { passageInterlinear(startVerseId: 5, endVerseId: 2) { verses { verseId } } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid")
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `go -C backend test ./test/resolvers/ -run PassageInterlinear -v`
Expected: FAIL (`Cannot query field "passageInterlinear"` in the response errors).

- [ ] **Step 3: Add the schema, regenerate, implement the resolver**

Add the types above near `PassageText` in `backend/schema.graphql`, and add to `type Query` after `passageText`:

```graphql
  # Original-language word alignment for verse ordinals startVerseId..endVerseId (inclusive, capped server-side).
  # Verses without alignment data are absent from the result.
  passageInterlinear(startVerseId: Int!, endVerseId: Int!): PassageInterlinear!
```

Run: `make -C backend graphql-gen`
Then handle the stray file per the repo rule: `git status` shows `backend/internal/adapters/graphql/resolvers/schema.resolvers.go`; open it, copy the new `PassageInterlinear` stub into `content.resolvers.go`, then delete the stray file.

Resolver in `content.resolvers.go`, next to `PassageText`:

```go
// PassageInterlinear is the resolver for the passageInterlinear field.
func (r *queryResolver) PassageInterlinear(ctx context.Context, startVerseID int, endVerseID int) (*model.PassageInterlinear, error) {
	result, err := r.ContentService.PassageInterlinear(ctx, startVerseID, endVerseID)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, err
		}
		slog.Error("failed to load passage interlinear", "start", startVerseID, "end", endVerseID, "error", err)
		return nil, fmt.Errorf("failed to load passage interlinear")
	}

	verses := make([]*model.InterlinearVerse, len(result.Verses))
	for i, v := range result.Verses {
		segments := make([]*model.InterlinearSegment, len(v.Segments))
		for j, s := range v.Segments {
			segments[j] = &model.InterlinearSegment{Text: s.Text, SpaceBefore: s.SpaceBefore}
		}
		words := make([]*model.InterlinearWord, len(v.Words))
		for j, w := range v.Words {
			words[j] = &model.InterlinearWord{
				ID: w.ID, Language: w.Language, Source: w.Source, Translit: w.Translit, Parsing: w.Parsing,
				Strongs: w.Strongs, Gloss: w.Gloss, TagSource: w.TagSource, SourceOrder: w.SourceOrder, Segment: w.Segment,
			}
		}
		verses[i] = &model.InterlinearVerse{VerseID: v.VerseID, Chapter: v.Chapter, Verse: v.Verse, Segments: segments, Words: words}
	}
	return &model.PassageInterlinear{Verses: verses}, nil
}
```

(Check how the existing `PassageText` resolver classifies its errors — lines 232–243 of `content.resolvers.go` — and mirror it exactly; the version above assumes `domain.ErrInvalidInput` is the parent of `ErrInvalidPassage`, which `bible_reference.go:12` confirms.)

- [ ] **Step 4: Run to verify it passes**

Run: `go -C backend test ./... `
Expected: PASS across the backend (the existing `PassageText` and passage-mutation tests must still pass).
Run: `gofmt -l backend` — Expected: no output.
Run: `go -C backend build ./...` — Expected: compiles.

- [ ] **Step 5: Commit**

```bash
git add backend
git commit -m "feat(graphql): add passageInterlinear query"
```

PR body (`feature.md` template): summary, the E1 data contract it consumes, **"Requires a manual `migrate up` (000026) against each environment, then a human runs `go run ./cmd/seed-bible` with the downloaded release files; the seeder skips the interlinear step when the files are absent"**, and a note that no environment has been touched by this PR.

---

# PR E3: Frontend ("Show original language")

**Branch:** `feature/bible-interlinear-frontend` (from updated `feature/add-bible-content-types`; needs E2's GraphQL contract, not its data). All commands run from `frontend/` via `pnpm --dir frontend ...` (one command per Bash call). Components use **Svelte 5 runes only**; queries use the `createQuery(() => ({...}))` function-wrapper pattern and the authenticated `graphqlRequest()` wrapper (never the bare client).

**Verify commands for this PR:** `pnpm --dir frontend run test:run`, `pnpm --dir frontend run check` (one pre-existing error in `tests/browser/ag-grid-integration.test.ts` is known and unrelated), `pnpm --dir frontend exec prettier --write <touched files>`.

### Task E3.1: Query, response types and cache key

**Files:**
- Modify: `frontend/src/lib/queries/bible/index.ts`, `frontend/src/lib/queries/keys.ts`
- Test: `frontend/tests/unit/interlinearQuery.test.ts`

**Interfaces:**
- Produces `PASSAGE_INTERLINEAR_QUERY`, the types `InterlinearSegment`, `InterlinearWord`, `InterlinearVerse`, `PassageInterlinearResponse`, and `queryKeys.bible.passageInterlinear(startVerseId, endVerseId)`. These mirror the GraphQL contract from E2.6 exactly.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/interlinearQuery.test.ts
import { describe, it, expect } from 'vitest';
import { PASSAGE_INTERLINEAR_QUERY } from '$lib/queries/bible';
import { queryKeys } from '$lib/queries/keys';

describe('passage interlinear query', () => {
	it('asks for every field the UI renders, using the GraphQL names from the backend contract', () => {
		for (const field of [
			'passageInterlinear',
			'startVerseId',
			'endVerseId',
			'verseId',
			'chapter',
			'segments',
			'spaceBefore',
			'words',
			'language',
			'source',
			'translit',
			'parsing',
			'strongs',
			'gloss',
			'tagSource',
			'sourceOrder',
			'segment',
		]) {
			expect(PASSAGE_INTERLINEAR_QUERY).toContain(field);
		}
	});

	it('cache key includes both verse ids so changing the range refetches', () => {
		expect(queryKeys.bible.passageInterlinear(1, 5)).toEqual([...queryKeys.bible.all(), 'interlinear', 1, 5]);
		expect(queryKeys.bible.passageInterlinear(1, 5)).not.toEqual(queryKeys.bible.passageInterlinear(1, 6));
		// distinct from the plain-text key for the same range
		expect(queryKeys.bible.passageInterlinear(1, 5)).not.toEqual(queryKeys.bible.passageText(1, 5));
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir frontend exec vitest run tests/unit/interlinearQuery.test.ts`
Expected: FAIL (`PASSAGE_INTERLINEAR_QUERY` is not exported).

- [ ] **Step 3: Implement**

Append to `frontend/src/lib/queries/bible/index.ts`:

```ts
// Public query; lazy — only sent after the reader presses "Show original language".
// Verses without alignment data are absent from the response (callers show plain text for them).
export const PASSAGE_INTERLINEAR_QUERY = gql`
	query PassageInterlinear($startVerseId: Int!, $endVerseId: Int!) {
		passageInterlinear(startVerseId: $startVerseId, endVerseId: $endVerseId) {
			verses {
				verseId
				chapter
				verse
				segments {
					text
					spaceBefore
				}
				words {
					id
					language
					source
					translit
					parsing
					strongs
					gloss
					tagSource
					sourceOrder
					segment
				}
			}
		}
	}
`;

export interface InterlinearSegment {
	text: string;
	spaceBefore: boolean;
}

export interface InterlinearWord {
	/** index within its verse's `words` (which are in original-language order) */
	id: number;
	language: 'heb' | 'grc';
	source: string;
	translit: string;
	parsing: string;
	/** disambiguated tag, e.g. "H1254B" (display with formatStrongs) */
	strongs: string;
	gloss: string;
	tagSource: 'tagged' | 'fallback';
	sourceOrder: number;
	/** index into the verse's `segments` of the English phrase, or null when the word belongs to no phrase */
	segment: number | null;
}

export interface InterlinearVerse {
	verseId: number;
	chapter: number;
	verse: number;
	segments: InterlinearSegment[];
	words: InterlinearWord[];
}

export interface PassageInterlinearResponse {
	passageInterlinear: { verses: InterlinearVerse[] };
}
```

In `keys.ts`, inside `bible: { ... }`:

```ts
		passageInterlinear: (startVerseId: number, endVerseId: number) =>
			[...queryKeys.bible.all(), 'interlinear', startVerseId, endVerseId] as const,
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --dir frontend exec vitest run tests/unit/interlinearQuery.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --dir frontend exec prettier --write src/lib/queries/bible/index.ts src/lib/queries/keys.ts tests/unit/interlinearQuery.test.ts
git add frontend/src/lib/queries frontend/tests/unit/interlinearQuery.test.ts
git commit -m "feat(frontend): add passageInterlinear query, types and cache key"
```

### Task E3.2: Pure helpers — Strong's formatting, hover/pin state machine, popover and connector geometry

**Files:**
- Create: `frontend/src/lib/utils/interlinear.ts`
- Test: `frontend/tests/unit/interlinear.test.ts`

**Interfaces:**
- Consumes `InterlinearVerse`, `InterlinearWord` from E3.1.
- Produces (all pure, no DOM):
  - `formatStrongs(tag: string): string` — `'H0430G' → 'H430'`, `'H1254B' → 'H1254'`, `'G3439' → 'G3439'`, `'' → ''`.
  - `wordKey(verseId: number, wordId: number): string` — `'1:2'`.
  - `phraseWordIds(verse: InterlinearVerse, segment: number): number[]` — ids of the words whose `segment` is that index, in original order.
  - `primaryWordKey(verse: InterlinearVerse, segment: number): string | null` — key of the first word of the phrase in original order, or `null` when none.
  - `InterlinearState = { hover: string | null; pinned: string | null }`, `initialInterlinearState`, `type InterlinearEvent`, `reduceInterlinear(state, event): InterlinearState`, `activeKey(state): string | null`.
  - `interface Rect { left: number; top: number; right: number; bottom: number }`
  - `placePopover(anchor: Rect, container: Rect, popoverWidth: number, gap?: number): { left: number; top: number }` — coordinates relative to `container`, left-aligned to the anchor and clamped inside the container, `gap` (default 9) below the anchor's bottom.
  - `connectorLine(word: Rect, chip: Rect, container: Rect): { x1: number; y1: number; x2: number; y2: number }` — from the **bottom-centre of the word** to the **top-centre of the chip**, relative to `container`.

State machine (verified against the prototype's behavior): `enter(key)` sets hover; `leave(key)` clears hover only if it is that key; `click(key)` toggles pin (pinned ↔ unpinned) and sets hover; `dblclick` clears both; `escape` clears both; `outside` clears both. `activeKey` is `pinned ?? hover`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/interlinear.test.ts
import { describe, it, expect } from 'vitest';
import {
	formatStrongs,
	wordKey,
	phraseWordIds,
	primaryWordKey,
	initialInterlinearState,
	reduceInterlinear,
	activeKey,
	placePopover,
	connectorLine,
} from '$lib/utils/interlinear';
import type { InterlinearVerse } from '$lib/queries/bible';

const verse: InterlinearVerse = {
	verseId: 1,
	chapter: 1,
	verse: 1,
	segments: [
		{ text: 'In the beginning', spaceBefore: false },
		{ text: 'God', spaceBefore: true },
		{ text: 'created', spaceBefore: true },
	],
	// original (Hebrew) order: beginning, created, God, marker; two words share phrase 0
	words: [
		{ id: 0, language: 'heb', source: 'a', translit: 'a', parsing: '', strongs: 'H7225G', gloss: 'first: beginning', tagSource: 'tagged', sourceOrder: 0, segment: 0 },
		{ id: 1, language: 'heb', source: 'b', translit: 'b', parsing: '', strongs: 'H1254A', gloss: 'to create', tagSource: 'tagged', sourceOrder: 1, segment: 2 },
		{ id: 2, language: 'heb', source: 'c', translit: 'c', parsing: '', strongs: 'H0430G', gloss: 'God', tagSource: 'tagged', sourceOrder: 2, segment: 1 },
		{ id: 3, language: 'heb', source: 'd', translit: 'd', parsing: '', strongs: 'H0853', gloss: '[Obj.]', tagSource: 'tagged', sourceOrder: 3, segment: null },
		{ id: 4, language: 'heb', source: 'e', translit: 'e', parsing: '', strongs: 'H0001', gloss: 'x', tagSource: 'fallback', sourceOrder: 4, segment: 0 },
	],
};

describe('formatStrongs', () => {
	it('drops zero padding and the sense letter', () => {
		expect(formatStrongs('H0430G')).toBe('H430');
		expect(formatStrongs('H1254B')).toBe('H1254');
		expect(formatStrongs('G3439')).toBe('G3439');
		expect(formatStrongs('H0853')).toBe('H853');
	});
	it('returns an empty string for an empty tag', () => {
		expect(formatStrongs('')).toBe('');
	});
});

describe('phrase helpers', () => {
	it('wordKey is verse-qualified', () => {
		expect(wordKey(26137, 3)).toBe('26137:3');
	});
	it('a phrase can have several source words, in original order', () => {
		expect(phraseWordIds(verse, 0)).toEqual([0, 4]);
		expect(phraseWordIds(verse, 1)).toEqual([2]);
	});
	it('the primary word of a phrase is its first source word', () => {
		expect(primaryWordKey(verse, 0)).toBe('1:0');
		expect(primaryWordKey(verse, 2)).toBe('1:1');
	});
	it('a phrase with no words has no primary word', () => {
		expect(primaryWordKey(verse, 99)).toBeNull();
	});
});

describe('interlinear state machine', () => {
	const s0 = initialInterlinearState;

	it('starts idle', () => {
		expect(activeKey(s0)).toBeNull();
	});
	it('hover shows a word and leaving hides it', () => {
		const hovered = reduceInterlinear(s0, { type: 'enter', key: 'a' });
		expect(activeKey(hovered)).toBe('a');
		expect(activeKey(reduceInterlinear(hovered, { type: 'leave', key: 'a' }))).toBeNull();
	});
	it('leaving a different word does not clear the current hover', () => {
		const hovered = reduceInterlinear(s0, { type: 'enter', key: 'b' });
		expect(activeKey(reduceInterlinear(hovered, { type: 'leave', key: 'a' }))).toBe('b');
	});
	it('click pins, and the pin survives leaving', () => {
		let s = reduceInterlinear(s0, { type: 'enter', key: 'a' });
		s = reduceInterlinear(s, { type: 'click', key: 'a' });
		expect(s.pinned).toBe('a');
		s = reduceInterlinear(s, { type: 'leave', key: 'a' });
		expect(activeKey(s)).toBe('a');
	});
	it('clicking the pinned word again unpins it', () => {
		let s = reduceInterlinear(s0, { type: 'click', key: 'a' });
		s = reduceInterlinear(s, { type: 'click', key: 'a' });
		expect(s.pinned).toBeNull();
	});
	it('clicking another word moves the pin', () => {
		let s = reduceInterlinear(s0, { type: 'click', key: 'a' });
		s = reduceInterlinear(s, { type: 'click', key: 'b' });
		expect(s.pinned).toBe('b');
	});
	it('a pinned word wins over a hovered word', () => {
		let s = reduceInterlinear(s0, { type: 'click', key: 'a' });
		s = reduceInterlinear(s, { type: 'enter', key: 'b' });
		expect(activeKey(s)).toBe('a');
	});
	it('double-click, Escape and outside all clear everything', () => {
		const pinned = reduceInterlinear(reduceInterlinear(s0, { type: 'enter', key: 'a' }), { type: 'click', key: 'a' });
		for (const type of ['dblclick', 'escape', 'outside'] as const) {
			const cleared = reduceInterlinear(pinned, { type });
			expect(cleared).toEqual({ hover: null, pinned: null });
		}
	});
});

describe('geometry', () => {
	const container = { left: 100, top: 200, right: 700, bottom: 800 };

	it('popover sits below the anchor, left-aligned to it, relative to the container', () => {
		const chip = { left: 180, top: 500, right: 230, bottom: 530 };
		expect(placePopover(chip, container, 260)).toEqual({ left: 80, top: 339 }); // (180-100), (530-200)+9
	});
	it('popover is clamped inside the container on the right and left', () => {
		const far = { left: 690, top: 500, right: 700, bottom: 530 };
		expect(placePopover(far, container, 260).left).toBe(340); // container width 600 - 260
		const before = { left: 50, top: 500, right: 60, bottom: 530 };
		expect(placePopover(before, container, 260).left).toBe(0);
	});
	it('connector runs from the bottom-centre of the word to the top-centre of the chip', () => {
		const word = { left: 262, top: 368, right: 320, bottom: 390 };
		const chip = { left: 176, top: 500, right: 206, bottom: 534 };
		// verified live against the prototype: created -> H1254 chip
		expect(connectorLine(word, chip, { left: 77, top: 361, right: 1203, bottom: 562 })).toEqual({
			x1: 214, // 291 - 77
			y1: 29, // 390 - 361
			x2: 114, // 191 - 77
			y2: 139, // 500 - 361
		});
	});
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir frontend exec vitest run tests/unit/interlinear.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement**

```ts
// frontend/src/lib/utils/interlinear.ts
import type { InterlinearVerse } from '$lib/queries/bible';

/** 'H0430G' -> 'H430', 'H1254B' -> 'H1254'. Zero padding and the sense letter are internal. */
export function formatStrongs(tag: string): string {
	const m = /^([HG])0*(\d+)/.exec(tag);
	return m ? `${m[1]}${m[2]}` : '';
}

export function wordKey(verseId: number, wordId: number): string {
	return `${verseId}:${wordId}`;
}

export function phraseWordIds(verse: InterlinearVerse, segment: number): number[] {
	return verse.words.filter((w) => w.segment === segment).map((w) => w.id);
}

/** The word a phrase activates: its first source word in original order. */
export function primaryWordKey(verse: InterlinearVerse, segment: number): string | null {
	const ids = phraseWordIds(verse, segment);
	return ids.length ? wordKey(verse.verseId, ids[0]) : null;
}

export interface InterlinearState {
	hover: string | null;
	pinned: string | null;
}

export type InterlinearEvent =
	| { type: 'enter'; key: string }
	| { type: 'leave'; key: string }
	| { type: 'click'; key: string }
	| { type: 'dblclick' }
	| { type: 'escape' }
	| { type: 'outside' };

export const initialInterlinearState: InterlinearState = { hover: null, pinned: null };

export function reduceInterlinear(state: InterlinearState, event: InterlinearEvent): InterlinearState {
	switch (event.type) {
		case 'enter':
			return { ...state, hover: event.key };
		case 'leave':
			return state.hover === event.key ? { ...state, hover: null } : state;
		case 'click':
			return { hover: event.key, pinned: state.pinned === event.key ? null : event.key };
		case 'dblclick':
		case 'escape':
		case 'outside':
			return { hover: null, pinned: null };
	}
}

export function activeKey(state: InterlinearState): string | null {
	return state.pinned ?? state.hover;
}

export interface Rect {
	left: number;
	top: number;
	right: number;
	bottom: number;
}

/** Popover position relative to `container`: below the anchor, left-aligned to it, clamped inside the container. */
export function placePopover(anchor: Rect, container: Rect, popoverWidth: number, gap = 9): { left: number; top: number } {
	const maxLeft = Math.max(0, container.right - container.left - popoverWidth);
	const left = Math.min(Math.max(anchor.left - container.left, 0), maxLeft);
	return { left, top: anchor.bottom - container.top + gap };
}

/** Line from the bottom-centre of the English word to the top-centre of its chip, relative to `container`. */
export function connectorLine(word: Rect, chip: Rect, container: Rect) {
	return {
		x1: (word.left + word.right) / 2 - container.left,
		y1: word.bottom - container.top,
		x2: (chip.left + chip.right) / 2 - container.left,
		y2: chip.top - container.top,
	};
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --dir frontend exec vitest run tests/unit/interlinear.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
pnpm --dir frontend exec prettier --write src/lib/utils/interlinear.ts tests/unit/interlinear.test.ts
git add frontend/src/lib/utils/interlinear.ts frontend/tests/unit/interlinear.test.ts
git commit -m "feat(frontend): interlinear state machine and popover/connector geometry helpers"
```

### Task E3.3: `WordPopover` and `InterlinearCredit`

**Files:**
- Create: `frontend/src/lib/components/interlinear/WordPopover.svelte`, `frontend/src/lib/components/interlinear/InterlinearCredit.svelte`
- Test: `frontend/tests/components/interlinear/WordPopover.test.ts`, `frontend/tests/components/interlinear/InterlinearCredit.test.ts`

**Interfaces:**
- Consumes `InterlinearWord` (E3.1), `formatStrongs` (E3.2).
- Produces `WordPopover` with props `{ word: InterlinearWord; english: string | null; left: number; top: number; id: string }` — a non-interactive `role="tooltip"` block positioned absolutely at `left`/`top`; shows the formatted Strong's number, language label ("Hebrew"/"Greek"), the source word (`dir="rtl"` for Hebrew), the transliteration, the gloss, the parsing, and — when `english` is set — "Rendered here as “…”". Long parsing text wraps.
- Produces `InterlinearCredit` (no props): "Word alignment: Berean Standard Bible (public domain). Meanings and word tags: **STEP Bible** (link to `https://www.stepbible.org`), Tyndale House, CC BY 4.0." The link text is exactly `STEP Bible`, opens in a new tab with `rel="noopener noreferrer"`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/components/interlinear/WordPopover.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import WordPopover from '$lib/components/interlinear/WordPopover.svelte';
import type { InterlinearWord } from '$lib/queries/bible';

const hebrew: InterlinearWord = {
	id: 1, language: 'heb', source: 'בָּרָא', translit: "ba.Ra'",
	parsing: 'Verb - Qal - Perfect - third person masculine singular',
	strongs: 'H1254A', gloss: 'to create', tagSource: 'tagged', sourceOrder: 1, segment: 2,
};
const greek: InterlinearWord = { ...hebrew, id: 2, language: 'grc', source: 'μονογενῆ', translit: 'monogenē', strongs: 'G3439', gloss: 'unique' };

describe('WordPopover', () => {
	it('shows the formatted number, language, source word, transliteration, gloss and parsing', () => {
		render(WordPopover, { props: { word: hebrew, english: 'created', left: 10, top: 20, id: 'pop' } });
		expect(screen.getByText('H1254')).toBeInTheDocument();
		expect(screen.getByText('Hebrew')).toBeInTheDocument();
		expect(screen.getByText('בָּרָא')).toBeInTheDocument();
		expect(screen.getByText("ba.Ra'")).toBeInTheDocument();
		expect(screen.getByText('to create')).toBeInTheDocument();
		expect(screen.getByText(/third person masculine singular/)).toBeInTheDocument();
		expect(screen.getByText(/created/)).toBeInTheDocument();
	});

	it('is a non-interactive tooltip positioned where it was told to be', () => {
		render(WordPopover, { props: { word: hebrew, english: null, left: 10, top: 20, id: 'pop' } });
		const tip = screen.getByRole('tooltip');
		expect(tip).toHaveAttribute('id', 'pop');
		expect(tip.style.left).toBe('10px');
		expect(tip.style.top).toBe('20px');
	});

	it('renders Hebrew right-to-left and Greek left-to-right', () => {
		const { unmount } = render(WordPopover, { props: { word: hebrew, english: null, left: 0, top: 0, id: 'p' } });
		expect(screen.getByText('בָּרָא')).toHaveAttribute('dir', 'rtl');
		unmount();
		render(WordPopover, { props: { word: greek, english: null, left: 0, top: 0, id: 'p' } });
		expect(screen.getByText('Greek')).toBeInTheDocument();
		expect(screen.getByText('μονογενῆ')).toHaveAttribute('dir', 'ltr');
	});

	it('omits the rendered-as line and the meaning when there is none', () => {
		render(WordPopover, { props: { word: { ...hebrew, gloss: '' }, english: null, left: 0, top: 0, id: 'p' } });
		expect(screen.queryByText(/Rendered here as/)).not.toBeInTheDocument();
		expect(screen.queryByTestId('popover-gloss')).not.toBeInTheDocument();
	});

	it('keeps long parsing text inside the popover (wraps, never overflows)', () => {
		render(WordPopover, { props: { word: hebrew, english: null, left: 0, top: 0, id: 'p' } });
		const parsing = screen.getByText(/third person masculine singular/);
		expect(parsing.className).toMatch(/break-words|whitespace-normal/);
	});
});
```

```ts
// frontend/tests/components/interlinear/InterlinearCredit.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import InterlinearCredit from '$lib/components/interlinear/InterlinearCredit.svelte';

describe('InterlinearCredit', () => {
	it('links "STEP Bible" to stepbible.org and states the license', () => {
		render(InterlinearCredit);
		const link = screen.getByRole('link', { name: 'STEP Bible' });
		expect(link).toHaveAttribute('href', 'https://www.stepbible.org');
		expect(link).toHaveAttribute('target', '_blank');
		expect(link).toHaveAttribute('rel', 'noopener noreferrer');
		expect(screen.getByText(/CC BY 4\.0/)).toBeInTheDocument();
		expect(screen.getByText(/Berean Standard Bible \(public domain\)/)).toBeInTheDocument();
		expect(screen.getByText(/Tyndale House/)).toBeInTheDocument();
	});
});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/components/interlinear`
Expected: FAIL (components do not exist).

- [ ] **Step 3: Implement**

```svelte
<!-- frontend/src/lib/components/interlinear/WordPopover.svelte -->
<script lang="ts">
	import type { InterlinearWord } from '$lib/queries/bible';
	import { formatStrongs } from '$lib/utils/interlinear';

	let {
		word,
		english,
		left,
		top,
		id,
	}: { word: InterlinearWord; english: string | null; left: number; top: number; id: string } = $props();

	const isHebrew = $derived(word.language === 'heb');
</script>

<div
	{id}
	role="tooltip"
	class="pointer-events-none absolute z-30 flex w-[260px] max-w-full flex-col gap-2.5 rounded-[14px] border border-border bg-popover p-4 text-left shadow-lg"
	style="left: {left}px; top: {top}px"
>
	<div class="flex items-center justify-between">
		<span class="rounded-md bg-muted px-2 py-0.5 font-mono text-xs font-bold text-foreground">{formatStrongs(word.strongs)}</span>
		<span class="text-[10px] font-bold tracking-wider text-muted-foreground uppercase">{isHebrew ? 'Hebrew' : 'Greek'}</span>
	</div>
	<div class="flex flex-col gap-0.5">
		<div dir={isHebrew ? 'rtl' : 'ltr'} class="font-[family-name:var(--font-family-serif)] text-2xl text-foreground">{word.source}</div>
		<div class="text-[13px] text-muted-foreground italic">{word.translit}</div>
	</div>
	{#if word.gloss}
		<div class="h-px bg-border"></div>
		<div data-testid="popover-gloss" class="text-[13px] leading-relaxed text-foreground">{word.gloss}</div>
	{/if}
	{#if english}
		<div class="text-[12px] text-muted-foreground">Rendered here as “{english}”</div>
	{/if}
	{#if word.parsing}
		<div class="text-[11px] break-words whitespace-normal text-muted-foreground">{word.parsing}</div>
	{/if}
</div>
```

```svelte
<!-- frontend/src/lib/components/interlinear/InterlinearCredit.svelte -->
<p class="mt-2 text-[11px] text-muted-foreground">
	Word alignment: Berean Standard Bible (public domain). Meanings and word tags:
	<a href="https://www.stepbible.org" target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">STEP Bible</a>,
	Tyndale House, CC BY 4.0.
</p>
```

- [ ] **Step 4: Run to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/components/interlinear`
Expected: PASS. (The `getByText('Hebrew')` assertion needs the label rendered exactly as `Hebrew`; if `getByText(/created/)` matches more than one node, tighten it to the "Rendered here as" line.)

- [ ] **Step 5: Commit**

```bash
pnpm --dir frontend exec prettier --write src/lib/components/interlinear tests/components/interlinear
git add frontend/src/lib/components/interlinear frontend/tests/components/interlinear
git commit -m "feat(frontend): word popover and STEP Bible credit line"
```

### Task E3.4: `InterlinearPassage` — verse text, chips row, connector, state wiring

**Files:**
- Create: `frontend/src/lib/components/interlinear/InterlinearPassage.svelte`
- Test: `frontend/tests/components/interlinear/InterlinearPassage.test.ts`

**Interfaces:**
- Consumes `InterlinearVerse[]`, `VerseText[]` (from `$lib/queries/bible`), and E3.2/E3.3.
- Produces `InterlinearPassage` with props `{ verses: VerseText[]; interlinear: InterlinearVerse[] }`: renders each plain verse in order — **a verse with interlinear data renders its segments** (phrases that have words are `<button data-segment="{verseId}:{index}">`; the rest are plain `<span>`s), **a verse without data renders as today's plain text** (with its verse number); then **one chips row for the whole passage** (each verse's words in original order, preceded by the verse number); a popover under the active chip; a dashed SVG connector from the phrase to the chip; and the credit is left to the parent (E3.5).

Behavior contract (from the spec and the verified prototype):
- Hover/focus a phrase → activates the phrase's **first source word**; hover/focus a chip → activates that word. Click pins, double-click / Escape / click-outside clears. Chips are `<button data-chip="{verseId}:{wordId}">`, each with the source word, transliteration and formatted Strong's number; Hebrew chips are `dir="rtl"`.
- The connector is drawn only while a word is active **and** it belongs to a phrase (`segment !== null`).
- Event handling is **delegated** on the text container and the chips container (one listener each), so a long passage does not attach thousands of listeners and hover changes re-render only the popover and connector.
- Keyboard: phrases and chips are focusable buttons; `focus` activates like hover, `blur` leaves, `Escape` clears.
- An unknown active key (for example the verse disappeared because the passage was collapsed) renders nothing rather than throwing.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/components/interlinear/InterlinearPassage.test.ts
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/svelte';
import InterlinearPassage from '$lib/components/interlinear/InterlinearPassage.svelte';
import type { InterlinearVerse } from '$lib/queries/bible';

const word = (id: number, strongs: string, gloss: string, segment: number | null, source = `s${id}`) => ({
	id, language: 'heb' as const, source, translit: `t${id}`, parsing: '', strongs, gloss,
	tagSource: 'tagged' as const, sourceOrder: id, segment,
});

// Genesis 1:1: English "In the beginning | God | created | the heavens…"; Hebrew order beginning, created, God, marker.
const gen11: InterlinearVerse = {
	verseId: 1, chapter: 1, verse: 1,
	segments: [
		{ text: 'In the beginning', spaceBefore: false },
		{ text: 'God', spaceBefore: true },
		{ text: 'created', spaceBefore: true },
		{ text: 'the heavens and the earth.', spaceBefore: true },
	],
	words: [word(0, 'H7225G', 'first: beginning', 0), word(1, 'H1254A', 'to create', 2), word(2, 'H0430G', 'God', 1), word(3, 'H0853', '[Obj.]', null)],
};

const plain = (verseId: number, verse: number, text: string) => ({ verseId, chapter: 1, verse, text });

afterEach(() => vi.restoreAllMocks());

describe('InterlinearPassage', () => {
	it('renders the phrases of a verse with data, in English order, and one chip per source word in original order', () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const phrases = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-segment'));
		expect(phrases.map((p) => p.textContent?.trim())).toEqual(['In the beginning', 'God', 'created']);
		const chips = screen.getAllByRole('button').filter((b) => b.hasAttribute('data-chip'));
		// original order: beginning, created, God, marker  (the Genesis 1:1 swap)
		expect(chips.map((c) => c.getAttribute('data-chip'))).toEqual(['1:0', '1:1', '1:2', '1:3']);
		// the trailing English-only text is plain, not a button
		expect(screen.getByText('the heavens and the earth.')).toBeInTheDocument();
	});

	it('a verse without alignment data renders as plain text next to a verse that has it', () => {
		render(InterlinearPassage, {
			props: { verses: [plain(1, 1, 'ignored'), plain(2, 2, 'Now the earth was formless.')], interlinear: [gen11] },
		});
		expect(screen.getByText('Now the earth was formless.')).toBeInTheDocument();
		expect(screen.queryByText('ignored')).not.toBeInTheDocument();
	});

	it('hovering a phrase shows the popover for its first source word; leaving hides it', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const created = screen.getByRole('button', { name: 'created' });
		await fireEvent.mouseOver(created);
		const tip = await screen.findByRole('tooltip');
		expect(tip).toHaveTextContent('H1254');
		expect(tip).toHaveTextContent('to create');
		await fireEvent.mouseOut(created);
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
	});

	it('click pins the popover so it survives leaving; Escape clears it', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const god = screen.getByRole('button', { name: 'God' });
		await fireEvent.click(god);
		await fireEvent.mouseOut(god);
		expect(await screen.findByRole('tooltip')).toHaveTextContent('H430');
		await fireEvent.keyDown(document, { key: 'Escape' });
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
	});

	it('double-click clears a pinned popover', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const god = screen.getByRole('button', { name: 'God' });
		await fireEvent.click(god);
		await fireEvent.dblClick(god);
		await waitFor(() => expect(screen.queryByRole('tooltip')).not.toBeInTheDocument());
	});

	it('hovering a chip shows its word, and a word with no phrase still gets a popover but no connector', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const marker = screen.getAllByRole('button').find((b) => b.getAttribute('data-chip') === '1:3')!;
		await fireEvent.mouseOver(marker);
		expect((await screen.findByRole('tooltip')).textContent).toContain('[Obj.]');
		expect(screen.queryByTestId('connector')).not.toBeInTheDocument();
	});

	it('draws the connector from the phrase to the right chip (God -> the 3rd chip)', async () => {
		// jsdom has no layout: give elements deterministic boxes based on their data attributes
		vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (this: HTMLElement) {
			const seg = this.getAttribute('data-segment');
			const chip = this.getAttribute('data-chip');
			if (seg !== null) { const i = Number(seg.split(':')[1]); return rect(100 + i * 100, 100, 160 + i * 100, 120); }
			if (chip !== null) { const i = Number(chip.split(':')[1]); return rect(100 + i * 50, 300, 140 + i * 50, 340); }
			return rect(0, 0, 800, 600);
		});
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		await fireEvent.mouseOver(screen.getByRole('button', { name: 'God' }));
		const line = await screen.findByTestId('connector');
		const l = line.querySelector('line')!;
		// God is segment 1: bottom-centre (100+100+30=230, 120); its chip is word 2: top-centre (100+100+20=220, 300)
		expect(Number(l.getAttribute('x1'))).toBe(230);
		expect(Number(l.getAttribute('y1'))).toBe(120);
		expect(Number(l.getAttribute('x2'))).toBe(220);
		expect(Number(l.getAttribute('y2'))).toBe(300);
	});

	it('phrases and chips are focusable; focus opens the popover like hover', async () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const god = screen.getByRole('button', { name: 'God' });
		god.focus();
		await fireEvent.focusIn(god);
		expect(await screen.findByRole('tooltip')).toHaveTextContent('H430');
	});

	it('Hebrew chips render right-to-left', () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		const chip = screen.getAllByRole('button').find((b) => b.getAttribute('data-chip') === '1:0')!;
		expect(chip.querySelector('[dir="rtl"]')).not.toBeNull();
	});

	it('renders nothing extra when the interlinear list is empty (all verses plain)', () => {
		render(InterlinearPassage, { props: { verses: [plain(1, 1, 'In the beginning.')], interlinear: [] } });
		expect(screen.getByText('In the beginning.')).toBeInTheDocument();
		expect(screen.queryAllByRole('button')).toHaveLength(0);
	});

	it('a pinned word whose verse is no longer rendered does not crash', async () => {
		const { rerender } = render(InterlinearPassage, { props: { verses: [plain(1, 1, 'x')], interlinear: [gen11] } });
		await fireEvent.click(screen.getByRole('button', { name: 'God' }));
		await rerender({ verses: [plain(2, 2, 'other')], interlinear: [] });
		expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
	});
});

function rect(left: number, top: number, right: number, bottom: number): DOMRect {
	return { left, top, right, bottom, width: right - left, height: bottom - top, x: left, y: top, toJSON() {} } as DOMRect;
}
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --dir frontend exec vitest run tests/components/interlinear/InterlinearPassage.test.ts`
Expected: FAIL (component does not exist).

- [ ] **Step 3: Implement**

```svelte
<!-- frontend/src/lib/components/interlinear/InterlinearPassage.svelte -->
<script lang="ts">
	import type { InterlinearVerse, InterlinearWord, VerseText } from '$lib/queries/bible';
	import {
		activeKey,
		connectorLine,
		formatStrongs,
		initialInterlinearState,
		placePopover,
		primaryWordKey,
		reduceInterlinear,
		wordKey,
		type InterlinearEvent,
	} from '$lib/utils/interlinear';
	import WordPopover from './WordPopover.svelte';

	let { verses, interlinear }: { verses: VerseText[]; interlinear: InterlinearVerse[] } = $props();

	const POPOVER_WIDTH = 260;

	const byVerse = $derived(new Map(interlinear.map((v) => [v.verseId, v])));
	// Words for the passage, verse by verse, each verse in original order (chips row).
	const chipVerses = $derived(verses.map((v) => byVerse.get(v.verseId)).filter((v): v is InterlinearVerse => !!v));

	let ui = $state(initialInterlinearState); // not named `state`: that collides with the $state rune
	let container = $state<HTMLDivElement | undefined>();
	let tick = $state(0); // bumped on resize so geometry is recomputed

	function send(event: InterlinearEvent) {
		ui = reduceInterlinear(ui, event);
	}

	const active = $derived(activeKey(ui));

	function lookup(key: string | null): { verse: InterlinearVerse; word: InterlinearWord } | null {
		if (!key) return null;
		const [verseId, wordId] = key.split(':').map(Number);
		const verse = byVerse.get(verseId);
		const word = verse?.words[wordId];
		return verse && word ? { verse, word } : null;
	}
	const activeWord = $derived(lookup(active));
	const activeEnglish = $derived(
		activeWord && activeWord.word.segment !== null ? (activeWord.verse.segments[activeWord.word.segment]?.text ?? null) : null,
	);

	let popover = $state<{ left: number; top: number } | null>(null);
	let line = $state<{ x1: number; y1: number; x2: number; y2: number } | null>(null);

	// Geometry is measured after the active word changes (or the window resizes). It reads
	// `active`/`tick`/`container` synchronously and only writes popover/line, so it cannot loop.
	$effect(() => {
		const key = active;
		void tick;
		const c = container;
		const found = lookup(key);
		if (!key || !c || !found) {
			popover = null;
			line = null;
			return;
		}
		const cBox = c.getBoundingClientRect();
		const chip = c.querySelector<HTMLElement>(`[data-chip="${key}"]`);
		popover = chip ? placePopover(chip.getBoundingClientRect(), cBox, POPOVER_WIDTH) : null;
		const seg = found.word.segment;
		const phrase = seg !== null ? c.querySelector<HTMLElement>(`[data-segment="${found.verse.verseId}:${seg}"]`) : null;
		line = chip && phrase ? connectorLine(phrase.getBoundingClientRect(), chip.getBoundingClientRect(), cBox) : null;
	});

	// Delegated handlers: one listener per container, not one per phrase or chip.
	function keyFromTarget(e: Event): string | null {
		const el = (e.target as HTMLElement | null)?.closest<HTMLElement>('[data-segment],[data-chip]');
		if (!el) return null;
		const chip = el.getAttribute('data-chip');
		if (chip) return chip;
		const [verseId, index] = (el.getAttribute('data-segment') as string).split(':').map(Number);
		const verse = byVerse.get(verseId);
		return verse ? primaryWordKey(verse, index) : null;
	}
	const onOver = (e: Event) => { const k = keyFromTarget(e); if (k) send({ type: 'enter', key: k }); };
	const onOut = (e: Event) => { const k = keyFromTarget(e); if (k) send({ type: 'leave', key: k }); };
	const onClick = (e: Event) => { const k = keyFromTarget(e); if (k) send({ type: 'click', key: k }); };
	const onDblClick = (e: Event) => { if (keyFromTarget(e)) send({ type: 'dblclick' }); };

	function onDocumentKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') send({ type: 'escape' });
	}
	function onDocumentPointerDown(e: Event) {
		if (ui.pinned && container && !container.contains(e.target as Node)) send({ type: 'outside' });
	}
</script>

<svelte:document onkeydown={onDocumentKeydown} onpointerdown={onDocumentPointerDown} />
<svelte:window onresize={() => (tick += 1)} />

<div bind:this={container} class="relative">
	<!-- Delegated handlers on the container: keyboard activation happens on the inner <button>s, whose click bubbles here. -->
	<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
	<div
		class="font-[family-name:var(--font-family-serif)] text-[15px] leading-relaxed text-foreground"
		onmouseover={onOver}
		onmouseout={onOut}
		onfocusin={onOver}
		onfocusout={onOut}
		onclick={onClick}
		ondblclick={onDblClick}
	>
		{#each verses as v (v.verseId)}
			{@const iv = byVerse.get(v.verseId)}
			{#if iv}
				<span
					><sup class="mr-0.5 ml-0.5 text-[10px] text-muted-foreground">{v.verse}</sup>{#each iv.segments as seg, i (i)}{#if seg.spaceBefore}{' '}{/if}{#if iv.words.some((w) => w.segment === i)}<button
								type="button"
								data-segment="{iv.verseId}:{i}"
								class="cursor-pointer border-0 bg-transparent p-0 font-[inherit] text-primary underline decoration-dotted underline-offset-4">{seg.text}</button
							>{:else}<span>{seg.text}</span>{/if}{/each}{' '}</span
				>
			{:else if v.text}
				<span
					><sup class="mr-0.5 ml-0.5 text-[10px] text-muted-foreground">{v.verse}</sup>{v.text}{' '}</span
				>
			{/if}
		{/each}
	</div>

	{#if chipVerses.length}
		<div class="mt-3 flex flex-col gap-2 border-t border-dashed border-border pt-3.5">
			<div class="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">Original language</div>
			<!-- svelte-ignore a11y_no_static_element_interactions, a11y_click_events_have_key_events -->
			<div
				class="flex flex-wrap gap-x-1.5 gap-y-2"
				onmouseover={onOver}
				onmouseout={onOut}
				onfocusin={onOver}
				onfocusout={onOut}
				onclick={onClick}
				ondblclick={onDblClick}
			>
				{#each chipVerses as iv (iv.verseId)}
					<span class="self-center text-[10px] text-muted-foreground">{iv.verse}</span>
					{#each iv.words as w (w.id)}
						<button
							type="button"
							data-chip={wordKey(iv.verseId, w.id)}
							aria-describedby={active === wordKey(iv.verseId, w.id) ? 'interlinear-popover' : undefined}
							class="inline-flex cursor-pointer flex-col items-center gap-0.5 rounded-lg border border-border bg-muted/40 px-2 py-1"
						>
							<span dir={w.language === 'heb' ? 'rtl' : 'ltr'} class="text-base text-foreground">{w.source}</span>
							<span class="text-[10px] text-muted-foreground italic">{w.translit}</span>
							<span class="rounded bg-muted px-1 font-mono text-[10px] font-bold text-foreground">{formatStrongs(w.strongs)}</span>
						</button>
					{/each}
				{/each}
			</div>
		</div>
	{/if}

	{#if activeWord && popover}
		<WordPopover
			id="interlinear-popover"
			word={activeWord.word}
			english={activeEnglish}
			left={popover.left}
			top={popover.top}
		/>
	{/if}

	{#if line}
		<svg data-testid="connector" class="pointer-events-none absolute inset-0 z-[25] h-full w-full overflow-visible" aria-hidden="true">
			<line x1={line.x1} y1={line.y1} x2={line.x2} y2={line.y2} stroke="currentColor" class="text-primary" stroke-width="1.5" stroke-dasharray="4 3" />
			<circle cx={line.x1} cy={line.y1} r="3" fill="currentColor" class="text-primary" />
			<circle cx={line.x2} cy={line.y2} r="3" fill="currentColor" class="text-primary" />
		</svg>
	{/if}
</div>
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm --dir frontend exec vitest run tests/components/interlinear/InterlinearPassage.test.ts`
Expected: PASS. Known adjustments an executor may need (do not weaken an assertion — fix the component or the event wiring):
- If `mouseOver`/`mouseOut` do not bubble to the delegated handler in jsdom, use `mouseenter`-equivalent via `fireEvent.mouseOver` on the button (it bubbles); verify the tests use `mouseOver`/`mouseOut`, which bubble.
- `getByRole('button', { name: 'God' })` requires the button's accessible name to be exactly the phrase text.
- Run `pnpm --dir frontend run check` too: `svelte-check` catches type errors the unit tests cannot (a variable named `state` collides with the `$state` rune).

- [ ] **Step 5: Commit**

```bash
pnpm --dir frontend exec prettier --write src/lib/components/interlinear tests/components/interlinear
git add frontend/src/lib/components/interlinear frontend/tests/components/interlinear
git commit -m "feat(frontend): interlinear passage with phrases, chips row, popover and connector"
```

### Task E3.5: `OriginalLanguage` (lazy query + states) and wiring into `PassageText`

**Files:**
- Create: `frontend/src/lib/components/interlinear/OriginalLanguage.svelte`
- Modify: `frontend/src/lib/components/PassageText.svelte`
- Test: `frontend/tests/components/interlinear/OriginalLanguage.test.ts`; extend `frontend/tests/components/PassageText.test.ts`

**Interfaces:**
- Consumes `PASSAGE_INTERLINEAR_QUERY`, `PassageInterlinearResponse`, `queryKeys.bible.passageInterlinear` (E3.1), `InterlinearPassage`, `InterlinearCredit` (E3.3–E3.4).
- Produces `OriginalLanguage` with props `{ startVerseId: number; endVerseId: number; verses: VerseText[]; plain: Snippet }` — **mounted only when the reader has pressed the button**, so the query (created inside this component) never runs otherwise. It renders: loading (plain text via the `plain` snippet + "Loading original language…"), error (plain text + message + **Retry**), empty (plain text + "Original-language data isn't available for this passage."), and success (`InterlinearPassage` + `InterlinearCredit`).
- `PassageText` gains a "Show original language" toggle button (`aria-pressed`) shown only when the passage text has loaded and is not over the 150-verse cap. Turning it off unmounts `OriginalLanguage` (which cancels the request's effect on the UI). The existing plain-text rendering moves into a `plain` snippet, unchanged.

**Why a child component:** the existing `PassageText` tests mock `createQuery` to return one shared state for every call; a second `createQuery` inside `PassageText` would break them. Keeping the interlinear query inside the lazily mounted child leaves those tests valid.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/components/interlinear/OriginalLanguage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import OriginalLanguage from '$lib/components/interlinear/OriginalLanguage.svelte';
import { queryKeys } from '$lib/queries/keys';

const mocks = vi.hoisted(() => ({
	state: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
	lastOptions: null as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: (opts: () => unknown) => {
		mocks.lastOptions = opts();
		return mocks.state;
	},
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));

const plainSnippet = createRawSnippet(() => ({ render: () => '<div data-testid="plain">plain verses</div>' }));
const verses = [{ verseId: 1, chapter: 1, verse: 1, text: 'In the beginning' }];
const props = { startVerseId: 1, endVerseId: 1, verses, plain: plainSnippet };

const genesis = {
	passageInterlinear: {
		verses: [{
			verseId: 1, chapter: 1, verse: 1,
			segments: [{ text: 'In the beginning', spaceBefore: false }],
			words: [{ id: 0, language: 'heb', source: 'רֵאשִׁית', translit: 're.shit', parsing: '', strongs: 'H7225G', gloss: 'first: beginning', tagSource: 'tagged', sourceOrder: 0, segment: 0 }],
		}],
	},
};

describe('OriginalLanguage', () => {
	beforeEach(() => {
		mocks.state.data = undefined;
		mocks.state.isLoading = false;
		mocks.state.isError = false;
		mocks.state.refetch = vi.fn();
		mocks.lastOptions = null;
	});

	it('loading: keeps showing the plain verses and says it is loading', () => {
		mocks.state.isLoading = true;
		render(OriginalLanguage, { props });
		expect(screen.getByTestId('plain')).toBeInTheDocument();
		expect(screen.getByText(/loading original language/i)).toBeInTheDocument();
	});

	it('error: keeps the plain verses, shows a message and a working Retry', async () => {
		mocks.state.isError = true;
		render(OriginalLanguage, { props });
		expect(screen.getByTestId('plain')).toBeInTheDocument();
		expect(screen.getByText(/couldn't load original language/i)).toBeInTheDocument();
		await fireEvent.click(screen.getByRole('button', { name: /retry/i }));
		expect(mocks.state.refetch).toHaveBeenCalledTimes(1);
	});

	it('no data for the passage: not an error, not a retry — a plain notice over the plain text', () => {
		mocks.state.data = { passageInterlinear: { verses: [] } };
		render(OriginalLanguage, { props });
		expect(screen.getByTestId('plain')).toBeInTheDocument();
		expect(screen.getByText(/original-language data isn.t available for this passage/i)).toBeInTheDocument();
		expect(screen.queryByRole('button', { name: /retry/i })).not.toBeInTheDocument();
		expect(screen.queryByText(/STEP Bible/)).not.toBeInTheDocument();
	});

	it('success: shows the interlinear passage and the STEP Bible credit, not the plain snippet', () => {
		mocks.state.data = genesis;
		render(OriginalLanguage, { props });
		expect(screen.queryByTestId('plain')).not.toBeInTheDocument();
		expect(screen.getByRole('button', { name: 'In the beginning' })).toBeInTheDocument();
		expect(screen.getByRole('link', { name: 'STEP Bible' })).toBeInTheDocument();
	});

	it('requests the whole range, keyed by it, and never re-fetches (data never changes)', () => {
		mocks.state.data = genesis;
		render(OriginalLanguage, { props: { ...props, startVerseId: 1, endVerseId: 3 } });
		expect(mocks.lastOptions.queryKey).toEqual(queryKeys.bible.passageInterlinear(1, 3));
		expect(mocks.lastOptions.staleTime).toBe(Infinity);
	});
});
```

Extend `PassageText.test.ts` (existing mocks stay as they are; interlinear-specific tests mock the child):

```ts
vi.mock('$lib/components/interlinear/OriginalLanguage.svelte', async () => {
	const { default: Stub } = await import('../helpers/OriginalLanguageStub.svelte');
	return { default: Stub };
});
```

Create the stub `frontend/tests/helpers/OriginalLanguageStub.svelte`:

```svelte
<script lang="ts">
	let { startVerseId, endVerseId, plain }: { startVerseId: number; endVerseId: number; verses: unknown; plain: import('svelte').Snippet } = $props();
</script>

<div data-testid="original-language-stub" data-range="{startVerseId}-{endVerseId}">{@render plain()}</div>
```

and add these tests to the `PassageText` suite:

```ts
	it('offers "Show original language" once the text has loaded, off by default, without mounting the interlinear child', () => {
		mocks.mockQueryState.data = { passageText: { translation: 'BSB', copyright: COPYRIGHT, verses: makeVerses(3) } };
		render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		const toggle = screen.getByRole('button', { name: /show original language/i });
		expect(toggle).toHaveAttribute('aria-pressed', 'false');
		expect(screen.queryByTestId('original-language-stub')).not.toBeInTheDocument();
	});

	it('pressing it mounts the interlinear view for the same range and keeps the plain verses available', async () => {
		mocks.mockQueryState.data = { passageText: { translation: 'BSB', copyright: COPYRIGHT, verses: makeVerses(3) } };
		render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		await fireEvent.click(screen.getByRole('button', { name: /show original language/i }));
		const stub = screen.getByTestId('original-language-stub');
		expect(stub.getAttribute('data-range')).toBe('1-3');
		expect(stub).toHaveTextContent('Verse text 1'); // the plain snippet still renders the verses
		expect(screen.getByRole('button', { name: /show original language/i })).toHaveAttribute('aria-pressed', 'true');
	});

	it('pressing it again turns the mode off', async () => {
		mocks.mockQueryState.data = { passageText: { translation: 'BSB', copyright: COPYRIGHT, verses: makeVerses(2) } };
		render(PassageText, { props: { startVerseId: 1, endVerseId: 2 } });
		const toggle = screen.getByRole('button', { name: /show original language/i });
		await fireEvent.click(toggle);
		await fireEvent.click(toggle);
		expect(screen.queryByTestId('original-language-stub')).not.toBeInTheDocument();
		expect(toggle).toHaveAttribute('aria-pressed', 'false');
	});

	it('does not offer the toggle while loading, on error, or above the 150-verse cap', () => {
		mocks.mockQueryState.isLoading = true;
		const { unmount } = render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		expect(screen.queryByRole('button', { name: /original language/i })).not.toBeInTheDocument();
		unmount();

		mocks.mockQueryState.isLoading = false;
		mocks.mockQueryState.isError = true;
		const second = render(PassageText, { props: { startVerseId: 1, endVerseId: 3 } });
		expect(screen.queryByRole('button', { name: /original language/i })).not.toBeInTheDocument();
		second.unmount();

		mocks.mockQueryState.isError = false;
		render(PassageText, { props: { startVerseId: 1, endVerseId: 200 } });
		expect(screen.queryByRole('button', { name: /original language/i })).not.toBeInTheDocument();
	});
```

- [ ] **Step 2: Run to verify they fail**

Run: `pnpm --dir frontend exec vitest run tests/components/interlinear/OriginalLanguage.test.ts tests/components/PassageText.test.ts`
Expected: FAIL (component missing; toggle absent).

- [ ] **Step 3: Implement `OriginalLanguage.svelte`**

```svelte
<!-- frontend/src/lib/components/interlinear/OriginalLanguage.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { PASSAGE_INTERLINEAR_QUERY, type PassageInterlinearResponse, type VerseText } from '$lib/queries/bible';
	import { queryKeys } from '$lib/queries/keys';
	import InterlinearPassage from './InterlinearPassage.svelte';
	import InterlinearCredit from './InterlinearCredit.svelte';

	let {
		startVerseId,
		endVerseId,
		verses,
		plain,
	}: { startVerseId: number; endVerseId: number; verses: VerseText[]; plain: Snippet } = $props();

	// Mounted only after the reader asks for original language, so nothing is fetched otherwise.
	const query = createQuery(() => ({
		queryKey: queryKeys.bible.passageInterlinear(startVerseId, endVerseId),
		queryFn: () => graphqlRequest<PassageInterlinearResponse>(PASSAGE_INTERLINEAR_QUERY, { startVerseId, endVerseId }),
		staleTime: Infinity, // alignment data never changes
	}));

	const interlinear = $derived(query.data?.passageInterlinear.verses ?? []);
</script>

{#if query.isLoading}
	{@render plain()}
	<p class="mt-2 text-[12px] text-muted-foreground">Loading original language…</p>
{:else if query.isError}
	{@render plain()}
	<p class="mt-2 text-[12px] text-destructive">
		Couldn't load original language.
		<button type="button" class="font-semibold text-primary hover:underline" onclick={() => query.refetch()}>Retry</button>
	</p>
{:else if query.data && interlinear.length === 0}
	{@render plain()}
	<p class="mt-2 text-[12px] text-muted-foreground">Original-language data isn't available for this passage.</p>
{:else if query.data}
	<InterlinearPassage {verses} {interlinear} />
	<InterlinearCredit />
{/if}
```

- [ ] **Step 4: Wire into `PassageText.svelte`**

**This task must start after unit D (PR #416) has merged into the integration branch** — D edits the same file (verse spacing, the over-cap link removal). If it has not merged, stop and rebase first.

Replace `frontend/src/lib/components/PassageText.svelte` with the file below. It is the post-D file plus exactly these changes: the `OriginalLanguage` import, `showOriginal` state, the existing verse loop moved unchanged into a `plain` snippet, the `OriginalLanguage` branch, and the toggle button (its visible label stays "Show original language" in both states; `aria-pressed` carries the state).

```svelte
<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { PASSAGE_TEXT_QUERY, type PassageTextResponse } from '$lib/queries/bible';
	import { queryKeys } from '$lib/queries/keys';
	import OriginalLanguage from '$lib/components/interlinear/OriginalLanguage.svelte';

	let { startVerseId, endVerseId }: { startVerseId: number; endVerseId: number } = $props();

	// Two-tier cap (AN Q13): render in full up to COLLAPSE_THRESHOLD verses,
	// collapse behind a toggle up to HARD_CAP, and show no text beyond that
	// (PassageLinks, rendered alongside, carries the outbound link).
	const COLLAPSE_THRESHOLD = 30;
	const HARD_CAP = 150;
	const COLLAPSED_PREVIEW_COUNT = 10;

	let expanded = $state(false);
	// "Show original language": off on every open. The interlinear query lives in the lazily
	// mounted OriginalLanguage child, so nothing extra is fetched until this is turned on.
	let showOriginal = $state(false);

	const verseCount = $derived(endVerseId - startVerseId + 1);
	const overCap = $derived(verseCount > HARD_CAP);

	// Over the hard cap we never fetch — no inline text is shown anyway.
	const query = createQuery(() => ({
		queryKey: queryKeys.bible.passageText(startVerseId, endVerseId),
		queryFn: () => graphqlRequest<PassageTextResponse>(PASSAGE_TEXT_QUERY, { startVerseId, endVerseId }),
		enabled: !overCap,
		staleTime: Infinity, // verse text never changes
	}));

	const verses = $derived(query.data?.passageText.verses ?? []);
	const visibleVerses = $derived(
		verseCount <= COLLAPSE_THRESHOLD || expanded ? verses : verses.slice(0, COLLAPSED_PREVIEW_COUNT),
	);
</script>

{#snippet plain()}
	<div>
		{#each visibleVerses as v (v.verseId)}
			<!-- The explicit trailing space keeps a verse number from running into the previous verse's last word. -->
			<span
				>{#if v.text}<sup class="mr-0.5 ml-0.5 text-[10px] text-muted-foreground">{v.verse}</sup
					>{v.text}{' '}{/if}</span
			>
		{/each}
	</div>
{/snippet}

<div class="passage-text font-[family-name:var(--font-family-serif)] text-[15px] leading-relaxed text-foreground">
	{#if overCap}
		<p class="text-muted-foreground">{verseCount} verses — too long to display here.</p>
	{:else if query.isLoading}
		<p class="text-muted-foreground">Loading passage…</p>
	{:else if query.isError}
		<p class="text-destructive">Couldn't load this passage.</p>
	{:else if query.data}
		{@const { translation, copyright } = query.data.passageText}
		{#if showOriginal}
			<OriginalLanguage {startVerseId} {endVerseId} verses={visibleVerses} {plain} />
		{:else}
			{@render plain()}
		{/if}
		<button
			type="button"
			aria-pressed={showOriginal}
			class="mt-2 mr-3 text-[13px] font-semibold text-primary hover:underline"
			onclick={() => (showOriginal = !showOriginal)}
		>
			Show original language
		</button>
		{#if verseCount > COLLAPSE_THRESHOLD}
			<button
				type="button"
				class="mt-2 text-[13px] font-semibold text-primary hover:underline"
				onclick={() => (expanded = !expanded)}
			>
				{expanded ? 'Show less' : 'Show full passage'}
			</button>
		{/if}
		<p class="mt-2 text-[11px] text-muted-foreground">{translation} · {copyright}</p>
	{/if}
</div>
```

- [ ] **Step 5: Run to verify they pass**

Run: `pnpm --dir frontend exec vitest run tests/components/interlinear tests/components/PassageText.test.ts`
Expected: PASS, including every pre-existing `PassageText` test (they must not change).

- [ ] **Step 6: Commit**

```bash
pnpm --dir frontend exec prettier --write src/lib/components/PassageText.svelte src/lib/components/interlinear tests/components tests/helpers
git add frontend/src frontend/tests
git commit -m "feat(frontend): lazy 'Show original language' with loading, error, empty and credit states"
```

### Task E3.6: Modal-level test, full checks, and browser verification

**Files:**
- Modify: `frontend/tests/components/ActivityDetailsModal.test.ts`

- [ ] **Step 1: Add a modal-level test** (in the existing `BIBLE_PASSAGE content` describe; the modal mocks `createQuery` like the other tests — reuse its mock state for the plain text)

```ts
		it('offers original language for a passage and not for a YouTube video', () => {
			render(ActivityDetailsModal, { props: { content: passage, open: true, onClose: vi.fn() } });
			expect(screen.getByRole('button', { name: /show original language/i })).toBeInTheDocument();
		});

		it('does not offer original language for a YouTube video', () => {
			render(ActivityDetailsModal, { props: { content, open: true, onClose: vi.fn() } });
			expect(screen.queryByRole('button', { name: /original language/i })).not.toBeInTheDocument();
		});
```

- [ ] **Step 2: Run the whole frontend suite and the type check**

Run: `pnpm --dir frontend run test:run`
Expected: all tests pass (previous baseline was 1454 tests; expect more).
Run: `pnpm --dir frontend run check`
Expected: only the one known, unrelated error in `tests/browser/ag-grid-integration.test.ts`. Anything new is yours to fix.

- [ ] **Step 3: Browser verification (local session only; never sign in — ask the human if signed out)**

Prerequisites: E1 data files fetched into `data/bible/interlinear/`, migration `000026` applied and `go run ./cmd/seed-bible` run **by the human** against the dev database, backend running with this branch, and the worktree frontend served on a spare port with a throwaway wrapper config (see `.docs/VERIFICATION.md` "Verifying from a worktree"; name the wrapper `.mts`). Then, with the Chrome DevTools MCP against a Bible passage (for example Genesis 1:1-3 and John 3:16):
  1. Open the modal: the passage looks exactly as before; the network panel shows **no** `passageInterlinear` request.
  2. Press **Show original language**: the request is sent once; phrases become underlined; the chips row appears; the credit line shows "STEP Bible" as a link.
  3. Hover **created**: the popover shows `H1254`, the Hebrew word, "to create"; the dashed connector runs from "created" to the second chip; hover **God**: connector to the *third* chip (the word-order swap).
  4. Click to pin, move away (stays), Escape / double-click (clears). Tab to a phrase: the popover opens on focus.
  5. Psalms 51:1: title and verse 1 render with no plain-text gaps. A verse the data lacks renders as plain text next to interlinear neighbors.
  6. Phone width (emulate 375x812, `mobile,touch`): tap a phrase opens the popover in the same slot beneath the chips; tap elsewhere closes it; the chips row wraps or scrolls without horizontal page overflow.
  7. A long passage (Psalms 119:1-30 within the cap): opens quickly, hover stays responsive.
  Capture `sv-bible-E-*` screenshots and a short video per `.docs/PR_SCREENSHOTS.md` (uploading to the `screenshots` release requires the owner's go-ahead; interactive changes also get a video).

- [ ] **Step 4: Commit and open the PR**

```bash
git add frontend/tests/components/ActivityDetailsModal.test.ts
git commit -m "test(frontend): original-language toggle appears for passages only"
```

PR body (`feature.md` template): summary, screenshots/video, the Test Plan checklist, and the dependency note ("needs E2's `passageInterlinear` query and the seeded data to show anything; with no data the toggle shows 'not available'").

---

## Cross-Task Gaps Flagged During Planning

- **Fixture/ordinal facts to re-check at execution time:** the fixtures assume verse ordinals from `data/bible/books.json` (John 3:16 = 26137). If `books.json` changed, `test_berean.py::test_known_ordinals` fails first.
- **`domain.ErrInvalidInput` mapping in the resolver (E2.6):** confirm the `PassageText` resolver's exact error branch before copying it; the plan mirrors its intent (client-safe message for invalid input, generic message + log for everything else).
- **Svelte 5 event delegation in jsdom (E3.4):** `mouseover`/`mouseout`/`focusin`/`focusout` bubble; `mouseenter`/`mouseleave` do not. The component intentionally uses the bubbling events; do not "fix" a failing test by switching to `mouseenter`.
- **`seedInterlinear`'s transaction body is not unit-tested** (it needs a database, and agents must not use the shared one). Everything around it is tested (manifest, checksum, parsing, insert building, skip-when-missing). The first human run must verify: `SELECT count(*) FROM bible_word` equals the manifest's `bible_word.rows`, `SELECT count(*) FROM bible_lexicon` equals its `bible_lexicon.rows`, and `SELECT * FROM bible_data_version` shows the manifest version and both SHA-256s.
- **Not planned (out of scope per the spec):** hand-written definitions, the Meaning column, remembering the toggle, the New Testament number-equivalence table (`G3708`↔`G1492`), interlinear on grid rows or a standalone route.
- **Owner-only steps:** uploading the release assets, applying migration `000026`, running the seeder, and uploading screenshots/video. Each PR description says so.
