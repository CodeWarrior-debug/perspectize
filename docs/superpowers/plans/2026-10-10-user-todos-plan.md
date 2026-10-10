⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed

# User Todos ("Plan") Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user keep a plan of todos about content (or free-text items): action, priority, status, % complete, dates, comments, privacy, and one named list with an order, on a new **Plan** page.

**Architecture:** Three new tables (`todo_actions`, `user_todo_lists`, `user_todos`) behind the usual hexagonal stack: domain → ports → GORM repositories (actions wrapped in a cached repository) → `UserTodoService` → gqlgen resolvers with dataloaders. Frontend adds a `userTodos` query domain, a toast helper, and a `/plan` route with an AG Grid table.

**Tech Stack:** Go (gqlgen, GORM, gorm-cursor-paginator, bluemonday, testify, sqlmock, `internal/perf/querycount`), PostgreSQL 17, SvelteKit 5 (runes), TanStack Query, AG Grid (`ag-grid-svelte5`), svelte-sonner, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-08-user-todos-design.md`. Read it in full first. All its decisions are settled (including user-entered actions as `todo_actions` rows and `user_id` as the owner column); do not reopen them.

## Global Constraints

- **No `&&`-chained shell commands.** One command per Bash call, for every subagent.
- **Never run `make migrate-*` or `migrate ... up/down`.** `DATABASE_URL` is the shared Neon DB. Migrations are written only. Integration tests use a local throwaway Postgres (`backend/CLAUDE.md` → Testing).
- **Never edit any `CLAUDE.md`.** Collect proposed lines (toast helper, any new gotcha) for `/revise-claude-md` at PR time.
- `.env*` (except `.env.example`) is unreadable; no new env vars are needed.
- **Enums:** Go/GraphQL UPPERCASE, DB lowercase with `CHECK`; bind in `gqlgen.yml`, never switch statements. Reuse `domain.Privacy`, `privacyToDBValue`, `privacyFromDBValue`.
- **Priority** is the rating scale: `valid_integer_range` in SQL, `domain.ValidateRating` / `ErrInvalidRating` in Go, `lib/utils/ratings.ts` + `RatingInput.svelte` in the UI. No new scale code.
- **Every FK blocks** (explicit `ON DELETE RESTRICT`). No cascades, no `SET NULL`. Services clear or reassign references first.
- **Ownership:** `auth.RequireAuth(ctx)` in the resolver → actor id into the service → owner-scoped `UPDATE`/`DELETE` WHERE. No `@owner`. Use `clause.Returning{}`; never `Save()` behind a scoped WHERE; read the row only on a zero-row miss to split not-found from forbidden.
- **Privacy reads:** list = public OR owner; by-id = `null` for someone else's private row (not an error).
- **Query budget:** every DB path gets a `querycount` assertion; per-parent fields go through dataloaders; `test/roundtrips` gets a count for each new operation.
- After `make graphql-gen`, diff then delete the stray `resolvers/schema.resolvers.go`; copy new stubs into `user_todo.resolvers.go`.
- Frontend: theme tokens only (no raw hex/rgb); Svelte 5 runes only; hooks hide cache wiring; keys from `queryKeys`; new hooks are `vi.mock`ed in component tests.
- Branch: `feature/user-todos` from updated `main`. Conventional commits, one task per commit.

## Review Focus

1. **Privacy leaks:** another user's private todo or list never appears in `userTodos`, `userTodoLists` or `userTodoByID`, for anonymous and signed-in callers.
2. **Owner guards:** update/delete/reorder/list-assign by a non-owner returns forbidden (or not-found for a private row) and changes nothing; a todo can't be put in another user's list.
3. **Deletes respect the FK gate:** deleting a list unlists its todos first; deleting a user reassigns todos, lists and custom actions to `[deleted]`; nothing cascades.
4. **Open-todo uniqueness:** a second open todo for the same owner+content+action fails with `ErrAlreadyExists`; a done one doesn't block a new `revisit`.
5. **Done ↔ 100% is never silent:** the server stores exactly what it is sent; only the toast's Yes sends the paired field.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/migrations/000031_add_user_todos.{up,down}.sql` | 3 tables, presets seed, CHECKs, FKs, indexes (number provisional) |
| `backend/internal/core/domain/user_todo.go` | `UserTodo`, `UserTodoList`, `TodoAction`, `UserTodoStatus`, inputs, list params |
| `backend/internal/core/domain/errors.go` | `ErrInvalidPercent` |
| `backend/internal/core/ports/repositories/user_todo_repository.go` | `UserTodoRepository`, `UserTodoListRepository` |
| `backend/internal/core/ports/repositories/todo_action_repository.go` | `TodoActionRepository` |
| `backend/internal/core/ports/services/user_todo_service.go` | service port |
| `backend/internal/adapters/repositories/postgres/gorm_user_todo_repository.go` | todos + lists |
| `backend/internal/adapters/repositories/postgres/gorm_todo_action_repository.go` | actions |
| `backend/internal/adapters/repositories/postgres/{gorm_models,gorm_mappers,helpers}.go` | models, mappers, status converter, sort whitelist |
| `backend/internal/adapters/repositories/cached/todo_action_repository.go` | id-keyed TTL cache |
| `backend/internal/core/services/user_todo_service.go` | rules |
| `backend/internal/core/services/user_service.go` | `Delete` reassigns todos, lists, actions |
| `backend/schema.graphql`, `backend/gqlgen.yml` | types, enums, queries, mutations, bindings |
| `backend/internal/adapters/graphql/resolvers/user_todo.resolvers.go` | resolvers |
| `backend/internal/adapters/graphql/resolvers/helpers.go` | model ↔ domain mapping |
| `backend/internal/adapters/graphql/dataloader/dataloader.go` | `TodoActionByID`, `UserTodoListByID` |
| `backend/cmd/server/main.go`, `backend/internal/server/api.go` | wiring |
| `frontend/src/lib/queries/keys.ts`, `frontend/src/lib/queries/userTodos/*` | gql defs + hooks |
| `frontend/src/lib/utils/toast.ts` | `ACTION_TOAST_DURATION_MS`, `toastWithAction` |
| `frontend/src/lib/utils/plan-grid-config.ts` | Plan grid column metadata |
| `frontend/src/routes/plan/+page.svelte`, `frontend/src/lib/components/plan/*` | page, grid, dialog, action picker, list switcher |
| `frontend/src/lib/components/Header.svelte` | `Plan` nav link |

---

### Task 1: Migration

**Files:** create `backend/migrations/000031_add_user_todos.up.sql`, `000031_add_user_todos.down.sql`.

- [ ] Confirm the next free number: `ls backend/migrations` (last is `000029_add_hot_query_indexes` as of 2026-10-10). Numbers stay provisional until merge.
- [ ] `todo_actions`: columns per spec; `user_id` FK `users(id)` `ON DELETE RESTRICT`; `UNIQUE NULLS NOT DISTINCT (user_id, key)`; `updated_at` trigger (`update_updated_at`, as in `000004`).
- [ ] Seed the 10 presets with `INSERT … ON CONFLICT DO NOTHING` (idempotent), keys/labels/descriptions/sequence exactly as the spec table.
- [ ] `user_todo_lists`: per spec; `privacy` `NOT NULL DEFAULT 'public'` + `CHECK`; `UNIQUE (user_id, name)`; trigger.
- [ ] `user_todos`: per spec; `priority valid_integer_range`; status/privacy/percent `CHECK`s; `CHECK (content_id IS NOT NULL OR name IS NOT NULL)`; `CHECK ((list_id IS NULL) = (list_position IS NULL))`; all FKs `ON DELETE RESTRICT` with named constraints (`user_todos_user_fk`, `user_todos_content_fk`, `user_todos_action_fk`, `user_todos_list_fk`); partial unique index on open todos; indexes `(user_id, status)` and `(list_id, list_position)`; trigger.
- [ ] `down`: drop `user_todos`, `user_todo_lists`, `todo_actions` (`IF EXISTS`), in that order.
- [ ] Validate the SQL against a **local** Postgres only (`pg_ctlcluster 16 main start`, a throwaway DB): up, down, up again. Never Neon.
- [ ] Commit `feat(db): add user todos tables`.

### Task 2: Domain and ports

**Files:** `domain/user_todo.go`, `domain/errors.go`, the three port files.

- [ ] `UserTodoStatus` consts `NOT_STARTED`, `IN_PROGRESS`, `DONE`, `DROPPED`; `UserTodoSortBy` (`PRIORITY`, `DUE_DATE`, `CREATED_AT`, `UPDATED_AT`, `LIST_POSITION`).
- [ ] Structs `TodoAction`, `UserTodoList`, `UserTodo` (dates as `*time.Time` date-only; `Comments *string`; `Privacy Privacy`; `UserID int`).
- [ ] Inputs `CreateUserTodoInput`, `UpdateUserTodoInput` (pointer fields, like `UpdatePerspectiveInput`), list inputs, `UserTodoListParams` with `ViewerID *int`, `RestrictToPublicOrOwner bool`, `Filter`.
- [ ] `ErrInvalidPercent`.
- [ ] Ports: repository methods sized for the service (list page, `GetByID`, `GetByIDs` for loaders, create, owner-scoped update/delete, `AssignToList`, `UnlistAll(listID, ownerID)`, `Reorder`, `ReassignByUser`); action repo `GetByIDs`, `ListForUser`, `Create`, `ReassignByUser`. No pass-through methods the service won't add rules to.
- [ ] `go build ./...`; commit `feat(domain): user todo models and ports`.

### Task 3: Postgres repositories (TDD)

**Files:** `gorm_user_todo_repository.go`, `gorm_todo_action_repository.go`, `gorm_models.go`, `gorm_mappers.go`, `helpers.go`, matching `_test.go` files.

- [ ] Write sqlmock tests first (pattern: `gorm_perspective_repository_test.go`): list page with and without `includeTotalCount`; privacy predicate (`privacy = 'public' OR user_id = ?`) when `RestrictToPublicOrOwner`; `GetByIDs` uses `= ANY(CAST(? AS bigint[]))`; owner-scoped `UPDATE … RETURNING`; zero-row update → follow-up read splits `ErrNotFound` / `ErrForbidden`; unique-violation on the open-todo index → `ErrAlreadyExists`; `UnlistAll` + delete for lists; `Reorder` as one `UPDATE … FROM (VALUES …)`; `ReassignByUser` for todos, lists, actions.
- [ ] `querycount` budgets: list page 1 (+1 with total); `GetByIDs` 1 for 1 and for 50 ids, 0 for none; single writes 1.
- [ ] Implement with `gorm-cursor-paginator` (check both `err` and `pageResult.Error`), status converter (lowercase ↔ UPPERCASE) and sort whitelist in `helpers.go`.
- [ ] `go test ./internal/adapters/repositories/...`; `gofmt -l .` empty; commit.

### Task 4: Cached action repository (TDD)

**Files:** `cached/todo_action_repository.go`, `cached/todo_action_repository_test.go`.

- [ ] Copy the shape and tests of `cached/category_repository.go`: TTL (`DefaultTodoActionTTL`), injected clock, generation counter, `GetByIDs` reads only missing ids in one query, `Create` refreshes its entry from the returned row. `ListForUser` passes through (per-user, small) unless measurement says otherwise.
- [ ] Tests: hit, miss, expiry, write-refresh, concurrent write during read (generation).
- [ ] Commit.

### Task 5: Service and user-delete reassignment (TDD)

**Files:** `services/user_todo_service.go`, `services/user_service.go`, `test/services/user_todo_service_test.go`, `test/services/user_service_test.go`.

- [ ] Table-driven tests with hand-written mocks (update **every** mock of a changed port under `test/`):
  - priority out of range → `ErrInvalidRating`; percent out of range → `ErrInvalidPercent`; neither content nor name → `ErrInvalidInput`.
  - privacy defaults to `PUBLIC`; comments sanitized with `sanitizeReview` (script tag stripped).
  - status → `IN_PROGRESS` fills an empty `start_date`; no automatic done/100 pairing.
  - assigning to another user's list → `ErrForbidden`; assigning appends at `max(position)+1`.
  - `DeleteList` calls `UnlistAll` before delete.
  - custom action key trimmed + lowercased; duplicate returns the existing row.
  - list/by-id pass `ViewerID` and `RestrictToPublicOrOwner`.
- [ ] `UserService.Delete`: after content and perspectives, call `ReassignByUser` on the todo, list and action repositories; extend its tests (order and error propagation).
- [ ] Implement; `go test ./...`; commit.

### Task 6: GraphQL, dataloaders, wiring (TDD)

**Files:** `schema.graphql`, `gqlgen.yml`, `resolvers/user_todo.resolvers.go`, `resolvers/helpers.go`, `dataloader/dataloader.go`, `cmd/server/main.go`, `internal/server/api.go`, `test/resolvers/…`, `test/roundtrips/user_todo_test.go`.

- [ ] Schema exactly as the spec (types, enums, `PaginatedUserTodos`, `UserTodoFilter` with `IntID`, queries without `@auth` except `todoActions`, mutations with `@auth`).
- [ ] `gqlgen.yml`: bind `UserTodoStatus`, `UserTodoSortBy`; `resolver: true` for `UserTodo.user/content/action/list` and `UserTodoList.user`.
- [ ] `make graphql-gen`; diff and delete stray `schema.resolvers.go`; move stubs.
- [ ] Dataloaders: add `TodoActionByID`, `UserTodoListByID` to `Loaders`/`NewLoaders`/`Services`; reuse `UserByID`, `ContentByID`. Loader tests: N loads → 1 call.
- [ ] Mapping lives once in `helpers.go`.
- [ ] Wire: `cached.NewTodoActionRepository(postgres.NewGormTodoActionRepository(db), cached.DefaultTodoActionTTL)` in `main.go`; service into `server.Deps` and `NewResolver`. Run `go vet -tags perf ./internal/perf/...` after the signature change.
- [ ] Resolver tests: anonymous/other/owner for list and by-id; non-owner mutations; `RequireAuth` on every mutation.
- [ ] Round trips (`test/roundtrips`, real Postgres): pin counts for `userTodos` selecting owner, content, action, list; and for `createUserTodo`.
- [ ] `go build ./...`, `gofmt -l .`, `go test ./...`; commit.

### Task 7: Frontend query domain (TDD)

**Files:** `lib/queries/keys.ts`, `lib/queries/userTodos/{index.ts,useUserTodos.ts,useTodoActions.ts,useUserTodoLists.ts,useCreateUserTodo.ts,useUpdateUserTodo.ts,useDeleteUserTodo.ts,useCreateTodoAction.ts,useReorderUserTodoList.ts,useCreateUserTodoList.ts,useUpdateUserTodoList.ts,useDeleteUserTodoList.ts}`, `tests/unit/hooks-userTodos*.test.ts`.

- [ ] `queryKeys.userTodos`: `all`, `lists`, `list(filters)` mirroring every variable, `detail(id)`, `actions`, `todoLists(ownerId)`.
- [ ] `staleTime`: todos/lists minutes; actions long, evicted by `useCreateTodoAction`.
- [ ] Mutations evict exactly the affected list/detail keys; optimistic patch only same-shape caches with rollback.
- [ ] Cache-contract tests with `tests/helpers/queryBudget.ts`: 3 consumers → 1 fetch; second mount within `staleTime` → 0; `hashKey` changes per variable; `invalidationOutcome` invalidated vs untouched.
- [ ] `pnpm run test:run`; commit.

### Task 8: Toast helper (TDD)

**Files:** `lib/utils/toast.ts`, `tests/unit/toast.test.ts`.

- [ ] `ACTION_TOAST_DURATION_MS = 4000`; `toastWithAction(message, { label, onClick })` calls svelte-sonner with that duration. The `<Toaster duration={2000}>` default stays.
- [ ] Test the duration and that the action fires. Note a proposed `frontend/CLAUDE.md` line for `/revise-claude-md`.
- [ ] Commit.

### Task 9: Plan page

**Files:** `routes/plan/+page.svelte`, `lib/components/plan/{PlanTable.svelte,TodoDialog.svelte,ActionPicker.svelte,ListSwitcher.svelte}`, `lib/utils/plan-grid-config.ts`, `Header.svelte`, tests under `tests/components/` and `tests/unit/`.

- [ ] Nav: add `{ href: '/plan', label: 'Plan' }` to `navLinks`.
- [ ] `plan-grid-config.ts`: one metadata array for the columns in the spec, with responsive tiers; unit-test it (pattern: `grid-config.test.ts`). Follow `docs/AG_GRID.md` and `ADDING_AG_GRID_COLUMN.md`; keep `hide` and the responsive `$effect` in sync; mobile card fallback.
- [ ] Priority cell via `ratingToDisplay`; comments preview via `SafeHtml.svelte`; Add perspective cell opens `PerspectivePopover` (lazy import as `ActivityTable.svelte` does), disabled with a tooltip on name-only rows.
- [ ] `TodoDialog`: `RatingInput` for priority; comments editor reused from `PerspectiveEditor.svelte` (extract a shared component if it isn't standalone); dates; privacy; list.
- [ ] `ActionPicker`: combobox ordered by `typicalSequence` then label; each item's `description` as a hover tooltip; typed unknown value offers "Add “…”" → `useCreateTodoAction`.
- [ ] `ListSwitcher`: all / one list / unlisted; with one list, sort by position and drag to reorder → `useReorderUserTodoList`.
- [ ] Done ↔ 100% prompts via `toastWithAction`; Yes sends the paired field (and `endDate` if empty).
- [ ] Component tests (hooks `vi.mock`ed): picker order, tooltip text, add-new; both prompts (Yes applies, dismiss doesn't); disabled Add perspective on name-only rows.
- [ ] `pnpm run check`; `pnpm run test:run`; commit.

### Task 10: Entry points

**Files:** `ActivityTable.svelte` (or its row actions), `ActivityDetailsModal.svelte`, `PerspectivePopover.svelte` save path, tests.

- [ ] "Add to plan" on Activity rows and in the details modal, action defaulting to `consume`.
- [ ] After a perspective save on content with an open `consume`/`review` todo: `toastWithAction('Mark this todo done?', …)`.
- [ ] Update component tests (mock the new hooks); commit.

### Task 11: Verify and open the PR

- [ ] Backend: `go build ./...`, `gofmt -l .` (empty), `go test ./...`, `go vet -tags perf ./internal/perf/...`; integration tests against local Postgres. Frontend: `pnpm install` (cloud), `pnpm run check`, `pnpm run test:run`, `pnpm run test:browser --browser.headless=true` if grid behavior changed.
- [ ] Stale-reference grep if anything was renamed.
- [ ] `/revise-claude-md`; PR from `feature/user-todos` with the `feature.md` template, QA Acceptance Criteria rows (including privacy and non-owner negatives), `needs-demo-video` from a cloud session; the workflow adds `migrations-unapplied`. State that the migration needs a manual `migrate up` per environment.
