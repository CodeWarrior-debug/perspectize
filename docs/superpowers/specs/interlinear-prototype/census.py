import csv, re, json, collections
csv.field_size_limit(10**9)
BASE = '/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize--claude-worktrees-agent-ab5aff3aa149547ab/4027fd5c-4155-4ad3-8adb-7903bf2b1dd1/scratchpad/e-spike/'
ROOT = '/Users/jamesjordan/GitHub/perspectize/.claude/worktrees/interlinear/data/bible/'
books = json.load(open(ROOT + 'books.json'))
name2id = {}
for b in books:
    name2id[b['name'].lower()] = b['id']
    for a in b['aliases']: name2id[a.lower()] = b['id']
start = {}; run = 0
for b in sorted(books, key=lambda b: b['id']):
    start[b['id']] = run; run += sum(b['versesPerChapter'])
def ordinal(bid, ch, v):
    b = next(x for x in books if x['id'] == bid)
    return start[bid] + sum(b['versesPerChapter'][:ch - 1]) + v

ours = {}
for line in open(ROOT + 'bsb.tsv', encoding='utf-8').read().split('\n')[1:]:
    if line.strip():
        i, t = line.split('\t', 1); ours[int(i)] = t

rows = list(csv.reader(open(BASE + 'bsb_tables.tsv', encoding='utf-8'), delimiter='\t', quotechar=None))
hdr, rows = rows[0], rows[1:]
IDX = dict(sort_h=0, sort_g=1, sort_b=2, verse=3, lang=4, str_h=10, str_g=11, vid=12, hdg=13, xref=14, par=15, space=16, begq=17, eng=18, pnc=19, endq=20, fn=21, endtext=22)
def f(r, k): return r[IDX[k]] if len(r) > IDX[k] else ''

# ---- 1. census of line kinds
kinds = collections.Counter()
short = 0
for r in rows:
    if len(r) < 23: short += 1
    has = tuple(k for k in ('str', 'eng', 'pnc', 'begq', 'endq', 'hdg', 'xref', 'par', 'fn', 'endtext', 'space') if (
        (f(r, 'str_h').strip() or f(r, 'str_g').strip()) if k == 'str' else f(r, k).strip()))
    kinds[has] += 1
print('lines:', len(rows), ' short lines (<23 cols):', short)
for k, c in kinds.most_common(10): print(f'  {c:7d}  {k or "(completely empty)"}')

# words w/o strongs but with english?
ws_noeng = ws_eng = 0
for r in rows:
    s = f(r, 'str_h').strip() or f(r, 'str_g').strip()
    if s:
        if f(r, 'eng').strip(): ws_eng += 1
        else: ws_noeng += 1
print('rows WITH Strong: english present', ws_eng, ' english blank (continuation)', ws_noeng)
dash = sum(1 for r in rows if f(r, 'eng').strip() == '-')
vvv = sum(1 for r in rows if f(r, 'eng').strip() == 'vvv')
print("english == '-':", dash, "  english == 'vvv':", vvv)

# ---- 2. verse counter vs our ordinal
label = None; lab_ord = {}
mism = 0; checked = 0; firsts = []
byverse = collections.defaultdict(list)
for r in rows:
    if len(r) < 19: continue
    if f(r, 'vid').strip():
        m = re.match(r'^(.+?)\s+(\d+):(\d+)$', f(r, 'vid').strip())
        label = ordinal(name2id[m.group(1).lower()], int(m.group(2)), int(m.group(3))) if m and m.group(1).lower() in name2id else None
        if label is not None:
            checked += 1
            if str(label) != f(r, 'verse').strip():
                mism += 1
                if len(firsts) < 5: firsts.append((f(r, 'vid'), label, f(r, 'verse')))
    if label is not None: byverse[label].append(r)
print(f'\nverse labels checked: {checked}; Verse counter != our ordinal: {mism}', firsts)
print('distinct verses gathered:', len(byverse), ' (ours has', len(ours), ')')

# ---- 3. rebuild text and compare with bsb.tsv
def build(vrows):
    vrows = sorted(vrows, key=lambda r: int(f(r, 'sort_b')) if f(r, 'sort_b').strip().isdigit() else 10**9)
    s = ''.join(f(r, 'begq') + f(r, 'eng') + f(r, 'pnc') + f(r, 'endq') for r in vrows)
    s = re.sub(r'\s+', ' ', s).strip()
    s = re.sub(r'([“‘(]) ', r'\1', s)
    s = re.sub(r' ([,.;:?!”’)])', r'\1', s)
    s = s.replace(' - ', ' ')
    return re.sub(r'\s+', ' ', s).strip()
eq = 0; diff = []; empty_ours = [k for k, t in ours.items() if not t.strip()]
for v, t in ours.items():
    got = build(byverse.get(v, []))
    if got == t.strip(): eq += 1
    else: diff.append((v, t.strip(), got))
print(f'\nrebuilt == bsb.tsv: {eq} of {len(ours)}; different: {len(diff)}; empty-in-ours verses: {len(empty_ours)}')
json.dump(diff, open(BASE + 'text_diff.json', 'w'), ensure_ascii=False)
for v, a, b in diff[:6]:
    print(f'  verse {v}\n    ours : {a[:150]}\n    rebuilt: {b[:150]}')
