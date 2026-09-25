"""Pipeline: Berean rows + STEPBible tags + lexicon -> bible_word / bible_lexicon TSVs."""
from __future__ import annotations

import gzip
import hashlib
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
