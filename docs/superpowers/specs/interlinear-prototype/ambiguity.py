import csv, re, collections
csv.field_size_limit(10**9)
BASE = '/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize--claude-worktrees-agent-ab5aff3aa149547ab/4027fd5c-4155-4ad3-8adb-7903bf2b1dd1/scratchpad/'

# --- STEPBible lexicons: group rows by plain Strong's number
lex = collections.defaultdict(list)
for lang, fn in (('H', 'step/TBESH.txt'), ('G', 'step/TBESG.txt')):
    for line in open(BASE + fn, encoding='utf-8-sig'):
        cols = line.rstrip('\n').split('\t')
        if len(cols) < 8: continue
        m = re.match(r'^([HG])(\d+)', cols[0])
        if not m or m.group(1) != lang: continue
        lex[(lang, int(m.group(2)))].append({'e': cols[0], 'd': cols[1], 'u': cols[2], 'gloss': cols[6], 'is_sub': 'a Meaning of' in cols[1]})

# --- Berean occurrences per plain number
occ = collections.Counter()
path = BASE + 'e-spike/bsb_tables.tsv'
for r in csv.reader(open(path, encoding='utf-8'), delimiter='\t', quotechar=None):
    if len(r) < 12: continue
    if r[10].strip().isdigit(): occ[('H', int(r[10]))] += 1
    if r[11].strip().isdigit(): occ[('G', int(r[11]))] += 1

total_occ = sum(occ.values())
missing = [(k, c) for k, c in occ.items() if k not in lex]
print('distinct Berean numbers:', len(occ), ' total word rows:', total_occ)
print('numbers with NO lexicon row:', len(missing), ' occurrences:', sum(c for _, c in missing))

multi = {k: v for k, v in lex.items() if len(v) > 1}
print('\nlexicon numbers with >1 row:', len(multi), 'of', len(lex))
amb_occ = sum(occ.get(k, 0) for k in multi)
print('Berean occurrences of those numbers:', amb_occ, f'({100*amb_occ/total_occ:.1f}% of all word rows)')

# split multi rows into 'main + sub-meanings of the same word' vs genuinely separate words
def kinds(rows):
    subs = sum(1 for x in rows if x['is_sub'])
    return subs, len(rows) - subs
sep = {k: v for k, v in multi.items() if kinds(v)[1] > 1}
print('numbers with >1 NON-sub row (genuinely different words/senses):', len(sep))
sep_occ = sum(occ.get(k, 0) for k in sep)
print('Berean occurrences of those:', sep_occ, f'({100*sep_occ/total_occ:.1f}%)')

print('\nTop 15 genuinely-ambiguous numbers by Berean occurrences:')
for k in sorted(sep, key=lambda k: -occ.get(k, 0))[:15]:
    print(f'  {k[0]}{k[1]} x{occ.get(k,0)}: ' + ' | '.join(f"{x['d'].split()[0]}={x['gloss']}" for x in sep[k] if not x['is_sub']))
