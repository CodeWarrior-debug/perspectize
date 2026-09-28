import unittest
from pathlib import Path

from interlinear.berean import assign_span_heads, read_berean
from interlinear.books import load_books, verse_ordinal

HERE = Path(__file__).resolve().parent
FIX = HERE / "fixtures"
BOOKS = load_books(HERE.parents[2] / "books.json")


def rows_for(verses, book, ch, v):
    return verses[verse_ordinal(BOOKS, book, ch, v)]


def find(rows, strongs, **where):
    hits = [(i, r) for i, r in enumerate(rows) if r.strongs == strongs and all(getattr(r, k) == val for k, val in where.items())]
    assert hits, (strongs, where)
    return hits[0]


class SpanTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.verses = read_berean(FIX / "berean_excerpt.tsv")

    def test_a_row_with_english_heads_its_own_phrase(self):
        rows = rows_for(self.verses, 43, 3, 16)
        heads = assign_span_heads(rows)
        i, r = find(rows, 3439)  # "one and only"
        self.assertEqual(heads[i], r.bsb_sort)

    def test_untranslated_and_moved_words_belong_to_no_phrase(self):
        rows = rows_for(self.verses, 43, 3, 16)
        heads = assign_span_heads(rows)
        i, _ = find(rows, 3361)  # `vvv`
        self.assertIsNone(heads[i])
        i, _ = find(rows, 3588, english=" - ")  # untranslated article
        self.assertIsNone(heads[i])

    def test_adjacent_blank_english_row_continues_the_previous_phrase(self):
        rows = rows_for(self.verses, 1, 16, 6)
        heads = assign_span_heads(rows)
        i_cont, cont = find(rows, 5869)
        i_prev, prev = find(rows, 2896)  # "whatever you want"
        self.assertEqual(cont.bsb_sort, prev.bsb_sort + 1)
        self.assertEqual(heads[i_cont], prev.bsb_sort)

    def test_non_adjacent_blank_english_row_belongs_to_no_phrase(self):
        rows = rows_for(self.verses, 1, 39, 5)
        heads = assign_span_heads(rows)
        i, r = find(rows, 1961, bsb_sort=26888)  # H1961 far after the padding rows
        self.assertEqual(r.english.strip(), "")
        self.assertIsNone(heads[i])

    def test_english_only_rows_do_not_crash_and_head_themselves_when_they_have_text(self):
        rows = rows_for(self.verses, 1, 1, 1)
        heads = assign_span_heads(rows)
        self.assertEqual(len(heads), len(rows))


if __name__ == "__main__":
    unittest.main()
