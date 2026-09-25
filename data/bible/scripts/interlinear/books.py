"""Verse ordinals from data/bible/books.json (the same formula the Go and TS code use)."""
import json


def load_books(path):
    with open(path, encoding="utf-8") as fh:
        return sorted(json.load(fh), key=lambda b: b["id"])


def verse_ordinal(books, book_id, chapter, verse):
    """1-based global verse ordinal. Raises KeyError for an unknown book,
    ValueError when the chapter/verse does not exist."""
    offset = 0
    for b in books:
        if b["id"] == book_id:
            vpc = b["versesPerChapter"]
            if not 1 <= chapter <= len(vpc) or not 1 <= verse <= vpc[chapter - 1]:
                raise ValueError(f"{b['name']} {chapter}:{verse} does not exist")
            return offset + sum(vpc[: chapter - 1]) + verse
        offset += sum(b["versesPerChapter"])
    raise KeyError(book_id)
