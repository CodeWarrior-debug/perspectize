# Coding Conventions

**Analysis Date:** 2026-11-01

Two stacks: Go backend (`backend/`) and SvelteKit/Svelte 5 frontend (`frontend/`). Stack rules are in `backend/CLAUDE.md` and `frontend/CLAUDE.md`; Go error/DB patterns in `.docs/GO_PATTERNS.md`.

## Naming Patterns

**Files (backend):**
- Go snake_case; one file per domain/entity: `perspective_service.go`, `gorm_perspective_repository.go`, `gorm_mappers.go`.
- Resolvers: one file per domain, `internal/adapters/graphql/resolvers/{content,perspective,user,category,messaging}.resolvers.go`. Stubs generated into `schema.resolvers.go` by `make graphql-gen` get moved to the matching domain file.
- Tests: `<name>_test.go`; variants split by topic suffix (`perspective_service_update_test.go`, `content_service_limits_test.go`, `*_bench_test.go`).
- Migrations: `backend/migrations/0000NN_description.{up,down}.sql`; check `ls migrations | tail -5` for the next number.

**Files (frontend):**
- Svelte components PascalCase: `src/lib/components/FilterChips.svelte`; feature folders lowercase (`auth/`, `discover/`, `messaging/`, `shadcn/`).
- Utilities camelCase `.ts` (`src/lib/utils/gridUrlState.ts`); hyphenated for a few (`grid-config.ts`, `grid-empty.ts`).
- Hooks: `useX.ts` inside the domain folder, e.g. `src/lib/queries/perspectives/useCreatePerspective.ts`; gql defs in that folder's `index.ts`.
- Modules that use runes outside a component MUST be `*.svelte.ts` (`src/lib/theme/store.svelte.ts`).
- Tests: `tests/components/<Component>.test.ts`, `tests/unit/<topic>.test.ts` (hooks: `hooks-<name>.test.ts`).

**Go identifiers:** exported PascalCase, unexported camelCase; receivers short (`r *GormCategoryRepository`); mock fn fields `xxxFn` (`getByIDFn`). Domain enums are UPPERCASE string constants (`SortOrderAsc SortOrder = "ASC"`); DB-stored enums are lowercase text with repository converters.

**TS identifiers:** camelCase functions/variables, PascalCase types/interfaces, SCREAMING_SNAKE for gql documents and constants (`CREATE_PERSPECTIVE`, `LIST_CONTENT`, `OPTIMISTIC_PREFIX`).

**DB:** owning user column is always `user_id` (FK `users(id)`). User-owned visible rows carry `privacy` (`PUBLIC`/`PRIVATE`). Rating-style numerics use the `valid_integer_range` domain (0-10000).

**GraphQL schema:** timestamps are `String` (ISO); lists return `Paginated<X> { items, pageInfo, totalCount }`; writes are `create<X>`/`update<X>` with `@auth`, `delete<X>(id: ID!): Boolean! @auth`. Use the `IntID` scalar (`backend/pkg/graphql/intid.go`) for input/filter IDs.

## Code Style

**Go formatting/linting:**
- `gofmt` mandatory (CI Build job fails on `gofmt -l .` output); `make install-hooks` auto-fixes on commit.
- `golangci-lint` v2, config `backend/.golangci.yml`: `default: standard` plus gocritic, revive (blank-imports, context-as-argument, dot-imports, error-return, error-strings, exported, increment-decrement, receiver-naming, unexported-return, var-naming), misspell (US), prealloc, unconvert, nilerr. gocritic and revive dot-imports are excluded in `_test.go`.
- Run: `make fmt && make lint` in `backend/`.

**Frontend formatting (`frontend/.prettierrc`):** tabs, single quotes, trailing commas `all`, `printWidth: 120`, `prettier-plugin-svelte`. Run `pnpm run format` / `format:check`. No ESLint; type-check with `pnpm run check` (`svelte-check --tsgo`, TypeScript 7 native alongside 6.x).

**Colours:** pre-commit hook blocks raw hex/rgb literals in `src/lib/components/**` and `formatting.ts`; use theme tokens (`src/app.css` `@theme`, Tailwind v4 `--color-*`). Allowlist with an inline `hex-ok: <reason>` comment.

## Svelte 5 Rules

Runes only (no Svelte 4 syntax):
```svelte
<script lang="ts">
	let { data, children } = $props();
	let count = $state(0);
	let doubled = $derived(count * 2);
</script>
<button onclick={handler}>{@render children()}</button>
```
- Never use `$effect` for derivation. In an effect, copy reactive values into a local `const` before using them in timers/awaits (see `CategoryTypeahead.svelte`). Do not write then read-back the same `$state` in an effect (`effect_update_depth_exceeded`).
- Icons: per-icon imports `import XIcon from '@lucide/svelte/icons/x'`.
- shadcn primitives live in `src/lib/components/shadcn/` (not `ui/`); add to barrel `shadcn/index.ts`.
- Auth: never import `svelte-clerk` in new components; use the facade `useAuthState()` / `getAuthToken()` / `components/auth/*` so demo mode works.
- User HTML: `sanitizeHtml` (`src/lib/utils/sanitize.ts`) rendered through `SafeHtml.svelte`; mirrored by backend bluemonday in `internal/core/services/sanitize.go` (change both).

## Import Organization

**Go:** stdlib, blank line, then third-party and module imports (gofmt-sorted; module path `github.com/CodeWarrior-debug/perspectize/backend/...`). Import ports (`core/ports/...`), not repository structs, in services.

**TypeScript order (observed):** framework/library packages (`@tanstack/svelte-query`, `svelte-sonner`), then local relative (`../client`, `./index`), with `$lib/...` for cross-folder imports.

**Aliases:** `$lib` -> `frontend/src/lib`; `$app/*` SvelteKit modules (mocked in tests). Import the domain, not its guts: `import { LIST_CONTENT } from '$lib/queries/content'`.

## Error Handling

**Backend:**
- Sentinels in `backend/internal/core/domain/errors.go` (`ErrNotFound`, `ErrForbidden`, `ErrInvalidInput`, ...); match with `errors.Is`.
- Wrap with context using `%w`: `fmt.Errorf("%w: user_id must be a positive integer", domain.ErrInvalidInput)`.
- Repositories translate `gorm.ErrRecordNotFound` to `domain.ErrNotFound`, wrap everything else: `fmt.Errorf("failed to get category by id: %w", err)`.
- Resolvers map sentinels to client messages; log and hide the rest with `slog.Error(...)` then `fmt.Errorf("failed to update perspective: %v", err)`.
- `Paginate()` (gorm-cursor-paginator): check both the returned `err` and `pageResult.Error`.
- Owner-only mutations: guard at every layer (`auth.RequireAuth(ctx)` in resolver, actor passed into service returning `ErrForbidden`, SQL scoped `WHERE user_id = ? AND id = ?`).
- Writes: use `clause.Returning{}`; never `Save()` behind a scoped WHERE.

**Frontend:** mutation hooks use `graphqlRequest()` (authenticated wrapper in `src/lib/queries/client.ts`), never bare `graphqlClient`; surface failures via `toast.error` from `svelte-sonner` (see `useCreatePerspective.ts`); optimistic updates roll back in `onError`. Branch on `isPending` (not `isLoading`) for loading state.

## Logging

- Backend: `log/slog` with key/value pairs and context variant where a ctx exists: `slog.WarnContext(ctx, "failed to resolve wikipedia url for category", "qid", input.QID, "error", err)`. Logger setup in `backend/pkg/logger/`. Metric attributes from request input go through `telemetry.BoundedSet` (`pkg/telemetry/bounded.go`).
- Frontend: telemetry via Faro/OTel (`src/lib/telemetry.ts`); avoid stray `console.*`.

## Comments

- Comments explain why, often with issue/PR references (e.g. "issue #311"). Go doc comments on exported identifiers (revive `exported`).
- Temporary learning comments are marked `*TEMP*` for grep removal.
- TS: JSDoc `/** */` on helpers and test helpers.

## Function Design

- Deep modules: small interface, work hidden behind it. No pass-through service methods or wrapper components. Pull GraphQL <-> domain mapping into `resolvers/helpers.go`, not inline.
- Go: `ctx context.Context` first param; services take input structs; cursor pagination is keyset with `limit+1` and whitelisted sort columns (`adapters/repositories/postgres/helpers.go`).
- Hooks hide cache wiring: callers get `{ mutate, isPending }`; keys come from `queryKeys` (`src/lib/queries/keys.ts`) and mirror every variable `queryFn` sends. TanStack Query uses the function-wrapper form `createQuery(() => ({...}))`, results accessed without `$`.

## Module Design

- Go: hexagonal. `core/domain` (no GORM/adapters), `core/ports` interfaces, `core/services`, `adapters/*`; wiring only in `backend/cmd/server/main.go`. GORM models are separate from domain models with mappers (`gorm_models.go`, `gorm_mappers.go`).
- Enums/IDs: bind via gqlgen model binding in `backend/gqlgen.yml`; never hand-write enum switch conversions.
- Frontend: one folder per domain in `src/lib/queries/` (`index.ts` + hooks); barrel exports for shadcn only. Column metadata single-sourced in `src/lib/utils/grid-config.ts` `COLUMNS`.
- New repo port methods require updating every test mock implementing that interface (`backend/test/**`).

---

*Convention analysis: 2026-11-01*
