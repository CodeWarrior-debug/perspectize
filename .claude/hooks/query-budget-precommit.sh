#!/bin/bash
# PreToolUse hook (Bash) — non-blocking reminder on `git commit` to check the
# query budget (see .docs/QUERY_BUDGET.md) when staged files touch DB or
# data-fetching code and no test file is staged alongside.
#
# Deliberately a reminder, not a gate: it cannot judge query counts. The gate
# is the tests themselves (querycount on the backend, queryBudget helpers on
# the frontend), which fail in CI.

input=$(cat)
command=$(echo "$input" | jq -r '.tool_input.command // empty')

# Anchor on command position so this doesn't fire on `git commit` merely
# mentioned inside a commit message or other quoted text on the line.
if ! echo "$command" | grep -qE '(^|[;&|]|`|\$\()\s*git\s+commit\b'; then
  exit 0
fi

# `git commit -a` stages tracked changes implicitly; include the working tree.
staged=$(git diff --cached --name-only 2>/dev/null)
if echo "$command" | grep -qE '\s-[a-zA-Z]*a'; then
  staged=$(printf '%s\n%s' "$staged" "$(git diff --name-only 2>/dev/null)")
fi
[ -z "$staged" ] && exit 0

# Files that can change how many queries run or how the UI caches them.
backend_hits=$(echo "$staged" | grep -E '^backend/internal/(adapters/repositories/.*|adapters/graphql/(resolvers|dataloader)/[^/]*|core/services/[^/]*)\.go$' | grep -vE '_test\.go$|\.bak$|generated')
frontend_hits=$(echo "$staged" | grep -E '^frontend/src/(lib/queries/.*\.(ts|svelte\.ts)|lib/components/.*\.svelte|routes/.*\.svelte)$' | grep -vE 'queries/keys\.ts$|queries/[a-z]+/index\.ts$')
# Component/route files only matter when they actually fetch.
if [ -n "$frontend_hits" ]; then
  frontend_hits=$(echo "$frontend_hits" | while read -r f; do
    case "$f" in
      frontend/src/lib/queries/*) echo "$f" ;;
      *) [ -f "$f" ] && grep -qE 'createQuery|createInfiniteQuery|invalidateQueries' "$f" && echo "$f" ;;
    esac
  done)
fi

[ -z "$backend_hits" ] && [ -z "$frontend_hits" ] && exit 0

# Is a test staged alongside? If so the author is already on it — stay quiet.
backend_tests=$(echo "$staged" | grep -E '^backend/.*_test\.go$')
frontend_tests=$(echo "$staged" | grep -E '^frontend/tests/.*\.test\.ts$')
[ -n "$backend_hits" ] && [ -n "$backend_tests" ] && backend_hits=""
[ -n "$frontend_hits" ] && [ -n "$frontend_tests" ] && frontend_hits=""
[ -z "$backend_hits" ] && [ -z "$frontend_hits" ] && exit 0

reason='Query budget check (see .docs/QUERY_BUDGET.md). Staged changes touch data-access or data-fetching code with no test staged alongside:'
if [ -n "$backend_hits" ]; then
  reason="$reason

Backend:
$(echo "$backend_hits" | sed 's/^/  - /')
- Does any path now issue a query per row (N+1), repeat the same lookup, or fetch something the caller never reads?
- Batch methods (...ByIDs / Aggregate...): add a querycount test — same count for 1 and 50 inputs, 0 for empty input (backend/internal/perf/querycount).
- Per-row GraphQL fields must go through a dataloader; add/extend a loader call-count test."
fi
if [ -n "$frontend_hits" ]; then
  reason="$reason

Frontend:
$(echo "$frontend_hits" | sed 's/^/  - /')
- New createQuery: is staleTime set on purpose? Does another component already fetch this — reuse its hook/key instead of a second call.
- Does queryKey include every variable queryFn sends?
- Mutation: does onSuccess invalidate exactly the affected keys and nothing broader? Test with a real QueryClient (tests/helpers/queryBudget.ts, example tests/unit/query-cache-contract.test.ts)."
fi
reason="$reason

Write the tests before committing. If this change provably cannot affect query count or caching (rename, comment, pure refactor), proceed."

jq -n --arg reason "$reason" '{
  hookSpecificOutput: {
    hookEventName: "PreToolUse",
    permissionDecision: "allow",
    permissionDecisionReason: $reason
  }
}'
exit 0
