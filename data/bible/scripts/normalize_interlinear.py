#!/usr/bin/env python3
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
