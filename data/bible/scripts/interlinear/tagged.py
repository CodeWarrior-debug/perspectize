"""STEPBible TAHOT (Hebrew OT) / TAGNT (Greek NT) readers.

Every word carries its exact disambiguated Strong's tag. English (NRSV) references
are used; a Psalm title is verse .0 and is folded into verse 1 (the BSB prints the
title inside its verse 1). Word numbers restart at every Hebrew verse, so words are
kept in FILE order and never sorted by number.
"""
import re

from .books import verse_ordinal

ABBR = ["Gen", "Exo", "Lev", "Num", "Deu", "Jos", "Jdg", "Rut", "1Sa", "2Sa", "1Ki", "2Ki", "1Ch", "2Ch", "Ezr", "Neh",
        "Est", "Job", "Psa", "Pro", "Ecc", "Sng", "Isa", "Jer", "Lam", "Ezk", "Dan", "Hos", "Jol", "Amo", "Oba", "Jon",
        "Mic", "Nam", "Hab", "Zep", "Hag", "Zec", "Mal", "Mat", "Mrk", "Luk", "Jhn", "Act", "Rom", "1Co", "2Co", "Gal",
        "Eph", "Php", "Col", "1Th", "2Th", "1Ti", "2Ti", "Tit", "Phm", "Heb", "Jas", "1Pe", "2Pe", "1Jn", "2Jn", "3Jn",
        "Jud", "Rev"]
_ABBR_ID = {a: i + 1 for i, a in enumerate(ABBR)}
_REF = re.compile(r"^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)(?:\([^)]*\))?#(\d+)=")
_BRACED = re.compile(r"\{([HG]\d+[A-Za-z]?)\}")
_LEADING = re.compile(r"^([HG]\d+[A-Za-z]?)")


def _tags(cols):
    if len(cols) > 4:
        braced = _BRACED.findall(cols[4])
        if braced:
            return braced
    if len(cols) > 3:
        m = _LEADING.match(cols[3])
        if m:
            return [m.group(1)]
    return []


def read_tagged(paths, books):
    out: dict[int, list[list[str]]] = {}
    skipped: list[str] = []
    for path in paths:
        with open(path, encoding="utf-8-sig") as fh:
            for line in fh:
                m = _REF.match(line)
                if not m or m.group(1) not in _ABBR_ID:
                    continue
                cols = line.rstrip("\n").split("\t")
                tags = _tags(cols)
                if not tags:
                    continue
                book, chapter, verse = _ABBR_ID[m.group(1)], int(m.group(2)), int(m.group(3))
                if verse == 0:
                    verse = 1
                try:
                    ordinal = verse_ordinal(books, book, chapter, verse)
                except (ValueError, KeyError):
                    skipped.append(f"{m.group(1)}.{chapter}.{m.group(3)}")
                    continue
                out.setdefault(ordinal, []).append(tags)
    return out, skipped
