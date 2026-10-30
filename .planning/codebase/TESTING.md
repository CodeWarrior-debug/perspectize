# Testing Patterns

**Analysis Date:** 2026-10-01

## Test Framework

**Backend runner:** Go `testing` with `testify` (`assert`, `require`); `go-sqlmock` is used for some repository tests; gqlgen test client / `httptest` server for resolvers.

**Frontend runners** (`frontend/vite.config.ts`, Vitest 4 with two projects):
- `unit` project: jsdom, `globals: true`, setup `tests/setup.ts`, includes `tests/**/*.{test,spec}.{js,ts}` excluding `tests/browser/**`
- `browser` project (`frontend/vitest.config.browser.ts`): real Chromium via `@vitest/browser-playwright`, includes `tests/browser/**/*.test.ts`
- Component testing: `@testing-library/svelte` + `@testing-library/jest-dom`
- E2E: Playwright demo tours/flows in `frontend/demo/` (`playwright.config.ts`, projects `e2e` and `record`)
- Mutation testing: Stryker (`frontend/stryker.config.json`, `stryker-chunked.mjs`), gremlins for Go

**Run commands:**
```bash
# Backend (from backend/)
go test ./...                 # all tests; DB tests auto-skip without DATABASE_URL
make test                     # verbose + coverage for ./internal/... ./pkg/...
make test-coverage            # coverage.out + coverage.html
go vet -tags perf ./internal/perf/...   # compile perf-tagged harness
go test -tags perf ./internal/perf/     # opt-in whole-request query counts (real Postgres)
make mutate / make mutate-diff          # gremlins mutation testing (slow)

# Frontend (from frontend/)
pnpm run test:run             # unit project once (CI/verification)
pnpm run test                 # watch mode
pnpm run test:coverage        # unit + v8 coverage with thresholds
pnpm run test:browser         # browser project (needs Chromium)
pnpm run test:all             # both projects
pnpm run demo:test            # Playwright demo E2E (needs demo stack, `make demo-test`)
pnpm run mutate               # Stryker (or mutate:chunked / mutate:incremental)
pnpm run test:duplication     # jscpd
```

## Test File Organization

**Backend:** tests live outside the packages they test, in `backend/test/<area>/` as external packages (`package services_test`), plus a few co-located tests (`backend/internal/config/demo_internal_test.go`, `backend/internal/demo/fixtures_test.go`, `backend/pkg/middleware/timing_test.go`, `backend/cmd/seed-*/main_test.go`).

```
backend/test/
├── config/ database/ domain/ graphql/ messaging/ realtime/
├── repositories/   # real-Postgres tests, helpers_test.go (openTestDB, mustCreateUser, cleanupUsers)
├── resolvers/      # GraphQL over httptest, helpers_test.go (mocks, setupTestServer, executeGraphQL)
├── services/       # service tests with in-file mock repos
└── youtube/
backend/internal/perf/querycount/  # GORM-callback statement counter (non-test helper)
```

**Frontend:** separate `tests/` tree (not co-located), roughly 157 test files.

```
frontend/tests/
├── setup.ts        # global mocks ($app/*, IntersectionObserver, localStorage, matchMedia)
├── components/     # <Component>.test.ts (render + interact)
├── unit/           # hooks-*.test.ts, queries-*.test.ts, messaging-*.test.ts, utils, query-cache-contract.test.ts
├── utils/          # pure util tests
├── helpers/        # queryBudget.ts (excluded from coverage)
├── browser/        # real-browser tests + mocks/ (svelte-clerk, $app/* stubs)
└── fixtures/
```

## Test Structure

**Go: table-driven with subtests, testify assertions** (`backend/test/resolvers/user_authz_test.go`):
```go
cases := []struct{ name, query, wantMsg string }{
	{"update another user", `mutation { updateUser(...) { id } }`, "access denied: ..."},
}
for _, tc := range cases {
	t.Run(tc.name, func(t *testing.T) {
		result := executeGraphQL(t, server, tc.query)
		require.NotEmpty(t, result.Errors)
		assert.Contains(t, result.Errors[0].Message, tc.wantMsg)
	})
}
```
- Use `require` for preconditions, `assert` for outcomes. Wrapped errors checked with `errors.Is`.
- Test helpers call `t.Helper()`. `t.Parallel()` is not used. CI runs `go test -p 1 -race`.
- Env isolation: `t.Setenv("KEY", "")` (`clearConfigEnvVars` in `backend/test/config/config_test.go`).
- Boundary-value tests are named for the boundary (`message_retention_boundary_test.go`, `presence_boundary_test.go`, `TestPerspectiveCreate_LimitBoundaries`).

**Frontend: `describe` / nested `describe` / `it`** with a render helper (`frontend/tests/components/RatingInput.test.ts`):
```ts
function renderRatingInput(props?: {...}) {
	return render(RatingInput, { props: { label: 'Test Rating', value: null, name: 'test-rating', ...props } });
}
describe('RatingInput component', () => {
	beforeEach(() => { vi.clearAllMocks(); });
	describe('rendering', () => {
		it('displays the label text', () => {
			renderRatingInput({ label: 'Quality' });
			expect(screen.getByText('Quality')).toBeInTheDocument();
		});
	});
});
```
Query by role/text/display value (`screen.getByText`, `getByDisplayValue`), interact with `fireEvent`.

## Mocking

**Go:** hand-written mocks with function fields and sane defaults, defined in the test file (or `helpers_test.go` for shared ones). A nil `xxxFn` returns a default (usually `domain.ErrNotFound` or an empty result), so each test overrides only what it needs:
```go
type mockContentRepository struct {
	getByIDFn func(ctx context.Context, id int) (*domain.Content, error)
}
func (m *mockContentRepository) GetByID(ctx context.Context, id int) (*domain.Content, error) {
	if m.getByIDFn != nil { return m.getByIDFn(ctx, id) }
	return nil, domain.ErrNotFound
}
```
Adding a method to a port interface requires updating every mock in `backend/test/` or compilation fails. Resolver tests use `setupTestServer*` helpers that authenticate every request as user 1 (`injectAuthMiddleware`).

**Frontend:** `vi.mock` with `vi.hoisted` for shared mock handles (`frontend/tests/unit/hooks-useSendMessage.test.ts`):
```ts
const mocks = vi.hoisted(() => ({ mockGraphql: vi.fn(), captured: undefined as any }));
vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => { mocks.captured = fn(); return { mutate: vi.fn(), isPending: false }; }),
	useQueryClient: vi.fn(() => ({ setQueryData: mocks.mockSetQueryData })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
import { useSendMessage } from '$lib/queries/messaging/useSendMessage'; // import AFTER mocks
```
Hook tests capture the options passed to `createMutation` and call `onMutate`/`mutationFn`/`onError`/`onSuccess` directly.

- Global mocks in `frontend/tests/setup.ts`: `$app/environment`, `$app/navigation`, `$app/state` (mutable `mockPageState`), `$app/stores`, favicon asset, `IntersectionObserver` (fires immediately as intersecting), in-memory `localStorage`, `matchMedia` (desktop).
- Adding a `useX` hook to a component means mocking it in that component's tests (`vi.mock` each hook; no QueryClient provider is rendered).
- Browser project aliases `svelte-clerk` and `$app/*` to stubs in `frontend/tests/browser/mocks/`.

**Mock:** repositories/ports, HTTP/GraphQL transport, YouTube client, toasts, router/SvelteKit modules, heavy third-party widgets (ColorWheel stubbed in theme tests).
**Do not mock:** the QueryClient in cache-contract tests (use a real one), the domain layer, or Postgres in repository tests.

## Fixtures and Factories

- Go: inline struct literals; DB tests salt usernames/Clerk IDs with the nanosecond clock to avoid collisions on the persistent dev DB (`mustCreateUser` in `backend/test/repositories/helpers_test.go`) and clean up with `cleanupUsers`. Demo data seeding fixtures in `backend/internal/demo/fixtures.go`.
- Frontend: inline objects per test file; shared helpers in `frontend/tests/helpers/queryBudget.ts`; browser fixtures in `frontend/tests/browser/fixtures/`; demo personas in `frontend/demo/fixtures.ts`.

## Integration Tests

- DB tests (`backend/test/repositories`, `backend/test/database`) call `openTestDB(t)`, which `t.Skip`s when `DATABASE_URL` is empty or unreachable, so the suite stays green without Postgres. CI runs migrations first, then tests.
- Messaging end-to-end tests (`backend/test/messaging/e2e_test.go`, `harness_test.go`, `wsclient_test.go`) drive a real WebSocket client.
- Tests that read files outside `backend/` must be added to `MUTATE_SKIP` in the Makefile or be made hermetic.

## Query Budget Tests (REQUIRED for data-access changes)

**Backend:** `backend/internal/perf/querycount`:
```go
c := querycount.Attach(t, db)
_, _ = repo.GetByIDs(ctx, seqIDs(50))
c.AssertExactly(t, 1) // batch: 1 query for 50 ids
```
Batch methods assert the same count for 1 and 50 inputs and 0 for empty input; budgets equal today's actual cost. Dataloader fields need a loader test proving N loads cause 1 service call. Whole-request counts live behind the `perf` build tag (`backend/internal/perf/dataloader_perf_test.go`); CI only vets them.

**Frontend:** real `QueryClient` via `frontend/tests/helpers/queryBudget.ts` (`makeClient`, `countingFetch`, `mountConsumers`, `seed`, `invalidationOutcome`); worked examples in `frontend/tests/unit/query-cache-contract.test.ts`. Assert `fetches() === 1` for N consumers, 0 calls inside `staleTime`, `hashKey` changes per variable, and a mutation invalidates exactly the affected keys and leaves unrelated ones untouched. See `.docs/QUERY_BUDGET.md`.

## Coverage

- Frontend: v8 coverage with enforced thresholds lines 80, functions 75, branches 75, statements 80 (`frontend/vite.config.ts`). Excludes `src/lib/components/shadcn/**`, `src/routes/**`, `ActivityTable.svelte`, `theme/ColorWheel.svelte`, config files, `tests/helpers/**`. CI (`.github/workflows/frontend-test.yml`) runs `test:coverage` then `test:browser --browser.headless=true`.
- Backend: no enforced threshold; `go test -coverprofile` uploaded in CI (`.github/workflows/ci.yml`, with `-race -p 1`).
- Mutation: `.github/workflows/mutation.yml` (gremlins `mutate-diff` on PRs; Stryker thresholds high 80 / low 60, no break). A run with zero survivors is a harness bug; verify by hand-applying a mutant. Report results as tests caught X of Y planted bugs.
- Single-state UI needs no unit test; stateful components need each distinct state exercised (user testing principles).

## Common Patterns

**Async (frontend):**
```ts
mocks.mockGraphql.mockResolvedValue({ sendMessage: server });
const result = await mocks.captured.mutationFn(args);
expect(mocks.mockGraphql).toHaveBeenCalledWith(SEND_MESSAGE, { input: {...} });
```
Use `vi.waitFor` for settled state (`mountConsumers`).

**Error testing (Go):**
```go
wrapped := fmt.Errorf("something failed: %w", domain.ErrNotFound)
assert.True(t, errors.Is(wrapped, domain.ErrNotFound))
```

**Unexported helpers:** Go tests are external packages, so unexported functions are tested through the GraphQL server; some placeholder tests are `t.Skip("... unexported - tested via integration tests")` (`backend/test/resolvers/helpers_test.go`).

**Gotchas:**
- gqlgen defaults: `first: Int = 10` arrives as non-nil `10`; tests must expect it.
- gqlgen test client rejects response keys with no matching struct field; list every selected field or decode into `map[string]json.RawMessage`.
- `AddVideoDialog` success-state test is intermittently flaky under the full suite (passes in isolation).
- Unit tests importing a module that pulls in `svelte-clerk` break (`$env/dynamic/public` undefined under Vitest); keep `$lib/auth` free of it.

---

*Testing analysis: 2026-10-01*
