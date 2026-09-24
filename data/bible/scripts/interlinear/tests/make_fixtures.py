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
