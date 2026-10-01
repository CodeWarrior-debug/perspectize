# Query Budget

Rules and tooling that keep slow queries, N+1s, duplicated DB calls and stale or over-evicted caches from coming back. Motivated by the slow-query / duplicate-call cleanup (dataloaders for `Content.primaryCategory` and the perspective aggregates, the `useContentAggregates` / `queryKeys` work).

The enforcement is **tests that fail in CI**. The Claude hook and PR-template checklist below are reminders, not the gate.

## Backend: every path has a query budget

A "budget" is the number of SQL statements a code path issues **today**, asserted in a test. Adding a query, or losing a batch, turns the test red.

**Helper:** `backend/internal/perf/querycount` counts statements through GORM callbacks, so it works against go-sqlmock and a real database.

```go
db, mock := newMockDB(t)           // postgres package test harness
mock.ExpectQuery(`FROM "categories" WHERE id IN`).WillReturnRows(rows)

c := querycount.Attach(t, db)
_, err := repo.GetByIDs(ctx, seqIDs(50)) // 50 ids
require.NoError(t, err)
c.AssertExactly(t, 1)              // ONE query, not 50
```

- `AssertExactly(n)` — use when the number matters (batch = 1, empty input = 0).
- `AssertAtMost(n)` / `querycount.AssertAtMost(t, db, n, fn)` — set `n` to the current cost, **not** a generous ceiling.
- Examples: `internal/adapters/repositories/postgres/query_count_test.go`; loader call counts in `internal/adapters/graphql/dataloader/dataloader_test.go`.
- Whole-request counts against real Postgres: the opt-in `perf` harness (`internal/perf/`, `go test -tags perf`). CI compiles it (`go vet -tags perf`) so it cannot rot.

**When a test is required**

| Change | Required test |
| --- | --- |
| New or changed repository method that takes a slice/batch (`...ByIDs`, `Aggregate...`) | Query count is the same for 1 and 50 inputs; empty input issues 0 |
| New or changed list/paginated query | Statement count asserted (page + total only if `includeTotalCount`) |
| New GraphQL field resolver that loads per-row data | Goes through a dataloader; loader test proves N loads → 1 service call |
| New service method that composes several repo calls | Count asserted, no repeat of the same statement |
| New migration adding a filtered/sorted column | Index in the migration, or a one-line reason in the PR why not |

**Smells to reject in review:** a repo/service call inside a `for` over results; a resolver that calls a service per parent row; `Preload` of a relation the caller never reads; the same lookup done in both the directive/middleware and the resolver; `COUNT(*)` issued when `includeTotalCount` is false.

## Frontend: one fetch per key, deliberate freshness, exact eviction

**Helpers:** `frontend/tests/helpers/queryBudget.ts` (real `QueryClient`). Worked examples: `tests/unit/query-cache-contract.test.ts`.

| Rule | Test |
| --- | --- |
| A new `createQuery` has a `staleTime` chosen on purpose (data that never changes → `Infinity`; user-scoped → minutes; list → ~30–60s). Default `0` refetches on every mount. | `countingFetch` + `mountConsumers`: second mount inside `staleTime` costs 0 calls |
| Many components showing the same data share **one** key (and one hook), not copy-pasted `createQuery` calls | `mountConsumers(client, options, 3)` → `fetches() === 1` |
| Every variable `queryFn` sends is in `queryKey` (see frontend/CLAUDE.md) | `hashKey` differs when each variable changes; equal when it doesn't |
| A mutation's `onSuccess` invalidates exactly what changed — the affected lists/details/aggregates, nothing broader | `seed` affected + unrelated keys, run `onSuccess`, `invalidationOutcome` → assert **both** `invalidated` and `untouched` |
| Never invalidate a root (`queryKeys.all`, `content.all()`) to be "safe" | The `untouched` assertion fails |
| Optimistic updates only patch caches of the same row shape, and roll back in `onError` | Existing pattern: `hooks-useDeletePerspective.test.ts` |
| Use `isPending`, not `isLoading`, for the loading state (offline) | Component test |
| No fetch in an `$effect` that can loop or fire per keystroke without debounce | Component test with fake timers: one call after the debounce |

**Mock-only hook tests are not enough for eviction.** `expect(invalidateQueries).toHaveBeenCalledWith(...)` passes even if the key matches no cache entry. Keep the existing mocked tests for branches (`onError` messages), and add a real-`QueryClient` test for the eviction contract.

## Reminders (not gates)

- **Pre-commit Claude hook** `.claude/hooks/query-budget-precommit.sh` — on `git commit`, if staged files touch a repository, resolver/dataloader, query hook or a component that uses `createQuery` **and** no test file is staged alongside, it injects a non-blocking reminder with this checklist. See [HOOKS.md](HOOKS.md).
- **PR templates** (`feature.md`, `bugfix.md`) carry a "Query budget" checklist.
- **Reviewers/agents**: `code-reviewer`, `test-writer`, `vitest-writer`, `go-backend`, `svelte-frontend` all reference this file.

Why not a PR-creation hook: cloud sessions create PRs through the GitHub MCP tool, which a `gh pr create` Bash hook never sees, and a hook cannot judge query counts anyway. By PR time the code is already written.
