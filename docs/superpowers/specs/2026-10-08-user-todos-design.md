⚠️ Written without superpowers loaded — a superpowers-enabled session should review via writing-plans before this is executed

# User Todos ("Plan") — Design

**Date:** 2026-10-08 (v3, 2026-10-10: rewritten after owner review on PR #572)
**Branch:** `chore/user-todos-spec` (spec only; implementation gets its own `feature/` branch)
**Type:** feature
**Tracking issue:** none for this spec. Follow-up: #571 (plan columns on the Activity table)
**Status:** draft, owner decisions below are settled; the few open ones are under **Decisions to confirm**

## Problem

A user can record what they think about content (a perspective) but not what they intend to do with it: watch this movie, revisit that video, research a claim, share it. There is nowhere to keep that plan, order it, or track progress on it.

## Goals

1. A user keeps a plan of todos, each about a piece of content (or, when the content isn't in Perspectize, a free-text name).
2. Each todo has an **action** (consume, research, share, …), a **priority** on the app's rating scale, a **status**, **% complete**, optional dates and rich-text comments.
3. Todos can be grouped into **named lists**, ordered within a list.
4. Todos follow the codebase **privacy model** (`PUBLIC` / `PRIVATE`, default `PUBLIC`).
5. The data model leaves room for **assignees** (other users working a todo) without a rename later.
6. A new top-level **Plan** page shows and edits the user's todos.

## Non-goals

- Assignees themselves (only the naming and the visibility rule are designed for them; see **Future: assignees**).
- Plan columns on the Activity table: #571.
- A todo in more than one list (one list per todo until asked otherwise).
- Consumption history / analytics (counts, timelines, streaks), list sharing, OAuth import.

## Codebase conventions this follows

| Convention | Where it comes from | Applied here |
|---|---|---|
| Hexagonal layers, one file per domain | `backend/CLAUDE.md` → Architecture, Deep Modules, Adding a New Feature | `domain/user_todo.go`, `ports/repositories/user_todo_repository.go`, `services/user_todo_service.go`, `postgres/gorm_user_todo_repository.go`, `resolvers/user_todo.resolvers.go` |
| GORM separate-model pattern | `backend/CLAUDE.md` → ORM | GORM structs in `gorm_models.go`, mappers in `gorm_mappers.go` |
| Enums UPPERCASE in domain/GraphQL, lowercase in DB, bound in `gqlgen.yml` | `backend/CLAUDE.md` → Enum & ID Handling | `UserTodoStatus`, reuse `domain.Privacy` and `privacyToDBValue` / `privacyFromDBValue` |
| Rating scale 0–10000 | root `CLAUDE.md`; `valid_integer_range` DB domain; `domain.RatingMin/RatingMax`, `domain.ValidateRating`, `domain.ErrInvalidRating`; frontend `lib/utils/ratings.ts`, `RatingInput.svelte` | `priority` uses all of them unchanged |
| Privacy: hardened column, owner-or-public reads, `null` (not FORBIDDEN) for a hidden row | `2026-09-09-perspective-privacy-design.md`; `PerspectiveListParams.ViewerID` / `RestrictToPublicOrOwner` | same shape for todos and lists |
| Owner guards at every layer | `backend/CLAUDE.md` → Gotchas | `auth.RequireAuth(ctx)` in resolver → actor id into service → owner-scoped `UPDATE`/`DELETE` WHERE; no `@owner` |
| Writes: `clause.Returning{}`, no `Save()` behind a scoped WHERE, `SkipDefaultTransaction` | `backend/CLAUDE.md` → Query budget | all mutations |
| Query budget + dataloaders + round-trip counts | `backend/CLAUDE.md`, `.docs/QUERY_BUDGET.md` | per-parent fields via `adapters/graphql/dataloader`; counts in `test/roundtrips` |
| Cached lookup repositories | `adapters/repositories/cached/category_repository.go` | `cached.TodoActionRepository` |
| Cursor pagination, `Paginated<X> { items, pageInfo, totalCount }` | `schema.graphql` `perspectives(...)`; `gorm-cursor-paginator` (check both `err` and `pageResult.Error`) | `userTodos(...)` |
| HTML sanitized server-side and client-side | `services/sanitize.go` (`sanitizeReview`, bluemonday) and `lib/utils/sanitize.ts` (DOMPurify); render via `SafeHtml.svelte` | `comments` |
| Migrations written, never applied in dev; idempotent DDL; provisional numbers | root + `backend/CLAUDE.md` → Migrations | next free number today is `000030` |
| Frontend: one query folder per domain, keys from `queryKeys`, cache wiring inside the hook, mutations evict exactly what changed | `frontend/CLAUDE.md` → Deep Modules, Query caching | `lib/queries/userTodos/` |
| One-word verb nav labels | `Header.svelte` `navLinks` (Activity, Discover, Compare) | **Plan** at `/plan` |
| AG Grid column metadata in one place | `lib/utils/grid-config.ts` `COLUMNS` | plan grid gets its own `COLUMNS`-style metadata module |

## Data model

Migration `000030_add_user_todos` (number provisional, finalized before merge). Lowercase stored enums with `CHECK`s; `updated_at` via the existing `update_updated_at` trigger on each table.

### `todo_actions` (lookup, cached)

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` PK | |
| `key` | `text NOT NULL` | Stable machine key, lowercase (`consume`). |
| `label` | `text NOT NULL` | Shown in the picker (`Consume`). |
| `description` | `text NOT NULL DEFAULT ''` | Shown as the picker item's hover tooltip. |
| `typical_sequence` | `integer NULL` | The order a consumer typically does these in; the picker sorts by it. `NULL` for user-entered actions, which sort after the presets by label. |
| `owner_user_id` | `integer NULL` FK `users(id)` ON DELETE CASCADE | `NULL` = preset (global). Set = a user-entered action, visible only in that user's picker. |
| `created_at`, `updated_at` | `timestamptz NOT NULL DEFAULT NOW()` | |

Constraints: `UNIQUE NULLS NOT DISTINCT (owner_user_id, key)` (PG 15+) so presets can't collide and a user can't duplicate their own key.

Seeded presets (in the migration), in typical sequence:

| seq | key | Label | Tooltip (description) |
|---|---|---|---|
| 1 | `acquire` | Acquire | Buy, borrow or download it |
| 2 | `consume` | Consume | Watch, read or listen for the first time |
| 3 | `process` | Process | Digest it: take notes, summarize, extract |
| 4 | `research` | Research | Look into background, sources and related work |
| 5 | `verify` | Verify | Fact-check the claims in it |
| 6 | `compare` | Compare | Set it against other content |
| 7 | `review` | Review | Write or refine your perspective on it |
| 8 | `discuss` | Discuss | Talk it over with someone or in a thread |
| 9 | `share` | Share | Send or recommend it to someone |
| 10 | `revisit` | Revisit | Consume it again |

(`cite` and `archive` dropped per review.)

### `user_todo_lists`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` PK | |
| `owner_user_id` | `integer NOT NULL` FK `users(id)` ON DELETE CASCADE | |
| `name` | `varchar(100) NOT NULL` | |
| `description` | `text NULL` | |
| `privacy` | `text NOT NULL DEFAULT 'public'` `CHECK (privacy IN ('public','private'))` | Same rule as todos. |
| `created_at`, `updated_at` | `timestamptz` | |

`UNIQUE (owner_user_id, name)`.

### `user_todos`

| Column | Type | Notes |
|---|---|---|
| `id` | `serial` PK | |
| `owner_user_id` | `integer NOT NULL` FK `users(id)` ON DELETE CASCADE | Named *owner* (not `user_id`) so assignees can be added beside it without ambiguity. |
| `content_id` | `integer NULL` FK `content(id)` ON DELETE SET NULL | |
| `name` | `varchar(255) NULL` | Only when there is no content (not found, an idea, an outside list). Ignored in the UI when `content_id` is set. |
| `action_id` | `integer NOT NULL` FK `todo_actions(id)` | |
| `priority` | `valid_integer_range NULL` | 0–10000, the rating domain. |
| `status` | `text NOT NULL DEFAULT 'not_started'` `CHECK (status IN ('not_started','in_progress','done','dropped'))` | |
| `percent_complete` | `smallint NOT NULL DEFAULT 0` `CHECK (percent_complete BETWEEN 0 AND 100)` | |
| `start_date`, `end_date`, `due_date` | `date NULL` | All optional. `end_date` = finished; `due_date` = target. |
| `comments` | `text NULL` | Sanitized HTML. |
| `privacy` | `text NOT NULL DEFAULT 'public'` `CHECK (privacy IN ('public','private'))` | |
| `list_id` | `integer NULL` FK `user_todo_lists(id)` ON DELETE SET NULL | One list per todo. |
| `list_position` | `integer NULL` | Order within the list. |
| `created_at`, `updated_at` | `timestamptz` | |

Constraints and indexes:
- `CHECK (content_id IS NOT NULL OR name IS NOT NULL)`
- `CHECK ((list_id IS NULL) = (list_position IS NULL))`
- Partial unique `(owner_user_id, content_id, action_id) WHERE content_id IS NOT NULL AND status IN ('not_started','in_progress')`: one open todo per owner, content and action; a finished one doesn't block a later `revisit`.
- Index `(owner_user_id, status)` for the Plan page; index `(list_id, list_position)` for list order. Further indexes only with an `EXPLAIN` on real data (as the movie spec did).
- List and todo must share an owner: enforced in the service (a cross-table `CHECK` isn't possible), and in the `UPDATE` WHERE when assigning.

`down` drops the three tables (todos, lists, actions) in reverse order.

## Backend

### Domain (`core/domain/user_todo.go`)

`UserTodo`, `UserTodoList`, `TodoAction`; `UserTodoStatus` (`NOT_STARTED`, `IN_PROGRESS`, `DONE`, `DROPPED`); reuse `Privacy`. Input structs `CreateUserTodoInput` / `UpdateUserTodoInput` (pointer fields for partial update, like `UpdatePerspectiveInput`), `UserTodoListParams` with `ViewerID *int` and `RestrictToPublicOrOwner bool` mirroring `PerspectiveListParams`. Validation errors reuse `ErrInvalidRating` for priority and add `ErrInvalidPercent`.

### Ports

- `ports/repositories/user_todo_repository.go`: `UserTodoRepository` (list, get, create, update, delete, reorder list) and `UserTodoListRepository`.
- `ports/repositories/todo_action_repository.go`: `GetByIDs`, `ListForUser(ownerID)` (presets + that user's own), `Create`.

### Repositories

- `postgres/gorm_user_todo_repository.go`, `gorm_todo_action_repository.go`; status and privacy converters in `helpers.go`; sort whitelist (`PRIORITY`, `DUE_DATE`, `CREATED_AT`, `UPDATED_AT`, `LIST_POSITION`).
- `cached/todo_action_repository.go`: same shape as `cached.CategoryRepository` (id-keyed TTL cache, generation counter, `Create` refreshes its own entry from `RETURNING`). The presets never change at runtime and every row of the Plan grid resolves its action, so this saves a round trip per page load.

### Services (`services/user_todo_service.go`)

Rules that earn the service its place (no pass-throughs):
- Validate priority with `domain.ValidateRating`, percent 0–100, `content_id`-or-`name`, list ownership.
- Sanitize `comments` with the existing `sanitizeReview` policy.
- Default `privacy` to `PUBLIC` when absent.
- Status → `IN_PROGRESS` fills `start_date` if empty. The done/100% pairing is **not** automatic on the server: the client asks the user (see UI) and sends both fields when they agree.
- Moving a todo into a list appends it (`max(position)+1`); `ReorderList(listID, todoIDs, actorID)` rewrites positions 1..N in one statement, owner-scoped.
- Normalize user-entered action keys (trim, lowercase) and return the existing row on a duplicate.

### GraphQL (`schema.graphql`, resolvers in `resolvers/user_todo.resolvers.go`)

```graphql
enum UserTodoStatus { NOT_STARTED IN_PROGRESS DONE DROPPED }
enum UserTodoSortBy { PRIORITY DUE_DATE CREATED_AT UPDATED_AT LIST_POSITION }

type TodoAction { id: ID! key: String! label: String! description: String! typicalSequence: Int isPreset: Boolean! }
type UserTodoList { id: ID! owner: User! name: String! description: String privacy: Privacy! createdAt: String! updatedAt: String! }
type UserTodo {
  id: ID!  owner: User!  content: Content  name: String  action: TodoAction!
  priority: Int  status: UserTodoStatus!  percentComplete: Int!
  startDate: String  endDate: String  dueDate: String     # ISO YYYY-MM-DD
  comments: String  privacy: Privacy!  list: UserTodoList  listPosition: Int
  createdAt: String!  updatedAt: String!
}
type PaginatedUserTodos { items: [UserTodo!]! pageInfo: PageInfo! totalCount: Int }
input UserTodoFilter { ownerUserId: IntID  contentId: IntID  listId: IntID  status: [UserTodoStatus!]  actionId: IntID }
```

Queries (open, privacy-filtered like `perspectives`):
- `userTodos(first: Int = 10, after, last, before, sortBy: UserTodoSortBy = CREATED_AT, sortOrder: SortOrder = DESC, includeTotalCount: Boolean = false, filter: UserTodoFilter): PaginatedUserTodos!`
- `userTodoByID(id: ID!): UserTodo`: `null` for someone else's private todo.
- `userTodoLists(ownerUserId: IntID!): [UserTodoList!]!`: private lists only to their owner.
- `todoActions: [TodoAction!]! @auth`: presets plus the caller's own, ordered by `typical_sequence NULLS LAST, label`.

Mutations (all `@auth`, ownership in service + SQL, no `@owner`): `createUserTodo(input)`, `updateUserTodo(input)`, `deleteUserTodo(id): Boolean!`, `createTodoAction(input: { label, description })`, `createUserTodoList(input)`, `updateUserTodoList(input)`, `deleteUserTodoList(id): Boolean!`, `reorderUserTodoList(listId: IntID!, todoIds: [IntID!]!): [UserTodo!]!`.

`gqlgen.yml`: bind the enum; `resolver: true` for `UserTodo.owner`, `.content`, `.action`, `.list` and `UserTodoList.owner`, each through a dataloader (existing user and content loaders; new action and list loaders).

### Tests

- `test/services/user_todo_service_test.go` (table-driven, testify, hand-written mocks; update every mock of a changed port).
- `postgres/*_test.go` with the sqlmock harness, including query counts (`querycount.AssertExactly`): list page = 1 (+1 with `includeTotalCount`), batch loaders 1 for 1 and for 50 ids, 0 for none.
- Privacy: anonymous / other user / owner on list and by-id, matching the perspective privacy tests.
- `test/roundtrips`: a count for `userTodos` with owner, content and action selected.
- `cached/todo_action_repository_test.go` mirroring the category one.

## Frontend

### Queries (`lib/queries/userTodos/`)

`index.ts` (gql defs) plus `useUserTodos`, `useTodoActions`, `useUserTodoLists`, `useCreateUserTodo`, `useUpdateUserTodo`, `useDeleteUserTodo`, `useCreateTodoAction`, `useReorderUserTodoList`, and list CRUD hooks. Keys added under `queryKeys.userTodos` in `keys.ts`, mirroring every variable sent. `staleTime`: todos and lists are user-scoped (minutes); actions change only when the user adds one (long, evicted by `useCreateTodoAction`). Mutations evict only the affected list/detail keys. Cache-contract tests with `tests/helpers/queryBudget.ts`.

### Plan page (`routes/plan/+page.svelte`)

- Nav: add `{ href: '/plan', label: 'Plan' }` to `Header.svelte` `navLinks`.
- AG Grid following `docs/AG_GRID.md` and `ADDING_AG_GRID_COLUMN.md`: column metadata in one module (like `grid-config.ts` `COLUMNS`), responsive tiers decided per column, mobile card fallback.
- Columns: Content / Name, Action, Priority (rating display via `ratingToDisplay`), Status, % Complete, Start, End, Due, List (name + position), Privacy, Comments (preview), **Add perspective** (button; disabled with a tooltip on name-only rows).
- Editing: a todo dialog using `RatingInput` for priority, the comments editor used by `PerspectiveEditor.svelte` (extract a shared editor component if it isn't standalone), `SafeHtml.svelte` for display.
- Action picker: a combobox listing actions in `typical_sequence` order, each item's `description` as its hover tooltip; typing a value that isn't there offers "Add “…”" (calls `createTodoAction`).
- List switcher: all / one list / unlisted. With one list selected, rows sort by position and drag to reorder (`reorderUserTodoList`).
- "Add to plan" on Activity rows and in `ActivityDetailsModal`, action defaulting to `consume`.

### Toasts

- The app default is 2s (`<Toaster duration={2000}>` in `+layout.svelte`). **Any toast that carries an action lasts 4s**: add one helper (e.g. `lib/utils/toast.ts` exporting `ACTION_TOAST_DURATION_MS = 4000` and `toastWithAction(message, action)`) so the value lives in one place, and add a line to `frontend/CLAUDE.md` when it lands.
- Done ↔ 100%: status set to Done while % < 100 → "Mark 100% complete too?" **[Yes]**; % set to 100 while not Done → "Mark as done too?" **[Yes]**. Yes sends the paired field (and fills `end_date` if empty); dismissing changes nothing.
- After a perspective is saved for content with an open `consume` or `review` todo → "Mark this todo done?" **[Yes]**.

### Frontend tests

Vitest for the toast helper, rating/percent formatting, column metadata, and each hook (mocked in component tests per `frontend/CLAUDE.md`); component tests for the action picker (order + tooltip + add-new) and the done/100% prompts. A user-visible PR is labeled `needs-demo-video` from a cloud session.

## Future: assignees

Add `user_todo_assignees (todo_id FK ON DELETE CASCADE, user_id FK, assigned_at, PRIMARY KEY (todo_id, user_id))` (same shape as `thread_participants`). The read predicate becomes *public OR owner OR assignee*; assignees may update `status`, `percent_complete` and dates, while only the owner edits the rest and deletes. Nothing in v1 needs renaming for this: the owner column is already `owner_user_id` and the GraphQL field is `owner`.

## Rollout

The migration is written and reviewed, never applied in dev (shared Neon DB). The PR carrying it gets `migrations-unapplied` from the workflow and needs a manual `migrate up` per environment.

## Decisions to confirm

Settled in review (2026-10-10): first status is `not_started`; privacy column defaulting to public; owner naming ready for assignees; priority on the 0–10000 rating scale with the shared helpers; `cite` / `archive` dropped and actions ordered by `typical_sequence` with tooltips, stored in a cached table; one list per todo; the page is **Plan**.

Still open:
1. User-entered actions as rows in `todo_actions` with `owner_user_id` (vs. a free-text column on the todo). Chosen so the picker, ordering and tooltips work the same for both.
2. Preset order above (acquire → … → revisit).
3. Lists carry their own `privacy`, independent of their todos'.
4. `dropped` as the fourth status.
5. ON DELETE behavior: content deleted → todo keeps its row with `content_id` NULL (and will need a `name` to satisfy the CHECK, so the delete path must copy the content title into `name` first, or the CHECK should be relaxed). Pick one before the migration is written.
