"""STEPBible brief lexicons (TBESH / TBESG). Gloss column ONLY: the Hebrew `Meaning`
paragraph derives from Online Bible's abridged BDB and needs their permission."""
import re
from dataclasses import dataclass


@dataclass(frozen=True)
class LexEntry:
    tag: str      # disambiguated, e.g. H1254B
    plain: str    # plain Strong's key, e.g. H1254
    language: str  # 'heb' | 'grc'
    gloss: str


def read_lexicon(paths):
    entries = []
    for path in paths:
        with open(path, encoding="utf-8-sig") as fh:
            for line in fh:
                cols = line.rstrip("\n").split("\t")
                if len(cols) < 8:
                    continue
                e = re.match(r"^([HG])(\d+)", cols[0])
                d = re.match(r"^([HG]\d+[A-Za-z]?)", cols[1])
                if not e or not d:
                    continue
                entries.append(LexEntry(
                    tag=d.group(1),
                    plain=f"{e.group(1)}{int(e.group(2))}",
                    language="heb" if e.group(1) == "H" else "grc",
                    gloss=cols[6].strip(),
                ))
    return entries
