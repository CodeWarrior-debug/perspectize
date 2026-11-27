#!/usr/bin/env bash
# Architecture and convention check for the frontend.
#   F1-F6, F8  ESLint (eslint.config.js), known violations in eslint-suppressions.json
#   F7         dependency-cruiser cycles, known violations in .dependency-cruiser-known-violations.json
#   size       source files over 500 lines may not grow (.size-ceilings.txt); tests and generated files exempt
#
#   arch-check.sh            fail on anything new
#   arch-check.sh --update   shrink the baselines after fixing violations (never use it to hide a new one)
#
# The baselines may only shrink: this script also fails if a baseline has more entries than on origin/main.
set -u
cd "$(dirname "$0")/.." || exit 2
MAX_LINES=500
status=0

sizes() {
	find src -type f \( -name '*.ts' -o -name '*.svelte' -o -name '*.js' \) ! -name '*.test.ts' ! -name '*.d.ts' ! -path 'src/lib/components/ui/*' -print0 |
		xargs -0 wc -l | grep -v ' total$' | awk -v m="$MAX_LINES" '$1>m{print $2" "$1}' | sort
}

if [ "${1:-}" = "--update" ]; then
	pnpm exec eslint src --prune-suppressions >/dev/null 2>&1
	pnpm exec depcruise src --config .dependency-cruiser.cjs --output-type baseline >.dependency-cruiser-known-violations.json 2>/dev/null
	sizes >.size-ceilings.txt
	echo "baselines rewritten (eslint pruned, cycles $(grep -c '"type"' .dependency-cruiser-known-violations.json), $(wc -l <.size-ceilings.txt) files over $MAX_LINES lines)"
	exit 0
fi

run() { # name, command...
	local name="$1" out
	shift
	if out="$("$@" 2>&1)"; then echo "ok   $name"; else echo "FAIL $name"; echo "$out" | head -40; status=1; fi
}

run "eslint architecture rules (F1-F6, F8)" pnpm exec eslint src
run "dependency-cruiser cycles (F7)" pnpm exec depcruise src --config .dependency-cruiser.cjs --ignore-known

size_fail="$(sizes | while read -r f n; do
	c="$(awk -v f="$f" '$1==f{print $2}' .size-ceilings.txt)"
	if [ -z "$c" ]; then echo "$f is $n lines (limit $MAX_LINES): split it, new code goes in a new file"
	elif [ "$n" -gt "$c" ]; then echo "$f grew from $c to $n lines (over the $MAX_LINES limit): put the new code in a new file"; fi
done)"
if [ -n "$size_fail" ]; then echo "FAIL file size:"; echo "$size_fail"; status=1; else echo "ok   file sizes within ceilings"; fi

# Baselines may only shrink.
if git rev-parse --verify -q origin/main >/dev/null; then
	grew=""
	count_json() { grep -o '"count": *[0-9]*' | grep -o '[0-9]*' | paste -sd+ - | bc 2>/dev/null || echo 0; }
	now="$(count_json <eslint-suppressions.json)"
	before="$(git show origin/main:frontend/eslint-suppressions.json 2>/dev/null | count_json)"
	if [ -n "$before" ] && [ "$before" != 0 ] && [ "$now" -gt "$before" ]; then grew="$grew eslint-suppressions.json ($before -> $now)"; fi
	nowc="$(grep -c '"type"' .dependency-cruiser-known-violations.json)"
	beforec="$(git show origin/main:frontend/.dependency-cruiser-known-violations.json 2>/dev/null | grep -c '"type"')"
	if [ "$beforec" -gt 0 ] && [ "$nowc" -gt "$beforec" ]; then grew="$grew cycles ($beforec -> $nowc)"; fi
	if [ -n "$grew" ]; then echo "FAIL baseline grew:$grew. Fix the violation instead of baselining it."; status=1; fi
fi
exit "$status"
