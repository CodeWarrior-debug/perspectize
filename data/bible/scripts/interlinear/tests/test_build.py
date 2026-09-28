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
