# Testing Patterns

**Analysis Date:** 2026-11-26

## Test Framework

**Runner:**
- Backend: Go `testing`; gqlgen test client; go-sqlmock. Config: `backend/Makefile`.
- Frontend: Vitest 4 with two projects: `unit` (jsdom, globals, defined in `frontend/vite.config.ts`) and `browser` (`frontend/vitest.config.browser.ts`, Playwright Chromium, `vitest-browser-svelte`).
- E2E: Playwright (`frontend/demo/playwright.config.ts`) against the demo stack.

**Assertion Library:** testify (`assert`, `require`); Vitest `expect` with `@testing-library/jest-dom`.

**Run Commands:**
```bash
# backend/
make test                      # all, verbose, with coverage
make test-coverage             # coverage.out + coverage.html
go test -p 1 -race ./...       # CI mode (serial: tests share one database)
go vet -tags perf ./internal/perf/...   # compile the build-tagged harness
make mutate / make mutate-diff # Gremlins; always through make

# frontend/
pnpm run test:run              # unit project once
pnpm run test                  # unit watch
pnpm run test:coverage         # unit with v8 coverage
pnpm run test:browser          # real browser (VITEST_BROWSER_VIDEO=1 records)
pnpm run test:all              # both projects
pnpm run demo:test             # Playwright E2E (or `make demo-test` at root)
pnpm run mutate                # Stryker; also mutate:chunked, mutate:incremental
```
Run targeted tests while iterating (`pnpm exec vitest run tests/components/X.test.ts`), full suites before a push.

## Test File Organization

**Location:**
- Backend black-box tests: `backend/test/<area>/` with external packages (`package services_test`): `services`, `resolvers`, `repositories`, `domain`, `config`, `database`, `demo`, `server`, `realtime`, `messaging`, `graphql`, `youtube`, `roundtrips`.
- Backend white-box tests sit beside the code in `internal/**` (adapters, resolvers, services, assembly), `pkg/**` and `cmd/**`. sqlmock repository tests are in `internal/adapters/repositories/postgres/` (`query_count_test.go`, `paging_contract_test.go`).
- Frontend: nothing is co-located in `src/`. `frontend/tests/components/` (rendering), `tests/unit/` (utils, hooks, cache contracts; subfolders `theme/`, `contentTypes/`, `fonts/`), `tests/browser/`, `tests/helpers/`. Put new logic tests in `tests/unit/` (`tests/utils/` holds a few).
- Naming: `<Component>.test.ts`, `<topic>.test.ts`, `hooks-<hookName>.test.ts`; E2E `demo/tours/*.tour.ts` and `demo/flows/*.spec.ts`.

## Test Structure

**Suite Organization (Go):**
```go
func TestSanitizeReview_StripsScriptTags(t *testing.T) {
	in := `<p>hello</p><script>alert(1)</script>`
	got := sanitizeReview(in)
	assert.Equal(t, "<p>hello</p>", got)
}
```

**Suite Organization (Vitest):**
```ts
function renderChips(filterModel: Record<string, any>, gridApi = mockGridApi()) {
	return render(FilterChips, { props: { gridApi, filterModel } });
}

describe('FilterChips', () => {
	beforeEach(() => vi.clearAllMocks());

	it('renders nothing when no filters are active', () => {
		const { container } = renderChips({});
		expect(container.textContent?.trim()).toBe('');
	});
});
```

**Patterns:**
- Go: name `Test<Unit>_<Behaviour>`; `require` for preconditions, `assert` for checks; `t.Helper()` in helpers; `t.Setenv("KEY", "")` to isolate config (`clearConfigEnvVars` in `test/config/config_test.go`).
- Frontend: a small `renderX()` factory per file (or `tests/helpers/render.ts`); one `it` per distinct UI state. Add UI tests for stateful components and name the states; single-state static visuals need none.
- Components needing a QueryClient render through `tests/helpers/TestWrapper.svelte`; inside it use the dotted tag `<wrapped.Comp />`, or nothing renders and assertions pass vacuously.

**Load stability** (`.docs/CI_STABLE_TESTS.md`): pay cold costs in `beforeAll` with `tests/helpers/warmUp.ts`: `preloadLazy` for `{#await import()}` targets and modules imported in test bodies, `warmUpRender` / `warmUp` for heavy first renders. Never skip a test, add retries or raise a global timeout. A per-test timeout needs a comment saying why.

## Mocking

**Backend:** hand-written port mocks with function fields and defaults; no mock framework.
```go
type mockUserRepository struct {
	getByIDFn func(ctx context.Context, id int) (*domain.User, error)
}
func (m *mockUserRepository) GetByID(ctx context.Context, id int) (*domain.User, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}
```
See `test/services/user_service_test.go`; `mockContentRepository` exists in both `test/services` and `test/resolvers`.

**Frontend:** `vi.mock` with `vi.hoisted` handles (`tests/unit/hooks-useAddMovie.test.ts`):
```ts
const { mockGraphqlRequest } = vi.hoisted(() => ({ mockGraphqlRequest: vi.fn() }));
vi.mock('#lib/queries/client.js', () => ({ graphqlRequest: mockGraphqlRequest }));
vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((optionsFn: () => any) => {
		capturedMutationOptions = optionsFn();
		return { mutate: vi.fn(), isPending: false };
	}),
	useQueryClient: vi.fn(() => ({ invalidateQueries: mockInvalidateQueries })),
}));
preloadLazy(() => import('#lib/queries/content/useAddMovie.js'));
```
- Global mocks in `tests/setup.ts`: `$app/env`, `$app/navigation`, `$app/state` (exports mutable `mockPageState`), `$app/stores`, favicon, `IntersectionObserver` (fires at once), `localStorage`, `matchMedia`. Child stubs and harnesses: `tests/helpers/*.svelte`.
- A component that gains a `useX` hook needs it mocked in that component's tests when they render without a QueryClient.
- Browser project aliases `svelte-clerk`, `$app/env`, `$app/navigation`, `$app/state`, `$app/stores` to `tests/browser/mocks/`. Demo-mode tests use `vi.hoisted(() => vi.stubEnv('VITE_DEMO_MODE', 'true'))`.

**What to Mock:** ports, network wrappers, toasts, navigation, auth.

**What NOT to Mock:** the database in repository and round-trip tests; the `QueryClient` in cache-contract tests.

## Fixtures and Factories

- Backend: `test/repositories/helpers_test.go` (`openTestDB`, `mustCreateUser` with time-salted names for a persistent database); `test/roundtrips/harness_test.go` (`newHarness`, `h.user`, `h.content`, `h.roundTrips`); `test/messaging/harness_test.go`; demo data in `internal/demo/fixtures.go`; cross-stack data in repo-root `testdata/` and `data/bible/`.
- Frontend: host components in `tests/components/fixtures/`, harnesses in `tests/browser/fixtures/`, E2E fixtures in `demo/fixtures.ts`.

## Coverage

**Requirements:**
- Backend: no threshold; `-coverpkg=./internal/...,./pkg/...`; CI uploads to Codecov without failing on upload errors.
- Frontend (enforced by the CI `unit` job): lines 80, functions 75, branches 75, statements 80. Excludes include `src/routes/**`, `shadcn/**`, `components/library/ContentLibrary.svelte`, `theme/ColorWheel.svelte`, `tests/helpers/**`, configs.

**Mutation testing:**
- Gremlins: `backend/.gremlins.yaml` (integration mode). A test that reads files outside `backend/` goes in `MUTATE_SKIP` or becomes hermetic.
- Stryker: `vitest.config.stryker.ts` mirrors the `unit` project (keep in sync) and excludes tests reading outside `frontend/`.
- CI (`.github/workflows/mutation.yml`) is report-only on PRs. A run with no survivors indicates a harness bug.

## Test Types

**Unit:** mocked ports/hooks, no database.

**Integration:** DB tests `t.Skip` without a reachable `DATABASE_URL`, so a green run may have tested nothing; confirm PASS with `-v`. Use a local throwaway database, never the shared one, with `-p 1`. Some tests in `test/resolvers/helpers_test.go` are permanent `t.Skip` placeholders.

**Query budget (required for DB or data-fetching changes):**
```go
c := querycount.Attach(t, db) // internal/perf/querycount
_, _ = repo.GetByIDs(ctx, ids)
c.AssertExactly(t, 1)
```
- Batch methods: same count for 1 and 50 inputs, 0 for empty. Dataloaders: N loads give 1 service call. Whole requests are pinned in `test/roundtrips` (`h.roundTrips(want, token, query, vars)`; `RT_MEASURE=1` prints statements).
- Frontend: `tests/helpers/queryBudget.ts` (`makeClient`, `countingFetch`, `mountConsumers`, `seed`, `invalidationOutcome`) with a real `QueryClient` (`tests/unit/query-cache-contract.test.ts`). Assert both `invalidated` and `untouched`.

**E2E and browser:** AG Grid does not render in jsdom: unit-test pure helpers and renderers, and test grid behaviour in `tests/browser/` (wait for cells with `expect.poll`, not rows). Demo tours run with `workers: 1`. Capture output directory: `SV_SCREENSHOTS_DIR`.

**CI:**
- `ci.yml`: backend tests (Postgres, migrations, `-race`), build, `gofmt`, perf-harness vet; gated on code changes. `demo-e2e` runs only when demo paths change.
- `frontend-test.yml`: parallel `check`, `unit` (coverage) and `browser` jobs; JSON results upload from `test-results/`.

## Common Patterns

**Async Testing:**
```ts
const { useAddMovie } = await import('#lib/queries/content/useAddMovie.js'); // preloaded above
useAddMovie();
await capturedMutationOptions.mutationFn('tt0133093');
await vi.waitFor(() => expect(mockGraphqlRequest).toHaveBeenCalled());
```

**Error Testing:**
```go
wrapped := fmt.Errorf("something failed: %w", domain.ErrNotFound)
assert.True(t, errors.Is(wrapped, domain.ErrNotFound))
```

**gqlgen client:** decode targets must declare every selected field (or use `map[string]json.RawMessage`); `first` arrives as a non-nil default of `10`.

---

*Testing analysis: 2026-11-26*
