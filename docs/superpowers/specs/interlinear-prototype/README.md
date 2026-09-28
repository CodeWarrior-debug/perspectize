# Interlinear prototype scripts (throwaway reference, 2026-09-24)

Python scripts used to verify the facts in `../2026-09-24-bible-interlinear-design.md`.
They are **not** the production normalizer: they hard-code scratch-directory paths and
were written to measure, not to ship. The implementation plan should port the useful
parts into a committed, tested normalizer.

| Script | What it established |
|---|---|
| `census.py` | Line census of `bsb_tables.tsv`, `Verse` column == our verse ordinal (31,102/31,102) |
| `rebuild2.py`, `rebuild4.py` | Rebuilding verse text from the alignment rows; the rules that reach 31,100/31,102 exact |
| `ambiguity.py`, `h1254.py` | Plain Berean numbers map to several STEPBible entries (34.7% of rows; H1254 A/B) |
| `join_test.py` | Joining Berean rows to TAHOT/TAGNT (98.88% aligned; 99.37% of ambiguous rows) |
| `normalize_proto.py` | Prototype normalized output (442,340 rows, 12.9 MB gzip) with `orig_strongs`, `strongs`, `strongs_source` |

Inputs (downloaded 2026-09-24, not committed): `bereanbible.com/bsb_tables.tsv`;
STEPBible-Data `Lexicons/TBESH…`, `TBESG…`; `Translators Amalgamated OT+NT/TAHOT…`, `TAGNT…`.
