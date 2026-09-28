import csv, re, json, collections, difflib
exec(open('/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize--claude-worktrees-agent-ab5aff3aa149547ab/4027fd5c-4155-4ad3-8adb-7903bf2b1dd1/scratchpad/e-spike/census.py').read().split('# ---- 1. census')[0])
label = None
byverse = collections.defaultdict(list)
for r in rows:
    if len(r) < 19: continue
    if f(r, 'vid').strip():
        m = re.match(r'^(.+?)\s+(\d+):(\d+)$', f(r, 'vid').strip())
        label = ordinal(name2id[m.group(1).lower()], int(m.group(2)), int(m.group(3))) if m and m.group(1).lower() in name2id else None
    if label is not None: byverse[label].append(r)

def piece(r):
    beg = re.sub(r'<[^>]+>', '', f(r, 'begq')).replace('[', '').replace(']', '').strip()
    eng = f(r, 'eng').replace('[', '').replace(']', '').strip()
    if eng in ('-', 'vvv'): eng = ''
    if eng == '. . .': eng = '...'
    pnc = f(r, 'pnc').strip()
    end = f(r, 'endq').strip()
    return beg + eng + pnc + end

def build(vrows):
    vrows = sorted(vrows, key=lambda r: int(f(r, 'sort_b')) if f(r, 'sort_b').strip().isdigit() else 10**9)
    s = ' '.join(p for p in (piece(r) for r in vrows) if p)
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'— ', '—', s)
    s = re.sub(r' —', '—', s)
    s = re.sub(r'([“‘(]) ', r'\1', s)
    s = re.sub(r' ([,.;:?!”’)])', r'\1', s)
    return s

def norm(x): return re.sub(r'\s+', ' ', x.replace('“', '"').replace('”', '"').replace('‘', "'").replace('’', "'")).strip()
eq = 0; diffs = []
for v, t in ours.items():
    got = build(byverse.get(v, []))
    if got == t.strip(): eq += 1
    else: diffs.append((v, t.strip(), got))
print(f'rebuilt == bsb.tsv exactly: {eq} of {len(ours)}; different: {len(diffs)}')
# classify differences by word-level comparison (ignoring punctuation/quote/space)
def words(x): return re.findall(r"[A-Za-z0-9’'\-]+", x.lower().replace('’', "'"))
cats = collections.Counter(); samples = collections.defaultdict(list)
for v, a, b in diffs:
    if not a.strip(): cat = 'ours empty verse'
    elif words(a) == words(b): cat = 'same words, different punctuation/spacing'
    else: cat = 'different words'
    cats[cat] += 1
    if len(samples[cat]) < 5: samples[cat].append((v, a, b))
print(dict(cats))
for cat, ss in samples.items():
    print('\n==', cat)
    for v, a, b in ss:
        if cat == 'different words':
            sm = difflib.SequenceMatcher(None, words(a), words(b))
            ops = [(t, words(a)[i1:i2], words(b)[j1:j2]) for t, i1, i2, j1, j2 in sm.get_opcodes() if t != 'equal'][:3]
            print(f'  {v}: {ops}')
        else:
            i = next((k for k in range(min(len(a), len(b))) if a[k] != b[k]), min(len(a), len(b)))
            print(f'  {v}: ours ...{a[max(0,i-25):i+25]!r}  | rebuilt ...{b[max(0,i-25):i+25]!r}')
json.dump(diffs, open('/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize--claude-worktrees-agent-ab5aff3aa149547ab/4027fd5c-4155-4ad3-8adb-7903bf2b1dd1/scratchpad/e-spike/text_diff2.json', 'w'), ensure_ascii=False)
