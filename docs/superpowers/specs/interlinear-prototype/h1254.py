import csv, collections
csv.field_size_limit(10**9)
path = '/private/tmp/claude-501/-Users-jamesjordan-GitHub-perspectize--claude-worktrees-agent-ab5aff3aa149547ab/4027fd5c-4155-4ad3-8adb-7903bf2b1dd1/scratchpad/e-spike/bsb_tables.tsv'
rows = list(csv.reader(open(path, encoding='utf-8'), delimiter='\t', quotechar=None))
IH, IVERSEID, IENG, IPARSE1, IPARSE2, ITRANS = 10, 12, 18, 8, 9, 7
verse = ''
eng = collections.Counter()
hits = []
for r in rows[1:]:
    if len(r) <= IENG: continue
    if r[IVERSEID].strip(): verse = r[IVERSEID].strip()
    if r[IH].strip() == '1254':
        e = r[IENG].strip()
        eng[e] += 1
        hits.append((verse, e, r[ITRANS], r[IPARSE1], r[IPARSE2]))
print('total H1254 occurrences:', len(hits))
print('\nEnglish renderings (top 25):')
for k, c in eng.most_common(25): print(f'  {c:4d}  {k!r}')
print('\nOccurrences whose rendering suggests fat/cut/fatten:')
for h in hits:
    if any(w in h[1].lower() for w in ('fat', 'cut', 'clear', 'plump', 'sleek')):
        print('  ', h)
print('\nAll 1 Samuel 2:29 rows with 1254:')
for h in hits:
    if h[0] == '1 Samuel 2:29': print('  ', h)
