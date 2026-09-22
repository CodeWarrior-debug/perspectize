# Bible reference data — provenance

## books.json
Hand-authored 2026-09-22. Book names, order, testament and chapter counts are
standard KJV-canon facts; not derived from an external file. `canon` field
reserved for future deuterocanonical support (see AN §Q22) — all rows are
currently `protestant`.

## translations.json
Hand-authored 2026-09-22. Bible Gateway version codes, spot-checked live
before use in PR D per AN §Q15 (NASB/AMP especially — edition variants exist).

## verses.tsv
Source: https://github.com/BibleBot/RandomVersesData (one KJV verse per file,
`<n>.txt` for n = 0..31101, where n is already the canonical verse ordinal —
Genesis 1:1 = `0.txt`, Revelation 22:21 = `31101.txt`). Cloned locally
(shallow clone, not committed) rather than scripted per-file downloads.
Downloaded: 2026-09-22
Normalized via `data/bible/scripts/build_verses.py`, which maps upstream's
non-standard 3-char book abbreviations (e.g. `Sa1`, `Sol`) to `books.json`
`name` values — these don't match `books.json`'s `aliases`, so the script
carries its own mapping table.
Row count after normalization: 31,102 (matches the commonly cited KJV total
exactly for this edition/source; per AN §7, other KJV editions may differ by
a handful of verses due to versification differences — not treated as an
error here).
Spot-checked chapter/verse counts against public KJV references: Genesis
(50 chapters, 1533 verses), Psalms (150 chapters, 2461 verses), Revelation
(22 chapters, 404 verses) — all match, and chapter counts agree with
`books.json`'s `chapterCount` field for these three books.

## bsb.txt (added in Task A3)
Source: https://bereanbible.com/bsb.txt
Downloaded: <fill in on download date>
License: Public domain (berean.bible/terms.htm, dedicated 2023-04-30)
SHA-256: <fill in after download>
Row count after normalization: <fill in>
