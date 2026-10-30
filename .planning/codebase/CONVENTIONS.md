# Coding Conventions

**Analysis Date:** 2026-10-01

Two stacks: Go backend (`backend/`) and SvelteKit/Svelte 5 + TypeScript frontend (`frontend/`). Repo-wide rules are in `/CLAUDE.md`, `backend/CLAUDE.md`, `frontend/CLAUDE.md`.

## Repo-wide Rules

- **No chained bash commands** (`&&`): run each shell command as its own call.
- **Conventional commits**: `feat`, `fix`, `refactor`, `chore`, `docs`, `test`; one logical change per commit.
- **Branch names**: `type/INI-<issue>-kebab-description`; omit `INI-<n>` when no pre-existing issue.
- **Temporary explanatory comments** are marked `*TEMP*` so they can be grepped and removed.
- **Never run `make migrate-up/down`** in dev (shared Sevalla DB).
- **Deep modules**: one folder/file per domain, no pass-through wrappers/methods, hide wiring behind a small interface.
- **Verification before PR**: `go build ./...`, `gofmt -l .` (must be empty), `go test ./...` in `backend/`; `pnpm run test:run` in `frontend/`.

## Naming Patterns

**Go files** (`backend/`):
- snake_case: `content_service.go`, `gorm_content_repository.go`, `gorm_mappers.go`
- Resolvers per domain: `internal/adapters/graphql/resolvers/{content,perspective,user,category,messaging}.resolvers.go`
- Tests: `<subject>_test.go` in `backend/test/<area>/`

**Go identifiers:**
- Exported PascalCase, unexported camelCase; constructors `NewContentService`, functional options `WithBibleReference` (type `ContentServiceOption func(*ContentService)`)
- Sentinel errors `ErrXxx` in `internal/core/domain/errors.go`
- Test mocks: `mockContentRepository` with `xxxFn` func fields (`getByIDFn`)
- Test funcs: `TestSubject_Scenario` (`TestPerspectiveCreate_LimitBoundaries`, `TestUserMutations_NonOwnerDenied`)

**Frontend files** (`frontend/src/lib/`):
- Svelte components PascalCase: `RatingInput.svelte`, `PerspectivePopover.svelte`; feature folders lowercase (`auth/`, `discover/`, `interlinear/`, `theme/`)
- Query hooks camelCase `useXxx.ts`: `src/lib/queries/content/useCreateClaim.ts`
- Rune-using non-component modules use `.svelte.ts`: `src/lib/theme/store.svelte.ts`
- Utilities camelCase: `src/lib/utils/ratings.ts`, `buildTag.ts`
- Tests: `tests/unit/<area>-<subject>.test.ts` (kebab/dash, e.g. `hooks-useSendMessage.test.ts`), `tests/components/<Component>.test.ts`

**Frontend identifiers:** camelCase functions/variables, PascalCase types/interfaces, UPPER_SNAKE for GraphQL documents and constants (`CREATE_CLAIM`, `RATING_STEP`).

## Code Style

**Go formatting:** `gofmt` (CI `Build` job fails otherwise; `make install-hooks` auto-fixes on commit). Tabs.

**Go linting** (`backend/.golangci.yml`, golangci-lint v2, `default: standard`): plus `gocritic`, `revive` (exported, error-strings, context-as-argument, receiver-naming, var-naming, etc.), `misspell` (US), `prealloc`, `unconvert`, `nilerr`. Test files are exempt from `gocritic` and dot-imports. Run `make fmt && make lint`.

**Frontend formatting** (`frontend/.prettierrc`): Prettier 3 + `prettier-plugin-svelte`; tabs, single quotes, trailing commas `all`, `printWidth: 120`. Commands: `pnpm run format`, `pnpm run format:check`. Pre-commit hook auto-fixes.

**Frontend typing:** `tsconfig.json` is `strict: true`, `checkJs: true`; type-check with `pnpm run check` (svelte-check). No ESLint configured.

## Import Organization

**Go** (gofmt-sorted groups): stdlib, blank line, then third-party and module imports (`github.com/CodeWarrior-debug/perspectize/backend/...`). Services import ports (`internal/core/ports/...`), never adapters, except where wired in (see `internal/core/services/content_service.go`). Module aliases for disambiguation: `portservices`.

**Frontend:**
1. External packages (`@tanstack/svelte-query`, `svelte-sonner`, `@lucide/svelte/icons/...`)
2. `$lib/...` aliases (`$lib/queries/content`, `$lib/utils/ratings`)
3. Relative imports within the same folder (`../client`, `./claims`)

Import a domain barrel (`$lib/queries/content`), not its internals. shadcn primitives go through the barrel `src/lib/components/shadcn/index.ts`. Icons are imported per-icon (`@lucide/svelte/icons/chevron-down`).

## Svelte 5 Patterns (runes only)

Use `$state`, `$derived`, `$props`, `$bindable`, `$effect`, `{@render children()}`, `onclick={...}`. Never use Svelte 4 syntax (`export let`, `$:`, `<slot />`, `on:click`).

```svelte
let { label, value = $bindable<number | null>(null), name, compact = false }: {
	label: string; value: number | null; name: string; compact?: boolean;
} = $props();
```

Gotchas encoded in `frontend/CLAUDE.md`: `$effect` tracks only synchronously-read state (copy to a local const before `setTimeout`); never write then read the same `$state` in one `$effect`; use `$derived` for derivation; Escape handlers inside bits-ui dialogs use capture phase.

## Data Fetching (TanStack Query v5 + graphql-request)

- Function-wrapper API, no `$` store prefix: `createQuery(() => ({ queryKey, queryFn }))`.
- One folder per domain in `src/lib/queries/<domain>/` with `index.ts` (gql documents) plus `useXxx.ts` hooks.
- Query keys come from `queryKeys` in `src/lib/queries/keys.ts` and must mirror every variable `queryFn` sends.
- Mutation hooks use the authenticated `graphqlRequest()` from `src/lib/queries/client.ts`, not the bare `graphqlClient`.
- Cache invalidation lives inside the hook (`onSuccess`), targeted (`queryKeys.content.lists()`), never a root key.
- Branch loading UI on `isPending` (not `isLoading`) so offline-paused queries render.
- Auth: use the facade (`useAuthState`, `getAuthToken`, `components/auth/*`), never import `svelte-clerk` directly in new code.

## Error Handling

**Go** (details in `.docs/GO_PATTERNS.md`):
- Domain sentinels in `internal/core/domain/errors.go`, matched with `errors.Is`.
- Repositories translate `gorm.ErrRecordNotFound` to `domain.ErrNotFound`, wrap others with context: `fmt.Errorf("failed to get category by id: %w", err)`.
- Write paths: `RowsAffected == 0` means not found/not owned.
- Multi-step writes use `db.WithContext(ctx).Transaction(func(tx *gorm.DB) error {...})`; use `tx`, not `r.db`, inside.
- `gorm-cursor-paginator`: check both returned `err` and `pageResult.Error`.
- Resolvers map sentinels to client-safe messages, `slog.Error(...)` the rest and return a generic wrapped error.
- Owner-only mutations guard at every layer: `@owner` directive, `auth.RequireAuth(ctx)` in resolver, actor ID passed into service returning `domain.ErrForbidden`, SQL scoped by `user_id`.

**Frontend:** mutation hooks handle errors in `onError` with `toast.error(...)` (svelte-sonner), mapping known server messages to friendly text (`src/lib/queries/content/useCreateClaim.ts`); rollback optimistic cache entries in `onError`.

## Logging

- Go: structured `log/slog` (`slog.Error("updating perspective failed", "error", err)`); key/value pairs, lowercase message. Package `pkg/logger/`.
- Frontend: `svelte-sonner` toasts for user-facing feedback; avoid stray `console.log`.

## Comments

- Go: doc comments on exported identifiers starting with the identifier name (revive `exported`). Numbered step comments inside long service methods.
- Comments explain *why* (bug history, issue numbers like `#327`, `#311`), especially in config files (`frontend/vite.config.ts`).
- Svelte/TS: JSDoc block above components/helpers describing units and semantics (e.g. `RatingInput` "storage units 0-10000").

## Function and Module Design

- Go services take port interfaces, return domain models and domain errors; DI via constructors and functional options; wiring in `backend/cmd/server/main.go`.
- GraphQL model <-> domain mapping lives once in `internal/adapters/graphql/resolvers/helpers.go`; GORM mapping in `internal/adapters/repositories/postgres/gorm_mappers.go`. Domain models have no GORM imports.
- Use gqlgen model binding for enums (UPPERCASE domain values bound in `backend/gqlgen.yml`), never hand-written switches; use the `IntID` scalar (`pkg/graphql/intid.go`) for filter/input IDs.
- Cursor pagination: opaque base64 keyset, fetch `limit+1`, whitelist sort columns.
- Frontend: hooks return `{ mutate, isPending }`; components never call `graphqlClient.request` plus invalidation inline; no pass-through wrapper components.
- DB-touching code carries a query budget test (see `TESTING.md`).

---

*Convention analysis: 2026-10-01*
