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
