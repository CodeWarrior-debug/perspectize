import re, json, collections, difflib
src = open('rebuild2.py').read().split("eq = 0; diffs = []")[0]
exec(src)
def clean(x): return re.sub(r'<[^>]+>', '', x).replace('[', '').replace(']', '').replace('{', '').replace('}', '')
def scrub_eng(e):
    e = re.sub(r'\bvvv\b', ' ', e)
    e = re.sub(r'(?:\. ){2}\.', ' ', e)
    e = re.sub(r'(^|\s)-(?=\s|$)', ' ', e)
    return e
def piece(r):
    raw_beg = f(r, 'begq')
    beg = '' if 'reftext' in raw_beg else clean(raw_beg).strip()
    eng = re.sub(r'\s+', ' ', scrub_eng(clean(f(r, 'eng')))).strip()
    endtext = f(r, 'endtext').strip()
    end_extra = '' if endtext.startswith('[') else clean(endtext).strip()   # bracketed End text = duplicate hint
    return beg + eng + clean(f(r, 'pnc')).strip() + clean(f(r, 'endq')).strip() + end_extra
def words(x): return re.findall(r"[a-z0-9]+(?:['’][a-z]+)*", x.lower())
def classify():
    exact = 0; same = 0; real = []; punct = collections.Counter(); ex = {}
    for v, t in ours.items():
        got = build(byverse.get(v, []))
        if got == t.strip(): exact += 1
        elif words(got) == words(t):
            same += 1
            sm = difflib.SequenceMatcher(None, t.strip(), got, autojunk=False)
            for tag, i1, i2, j1, j2 in sm.get_opcodes():
                if tag != 'equal':
                    k = (t.strip()[i1:i2], got[j1:j2]); punct[k] += 1; ex.setdefault(k, (v, t.strip()[max(0, i1-14):i2+14], got[max(0, j1-14):j2+14]))
        else: real.append(v)
    return exact, same, real, punct, ex
if __name__ == '__main__':
    exact, same, real, punct, ex = classify()
    print(f'exact: {exact} ({100*exact/len(ours):.2f}%)   same words/different punctuation: {same}   real word differences: {len(real)}   total {len(ours)}')
    print('real-difference verses:', real)
    for k, c in punct.most_common(10): print(f'  {c:5d} {k!r} e.g. verse {ex[k][0]}: {ex[k][1]!r} vs {ex[k][2]!r}')
