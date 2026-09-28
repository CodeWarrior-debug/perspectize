# Test fixtures

Tiny excerpts (about ten verses) of third-party data, used only by the normalizer tests.
Regenerate with `../make_fixtures.py`.

- `berean_excerpt.tsv`, `bsb_excerpt.tsv`: Berean Standard Bible tables/text (public domain; berean.bible/terms.htm).
- `tahot_excerpt.txt`, `tagnt_excerpt.txt`: STEPBible-Data (Tyndale House), CC BY 4.0, credit "STEP Bible" (www.STEPBible.org). Excerpted unchanged.
- `lexicon_*_excerpt.txt`: the same source, cut down to the columns through `Gloss` (the `Meaning` paragraph is intentionally not committed). This is a modification of the data for test use; the gloss values are unchanged.
