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
