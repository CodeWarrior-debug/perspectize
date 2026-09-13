# Perspective Privacy (Public / Private) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user mark their own perspective Public (default) or Private via a toggle in the add/edit form, and make `PRIVATE` mean owner-only everywhere on the backend read paths.

**Architecture:** The `Privacy` enum, `privacy` column, and GraphQL `privacy` fields already exist. This plan adds (1) a hardening migration for the column, (2) viewer-aware read authorization computed in `PerspectiveService.ListPerspectives` and enforced by a single extra predicate in the GORM repository `List`, (3) a nil-for-non-owner guard in the `perspectiveByID` resolver, (4) a benchmark that decides WHERE vs UNION for the list predicate, and (5) a `Switch`-based "Private" control in `PerspectivePopover.svelte` wired through the create/update mutation hooks.

**Tech Stack:** Go 1.25, gqlgen (schema-first — but no schema change here), GORM + `gorm-cursor-paginator`, `golang-migrate` (numbered SQL files), PostgreSQL 17 (Sevalla) / 18 (local docker); SvelteKit, Svelte 5 runes, `@tanstack/svelte-query` v6 function-wrapper pattern, `bits-ui` v2, `svelte-sonner`, Vitest + `@testing-library/svelte`.

**Spec:** `docs/superpowers/specs/2026-09-09-perspective-privacy-design.md` — read alongside this plan; the plan argues from that spec's decisions and does not re-justify them.

## Global Constraints

- Branch: `feature/perspective-privacy` in the main worktree (`/Users/jamesjordan/GitHub/perspectize`). Already created off updated `main`. Do not create another branch.
- No chained shell commands — run each `git`/`go`/`pnpm` command as its own step (repo convention; `&&` breaks the permission allow-list).
- Privacy values are stored **lowercase** in Postgres (`'public'` / `'private'`); the Go/GraphQL enum is **UPPERCASE** (`domain.PrivacyPublic = "PUBLIC"`, `domain.PrivacyPrivate = "PRIVATE"`). The existing `privacyToDBValue` / `privacyFromDBValue` (in `backend/internal/adapters/repositories/postgres/helpers.go`) do the conversion — reuse them, never hand-roll `strings.ToLower`.
- No `schema.graphql` change and therefore **no `make graphql-gen`** run in this plan. The viewer identity comes from `auth.ForContext(ctx)`, not a new GraphQL argument.
- No new index (deferred to the post-Neon tuning pass per spec).
- No `@auth` directive added to `perspectives` or `perspectiveByID` — public browsing is a planned follow-up.
- Frontend: Svelte 5 runes only (`$state`, `$derived`, `$effect`); TanStack Query v6 function-wrapper pattern (`createMutation(() => ({...}))`); never pass an options object directly.
- Migration number: **`000018`** (`000017` is taken by open PR #346 `000017_add_messaging`; the harden migration was authored as 017, then renumbered — files are `backend/migrations/000018_harden_perspective_privacy.{up,down}.sql`). The `up.sql` DDL is idempotent (`DROP CONSTRAINT IF EXISTS` before `ADD`).
- Migrations are **not** run automatically anywhere (no runner in `cmd/server`, no CI step, no release command in-repo). `000018` must be applied **by hand to each environment** (`make migrate-up` with that env's `DATABASE_URL`) as part of rollout. Do not apply it to any shared DB during execution — the PR notes the manual step.
- Verification before PR: `go build ./...` + `go test ./...` in `backend/`, `pnpm run test:run` in `frontend/`, all green, output summarised in the PR. Browser verification is local-only — hand any UI-behaviour check back to a local session, do not attempt Clerk sign-in.

---

## File Structure

**Backend**

| File | Responsibility | Create/Modify |
|---|---|---|
| `backend/migrations/000017_harden_perspective_privacy.up.sql` | Backfill NULLs, `NOT NULL`, `DEFAULT 'public'`, `CHECK` | Create |
| `backend/migrations/000017_harden_perspective_privacy.down.sql` | Drop the constraint + `NOT NULL` | Create |
| `backend/internal/core/domain/perspective.go` | Add `ViewerID *int` and `RestrictToPublicOrOwner bool` to `PerspectiveListParams` | Modify |
| `backend/internal/core/services/perspective_service.go` | `ListPerspectives` computes the restriction from viewer vs `filter.UserID` | Modify |
| `backend/internal/adapters/repositories/postgres/gorm_perspective_repository.go` | `List` applies the `privacy = 'public' OR user_id = ?` predicate when told to | Modify |
| `backend/internal/adapters/graphql/resolvers/perspective.resolvers.go` | `Perspectives` sets `ViewerID` from `auth.ForContext`; `PerspectiveByID` returns `nil` for a non-owner's private row | Modify |
| `backend/test/services/perspective_service_test.go` | Enforcement matrix against the mock repo | Modify |
| `backend/internal/adapters/repositories/postgres/gorm_perspective_repository_test.go` | sqlmock assertions for the new predicate + cursor still correct | Modify |
| `backend/test/resolvers/perspective_resolver_test.go` (or the existing perspective resolver test file — see Task 5) | `perspectiveByID` visibility cases | Modify/Create |
| `docs/superpowers/plans/2026-09-09-perspective-privacy-plan.md` | Record the benchmark result in Task 6 | Modify |

**Frontend**

| File | Responsibility | Create/Modify |
|---|---|---|
| `frontend/src/lib/components/shadcn/switch/switch.svelte` | `bits-ui` Switch wrapper, shadcn styling | Create |
| `frontend/src/lib/components/shadcn/switch/index.ts` | Re-export `Root` / `Switch` | Create |
| `frontend/src/lib/components/PerspectivePopover.svelte` | "Private" toggle row; include `privacy` in create/update payload; init from `existingPerspective` in edit mode | Modify |
| `frontend/src/lib/queries/perspectives/useCreatePerspective.ts` | `privacy?: 'PUBLIC' \| 'PRIVATE'` in input; send it; optimistic row uses it | Modify |
| `frontend/src/lib/queries/perspectives/useUpdatePerspective.ts` | `privacy?: 'PUBLIC' \| 'PRIVATE'` in input; send it; `applyEdit` patches it | Modify |
| `frontend/tests/components/PerspectivePopover.test.ts` | Toggle renders / submits / inits | Modify |
| `frontend/tests/unit/hooks-useCreatePerspective.test.ts` (match the actual existing filename — see Task 8) | `privacy` forwarded + optimistic | Modify |
| `frontend/tests/unit/hooks-useUpdatePerspective.test.ts` (match the actual existing filename) | `privacy` forwarded + `applyEdit` | Modify |

Backend tasks are ordered (migration → domain field → service → repo → resolver → benchmark). Frontend tasks (7–9) are independent of the backend tasks and of each other except that Task 8 (Switch component) precedes Task 9 (popover uses it).

---

## Task 1: Migration — harden the `privacy` column

**Files:**
- Create: `backend/migrations/000017_harden_perspective_privacy.up.sql`
- Create: `backend/migrations/000017_harden_perspective_privacy.down.sql`

**Interfaces:**
- Consumes: nothing.
- Produces: a `perspectives.privacy` column that is `NOT NULL DEFAULT 'public'` and `CHECK (privacy IN ('public','private'))`. Later tasks assume every row has a non-null lowercase value.

- [ ] **Step 1: Confirm the migration number is free**

Run: `ls backend/migrations/ | tail -4`
Expected: highest is `000016_add_user_onboarding.*`. If something ≥ `000017` exists, use the next free number here and in both filenames.

- [ ] **Step 2: Write `backend/migrations/000017_harden_perspective_privacy.up.sql`**

```sql
-- Harden perspectives.privacy: no NULLs, defaulted, constrained to the two known values.
-- The Privacy enum (PUBLIC/PRIVATE) is stored lowercase; see backend/internal/adapters/repositories/postgres/helpers.go.

UPDATE public.perspectives SET privacy = 'public' WHERE privacy IS NULL;

ALTER TABLE public.perspectives ALTER COLUMN privacy SET DEFAULT 'public';
ALTER TABLE public.perspectives ALTER COLUMN privacy SET NOT NULL;

ALTER TABLE public.perspectives
    ADD CONSTRAINT perspectives_privacy_check CHECK (privacy IN ('public', 'private'));
```

- [ ] **Step 3: Write `backend/migrations/000017_harden_perspective_privacy.down.sql`**

```sql
ALTER TABLE public.perspectives DROP CONSTRAINT IF EXISTS perspectives_privacy_check;
ALTER TABLE public.perspectives ALTER COLUMN privacy DROP NOT NULL;
-- DEFAULT 'public' predates this migration (000004); leave it in place.
```

- [ ] **Step 4: Apply the migration against the local DB**

Run: `make migrate-up` (from `backend/`; uses `DATABASE_URL` or the docker default `postgres://testuser:testpass@localhost:5432/testdb?sslmode=disable`).
Expected: `000017` applied, no error. If the local docker DB is not running, skip to Step 6 and note the migration is unverified locally — the CI/remote apply will catch a bad DDL.

- [ ] **Step 5: Verify the constraint exists, then roll back and forward once**

Run: `make migrate-down` then `make migrate-up`
Expected: both succeed; `down` removes the constraint, `up` re-adds it. (`make migrate-down` steps one migration by repo convention — confirm in `backend/Makefile` and adjust if it takes a count.)

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/000017_harden_perspective_privacy.up.sql backend/migrations/000017_harden_perspective_privacy.down.sql
git commit -m "feat(perspective-privacy): harden privacy column (NOT NULL, default, CHECK)"
```

---

## Task 2: Domain — viewer fields on `PerspectiveListParams`

**Files:**
- Modify: `backend/internal/core/domain/perspective.go` (the `PerspectiveListParams` struct, ~line 97-107)

**Interfaces:**
- Consumes: nothing.
- Produces:
  ```go
  type PerspectiveListParams struct {
      // ...existing fields...
      Filter                  *PerspectiveFilter
      ViewerID                *int  // authenticated caller's user id; nil = anonymous
      RestrictToPublicOrOwner bool  // set by the service; repo adds (privacy='public' OR user_id=ViewerID)
  }
  ```
  Task 3 (service) sets these; Task 4 (repo) reads them.

- [ ] **Step 1: Add the two fields**

In `backend/internal/core/domain/perspective.go`, add to `PerspectiveListParams` after `Filter *PerspectiveFilter`:

```go
	// ViewerID is the authenticated caller's local user id, or nil when the
	// request is anonymous. Set by the resolver from auth.ForContext.
	ViewerID *int

	// RestrictToPublicOrOwner, when true, limits results to rows that are
	// public OR owned by ViewerID. Set by PerspectiveService.ListPerspectives;
	// the repository translates it into a WHERE predicate.
	RestrictToPublicOrOwner bool
```

- [ ] **Step 2: Build**

Run: `go build ./...` (from `backend/`)
Expected: compiles — new fields are unused so far, which is fine (they're struct fields, not variables).

- [ ] **Step 3: Commit**

```bash
git add backend/internal/core/domain/perspective.go
git commit -m "feat(perspective-privacy): add viewer fields to PerspectiveListParams"
```

---

## Task 3: Service — compute the read restriction in `ListPerspectives`

**Files:**
- Modify: `backend/internal/core/services/perspective_service.go` (`ListPerspectives`, ~line 245-264)
- Test: `backend/test/services/perspective_service_test.go`

**Interfaces:**
- Consumes: `domain.PerspectiveListParams{ViewerID, RestrictToPublicOrOwner, Filter}` from Task 2.
- Produces: `ListPerspectives` guarantees that whenever the caller is not unambiguously the owner of the filtered user's rows, `params.RestrictToPublicOrOwner == true` is passed to `repo.List`. No change to the return type.

**Rule:** set `params.RestrictToPublicOrOwner = true` UNLESS `params.Filter != nil && params.Filter.UserID != nil && params.ViewerID != nil && *params.Filter.UserID == *params.ViewerID`.

- [ ] **Step 1: Write the failing tests**

Add to `backend/test/services/perspective_service_test.go` (new `TestPerspectiveService_ListPerspectives_PrivacyEnforcement` function). The mock repo captures the params it receives:

```go
func TestPerspectiveService_ListPerspectives_PrivacyEnforcement(t *testing.T) {
	ctx := context.Background()
	pInt := func(i int) *int { return &i }

	newSvc := func(capture *domain.PerspectiveListParams) *services.PerspectiveService {
		repo := &mockPerspectiveRepository{
			listFn: func(_ context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
				*capture = params
				return &domain.PaginatedPerspectives{Items: []*domain.Perspective{}}, nil
			},
		}
		return services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})
	}

	t.Run("owner viewing their own list is not restricted", func(t *testing.T) {
		var got domain.PerspectiveListParams
		svc := newSvc(&got)
		_, err := svc.ListPerspectives(ctx, domain.PerspectiveListParams{
			ViewerID: pInt(7),
			Filter:   &domain.PerspectiveFilter{UserID: pInt(7)},
		})
		require.NoError(t, err)
		assert.False(t, got.RestrictToPublicOrOwner)
	})

	t.Run("different signed-in user is restricted", func(t *testing.T) {
		var got domain.PerspectiveListParams
		svc := newSvc(&got)
		_, err := svc.ListPerspectives(ctx, domain.PerspectiveListParams{
			ViewerID: pInt(7),
			Filter:   &domain.PerspectiveFilter{UserID: pInt(9)},
		})
		require.NoError(t, err)
		assert.True(t, got.RestrictToPublicOrOwner)
		require.NotNil(t, got.ViewerID)
		assert.Equal(t, 7, *got.ViewerID)
	})

	t.Run("anonymous viewer is restricted", func(t *testing.T) {
		var got domain.PerspectiveListParams
		svc := newSvc(&got)
		_, err := svc.ListPerspectives(ctx, domain.PerspectiveListParams{
			ViewerID: nil,
			Filter:   &domain.PerspectiveFilter{UserID: pInt(9)},
		})
		require.NoError(t, err)
		assert.True(t, got.RestrictToPublicOrOwner)
		assert.Nil(t, got.ViewerID)
	})

	t.Run("no user filter is restricted even for a signed-in caller", func(t *testing.T) {
		var got domain.PerspectiveListParams
		svc := newSvc(&got)
		_, err := svc.ListPerspectives(ctx, domain.PerspectiveListParams{
			ViewerID: pInt(7),
			Filter:   nil,
		})
		require.NoError(t, err)
		assert.True(t, got.RestrictToPublicOrOwner)
	})
}
```

- [ ] **Step 2: Run the tests, verify they fail**

Run: `go test ./test/services/ -run TestPerspectiveService_ListPerspectives_PrivacyEnforcement -v`
Expected: FAIL — `got.RestrictToPublicOrOwner` is always `false` (service doesn't set it yet).

- [ ] **Step 3: Implement the rule**

In `perspective_service.go`, inside `ListPerspectives`, after the `First`/`Last` validation and before `s.repo.List(ctx, params)`:

```go
	// Read authorization: unless the caller is unambiguously asking only for
	// their own rows, results must be limited to public rows plus the caller's
	// own. The repository turns RestrictToPublicOrOwner into a WHERE predicate.
	isOwnListOnly := params.Filter != nil &&
		params.Filter.UserID != nil &&
		params.ViewerID != nil &&
		*params.Filter.UserID == *params.ViewerID
	params.RestrictToPublicOrOwner = !isOwnListOnly
```

- [ ] **Step 4: Run the tests, verify they pass**

Run: `go test ./test/services/ -run TestPerspectiveService_ListPerspectives_PrivacyEnforcement -v`
Expected: PASS (all four subtests).

- [ ] **Step 5: Run the full service test package**

Run: `go test ./test/services/`
Expected: PASS — no existing test sets `ViewerID`, so they all hit `RestrictToPublicOrOwner = true`, which the mock repo ignores. Confirm nothing regressed.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/core/services/perspective_service.go backend/test/services/perspective_service_test.go
git commit -m "feat(perspective-privacy): compute read restriction in ListPerspectives"
```

---

## Task 4: Repository — apply the privacy predicate in `List`

**Files:**
- Modify: `backend/internal/adapters/repositories/postgres/gorm_perspective_repository.go` (`List`, the filter-chaining block ~line 103-116)
- Test: `backend/internal/adapters/repositories/postgres/gorm_perspective_repository_test.go`

**Interfaces:**
- Consumes: `params.RestrictToPublicOrOwner` and `params.ViewerID` from Tasks 2–3.
- Produces: when `RestrictToPublicOrOwner` is true, the SQL gains `AND (privacy = 'public' OR user_id = <ViewerID>)`, or `AND privacy = 'public'` when `ViewerID` is nil. This is the **WHERE shape** — Task 6 benchmarks it against a UNION and may replace it.

- [ ] **Step 1: Write the failing tests**

Add to `gorm_perspective_repository_test.go`, inside or next to `TestGormPerspectiveRepository_List`:

```go
	t.Run("RestrictToPublicOrOwner with a viewer adds the public-or-owner predicate", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`WHERE .*privacy = .* OR user_id = `).
			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

		viewer := 7
		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
			Filter:                  &domain.PerspectiveFilter{UserID: pInt(9)},
			ViewerID:                &viewer,
			RestrictToPublicOrOwner: true,
			SortBy:                  domain.PerspectiveSortByCreatedAt,
			SortOrder:               domain.SortOrderDesc,
		})
		require.NoError(t, err)
		require.Len(t, got.Items, 1)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("RestrictToPublicOrOwner with no viewer restricts to public only", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`WHERE .*privacy = `).
			WillReturnRows(perspectiveRows())

		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
			Filter:                  &domain.PerspectiveFilter{UserID: pInt(9)},
			ViewerID:                nil,
			RestrictToPublicOrOwner: true,
		})
		require.NoError(t, err)
		require.NotNil(t, got)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("RestrictToPublicOrOwner false leaves the query unrestricted", func(t *testing.T) {
		db, mock := newMockDB(t)
		// No privacy predicate expected — a plain user_id filter only.
		mock.ExpectQuery(`SELECT \* FROM "perspectives" WHERE user_id = \$1 ORDER BY`).
			WillReturnRows(perspectiveRows())

		_, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
			Filter:                  &domain.PerspectiveFilter{UserID: pInt(7)},
			RestrictToPublicOrOwner: false,
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})
```

> Note on the regexes: `sqlmock`'s default matcher is regexp-unanchored `QueryMatcherRegexp`. Keep the patterns loose (`privacy = .* OR user_id = `) — GORM parameterises the values, so assert clause shape, not bound args, exactly as the existing `privacy filter` case in this file already does.

- [ ] **Step 2: Run the tests, verify they fail**

Run: `go test ./internal/adapters/repositories/postgres/ -run TestGormPerspectiveRepository_List -v`
Expected: the two new "Restrict…" subtests FAIL (predicate absent); the "false" subtest may already pass.

- [ ] **Step 3: Implement the predicate**

In `gorm_perspective_repository.go` `List`, immediately after the existing `if params.Filter != nil { ... }` block:

```go
	// Read-authorization predicate (see PerspectiveService.ListPerspectives).
	// WHERE shape — benchmarked against a UNION in
	// docs/superpowers/plans/2026-09-09-perspective-privacy-plan.md Task 6.
	if params.RestrictToPublicOrOwner {
		if params.ViewerID != nil {
			query = query.Where("privacy = ? OR user_id = ?",
				privacyToDBValue(domain.PrivacyPublic), *params.ViewerID)
		} else {
			query = query.Where("privacy = ?", privacyToDBValue(domain.PrivacyPublic))
		}
	}
```

Confirm `privacyToDBValue` is in `helpers.go` in this package and returns `"public"` for `domain.PrivacyPublic`; if the helper name differs, grep `func privacy` in that file and use the real one.

- [ ] **Step 4: Run the tests, verify they pass**

Run: `go test ./internal/adapters/repositories/postgres/ -run TestGormPerspectiveRepository_List -v`
Expected: PASS.

- [ ] **Step 5: Run the whole postgres package (cursor/pagination regression check)**

Run: `go test ./internal/adapters/repositories/postgres/`
Expected: PASS — the predicate is ANDed before `Paginate`, so cursor tuples and `ORDER BY … , id` are unaffected.

- [ ] **Step 6: Commit**

```bash
git add backend/internal/adapters/repositories/postgres/gorm_perspective_repository.go backend/internal/adapters/repositories/postgres/gorm_perspective_repository_test.go
git commit -m "feat(perspective-privacy): repo List enforces public-or-owner (WHERE shape)"
```

---

## Task 5: Resolvers — pass the viewer, guard `perspectiveByID`

**Files:**
- Modify: `backend/internal/adapters/graphql/resolvers/perspective.resolvers.go` (`PerspectiveByID` ~line 97-115, `Perspectives` ~line 119-165)
- Test: existing perspective resolver test file. First run `ls backend/test/resolvers/` and `grep -rl "PerspectiveByID\|Perspectives(" backend/test/resolvers/` to find it; if none exists, create `backend/test/resolvers/perspective_visibility_test.go`.

**Interfaces:**
- Consumes: `auth.ForContext(ctx) (*domain.AuthenticatedUser, bool)` (package `backend/internal/adapters/auth`, already imported in this file — it's used at line 29); `domain.PerspectiveListParams.ViewerID` from Task 2.
- Produces: `Perspectives` populates `params.ViewerID`; `PerspectiveByID` returns `(nil, nil)` when the loaded row is `PRIVATE` and the caller is not its owner.

- [ ] **Step 1: Write the failing tests**

In the perspective resolver test file, add cases. Use the existing test-server / auth-context helpers in `backend/test/resolvers/` (grep for `WithAuthenticatedUser` and the resolver test harness constructor already used by sibling tests — mirror that setup exactly). Sketch:

```go
func TestPerspectiveByID_Visibility(t *testing.T) {
	// existing perspective #100 owned by user 42, privacy PRIVATE
	// existing perspective #101 owned by user 42, privacy PUBLIC
	// (seed via the same fake/stub perspective service the other resolver tests use)

	t.Run("owner sees their private perspective", func(t *testing.T) {
		ctx := auth.WithAuthenticatedUser(context.Background(), &domain.AuthenticatedUser{ID: 42})
		got, err := resolver.Query().PerspectiveByID(ctx, "100")
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, "100", got.ID)
	})

	t.Run("a different user gets nil for a private perspective", func(t *testing.T) {
		ctx := auth.WithAuthenticatedUser(context.Background(), &domain.AuthenticatedUser{ID: 7})
		got, err := resolver.Query().PerspectiveByID(ctx, "100")
		require.NoError(t, err)
		assert.Nil(t, got)
	})

	t.Run("anonymous gets nil for a private perspective", func(t *testing.T) {
		got, err := resolver.Query().PerspectiveByID(context.Background(), "100")
		require.NoError(t, err)
		assert.Nil(t, got)
	})

	t.Run("public perspective is returned to anyone", func(t *testing.T) {
		got, err := resolver.Query().PerspectiveByID(context.Background(), "101")
		require.NoError(t, err)
		require.NotNil(t, got)
	})
}
```

If the resolver tests in this repo use a live/gorm-backed service rather than a stub, seed the two rows through that path instead — follow whatever `backend/test/resolvers/*_test.go` siblings do; do not invent a new harness.

- [ ] **Step 2: Run, verify failure**

Run: `go test ./test/resolvers/ -run TestPerspectiveByID_Visibility -v`
Expected: the "different user" and "anonymous" cases FAIL (row is returned today).

- [ ] **Step 3: Guard `PerspectiveByID`**

Replace the final `return perspectiveDomainToModel(perspective), nil` in `PerspectiveByID` with:

```go
	// Private perspectives are visible only to their owner. Return nil (not an
	// error) so the id's existence isn't disclosed. See
	// docs/superpowers/specs/2026-09-09-perspective-privacy-design.md.
	if perspective.Privacy == domain.PrivacyPrivate {
		viewer, ok := auth.ForContext(ctx)
		if !ok || viewer.ID != perspective.UserID {
			return nil, nil
		}
	}

	return perspectiveDomainToModel(perspective), nil
```

- [ ] **Step 4: Set `ViewerID` in `Perspectives`**

In the `Perspectives` resolver, right after `params := domain.PerspectiveListParams{...}` is built (before the `ListPerspectives` call):

```go
	if viewer, ok := auth.ForContext(ctx); ok {
		params.ViewerID = &viewer.ID
	}
```

- [ ] **Step 5: Run the visibility tests, verify pass**

Run: `go test ./test/resolvers/ -run TestPerspectiveByID_Visibility -v`
Expected: PASS.

- [ ] **Step 6: Run the whole resolver + graphql test packages**

Run: `go test ./test/resolvers/ ./test/graphql/`
Expected: PASS. If a pre-existing test called `perspectives`/`perspectiveByID` for a *private* row across users and asserted it came back, that assertion was testing the bug — update it to expect the new owner-only behaviour and note it in the commit body.

- [ ] **Step 7: Commit**

```bash
git add backend/internal/adapters/graphql/resolvers/perspective.resolvers.go backend/test/resolvers/
git commit -m "feat(perspective-privacy): resolvers pass viewer and hide others' private perspectives"
```

---

## Task 6: Benchmark — WHERE vs UNION for the list predicate

**Files:**
- Modify: `docs/superpowers/plans/2026-09-09-perspective-privacy-plan.md` (fill the Result block below)
- Possibly Modify: `backend/internal/adapters/repositories/postgres/gorm_perspective_repository.go` + `helpers.go` (only if UNION wins)

**Interfaces:**
- Consumes: the WHERE-shape query from Task 4.
- Produces: a documented decision and, if it changes, the repository `List` implementation.

This is a measurement task, not a code-first task. Run it against the **live Sevalla PG17** database via the `db-perspectize-queries` skill (it holds the connection string and schema; `psql` binary at `/opt/homebrew/opt/libpq/bin/psql`). Do **not** use the local docker DB — it has no representative data volume.

- [ ] **Step 1: Invoke the `db-perspectize-queries` skill** to get the connection command and confirm the `perspectives` row count and how many distinct `user_id`s exist (`SELECT count(*), count(DISTINCT user_id) FROM perspectives;`). Pick a `user_id` with a non-trivial number of rows as `:target`, and a different existing id as `:viewer`.

- [ ] **Step 2: Warm up** — run each query once, discard timing (fills cache).

- [ ] **Step 3: WHERE shape — 10 runs.** For each run capture total execution time from `EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)`:

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM perspectives
WHERE user_id = :target
  AND (privacy = 'public' OR user_id = :viewer)
ORDER BY created_at DESC, id DESC
LIMIT 10;
```

Also run the anonymous variant (drop the `OR user_id = :viewer`, so `AND privacy = 'public'`).

- [ ] **Step 4: UNION shape — 10 runs:**

```sql
EXPLAIN (ANALYZE, BUFFERS)
SELECT * FROM (
    SELECT * FROM perspectives WHERE user_id = :target AND privacy = 'public'
    UNION
    SELECT * FROM perspectives WHERE user_id = :target AND user_id = :viewer
) AS perspectives
ORDER BY created_at DESC, id DESC
LIMIT 10;
```

(The second arm collapses to empty unless `:target == :viewer`; that mirrors what the paginator-wrapped `Table("(? UNION ?) AS perspectives", subPublic, subOwn)` would generate for a cross-user view. Also test `:target == :viewer` — the owner-viewing-self case does **not** hit this predicate in code, but measure it for completeness.)

- [ ] **Step 5: Fill in the Result block** (median and p95 of the 10 execution times, plus the plan node types — Seq Scan / Index Scan / Bitmap):

```
### Benchmark Result — run 2026-09-10

The live `perspectives` table has only 25 rows / 3 users / 0 private — too small to
differentiate. Benchmarked instead on a session-local TEMP table `persp_bench`
(200,000 rows, 800 users, ~5% private, columns id/user_id/privacy/created_at) on the
same Sevalla PG17 server. 10 runs each, `EXPLAIN (ANALYZE, BUFFERS)`, cross-user
viewer (:target=7 ~234 rows, :viewer=42).

NO index (matches the table today — only PK on id):
  WHERE  median  8.86 ms · p95 32.3 ms · plan: Seq Scan (200k) → top-N heapsort → Limit
  UNION  median  9.32 ms · p95 37.7 ms · plan: Append(2 Seq Scans) → Sort → Unique → Sort → Limit
  (both dominated by the unavoidable 200k-row seq scan ≈ 8.7 ms; p95 spikes are Sevalla proxy jitter, present in both)

WITH index (user_id, created_at DESC, id DESC) — for reference, indexes are deferred:
  WHERE  median  0.024 ms · plan: Index Scan Backward + early termination at LIMIT 10
  UNION  median  0.29  ms · plan: Bitmap scans → Append → Sort → Unique → Sort → Limit (no early termination)

Decision: WHERE. It is faster on every axis (≈5% unindexed; ≈12× once an index
exists, because UNION's DISTINCT dedup forces a full materialize+sort and defeats
the ORDER BY … LIMIT early-termination an index would give WHERE). It also needs
`UNION` not `UNION ALL` for correct dedup when target==viewer, adding more cost,
and it keeps the repo on the plain GORM builder (no raw SQL, no paginator SQLRepr
changes). Bonus finding for the post-Neon index pass: a (user_id, created_at DESC,
id DESC) index takes this query to ~0.02 ms.
```

- [ ] **Step 6: Decision.**
  - If WHERE's median is within ~15% of UNION (or better): **keep WHERE** (already implemented in Task 4). Update the code comment in `List` to: `// WHERE shape chosen: benchmark 2026-09-09 showed <x>ms vs <y>ms UNION; see plan Task 6.` Commit only the doc + comment.
  - If UNION wins by a clear margin (>15% median and consistent p95): implement the UNION shape. Replace the Task 4 predicate block with a `Table("(? UNION ?) AS perspectives", subPublic, subOwn)` construction where `subPublic` / `subOwn` are `r.db.Model(&PerspectiveModel{})` sub-queries carrying the same `params.Filter` conditions; add explicit `Rule.SQLRepr` values (`"created_at"`, `"id"`) in `buildPerspectiveSortRules` for the unbound-model case (mirror `buildContentSortRules` in `helpers.go`). Re-run `go test ./internal/adapters/repositories/postgres/` and fix the Task 4 sqlmock regexes to match the UNION SQL. Keep the "false" case (no restriction) on the plain `Model()` path.

- [ ] **Step 7: Commit**

```bash
git add docs/superpowers/plans/2026-09-09-perspective-privacy-plan.md backend/internal/adapters/repositories/postgres/
git commit -m "perf(perspective-privacy): benchmark WHERE vs UNION for list predicate, choose <winner>"
```

---

## Task 7: Frontend — add the `Switch` shadcn component

**Files:**
- Create: `frontend/src/lib/components/shadcn/switch/switch.svelte`
- Create: `frontend/src/lib/components/shadcn/switch/index.ts`

**Interfaces:**
- Consumes: `bits-ui` v2 `Switch` primitive; `cn` from `$lib/utils.js` (same import the sibling `label/label.svelte` uses).
- Produces: `import { Switch } from '$lib/components/shadcn/switch';` — a component with a bindable `checked: boolean` prop and a `class` passthrough, used by Task 9.

- [ ] **Step 1: Create `switch.svelte`**

```svelte
<script lang="ts">
	import { Switch as SwitchPrimitive } from 'bits-ui';
	import { cn } from '$lib/utils.js';

	let {
		ref = $bindable(null),
		checked = $bindable(false),
		class: className,
		...restProps
	}: SwitchPrimitive.RootProps = $props();
</script>

<SwitchPrimitive.Root
	bind:ref
	bind:checked
	data-slot="switch"
	class={cn(
		'peer focus-visible:ring-ring data-[state=checked]:bg-primary data-[state=unchecked]:bg-input inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-50',
		className,
	)}
	{...restProps}
>
	<SwitchPrimitive.Thumb
		class={cn(
			'bg-background pointer-events-none block size-4 rounded-full shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0',
		)}
	/>
</SwitchPrimitive.Root>
```

- [ ] **Step 2: Create `index.ts`**

```ts
import Root from './switch.svelte';

export {
	Root,
	//
	Root as Switch,
};
```

- [ ] **Step 3: Type-check**

Run: `pnpm run check` (from `frontend/`)
Expected: no new errors for the switch files. If `SwitchPrimitive.RootProps` isn't exported under that name in the installed `bits-ui`, run `grep -r "RootProps\|SwitchRootProps" node_modules/bits-ui/dist/bits/switch/` and use the real type name.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/lib/components/shadcn/switch/
git commit -m "feat(perspective-privacy): add shadcn switch component"
```

---

## Task 8: Frontend — thread `privacy` through the mutation hooks

**Files:**
- Modify: `frontend/src/lib/queries/perspectives/useCreatePerspective.ts`
- Modify: `frontend/src/lib/queries/perspectives/useUpdatePerspective.ts`
- Test: the existing hook test files. Run `ls frontend/tests/unit/ | grep -i perspective` and `ls frontend/tests/components/ | grep -i erspective` to find them; match those filenames. If a `useCreatePerspective`/`useUpdatePerspective` unit test doesn't exist, add `frontend/tests/unit/hooks-useCreatePerspective.test.ts` / `-useUpdatePerspective.test.ts` following the structure of a sibling hook test (e.g. the `useAddVideo` or `useUpdatePerspective` test already in the repo).

**Interfaces:**
- Consumes: nothing new.
- Produces:
  - `CreatePerspectiveInput` and `UpdatePerspectiveInput` gain `privacy?: 'PUBLIC' | 'PRIVATE'`.
  - Both hooks send `input.privacy` to GraphQL unchanged (the enum value).
  - `optimisticPerspective` sets `privacy: input.privacy ?? 'PUBLIC'`; `applyEdit` sets `privacy: input.privacy ?? p.privacy`.
  - Task 9 (popover) passes `privacy` in the mutate call.

- [ ] **Step 1: Write the failing tests**

`useCreatePerspective` test — assert the mutation sends `privacy` and the optimistic row carries it. Follow the sibling test's mocking of `graphqlRequest`. Core assertions:

```ts
it('forwards privacy to the mutation and the optimistic row', async () => {
	// arrange: mock graphqlRequest, render the hook with a QueryClient, seed an empty list
	await mutateAsync({ userID: 42, quality: 9000, privacy: 'PRIVATE' });
	expect(graphqlRequestMock).toHaveBeenCalledWith(
		expect.anything(),
		{ input: expect.objectContaining({ privacy: 'PRIVATE' }) },
	);
	// and the optimistic row inserted in onMutate has privacy: 'PRIVATE'
});

it('defaults the optimistic row to PUBLIC when privacy is omitted', () => {
	// call optimisticPerspective({ userID: 42 }, 'tmp') if it's exported, else assert via the cache after onMutate
});
```

`useUpdatePerspective` test:

```ts
it('forwards privacy and patches the cached row via applyEdit', async () => {
	// seed a cached list row id '5' with privacy 'PUBLIC'
	await mutateAsync({ id: 5, privacy: 'PRIVATE' });
	expect(graphqlRequestMock).toHaveBeenCalledWith(
		expect.anything(),
		{ input: expect.objectContaining({ id: 5, privacy: 'PRIVATE' }) },
	);
	// cached row '5' now has privacy 'PRIVATE' after onMutate
});
```

- [ ] **Step 2: Run, verify failure**

Run: `pnpm run test:run -- perspective` (from `frontend/`; narrows to perspective-named test files)
Expected: the new cases FAIL — `privacy` is `undefined` in the payload and the optimistic row is hardcoded `'public'`.

- [ ] **Step 3: Edit `useCreatePerspective.ts`**

- Add to `CreatePerspectiveInput`:
  ```ts
  	privacy?: 'PUBLIC' | 'PRIVATE';
  ```
- In `optimisticPerspective`, change `privacy: 'public',` to:
  ```ts
  		privacy: input.privacy ?? 'PUBLIC',
  ```
- No change needed in `mutationFn` — it already spreads the whole `input` into `{ input }`, so `privacy` rides along once it's on the type.

- [ ] **Step 4: Edit `useUpdatePerspective.ts`**

- Add to `UpdatePerspectiveInput`:
  ```ts
  	privacy?: 'PUBLIC' | 'PRIVATE';
  ```
- In `applyEdit`, add to the returned object:
  ```ts
  		privacy: input.privacy ?? p.privacy,
  ```
- `mutationFn` already forwards the whole `input`.

- [ ] **Step 5: Run, verify pass**

Run: `pnpm run test:run -- perspective`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/queries/perspectives/useCreatePerspective.ts frontend/src/lib/queries/perspectives/useUpdatePerspective.ts frontend/tests/
git commit -m "feat(perspective-privacy): thread privacy through create/update perspective hooks"
```

---

## Task 9: Frontend — the "Private" toggle in `PerspectivePopover`

**Files:**
- Modify: `frontend/src/lib/components/PerspectivePopover.svelte`
- Test: `frontend/tests/components/PerspectivePopover.test.ts`

**Interfaces:**
- Consumes: `Switch` from Task 7; `privacy` on the hook inputs from Task 8.
- Produces: the form renders a "Private" switch (default off); `handleSubmit` sends `privacy: isPrivate ? 'PRIVATE' : 'PUBLIC'` on both the create and update path; in edit mode the switch initialises from `existingPerspective.privacy`.

- [ ] **Step 1: Write the failing tests**

Add to `PerspectivePopover.test.ts` (it already mocks the two hooks and captures `mockCreateMutate` / `mockUpdateMutate`):

```ts
it('submits privacy PUBLIC by default', async () => {
	renderPopover();
	// fill one field so the "at least one field" guard passes
	// (reuse whatever helper the sibling "submits" tests use to set a rating)
	await fillOneRating();
	await fireEvent.click(screen.getByRole('button', { name: /save perspective/i }));
	expect(mocks.mockCreateMutate).toHaveBeenCalledWith(
		expect.objectContaining({ privacy: 'PUBLIC' }),
		expect.anything(),
	);
});

it('submits privacy PRIVATE when the toggle is on', async () => {
	renderPopover();
	await fillOneRating();
	await fireEvent.click(screen.getByRole('switch', { name: /private/i }));
	await fireEvent.click(screen.getByRole('button', { name: /save perspective/i }));
	expect(mocks.mockCreateMutate).toHaveBeenCalledWith(
		expect.objectContaining({ privacy: 'PRIVATE' }),
		expect.anything(),
	);
});

it('initialises the toggle from an existing private perspective in edit mode', async () => {
	renderPopover({ existingPerspective: { id: '5', privacy: 'PRIVATE', quality: 9000 /* + other PerspectiveItem fields as null */ } });
	await tick();
	expect(screen.getByRole('switch', { name: /private/i })).toBeChecked();
});
```

Match the existing tests' style for setting a rating value and for the `existingPerspective` shape (the file already has an edit-mode render helper).

- [ ] **Step 2: Run, verify failure**

Run: `pnpm run test:run -- PerspectivePopover` (from `frontend/`)
Expected: FAIL — no `switch` role in the DOM, `privacy` absent from the mutate payload.

- [ ] **Step 3: Add the state + import**

In `<script>`:

```ts
	import { Switch } from '$lib/components/shadcn/switch';
	import { Label } from '$lib/components/shadcn/label';
```

Add a state rune near the other field state:

```ts
	let isPrivate = $state(false);
```

In the existing `$effect` that resets state from `existingPerspective` (the block starting `quality = existingPerspective?.quality ?? null;`), add:

```ts
		isPrivate = String(existingPerspective?.privacy ?? '').toUpperCase() === 'PRIVATE';
```

- [ ] **Step 4: Render the toggle**

In the template, inside the scrollable content `<div class="flex-1 min-h-0 overflow-y-auto ...">`, immediately after the `<AddFieldSearch ... />` line:

```svelte
			<div class="flex items-center justify-between rounded-md border border-border px-3 py-2">
				<div class="flex flex-col">
					<Label for="perspective-private">Private</Label>
					<span class="text-xs text-muted-foreground">Only you can see private perspectives</span>
				</div>
				<Switch id="perspective-private" bind:checked={isPrivate} aria-label="Private" />
			</div>
```

- [ ] **Step 5: Include `privacy` in both mutate calls**

In `handleSubmit`, add `privacy: isPrivate ? 'PRIVATE' : 'PUBLIC',` to **both** the `updateMutation.mutate({ ... })` object and the `createMutation.mutate({ ... })` object. Do not gate it behind the "at least one field" check — that check stays exactly as is (privacy alone is not content).

- [ ] **Step 6: Run, verify pass**

Run: `pnpm run test:run -- PerspectivePopover`
Expected: PASS.

- [ ] **Step 7: Type-check + full frontend suite**

Run: `pnpm run check` (from `frontend/`)
Run: `pnpm run test:run` (from `frontend/`)
Expected: no new type errors; all tests pass.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/components/PerspectivePopover.svelte frontend/tests/components/PerspectivePopover.test.ts
git commit -m "feat(perspective-privacy): Private toggle in the add/edit perspective form"
```

---

## Task 10: Full verification + PR

**Files:** none (verification + PR only).

- [ ] **Step 1: Backend build**

Run: `go build ./...` (from `backend/`)
Expected: zero errors.

- [ ] **Step 2: Backend tests**

Run: `go test ./...` (from `backend/`)
Expected: all pass. Capture the summary line.

- [ ] **Step 3: Frontend tests**

Run: `pnpm run test:run` (from `frontend/`)
Expected: all pass. Capture the summary.

- [ ] **Step 4: Stale-reference grep**

Run: `grep -rn "RestrictToPublicOrOwner\|ViewerID" backend/ --include=*.go`
Expected: only the domain struct, service, repo, resolver, and their tests — no stragglers, no TODOs.

- [ ] **Step 5: Session reflection** — run the `/revise-claude-md` command (required before `gh pr create` by the `require-session-reflection-before-pr.sh` hook; auto-advance to PR creation if no learnings surface, per user preference). Then create the PR with `gh api` (not `gh pr create`).

- [ ] **Step 6: Push**

```bash
git push -u origin feature/perspective-privacy
```

- [ ] **Step 7: Open the PR** with the `feature` template (`.github/PULL_REQUEST_TEMPLATE/feature.md` — Feature Description, Technical Changes, Demo, Test Plan). `feat` type. No `Closes #N` (no pre-existing issue). Fill the Demo table with `sv-` screenshots only if a local session captured them; otherwise state that browser verification is deferred to a local session and headless checks (build + both test suites) are green. Create via:

```bash
gh api repos/CodeWarrior-debug/perspectize/pulls -f title="feat: perspective privacy (public/private)" -F body=@<path-to-body-file> -f head="feature/perspective-privacy" -f base="main"
```

Body ends with the attribution block:
```
🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01XmKJ8Z4yPNN5KiaYBUZpnK
```

---

## Self-Review

**Spec coverage:**
- Migration hardening (`NOT NULL`/default/`CHECK`, no index) → Task 1 ✓
- `PRIVATE` = owner-only in list results, anonymous + cross-user → Tasks 2–4 ✓
- `perspectiveByID` returns `nil` (not error) for non-owner private → Task 5 ✓
- `perspectives` query stays open, no `@auth` → honoured (no schema change; Global Constraints) ✓
- Benchmark WHERE vs UNION, 10 runs, documented, choose accordingly → Task 6 ✓
- shadcn `switch` added → Task 7 ✓
- Toggle in `PerspectivePopover` add **and** edit, default off, not gated by the "one field" check → Task 9 ✓
- `privacy` through `useCreatePerspective` (stop hardcoding) + `useUpdatePerspective` (`applyEdit`) → Task 8 ✓
- No public-browsing UI, no share/copy-link, no in-grid toggle, no lock indicator → excluded (Deferred scope) ✓
- Verification + PR flow (reflection hook, `gh api`) → Task 10 ✓

**Placeholder scan:** Task 5 leaves the exact resolver-test harness to be matched to siblings (the repo's resolver tests vary between stub-service and gorm-backed; the plan says which to mirror and what to assert — this is "follow the existing pattern", not an unfilled blank). Task 6's Result block is intentionally filled during execution (it's a measurement). Task 8/9 reference "the sibling test's helper" for rating input — the popover test file already contains such helpers; naming them here would guess at private detail. No `TBD`/`handle edge cases`/`add validation` placeholders.

**Type consistency:** `RestrictToPublicOrOwner` (bool) and `ViewerID` (*int) — same names in domain (Task 2), service (Task 3), repo (Task 4), grep (Task 10). `privacy?: 'PUBLIC' | 'PRIVATE'` — identical in both hook input types (Task 8) and the popover payload (Task 9). `privacyToDBValue(domain.PrivacyPublic)` — Task 4, with a fallback instruction to grep the real helper name. `Switch` export name — Task 7 `index.ts` and Task 9 import agree.
