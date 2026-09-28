import unittest
from pathlib import Path

from interlinear.berean import (
    BereanRow, build_chunks, piece, read_berean, read_bsb, render, space_between,
)
from interlinear.books import load_books, verse_ordinal

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
BOOKS = load_books(HERE.parents[2] / "books.json")


def row(**kw):
    base = dict(verse=1, bsb_sort=1, source_sort=None, lang=None, source="", translit="",
                parse_short="", parse_full="", strongs=None, english="", begq="", pnc="",
                endq="", endtext="")
    base.update(kw)
    return BereanRow(**base)


class BooksTests(unittest.TestCase):
    def test_known_ordinals(self):
        self.assertEqual(verse_ordinal(BOOKS, 1, 1, 1), 1)
        self.assertEqual(verse_ordinal(BOOKS, 43, 3, 16), 26137)  # John 3:16 (matches the file's Verse column)
        self.assertEqual(verse_ordinal(BOOKS, 66, 22, 21), 31102)

    def test_rejects_nonexistent_verse(self):
        with self.assertRaises(ValueError):
            verse_ordinal(BOOKS, 1, 1, 99)


class PieceTests(unittest.TestCase):
    def test_untranslated_and_moved_markers_produce_no_text(self):
        self.assertEqual(piece(row(strongs=853, english=" - ")), "")
        self.assertEqual(piece(row(strongs=3361, english=" vvv ")), "")
        self.assertEqual(piece(row(english=" . . . ")), "")

    def test_markers_embedded_in_a_phrase_are_removed(self):
        self.assertEqual(piece(row(english=" named vvv him ")), "named him")
        self.assertEqual(piece(row(english=" - There ")), "There")
        self.assertEqual(piece(row(english=" numbered . . . 40,500 ")), "numbered 40,500")

    def test_supplied_word_brackets_and_html_are_stripped(self):
        self.assertEqual(piece(row(english=" [was] good ")), "was good")
        self.assertEqual(piece(row(english=" fifty {each} ", endtext="”</span>")), "fifty each”")

    def test_closing_quote_can_live_in_end_text_but_bracketed_end_text_is_ignored(self):
        self.assertEqual(piece(row(english=" his heel ", pnc=".", endtext="” ")), "his heel.”")
        self.assertEqual(piece(row(english=" on it ", pnc=".", endq="’", endtext="[’’]")), "on it.’")

    def test_stray_spaces_inside_a_cell_are_tidied(self):
        self.assertEqual(piece(row(english=" Likewise , every ")), "Likewise, every")
        self.assertEqual(piece(row(english=" 1 ,700 shekels ")), "1,700 shekels")
        self.assertEqual(piece(row(english=" he — Jerubbaal ")), "he—Jerubbaal")
        self.assertEqual(piece(row(english=" “No , ”", pnc="")), "“No,”")

    def test_reftext_verse_number_spans_are_dropped(self):
        self.assertEqual(piece(row(begq="<span class=|reftext|><a href=|#|><b>1</b></a></span>", english=" Blessed ")), "Blessed")


class SpaceTests(unittest.TestCase):
    def test_rules(self):
        self.assertTrue(space_between("said,", "“Let"))
        self.assertFalse(space_between("“", "Let"))          # after an opening quote
        self.assertFalse(space_between("light", ",”"))       # before closing punctuation
        self.assertFalse(space_between("morning—", "the"))   # after an em dash
        self.assertFalse(space_between("you", "—birds"))     # before an em dash
        self.assertTrue(space_between("the", "earth"))


class FixtureTextTests(unittest.TestCase):
    """The consistency guard: text rebuilt from the alignment equals bsb.tsv."""

    @classmethod
    def setUpClass(cls):
        cls.verses = read_berean(FIX / "berean_excerpt.tsv")
        cls.bsb = read_bsb(FIX / "bsb_excerpt.tsv")

    def test_every_fixture_verse_rebuilds_exactly(self):
        self.assertGreaterEqual(len(self.bsb), 9)
        for verse, text in self.bsb.items():
            self.assertEqual(render(build_chunks(self.verses[verse])), text, f"verse {verse}")

    def test_padding_rows_are_not_read(self):
        for rows in self.verses.values():
            for r in rows:
                self.assertTrue(r.strongs is not None or r.english.strip() or r.begq.strip() or r.pnc.strip()
                                or r.endq.strip() or r.endtext.strip())

    def test_verse_column_is_the_ordinal(self):
        self.assertIn(verse_ordinal(BOOKS, 43, 3, 16), self.verses)
        self.assertIn(verse_ordinal(BOOKS, 9, 2, 29), self.verses)

    def test_greek_rows_use_greek_sort_and_hebrew_rows_hebrew_sort(self):
        john = self.verses[verse_ordinal(BOOKS, 43, 3, 16)]
        self.assertTrue(all(r.lang == "grc" for r in john if r.strongs is not None))
        gen = self.verses[1]
        self.assertTrue(all(r.lang == "heb" for r in gen if r.strongs is not None))


if __name__ == "__main__":
    unittest.main()
