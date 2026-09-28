import csv, re, json, gzip, hashlib, collections, sys
exec(open('/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize--claude-worktrees-agent-ab5aff3aa149547ab/4027fd5c-4155-4ad3-8adb-7903bf2b1dd1/scratchpad/e-spike/join_test.py').read().split("# Berean rows per verse")[0])
OUT = BASE + 'e-spike/bible_word_proto.tsv'

def plain(d): return d[0] + str(int(re.match(r'[HG](\d+)', d).group(1)))
def num(d): return int(re.match(r'[HG](\d+)', d).group(1))
def clean(x): return re.sub(r'<[^>]+>', '', x).replace('[', '').replace(']', '').replace('{', '').replace('}', '').strip()
def scrub_eng(e):
    e = re.sub(r'\bvvv\b', ' ', e); e = re.sub(r'(?:\. ){2}\.', ' ', e); e = re.sub(r'(^|\s)-(?=\s|$)', ' ', e)
    return re.sub(r'\s+', ' ', e).strip()

allrows = list(csv.reader(open(BASE + 'e-spike/bsb_tables.tsv', encoding='utf-8'), delimiter='\t', quotechar=None))[1:]
# group rows per verse label (ordinal = Verse column, verified equal to our ordinal)
verse_rows = collections.defaultdict(list)
label = None
for r in allrows:
    if len(r) < 23: continue
    if r[12].strip(): label = int(r[3]) if r[3].strip().isdigit() else None
    if label is not None: verse_rows[label].append(r)

# ordinal -> (bid,ch,v)
o2k = {}
for b in sorted(BOOKS, key=lambda b: b['id']):
    pass
run = 0
for b in sorted(BOOKS, key=lambda b: b['id']):
    for ch, n in enumerate(b['versesPerChapter'], 1):
        for v in range(1, n + 1):
            run += 1; o2k[run] = (b['id'], ch, v)

# pass 1: alignment + frequency table
align = {}   # (ordinal, rowindex-in-verse) -> tag
freq = collections.defaultdict(collections.Counter)
for o, vr in verse_rows.items():
    key = o2k[o]
    words = [(k, r) for k, r in enumerate(vr) if r[10].strip().isdigit() or r[11].strip().isdigit()]
    def srt(t): r = t[1]; c = r[0] if r[10].strip().isdigit() else r[1]; return int(c) if c.strip().isdigit() else 0
    words.sort(key=srt)
    a = [int(r[10]) if r[10].strip().isdigit() else int(r[11]) for _, r in words]
    if key in tag:
        al = lcs_align(a, [d for _, d in tag[key]])
        for i, d in al.items():
            align[(o, words[i][0])] = d; freq[plain(d)][d] += 1

def fallback(pl):
    for d, _ in freq.get(pl, collections.Counter()).most_common():
        if d in lexd: return d
    for d in lexd:
        if plain(d) == pl: return d
    return None
fb_cache = {}

# pass 2: write rows
n_rows = n_tagged = n_fb = n_eng_only = 0
with open(OUT, 'w', encoding='utf-8') as fo:
    fo.write('verse\tlang\tsrc_sort\tbsb_sort\tsource\ttranslit\tparse_short\tparse_full\torig_strongs\tstrongs\tstrongs_source\tspan_head\tenglish\tpre\tpost\n')
    for o in sorted(verse_rows):
        vr = verse_rows[o]
        head = None; last_bsb = None
        rows_sorted = sorted(enumerate(vr), key=lambda t: int(t[1][2]) if t[1][2].strip().isdigit() else 10**9)
        for k, r in rows_sorted:
            is_word = r[10].strip().isdigit() or r[11].strip().isdigit()
            eng = scrub_eng(clean(r[18]))
            pre = '' if 'reftext' in r[17] else clean(r[17])
            et = r[22].strip()
            post = clean(r[19]) + clean(r[20]) + ('' if et.startswith('[') else clean(et))
            bsb = int(r[2]) if r[2].strip().isdigit() else 0
            if not is_word:
                if eng or pre or post:
                    n_eng_only += 1; n_rows += 1
                    head = bsb; last_bsb = bsb
                    fo.write('\t'.join(map(str, [o, '', '', bsb, '', '', '', '', '', '', '', head, eng, pre, post])) + '\n')
                continue
            lang = 'heb' if r[10].strip().isdigit() else 'grc'
            ostr = (r[10] if lang == 'heb' else r[11]).strip()
            pl = ('H' if lang == 'heb' else 'G') + str(int(ostr))
            if (o, k) in align: st, src = align[(o, k)], 'tagged'; n_tagged += 1
            else:
                if pl not in fb_cache: fb_cache[pl] = fallback(pl)
                st, src = fb_cache[pl] or '', 'fallback'; n_fb += 1
            if eng: head = bsb
            elif last_bsb is not None and bsb == last_bsb + 1 and head is not None: pass    # continuation of previous phrase
            else: head = None
            last_bsb = bsb
            ssort = (r[0] if lang == 'heb' else r[1]).strip()
            fo.write('\t'.join(map(str, [o, lang, ssort, bsb, r[5], r[7], r[8], r[9], ostr, st, src, head if head is not None else '', eng, pre, post])) + '\n')
            n_rows += 1
raw = open(OUT, 'rb').read()
gz = gzip.compress(raw, 9)
open(OUT + '.gz', 'wb').write(gz)
print(f'rows written: {n_rows}  (word rows tagged: {n_tagged}, fallback: {n_fb}, english-only rows: {n_eng_only})')
print(f'uncompressed: {len(raw)/1e6:.1f} MB   gzip -9: {len(gz)/1e6:.2f} MB   sha256: {hashlib.sha256(gz).hexdigest()[:16]}…')
