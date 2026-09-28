#!/bin/sh
# Self-test for the hex/rgb-colour block in .hooks/pre-commit.
# Run directly: sh .hooks/test-pre-commit-hex-check.sh
# Not wired into `pnpm test`/`go test` — it exercises a real git hook, not
# application code, so it spins up its own scratch git repo under /tmp.

set -e

SCRIPT_DIR=$(cd "$(dirname "$0")" && pwd)
HOOK="$SCRIPT_DIR/pre-commit"
TMP_REPO=$(mktemp -d)
FAILURES=0

cleanup() {
    rm -rf "$TMP_REPO"
}
trap cleanup EXIT

cd "$TMP_REPO"
git init -q
git config user.email "test@example.com"
git config user.name "Test"
mkdir -p frontend/src/lib/components frontend/src/lib/utils
cp "$HOOK" .git/hooks/pre-commit
chmod +x .git/hooks/pre-commit

assert_commit_blocked() {
    desc=$1
    if git commit -q -m "test: $desc" >/tmp/hex-check-test-out 2>&1; then
        echo "FAIL: expected commit to be BLOCKED ($desc), but it succeeded"
        FAILURES=$((FAILURES + 1))
    else
        echo "PASS: commit blocked as expected ($desc)"
    fi
}

assert_commit_allowed() {
    desc=$1
    if git commit -q -m "test: $desc" >/tmp/hex-check-test-out 2>&1; then
        echo "PASS: commit allowed as expected ($desc)"
    else
        echo "FAIL: expected commit to be ALLOWED ($desc), but it was blocked:"
        cat /tmp/hex-check-test-out
        FAILURES=$((FAILURES + 1))
    fi
}

# 1. A new raw hex colour in a component should be blocked.
cat > frontend/src/lib/components/Widget.svelte <<'EOF'
<script lang="ts">
</script>
<div style="color: #ff0000;">hi</div>
EOF
git add frontend/src/lib/components/Widget.svelte
assert_commit_blocked "raw hex in a component"
git reset -q HEAD~0 2>/dev/null || true
git reset -q --mixed HEAD 2>/dev/null || true

# 2. A raw rgb() colour in formatting.ts should be blocked.
cat > frontend/src/lib/utils/formatting.ts <<'EOF'
export function paint(el: HTMLElement) {
	el.style.color = 'rgb(10, 20, 30)';
}
EOF
git add frontend/src/lib/utils/formatting.ts
assert_commit_blocked "raw rgb() in formatting.ts"
git rm -q --cached frontend/src/lib/utils/formatting.ts >/dev/null 2>&1 || true

# 3. A theme-token colour should be allowed.
cat > frontend/src/lib/components/Widget.svelte <<'EOF'
<script lang="ts">
</script>
<div style="color: var(--color-primary);">hi</div>
EOF
git add frontend/src/lib/components/Widget.svelte
assert_commit_allowed "theme token, no raw colour"

# 4. A raw hex colour with an inline hex-ok: allowlist comment should be allowed.
cat > frontend/src/lib/utils/formatting.ts <<'EOF'
export function paint(el: HTMLElement) {
	el.style.color = '#FF0000'; // hex-ok: YouTube brand red
}
EOF
git add frontend/src/lib/utils/formatting.ts
assert_commit_allowed "allowlisted brand colour via hex-ok: comment"

# 5. A file outside the checked scope may use raw hex colours freely.
mkdir -p frontend/src/lib/other
cat > frontend/src/lib/other/unrelated.ts <<'EOF'
export const color = '#123456';
EOF
git add frontend/src/lib/other/unrelated.ts
assert_commit_allowed "raw hex outside the checked scope"

echo ""
if [ "$FAILURES" -eq 0 ]; then
    echo "All hex-colour pre-commit hook tests passed."
    exit 0
else
    echo "$FAILURES hex-colour pre-commit hook test(s) failed."
    exit 1
fi
