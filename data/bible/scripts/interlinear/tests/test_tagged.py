import re
import unittest
from pathlib import Path

from interlinear.books import load_books, verse_ordinal
from interlinear.lexicon import read_lexicon
from interlinear.tagged import read_tagged

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
BOOKS = load_books(HERE.parents[2] / "books.json")


def num(tag):
    return int(re.match(r"[HG](\d+)", tag).group(1))


class TaggedTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.tagged, cls.skipped = read_tagged([FIX / "tahot_excerpt.txt", FIX / "tagnt_excerpt.txt"], BOOKS)

    def test_no_reference_is_skipped(self):
        self.assertEqual(self.skipped, [])

    def test_genesis_1_1_tags_are_disambiguated(self):
        words = self.tagged[1]
        self.assertEqual([w[0] for w in words], ["H7225G", "H1254A", "H0430G", "H0853", "H8064", "H0853", "H0776G"])

    def test_1_samuel_2_29_fattening_is_H1254B(self):
        words = self.tagged[verse_ordinal(BOOKS, 9, 2, 29)]
        self.assertEqual(words[11][0], "H1254B")   # word #12
        self.assertEqual(words[12][0], "H7225H")   # "from the choicest of" — the sub-meaning

    def test_psalm_title_is_folded_into_verse_one_in_file_order(self):
        # TAHOT word numbers restart at each Hebrew verse (title = 51.1-51.2, then English 51.1 = Hebrew 51.3):
        # they must NOT be sorted by word number.
        words = self.tagged[verse_ordinal(BOOKS, 19, 51, 1)]
        self.assertEqual([num(w[0]) for w in words],
                         [5329, 4210, 1732, 935, 413, 5416, 5030, 834, 935, 413, 1339, 1339, 2603, 430, 2617, 7230, 7356, 4229, 6588])

    def test_greek_tags_come_from_the_dstrong_column(self):
        words = self.tagged[verse_ordinal(BOOKS, 43, 3, 16)]
        tags = [w[0] for w in words]
        self.assertIn("G3439", tags)
        self.assertIn("G5207", tags)
        self.assertEqual(len(words), 26)  # includes the NA28-absent variant word #11


class LexiconTests(unittest.TestCase):
    def test_reads_gloss_only_and_plain_number(self):
        entries = read_lexicon([FIX / "lexicon_heb_excerpt.txt", FIX / "lexicon_grk_excerpt.txt"])
        by_tag = {e.tag: e for e in entries}
        self.assertEqual(by_tag["H1254A"].gloss, "to create")
        self.assertEqual(by_tag["H1254B"].gloss, "to fatten")
        self.assertEqual(by_tag["H1254A"].plain, "H1254")
        self.assertEqual(by_tag["H1254A"].language, "heb")
        self.assertEqual(by_tag["G3439"].gloss, "unique")
        self.assertEqual(by_tag["G3439"].language, "grc")
        self.assertEqual(by_tag["H7225H"].gloss, "first: best")


if __name__ == "__main__":
    unittest.main()
