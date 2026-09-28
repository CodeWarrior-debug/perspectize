"""In-order alignment of Berean word rows to STEPBible tagged words, plus the fallback rule."""
import re
from collections import Counter, defaultdict


def tag_number(tag):
    return int(re.match(r"[HG](\d+)", tag).group(1))


def plain_key(lang, number):
    return ("H" if lang == "heb" else "G") + str(number)


def lcs_align(numbers, words):
    """Longest in-order match between Berean numbers (source order) and tagged words.
    Returns {index into numbers: chosen tag}. A word whose number differs between the two
    datasets stays unaligned (see the spec: positional pairing gives wrong meanings)."""
    n, m = len(numbers), len(words)

    def ok(i, j):
        return any(tag_number(t) == numbers[i] for t in words[j])

    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            dp[i][j] = dp[i + 1][j + 1] + 1 if ok(i, j) else max(dp[i + 1][j], dp[i][j + 1])
    out, i, j = {}, 0, 0
    while i < n and j < m:
        if ok(i, j) and dp[i][j] == dp[i + 1][j + 1] + 1:
            out[i] = next(t for t in words[j] if tag_number(t) == numbers[i])
            i += 1
            j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]:
            i += 1
        else:
            j += 1
    return out


class Fallback:
    """Meaning for a word the join could not align: the plain number's most common tag across
    the Bible that has a gloss (right 79.0% of the time when measured; first-lexicon-row was 71.1%),
    then the first lexicon tag for that number, else empty."""

    def __init__(self, lexicon):
        self._gloss = {e.tag: e.gloss for e in lexicon}
        self._first = {}
        for e in lexicon:
            self._first.setdefault(e.plain, e.tag)
        self._freq = defaultdict(Counter)

    def observe(self, plain, tag):
        self._freq[plain][tag] += 1

    def choose(self, plain):
        for tag, _ in self._freq[plain].most_common():
            if self._gloss.get(tag):
                return tag
        return self._first.get(plain, "")
