import csv, re, json, collections
csv.field_size_limit(10**9)
BASE = '/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize--claude-worktrees-agent-ab5aff3aa149547ab/4027fd5c-4155-4ad3-8adb-7903bf2b1dd1/scratchpad/'
BOOKS = json.load(open('/Users/jamesjordan/GitHub/perspectize/.claude/worktrees/interlinear/data/bible/books.json'))
ABBR = ['Gen','Exo','Lev','Num','Deu','Jos','Jdg','Rut','1Sa','2Sa','1Ki','2Ki','1Ch','2Ch','Ezr','Neh','Est','Job','Psa','Pro','Ecc','Sng','Isa','Jer','Lam','Ezk','Dan','Hos','Jol','Amo','Oba','Jon','Mic','Nam','Hab','Zep','Hag','Zec','Mal',
        'Mat','Mrk','Luk','Jhn','Act','Rom','1Co','2Co','Gal','Eph','Php','Col','1Th','2Th','1Ti','2Ti','Tit','Phm','Heb','Jas','1Pe','2Pe','1Jn','2Jn','3Jn','Jud','Rev']
assert len(ABBR) == 66 and len(BOOKS) == 66
name2id = {}
for b in BOOKS:
    name2id[b['name'].lower()] = b['id']
    for a in b['aliases']: name2id[a.lower()] = b['id']
abbr2id = {a: i + 1 for i, a in enumerate(ABBR)}

# ---- lexicons: dStrong -> gloss
lexd = {}
for fn in ('step/TBESH.txt', 'step/TBESG.txt'):
    for line in open(BASE + fn, encoding='utf-8-sig'):
        c = line.rstrip('\n').split('\t')
        if len(c) < 8: continue
        m = re.match(r'^([HG]\d+[A-Za-z]?)', c[1])
        if m and re.match(r'^[HG]\d', c[0]): lexd[m.group(1)] = c[6]

# ---- tagged texts: (book_id, ch, v) -> [(word#, [dStrongs braced])]
tag = collections.defaultdict(list)
REF = re.compile(r'^([1-3]?[A-Za-z]{2,3})\.(\d+)\.(\d+)(?:\([^)]*\))?#(\d+)=')
for fn, col in (('step/TAHOT_Gen-Deu.txt', 4), ('step/TAHOT_Jos-Est.txt', 4), ('step/TAHOT_Job-Sng.txt', 4), ('step/TAHOT_Isa-Mal.txt', 4),
                ('step/TAGNT_Mat-Jhn.txt', 3), ('step/TAGNT_Act-Rev.txt', 3)):
    for line in open(BASE + fn, encoding='utf-8-sig'):
        m = REF.match(line)
        if not m or m.group(1) not in abbr2id: continue
        c = line.rstrip('\n').split('\t')
        if len(c) <= col: continue
        field = c[col]
        ds = re.findall(r'\{([HG]\d+[A-Za-z]?)\}', field) if col == 4 else [re.match(r'^([HG]\d+[A-Za-z]?)', field).group(1)] if re.match(r'^[HG]\d+[A-Za-z]?', field) else []
        if not ds: continue
        bid, ch, v, n = abbr2id[m.group(1)], int(m.group(2)), int(m.group(3)), int(m.group(4))
        if v == 0: v = 1  # Psalm titles: BSB puts the title inside verse 1
        tag[(bid, ch, v)].append((n, ds))
# keep file order: TAHOT word numbers restart at each Hebrew verse (Psalm titles)

# ---- Berean rows per verse
bere = collections.defaultdict(list)  # (bid,ch,v) -> [(sort, plain int, lang)]
unresolved = collections.Counter()
verse = None
for r in csv.reader(open(BASE + 'e-spike/bsb_tables.tsv', encoding='utf-8'), delimiter='\t', quotechar=None):
    if len(r) < 19: continue
    if r[12].strip():
        m = re.match(r'^(.+?)\s+(\d+):(\d+)$', r[12].strip())
        if m and m.group(1).lower() in name2id: verse = (name2id[m.group(1).lower()], int(m.group(2)), int(m.group(3)))
        else:
            verse = None
            unresolved[r[12].strip()] += 1
    if verse is None: continue
    if r[10].strip().isdigit(): bere[verse].append((int(r[0]) if r[0].strip().isdigit() else 0, int(r[10]), 'H'))
    elif r[11].strip().isdigit(): bere[verse].append((int(r[1]) if r[1].strip().isdigit() else 0, int(r[11]), 'G'))
print('unresolved verse labels:', sum(unresolved.values()), list(unresolved)[:5])
for k in bere: bere[k].sort(key=lambda x: x[0])

def lcs_align(a, b):
    """a: berean plain ints; b: list of dStrong lists. Returns dict a_index -> chosen dStrong."""
    n, m = len(a), len(b)
    def ok(i, j): return any(int(d[1:-1] if d[-1].isalpha() else d[1:]) == a[i] for d in b[j])
    dp = [[0] * (m + 1) for _ in range(n + 1)]
    for i in range(n - 1, -1, -1):
        for j in range(m - 1, -1, -1):
            dp[i][j] = dp[i + 1][j + 1] + 1 if ok(i, j) else max(dp[i + 1][j], dp[i][j + 1])
    out, i, j = {}, 0, 0
    while i < n and j < m:
        if ok(i, j) and dp[i][j] == dp[i + 1][j + 1] + 1:
            out[i] = [d for d in b[j] if int(d[1:-1] if d[-1].isalpha() else d[1:]) == a[i]][0]; i += 1; j += 1
        elif dp[i + 1][j] >= dp[i][j + 1]: i += 1
        else: j += 1
    return out

# ambiguity set: plain numbers with >1 lexicon dStrong
byplain = collections.defaultdict(set)
for d in lexd: byplain[d[0] + str(int(re.match(r'[HG](\d+)', d).group(1)))].add(d)
amb = {k for k, v in byplain.items() if len(v) > 1}

tot = mat = atot = amat = 0
nolex = 0
missing_verses = 0
badverse = []
results = {}
for vk, rows in bere.items():
    a = [x[1] for x in rows]
    lang = rows[0][2]
    if vk not in tag: missing_verses += 1; continue
    al = lcs_align(a, [d for _, d in tag[vk]])
    results[vk] = (rows, al)
    for i, (s, num, lg) in enumerate(rows):
        tot += 1
        isamb = (lg + str(num)) in amb
        if isamb: atot += 1
        if i in al:
            mat += 1
            if isamb: amat += 1
            if al[i] not in lexd: nolex += 1
    if len(al) < len(rows) and len(badverse) < 8000: badverse.append((vk, len(rows), len(al)))
print(f'Berean word rows with a Strong number: {tot}')
print(f'  aligned to a tagged word with same number: {mat} ({100*mat/tot:.2f}%)')
print(f'  ambiguous-number rows: {atot}; aligned: {amat} ({100*amat/atot:.2f}%)')
print(f'  aligned rows whose dStrong has NO lexicon gloss: {nolex}')
print(f'  verses in Berean with no tagged-text verse: {missing_verses}')
print(f'  verses with at least one unaligned row: {len(badverse)} of {len(bere)}')
print('  sample unaligned verses (bid,ch,v: rows, aligned):', badverse[:6])

def show(bid, ch, v, want):
    rows, al = results[(bid, ch, v)]
    for i, (s, num, lg) in enumerate(rows):
        if num == want: print(f'   {(bid,ch,v)} plain {lg}{num} -> {al.get(i)} = {lexd.get(al.get(i))!r}')
print('\nSpot checks:')
show(9, 2, 29, 1254)   # 1 Samuel 2:29 (book 9)
show(1, 1, 1, 1254)
show(1, 1, 1, 430)
show(43, 3, 16, 3439)
show(43, 3, 16, 5207)
json.dump({f'{k[0]}:{k[1]}:{k[2]}': [[rows[i][1], al.get(i)] for i in range(len(rows))] for k, (rows, al) in results.items()}, open(BASE + 'e-spike/join_result.json', 'w'))
