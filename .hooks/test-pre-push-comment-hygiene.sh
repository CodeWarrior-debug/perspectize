#!/bin/sh
# Self-test for .hooks/pre-push and .hooks/comment-history-scan.sh.
# Run directly: sh .hooks/test-pre-push-comment-hygiene.sh
# Uses a throwaway repo, a bare "remote" and a stub `claude`, so it costs no API calls.

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
REPO_ROOT=$(cd "$SCRIPT_DIR/.." && pwd)
WORK=$(mktemp -d)
FAILURES=0
trap 'rm -rf "$WORK"' EXIT

GIT_DIR_BIN=$(dirname "$(command -v git)")
PATH_NO_CLAUDE="/usr/bin:/bin:$GIT_DIR_BIN"
BIN="$WORK/bin"
mkdir -p "$BIN"

# Stub claude: COMMENT_STUB picks the behaviour; every call is logged.
cat > "$BIN/claude" <<'EOF'
#!/bin/sh
echo call >> "$STUB_LOG"
case "$COMMENT_STUB" in
    (fix)  for f in frontend/src/*.ts; do sed -i.bak -E 's/ \(#[0-9]+\)//' "$f"; rm -f "$f.bak"; done ;;
    (code) for f in frontend/src/*.ts; do sed -i.bak -E 's/ \(#[0-9]+\)//; s/x = 1/x = 2/' "$f"; rm -f "$f.bak"; done ;;
    (fail) exit 1 ;;
esac
exit 0
EOF
chmod +x "$BIN/claude"
export STUB_LOG="$WORK/stub.log"

REMOTE="$WORK/remote.git"
REPO="$WORK/repo"
git init -q --bare "$REMOTE"
git init -q -b main "$REPO"
cd "$REPO" || exit 1
git config user.email t@example.com
git config user.name Test
git config core.hooksPath .hooks
mkdir -p .hooks .claude/skills/comment-hygiene frontend/src
cp "$SCRIPT_DIR/pre-push" "$SCRIPT_DIR/comment-history-scan.sh" .hooks/
cp "$REPO_ROOT/.claude/skills/comment-hygiene/SKILL.md" .claude/skills/comment-hygiene/
printf 'export const x = 1;\n' > frontend/src/a.ts
git add -A
git commit -q -m "init"
git remote add origin "$REMOTE"
PERSPECTIZE_COMMENT_HOOK=1 git push -q origin main 2>/dev/null
git fetch -q origin

branch=0
new_branch() {
    branch=$((branch + 1))
    git checkout -q main
    git checkout -q -b "t$branch"
    : > "$STUB_LOG"
}

commit_file() { # <comment line> <message>
    printf '%s\nexport const x = 1;\n' "$1" > frontend/src/a.ts
    git add -A
    git commit -q -m "$2"
}

calls() { wc -l < "$STUB_LOG" | tr -d ' '; }

check() { # <description> <expected> <actual>
    if [ "$2" = "$3" ]; then echo "PASS: $1"; else echo "FAIL: $1 (expected '$2', got '$3')"; FAILURES=$((FAILURES + 1)); fi
}

push() { # run a push with the given PATH and stub mode; prints exit code
    PATH="$1" COMMENT_STUB="$2" git push -q origin HEAD 2>"$WORK/push.err" >/dev/null
    echo $?
}

# 1. Clean comment: push allowed, model never called.
new_branch
commit_file "// Wait for the token before fetching." "clean"
check "clean comment pushes" 0 "$(push "$BIN:$PATH_NO_CLAUDE" fix)"
check "clean comment makes no model call" 0 "$(calls)"

# 2. Ticket reference with no claude CLI: blocked.
new_branch
commit_file "// Head start for the table (#636)." "hard"
check "ticket ref without claude is blocked" 1 "$(push "$PATH_NO_CLAUDE" fix)"

# 3. History wording with no claude CLI: warning only.
new_branch
commit_file "// This previously dropped the field." "soft"
check "history wording without claude warns and pushes" 0 "$(push "$PATH_NO_CLAUDE" fix)"

# 4. History wording, model leaves it: allowed, and a second push skips the model.
new_branch
commit_file "// This previously dropped the field." "soft"
check "model leaves soft line: push allowed" 0 "$(push "$BIN:$PATH_NO_CLAUDE" noop)"
check "model was asked once" 1 "$(calls)"
git commit -q --allow-empty -m "more"
push "$BIN:$PATH_NO_CLAUDE" noop >/dev/null
check "judged soft line is not re-sent to the model" 1 "$(calls)"

# 5. Ticket ref introduced by the tip only: amend, push aborted, re-push works.
new_branch
commit_file "// Head start for the table (#636)." "tip only"
before=$(git rev-list --count main..HEAD)
check "tip-only fix aborts the push" 1 "$(push "$BIN:$PATH_NO_CLAUDE" fix)"
check "tip-only fix amends (commit count unchanged)" "$before" "$(git rev-list --count main..HEAD)"
check "tip-only fix leaves a clean tree" "" "$(git status --porcelain)"
check "comment is cleaned" "// Head start for the table." "$(head -1 frontend/src/a.ts)"
check "re-push after the fix succeeds" 0 "$(push "$BIN:$PATH_NO_CLAUDE" fix)"

# 6. Ticket ref introduced earlier than the tip: separate chore commit.
new_branch
commit_file "// Head start for the table (#636)." "early"
git commit -q --allow-empty -m "tip"
before=$(git rev-list --count main..HEAD)
check "earlier-commit fix aborts the push" 1 "$(push "$BIN:$PATH_NO_CLAUDE" fix)"
check "earlier-commit fix adds one chore commit" "$((before + 1))" "$(git rev-list --count main..HEAD)"
check "chore commit message" "chore: drop ticket and history references from comments" "$(git log -1 --format=%s)"

# 7. Model changes code: edits discarded, push blocked.
new_branch
commit_file "// Head start for the table (#636)." "code edit"
check "code edit blocks the push" 1 "$(push "$BIN:$PATH_NO_CLAUDE" code)"
check "code edit is discarded" "export const x = 1;" "$(tail -1 frontend/src/a.ts)"
check "tree is clean after discard" "" "$(git status --porcelain)"

# 8. Model fails or times out: blocked for HARD, tree restored.
new_branch
commit_file "// Head start for the table (#636)." "model fails"
check "failed model blocks a ticket ref" 1 "$(push "$BIN:$PATH_NO_CLAUDE" fail)"

# 9. Dirty tree: blocked without touching it.
new_branch
commit_file "// Head start for the table (#636)." "dirty"
echo "scratch" > frontend/src/untracked-note.txt
echo "// local edit" >> frontend/src/a.ts
check "dirty tree blocks a ticket ref" 1 "$(push "$BIN:$PATH_NO_CLAUDE" fix)"
check "dirty tree makes no model call" 0 "$(calls)"
git checkout -q -- frontend/src/a.ts
rm -f frontend/src/untracked-note.txt

# 10. Pushed ref is not the checked-out branch: blocked.
new_branch
commit_file "// Head start for the table (#636)." "other ref"
git branch -q other
git checkout -q main
res=$(PATH="$BIN:$PATH_NO_CLAUDE" COMMENT_STUB=fix git push -q origin other 2>/dev/null >/dev/null; echo $?)
check "pushing a ref that is not checked out is blocked" 1 "$res"

# 11. history-ok marker, a hex colour and a URL are not hits.
new_branch
printf '// Matches the brand colour #123abc, see https://example.com/a#12\nexport const y = "x"; // history-ok: wire format keeps the old name (#9)\nconst u = "http://a.test/#77";\n' > frontend/src/a.ts
git add -A
git commit -q -m "no false positives"
check "hex colour, URL and history-ok are ignored" 0 "$(push "$PATH_NO_CLAUDE" fix)"

# 12. A merge commit at the tip gets a separate commit, never an amend.
new_branch
commit_file "// Head start for the table (#636)." "feature"
git checkout -q main
git checkout -q -b "m$branch"
printf 'export const z = 1;\n' > frontend/src/b.ts
git add -A
git commit -q -m "side"
git checkout -q "t$branch"
git merge -q --no-ff -m "merge side" "m$branch"
before=$(git rev-list --count main..HEAD)
push "$BIN:$PATH_NO_CLAUDE" fix >/dev/null
check "merge tip gets a separate chore commit" "$((before + 1))" "$(git rev-list --count main..HEAD)"

# 13. Scanner: tiers and the comment-only verifier.
new_branch
cat > frontend/src/a.ts <<'EOF'
const a = 1; // PR #12 added this
// Gap #13 in the audit
// Phase 3 work
// previously dropped the field
// an import that no longer exists
const color = "#123"; const b = 2;
EOF
git add -A
git commit -q -m "tiers"
out=$(sh .hooks/comment-history-scan.sh main HEAD | cut -f1 | tr '\n' ' ')
check "scanner tiers" "HARD HARD HARD SOFT SOFT " "$out"
printf 'const a = 1;\n' > frontend/src/a.ts
sh .hooks/comment-history-scan.sh --verify 2>/dev/null
check "verify rejects deleted code lines" 1 "$?"
git checkout -q -- frontend/src/a.ts
sed -i.bak 's/ \/\/ PR #12 added this//' frontend/src/a.ts
rm -f frontend/src/a.ts.bak
sh .hooks/comment-history-scan.sh --verify
check "verify accepts a trailing comment removal" 0 "$?"
git checkout -q -- frontend/src/a.ts

echo ""
if [ "$FAILURES" -eq 0 ]; then echo "All checks passed."; else echo "$FAILURES check(s) failed."; fi
exit "$FAILURES"
