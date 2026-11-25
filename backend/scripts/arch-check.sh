#!/usr/bin/env bash
# Architecture and convention check with a baseline.
# B1 core isolation, B3 adapter isolation (go-arch-lint); B2 mutation auth chain, B5 paginator error check,
# B6 owner-scoped writes, B7 injected clock, B8 error shape (pattern checks below); B4 query-count gate (diff only).
#
#   arch-check.sh            fail on any violation not in .arch-baseline.txt
#   arch-check.sh --update   rewrite the baseline from the current code (it may only shrink: see below)
#
# go-arch-lint has no baseline of its own, so this wraps its JSON output. A violation is keyed on
# component | file | imported package (no line number, so edits above it don't re-surface it).
# .arch-baseline.txt lists today's known violations. Rules for it:
#   - it may shrink (fix a violation, then --update) but must never gain a line;
#   - a baselined file is off-limits for NEW imports of the same kind: don't add to it.
# Needs: go-arch-lint (go install github.com/fe3dback/go-arch-lint@v1.19.2) and jq.
set -u
cd "$(dirname "$0")/.." || exit 2
bin="$(command -v go-arch-lint || echo "$HOME/go/bin/go-arch-lint")"
[ -x "$bin" ] || { echo "go-arch-lint not found: go install github.com/fe3dback/go-arch-lint@v1.19.2"; exit 2; }

current="$(mktemp)"
trap 'rm -f "$current"' EXIT
"$bin" check --project-path . --json 2>/dev/null |
	jq -r '.Payload | ((.ExecutionWarnings // []) | map("CONFIG ERROR: " + .Text) | .[]),
	       ((.ArchWarningsDeps // []) + (.ArchWarningsDeepScan // []) | map("\(.ComponentName) | \(.FileRelativePath | ltrimstr("/")) | \(.ResolvedImportName | sub("^github.com/CodeWarrior-debug/perspectize/backend/"; ""))") | .[]),
	       ((.ArchWarningsNotMatched // []) | map("UNMATCHED FILE: \(.FileRelativePath // .)") | .[])' |
	sort >"$current"

# B7: no time.Now() in services or repositories (inject a clock). B8: wrap with %w, not %v, in services and
# repositories; never branch on error text. Test files are exempt. Keyed on rule | file | trimmed line.
pattern_check() { # rule, regex, dirs...
	local rule="$1" re="$2"
	shift 2
	grep -rnE --include='*.go' "$re" "$@" 2>/dev/null | grep -v '_test\.go' |
		sed -E "s/^([^:]+):[0-9]+:[[:space:]]*(.*)$/$rule | \1 | \2/"
}
{
	pattern_check B7 'time\.Now\(' internal/core/services internal/adapters/repositories
	pattern_check B8 'fmt\.Errorf\(.*%v.*err' internal/core/services internal/adapters/repositories
	pattern_check B8 'strings\.[A-Za-z]+\([^)]*\.Error\(\)' internal pkg cmd
} >>"$current"
sort -o "$current" "$current"

# B2: every Mutation field in schema.graphql carries @auth, and every mutation resolver calls auth.RequireAuth.
b2() {
	awk '/^type Mutation \{/{m=1;next} m&&/^\}/{m=0} m&&/^  [a-zA-Z]+\(/&&!/@auth/{sub(/\(.*/,"");gsub(/ /,""); print "B2 | schema.graphql | mutation " $0 " lacks @auth"}' schema.graphql
	for f in internal/adapters/graphql/resolvers/*.resolvers.go; do
		awk -v F="$f" '
			/^func \(r \*mutationResolver\) /{ if (name!="" && !ok) print "B2 | " F " | resolver " name " does not derive the actor (auth.RequireAuth or auth.ForContext)"; name=$4; sub(/\(.*/,"",name); ok=0; next }
			/^func /{ if (name!="" && !ok) print "B2 | " F " | resolver " name " does not derive the actor (auth.RequireAuth or auth.ForContext)"; name="" }
			name!="" && /auth\.(RequireAuth|ForContext)/{ok=1}
			END{ if (name!="" && !ok) print "B2 | " F " | resolver " name " does not derive the actor (auth.RequireAuth or auth.ForContext)" }' "$f"
	done
}
# B5: a file that calls the cursor paginator must check pageResult.Error as well as err.
b5() {
	grep -rlE --include='*.go' '\.Paginate\(' internal | grep -v '_test\.go' | while read -r f; do
		grep -q 'pageResult\.Error' "$f" || echo "B5 | $f | Paginate() without a pageResult.Error check"
	done
}
# B6: service methods that write (Create/Update/Delete/Set/Clear/Remove/Add/Mark) must take the acting user.
b6() {
	grep -nE --include='*.go' '^func \(s \*[A-Za-z]+Service\) (Create|Update|Delete|Set|Clear|Remove|Add|Mark)[A-Za-z]*\(' internal/core/services/*.go | grep -v '_test\.go' |
		grep -vE '(actor|[uU]serID|viewerID|ownerID)' |
		sed -E 's/^([^:]+):[0-9]+:func \(s \*([A-Za-z]+)\) ([A-Za-z]+)\(.*/B6 | \1 | \2.\3 has no actor or user id parameter/'
}
{ b2; b5; b6; } >>"$current"
sort -o "$current" "$current"

# File-size ratchet: non-test, non-generated Go files over MAX_LINES lines. A file already over the limit has a
# ceiling in .size-ceilings.txt (its size today) and may not grow past it; any other file may not pass MAX_LINES.
MAX_LINES=500
sizes() {
	find internal pkg cmd -name '*.go' ! -name '*_test.go' ! -name 'generated.go' ! -name 'models_gen.go' ! -name '*.gen.go' -print0 |
		xargs -0 wc -l | grep -v ' total$' | awk -v m="$MAX_LINES" '$1>m{print $2" "$1}' | sort
}

if grep -q '^CONFIG ERROR' "$current"; then
	cat "$current"
	exit 2
fi

if [ "${1:-}" = "--update" ]; then
	cp "$current" .arch-baseline.txt
	echo "baseline written: $(wc -l <.arch-baseline.txt) known violations"
	sizes >.size-ceilings.txt
	echo "size ceilings written: $(wc -l <.size-ceilings.txt) files over $MAX_LINES lines"
	exit 0
fi

new="$(comm -13 .arch-baseline.txt "$current")"
fixed="$(comm -23 .arch-baseline.txt "$current")"
status=0
if [ -n "$new" ]; then
	echo "FAIL new architecture violations (component | file | import):"
	echo "$new"
	echo "Fix the import; do not add it to .arch-baseline.txt."
	status=1
fi
if [ -n "$fixed" ]; then
	echo "NOTE baseline entries no longer occur; run backend/scripts/arch-check.sh --update to shrink it:"
	echo "$fixed"
fi

# B4: a new or changed repository method needs a query-count test in the same change (diff gate, not baselined).
b4_msg=""
if git rev-parse --verify -q origin/main >/dev/null; then
	changed_repo="$(git diff -U0 origin/main...HEAD -- internal/adapters/repositories | grep -E '^\+func \(' | grep -v '_test\.go' || true)"
	changed_repo="$changed_repo$(git diff -U0 -- internal/adapters/repositories | grep -E '^\+func \(' || true)"
	if [ -n "$changed_repo" ]; then
		if ! { git diff origin/main...HEAD --name-only; git diff --name-only; git ls-files --others --exclude-standard; } | grep -q '_test\.go' ||
			! { git diff -U0 origin/main...HEAD; git diff -U0; cat $(git ls-files --others --exclude-standard | grep '_test\.go$' 2>/dev/null) 2>/dev/null; } | grep -q 'querycount'; then
			b4_msg="B4: repository methods were added or changed but no changed test uses querycount (internal/perf/querycount):
$changed_repo"
		fi
	fi
fi
if [ -n "$b4_msg" ]; then echo "FAIL $b4_msg"; status=1; fi
size_fail="$(sizes | while read -r f n; do
	c="$(awk -v f="$f" '$1==f{print $2}' .size-ceilings.txt)"
	if [ -z "$c" ]; then echo "$f is $n lines (limit $MAX_LINES): split it, new code goes in a new file"
	elif [ "$n" -gt "$c" ]; then echo "$f grew from $c to $n lines (over the $MAX_LINES limit): put the new code in a new file"; fi
done)"
if [ -n "$size_fail" ]; then echo "FAIL file size:"; echo "$size_fail"; status=1; fi

[ "$status" -eq 0 ] && echo "ok   architecture (B1-B3, B5-B8): $(wc -l <"$current") known violations, none new; file sizes within ceilings"
exit "$status"
