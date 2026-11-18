#!/bin/sh
# Finds comments that narrate history or cite a ticket, in lines a diff adds.
# Used by .hooks/pre-push; the cleanup rubric is .claude/skills/comment-hygiene/SKILL.md.
#
#   comment-history-scan.sh <base> <tip>   scan the lines <tip> adds over <base>
#   comment-history-scan.sh --verify       check the working-tree diff changes comments only
#
# Scan output, one hit per line, tab-separated: TIER  file  line  comment-text
#   HARD  a ticket, PR or issue reference: never a useful comment, always blocks
#   SOFT  history wording ("previously", "no longer"): often fine, so a model judges it
#
# A hit is skipped when its line carries `history-ok: <reason>`, mirroring `hex-ok:`.
# Only added lines are scanned, so the existing codebase is never flagged retroactively.

set -e

# Files a comment can be checked in; generated and vendored code is out of scope.
in_scope() {
    case "$1" in
        (*generated*|*node_modules*|*.gen.go|*pnpm-lock*) return 1 ;;
        (backend/*.go|frontend/src/*.ts|frontend/src/*.js|frontend/src/*.svelte) return 0 ;;
        (*.sh|*.sql) return 0 ;;
        (*) return 1 ;;
    esac
}

# awk program shared by scan and verify: splits a line into code and comment by file kind.
AWK_LIB='
function kind(f) {
    if (f ~ /\.(go|ts|js|svelte)$/) return "slash"
    if (f ~ /\.sql$/) return "dash"
    if (f ~ /\.sh$/) return "hash"
    return "none"
}
# Index where the comment starts in line s, or 0 when there is none.
function cstart(s, k,    i, c, q, n, prev) {
    n = length(s); q = ""
    for (i = 1; i <= n; i++) {
        c = substr(s, i, 1)
        if (q != "") { if (c == "\\") { i++ } else if (c == q) { q = "" } ; continue }
        if (k == "slash") {
            if (c == "\"" || c == "`") { q = c; continue }
            if (c == "\x27") { q = c; continue }
            if (c == "/" && (substr(s, i, 2) == "//" || substr(s, i, 2) == "/*")) return i
            if (c == "<" && substr(s, i, 4) == "<!--") return i
            if (c == "*" && substr(s, 1, i) ~ /^[ \t]*\*$/ && (substr(s, i + 1, 1) == " " || substr(s, i + 1, 1) == "" || substr(s, i + 1, 1) == "/")) return i
        } else if (k == "dash") {
            if (c == "\x27") { q = c; continue }
            if (c == "-" && substr(s, i, 2) == "--") return i
        } else if (k == "hash") {
            if (c == "\"" || c == "\x27") { q = c; continue }
            prev = (i > 1) ? substr(s, i - 1, 1) : " "
            if (c == "#" && (prev == " " || prev == "\t")) return i
        }
    }
    return 0
}
'

scan() {
    base=$1
    tip=$2
    git diff --name-only --diff-filter=AM "$base" "$tip" | while IFS= read -r file; do
        in_scope "$file" || continue
        git diff -U0 "$base" "$tip" -- "$file" | awk -v file="$file" "$AWK_LIB"'
        BEGIN { k = kind(file); cur = 0 }
        /^@@/ {
            s = $0; sub(/^@@ -[0-9,]+ \+/, "", s); sub(/[ ,].*/, "", s); cur = s - 1; next
        }
        /^\+\+\+/ { next }
        /^\+/ {
            cur++
            line = substr($0, 2)
            if (line ~ /history-ok:/) next
            p = cstart(line, k)
            if (p == 0) next
            text = substr(line, p)
            low = tolower(text)
            # HARD: ticket, PR and issue numbers. A bare #NNN must not be followed by hex letters (colours).
            if (low ~ /(^|[^0-9a-z&])#[0-9]+([^0-9a-z]|$)/ \
                || low ~ /(^|[^a-z])(pr|pull request|issue|ticket|gap|gh)[ -]?#?[0-9]+/ \
                || low ~ /(^|[^a-z])ini-[0-9]+/ \
                || low ~ /(^|[^a-z])phase [0-9]+/ \
                || low ~ /(commit|sha) [0-9a-f]{7,}/) { tier = "HARD" }
            else if (low ~ /(^|[^a-z])(previously|formerly|anymore)([^a-z]|$)/ \
                || low ~ /no longer/ \
                || low ~ /used to (be|always|only|show|have|left|find|do|get|take|need|return|sort|fail)/ \
                || low ~ /(was|were|been) (changed|moved|renamed|removed|replaced|fixed|dropped|added|inlined)/ \
                || low ~ /(the |an? )?(old|legacy|former|original|previous) (code|way|behaviou?r|implementation|version|approach|logic)/ \
                || low ~ /(now|instead) (uses|returns|handles|calls|checks|lives)/ \
                || low ~ /(then|formerly) called/ \
                || low ~ /as of (v[0-9]|version|[0-9])/ \
                || low ~ /after the (refactor|migration|rewrite|rename)/) { tier = "SOFT" }
            else next
            gsub(/\t/, " ", text)
            printf "%s\t%s\t%d\t%s\n", tier, file, cur, text
        }'
    done
}

# Normalised code of a changed line (comment removed, whitespace trimmed). A pure comment line is empty.
verify() {
    git diff --name-only --diff-filter=AM | while IFS= read -r file; do
        in_scope "$file" || { echo "$file: file is outside the comment scan scope" >&2; echo bad; continue; }
        git diff -U0 -- "$file" | awk -v file="$file" "$AWK_LIB"'
        function norm(line,    p, code) {
            p = cstart(line, k)
            code = (p == 0) ? line : substr(line, 1, p - 1)
            gsub(/^[ \t]+|[ \t]+$/, "", code)
            return code
        }
        function flush() {
            if (removed != added) { print "bad"; print file ": a changed line is not a comment" > "/dev/stderr" }
            removed = ""; added = ""
        }
        BEGIN { k = kind(file) }
        /^@@/ { flush(); next }
        /^(\+\+\+|---)/ { next }
        /^-/ { c = norm(substr($0, 2)); if (c != "") removed = removed c "\n"; next }
        /^\+/ { c = norm(substr($0, 2)); if (c != "") added = added c "\n"; next }
        END { flush() }'
    done
}

case "${1:-}" in
    (--verify)
        if verify | grep -q '^bad$'; then exit 1; fi
        exit 0
        ;;
    ("")
        echo "usage: comment-history-scan.sh <base> <tip> | --verify" >&2
        exit 2
        ;;
    (*)
        scan "$1" "$2"
        ;;
esac
