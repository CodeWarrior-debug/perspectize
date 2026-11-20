# Testing Patterns

**Analysis Date:** 2026-11-01

## Test Framework

**Backend:**
- Go `testing` + `github.com/stretchr/testify` (`assert`, `require`); gqlgen test client; go-sqlmock for GORM-level tests.
- Config: `backend/Makefile`, CI in `.github/workflows/ci.yml`.

**Frontend:**
- Vitest 4 (`vitest.config` projects defined in `frontend/vite.config.ts`): `unit` project (jsdom, globals, `tests/setup.ts`) and `browser` project (`frontend/vitest.config.browser.ts`, Playwright/Chromium via `@vitest/browser-playwright`, `vitest-browser-svelte`).
- `@testing-library/svelte` + `@testing-library/jest-dom`.
- E2E: Playwright demo tours in `frontend/demo/` (`flows/`, `tours/`, `playwright.config.ts`) against the Docker demo stack.

**Run Commands:**
```bash
# backend/
make test                      # go test -v -cover -coverpkg=./internal/...,./pkg/... ./...
make test-coverage             # coverage.out + coverage.html
go test -p 1 -race ./...       # what CI runs (serial: retention tests sweep shared tables)
go vet -tags perf ./internal/perf/...   # CI compiles the build-tagged perf harness
make mutate / make mutate-diff # Gremlins mutation testing (slow; always via make)

# frontend/
pnpm run test:run              # unit project once (verification/CI)
pnpm run test                  # watch
pnpm run test:coverage         # v8 coverage, unit project only
pnpm run test:browser          # real-browser project (VITEST_BROWSER_VIDEO=1 records video)
pnpm run demo:test             # Playwright E2E vs demo stack (also `make demo-test` at root)
pnpm run mutate                # Stryker (config stryker.config.json)
pnpm run test:duplication      # jscpd
```
Per project preference, run targeted tests while iterating (`pnpm exec vitest run tests/components/X.test.ts`), full suites before a push.

## Test File Organization

**Backend:**
- Black-box tests in `backend/test/<area>/` using external packages (`package services_test`): `test/services/`, `test/resolvers/`, `test/repositories/`, `test/domain/`, `test/config/`, `test/database/`, `test/realtime/`, `test/messaging/` (websocket E2E), `test/graphql/`, `test/youtube/`, `test/roundtrips/`.
- White-box tests co-located for unexported code: `internal/core/services/perspective_service_test.go` (`package services`), `internal/adapters/graphql/resolvers/helpers_edges_test.go`, `internal/config/demo_internal_test.go`.
- Benchmarks: `*_bench_test.go` (`test/services/content_service_bench_test.go`).
- Query-count helper: `backend/internal/perf/querycount`; opt-in whole-request harness `internal/perf/` behind `-tags perf`.

**Frontend:**
- `frontend/tests/components/<Component>.test.ts` (component rendering), `frontend/tests/unit/<topic>.test.ts` (utils, hooks, cache contracts, parity checks), `frontend/tests/browser/*.test.ts` (real browser, mocks in `tests/browser/mocks/`), `frontend/tests/helpers/` (shared wrappers), `frontend/tests/fixtures/`.
- Global setup `frontend/tests/setup.ts`.

## Test Structure

**Go (table/mocks, testify):**
```go
func TestSanitizeReview_StripsScriptTags(t *testing.T) {
	in := `<p>hello</p><script>alert(1)</script>`
	got := sanitizeReview(in)
	assert.Equal(t, "<p>hello</p>", got)
}
```
- Name: `Test<Unit>_<Behaviour>`. `require` for preconditions that must stop the test, `assert` for checks.
- Use `t.Helper()` in helpers; `t.Setenv("KEY", "")` to isolate config (see `clearConfigEnvVars` in `test/config/config_test.go`).
- Errors asserted with `errors.Is` against `domain.Err*` sentinels (`test/domain/errors_test.go`).

**TypeScript (Vitest):**
```ts
describe('FilterChips', () => {
	beforeEach(() => { vi.clearAllMocks(); });
	it('renders a chip for a number filter', () => {
		renderChips({ views: { filterType: 'number', type: 'greaterThan', filter: 1000 } });
		expect(screen.getByText('Views:')).toBeInTheDocument();
	});
});
```
- Small `renderX(props)` factory per file wraps `render(Component, { props })`; shared `renderComponent` in `tests/helpers/render.ts`.
- `vi.clearAllMocks()` in `beforeEach`; each distinct UI state gets its own `it` (empty, each filter type, open/closed, loading/error).

## Mocking

**Backend:** hand-written mocks of port interfaces with function fields and sensible defaults; no mock framework.
```go
type mockUserRepository struct {
	getByIDFn func(ctx context.Context, id int) (*domain.User, error)
}
func (m *mockUserRepository) GetByID(ctx context.Context, id int) (*domain.User, error) {
	if m.getByIDFn != nil { return m.getByIDFn(ctx, id) }
	return nil, domain.ErrNotFound
}
```
Seen in `test/services/user_service_test.go` and `test/resolvers/helpers_test.go` (`mockContentRepository`). Adding a method to a port interface requires updating every mock in `test/`.

**Frontend:**
- Global mocks in `tests/setup.ts`: `$app/environment`, `$app/navigation`, `$app/state` (exports mutable `mockPageState`), `$app/stores`, favicon asset, `IntersectionObserver` (fires immediately), `localStorage` (in-memory class), `matchMedia`.
- Hook tests mock `@tanstack/svelte-query` and capture options (`tests/unit/hooks-useAddMovie.test.ts`):
```ts
const { mockGraphqlRequest } = vi.hoisted(() => ({ mockGraphqlRequest: vi.fn() }));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: mockGraphqlRequest }));
vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn) => { capturedMutationOptions = optionsFn(); return { mutate: vi.fn(), isPending: false }; }),
	useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));
```
- A component importing a new `useX` hook needs that hook `vi.mock`ed in its component test (no QueryClient provider is rendered).
- Stub child components with `tests/helpers/*.svelte` (`FakeCommentsEditor`, `Passthrough`, `TestWrapper`, ...).
- Browser project aliases `svelte-clerk` and `$app/*` to `tests/browser/mocks/`.

**Do not mock:** the database in repository/round-trip tests; the real `QueryClient` in cache-contract tests; the real Postgres in `test/roundtrips`.

## Fixtures and Factories

- Backend: `test/repositories/helpers_test.go` (`openTestDB`, `mustCreateUser` with nanosecond-salted unique names for a persistent DB), `test/roundtrips` harness (`newHarness`, `h.user`, `h.content`, `h.roundTrips`), `test/messaging/harness_test.go`; demo fixtures in `internal/demo/fixtures.go`.
- Frontend: `frontend/tests/fixtures/`, `frontend/tests/browser/fixtures/`, `frontend/demo/fixtures.ts`.

## Coverage

- Backend: no enforced threshold; `-coverpkg=./internal/...,./pkg/...`; CI uploads `coverage.out` to Codecov (non-blocking).
- Frontend: v8 thresholds in `frontend/vite.config.ts`: lines 80, functions 75, branches 75, statements 80. Excluded: `src/routes/**`, `src/lib/components/shadcn/**`, `ActivityTable.svelte`, `theme/ColorWheel.svelte`, `tests/helpers/**`, configs.
- Mutation testing: Gremlins (backend) and Stryker (frontend). A run with nothing surviving is a harness bug; report killed/lived/not-covered and the all-in figure.

## Test Types

**Unit:** mock ports/hooks, no DB (`test/services`, `tests/unit`, `tests/components`).

**Integration:** `openTestDB` reads `DATABASE_URL` and calls `t.Skip("Skipping - PostgreSQL not available")` when absent, so a green local run can mean nothing ran. Never point at the shared Neon DB; in cloud use a local `testdb` and `go test -p 1 ./...`. Some resolver tests are `t.Skip` placeholders for unexported helpers (`test/resolvers/helpers_test.go`).

**Query budget (REQUIRED for DB/data-fetching changes):**
```go
c := querycount.Attach(t, db)
_, _ = repo.GetByIDs(ctx, seqIDs(50))
c.AssertExactly(t, 1)
```
- Batch methods: same count for 1 and 50 inputs, 0 for empty. Dataloaders: N loads -> 1 service call. Whole-request counts pinned in `test/roundtrips` (`h.roundTrips(2, token, query, vars)`; `RT_MEASURE=1` prints statements). Matchers expect `= ANY(CAST(? AS bigint[]))`.
- Frontend: `tests/helpers/queryBudget.ts` (`makeClient`, `countingFetch`, `mountConsumers`, `seed`, `invalidationOutcome`) with a REAL `QueryClient`; examples in `tests/unit/query-cache-contract.test.ts`. Assert fetch count, `staleTime`, `hashKey` changes per variable, and both `invalidated` and `untouched` after a mutation (mocked `invalidateQueries` alone is insufficient).

**E2E:** Playwright (`frontend/demo/`), run in CI job `demo-e2e` via `pnpm run demo:test`; browser-mode component tests in `frontend/tests/browser/` (AG Grid integration, demo sign-in). Screenshots/video land in `SV_SCREENSHOTS_DIR`.

**CI:** `.github/workflows/ci.yml` (Go tests with `-race`, Postgres, migrations on a CI DB, `go build`, `gofmt`, `go vet -tags perf`), `.github/workflows/frontend-test.yml`, `.github/workflows/mutation.yml`.

## Common Patterns

**Async (Vitest):** `await import('$lib/queries/content/useAddMovie')` after mocks are set; `await vi.waitFor(() => {...})` for settling; `await capturedMutationOptions.mutationFn(arg)` to drive hook logic.

**Error testing (Go):**
```go
wrapped := fmt.Errorf("something failed: %w", domain.ErrNotFound)
assert.True(t, errors.Is(wrapped, domain.ErrNotFound))
```

**gqlgen client:** decode targets must declare every selected field (or use `map[string]json.RawMessage`); `first` defaults to a non-nil `10`.

**Flaky known:** `AddVideoDialog` success-state test can time out under the full suite but passes in isolation.

**When a UI test is worth adding:** only for stateful components; name each state covered. Single-state static visuals need none.

---

*Testing analysis: 2026-11-01*
