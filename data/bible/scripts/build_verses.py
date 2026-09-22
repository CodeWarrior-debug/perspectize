#!/usr/bin/env python3
"""One-off normalizer: upstream KJV verse list -> data/bible/verses.tsv.
Re-run only if the upstream source is corrected. See data/bible/README.md.

Upstream source: github.com/BibleBot/RandomVersesData. That repo stores one
KJV verse per file, named `<n>.txt` for n = 0..31101, where n already equals
the canonical verse ordinal (Genesis 1:1 = 0.txt, Revelation 22:21 =
31101.txt). Each file's single line is `<BookAbbrev> <chapter>:<verse> <text>`
using a fixed-width, non-standard abbreviation scheme (e.g. `Sa1` for
"1 Samuel", `Sol` for "Song of Solomon") that does NOT match books.json's
`aliases` lists, so this script carries its own mapping table
(UPSTREAM_BOOK_MAP) rather than reusing books.json aliases.

Usage:
    python3 build_verses.py <upstream_dir> <books.json> <out.tsv>

<upstream_dir> is a local checkout of BibleBot/RandomVersesData (a directory
containing 0.txt .. 31101.txt).
"""
import csv
import glob
import json
import os
import re
import sys

# Upstream abbreviation -> books.json `name`, verified against the 66 unique
# tokens actually present in the downloaded files (see task report for the
# verification command).
UPSTREAM_BOOK_MAP = {
    "Gen": "Genesis",
    "Exo": "Exodus",
    "Lev": "Leviticus",
    "Num": "Numbers",
    "Deu": "Deuteronomy",
    "Jos": "Joshua",
    "Jdg": "Judges",
    "Rut": "Ruth",
    "Sa1": "1 Samuel",
    "Sa2": "2 Samuel",
    "Kg1": "1 Kings",
    "Kg2": "2 Kings",
    "Ch1": "1 Chronicles",
    "Ch2": "2 Chronicles",
    "Ezr": "Ezra",
    "Neh": "Nehemiah",
    "Est": "Esther",
    "Job": "Job",
    "Psa": "Psalms",
    "Pro": "Proverbs",
    "Ecc": "Ecclesiastes",
    "Sol": "Song of Solomon",
    "Isa": "Isaiah",
    "Jer": "Jeremiah",
    "Lam": "Lamentations",
    "Eze": "Ezekiel",
    "Dan": "Daniel",
    "Hos": "Hosea",
    "Joe": "Joel",
    "Amo": "Amos",
    "Oba": "Obadiah",
    "Jon": "Jonah",
    "Mic": "Micah",
    "Nah": "Nahum",
    "Hab": "Habakkuk",
    "Zep": "Zephaniah",
    "Hag": "Haggai",
    "Zac": "Zechariah",
    "Mal": "Malachi",
    "Mat": "Matthew",
    "Mar": "Mark",
    "Luk": "Luke",
    "Joh": "John",
    "Act": "Acts",
    "Rom": "Romans",
    "Co1": "1 Corinthians",
    "Co2": "2 Corinthians",
    "Gal": "Galatians",
    "Eph": "Ephesians",
    "Phi": "Philippians",
    "Col": "Colossians",
    "Th1": "1 Thessalonians",
    "Th2": "2 Thessalonians",
    "Ti1": "1 Timothy",
    "Ti2": "2 Timothy",
    "Tit": "Titus",
    "Plm": "Philemon",
    "Heb": "Hebrews",
    "Jam": "James",
    "Pe1": "1 Peter",
    "Pe2": "2 Peter",
    "Jo1": "1 John",
    "Jo2": "2 John",
    "Jo3": "3 John",
    "Jde": "Jude",
    "Rev": "Revelation",
}

LINE_RE = re.compile(r"^(\S+)\s+(\d+):(\d+)\s+(.*)$")


def parse_upstream(upstream_dir):
    """Yield (book_name, chapter, verse) for every verse file in canonical order."""
    files = glob.glob(os.path.join(upstream_dir, "*.txt"))
    files = [f for f in files if os.path.basename(f) != "README.md"]
    # Filenames are the verse ordinal (0-based); sort numerically to
    # guarantee canonical order even though upstream is already 0..31101.
    files.sort(key=lambda f: int(os.path.splitext(os.path.basename(f))[0]))

    for path in files:
        with open(path, encoding="utf-8") as fh:
            line = fh.read().strip()
        m = LINE_RE.match(line)
        if not m:
            raise ValueError(f"Unrecognized line format in {path}: {line[:80]!r}")
        abbrev, chapter, verse, _text = m.groups()
        book_name = UPSTREAM_BOOK_MAP.get(abbrev)
        if book_name is None:
            raise KeyError(f"Unmapped upstream book abbreviation {abbrev!r} in {path}")
        yield book_name, int(chapter), int(verse)


def main(upstream_dir: str, books_path: str, out_path: str) -> None:
    with open(books_path) as f:
        books = json.load(f)
    name_to_id = {b["name"]: b["id"] for b in books}

    rows = []  # (book_id, chapter, verse)
    for book_name, chapter, verse in parse_upstream(upstream_dir):
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
