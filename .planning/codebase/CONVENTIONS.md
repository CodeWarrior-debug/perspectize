# Coding Conventions

**Analysis Date:** 2026-11-26

Two stacks: Go backend (`backend/`) and SvelteKit/Svelte 5 frontend (`frontend/`). Stack rules are in `backend/CLAUDE.md` and `frontend/CLAUDE.md`; Go error/DB patterns in `.docs/GO_PATTERNS.md`.

## Naming Patterns

**Files (backend):**
- Go snake_case, one file per domain: `perspective_service.go`, `gorm_perspective_repository.go`, `gorm_mappers.go`.
- Resolvers: one file per domain (`internal/adapters/graphql/resolvers/<domain>.resolvers.go`: content, perspective, user, user_todo, category, messaging, import). Move stubs that `make graphql-gen` drops into `schema.resolvers.go` to the domain file, then delete the stray file.
- Tests: `<name>_test.go`, split by topic suffix (`perspective_service_update_test.go`, `content_service_limits_test.go`, `*_bench_test.go`).
- Migrations: `backend/migrations/0000NN_description.{up,down}.sql`; check `ls migrations | tail -5` for the next number.

**Files (frontend):**
- Svelte components PascalCase (`src/lib/components/FilterChips.svelte`); feature folders lowercase or camelCase (`library/`, `messaging/`, `addContent/`, `shadcn/`).
- Utilities camelCase `.ts` (`src/lib/utils/gridUrlState.ts`); a few are hyphenated (`grid-config.ts`).
- Hooks: `useX.ts` in the domain folder (`src/lib/queries/perspectives/useCreatePerspective.ts`); gql documents in that folder's `index.ts`.
- Modules that use runes outside a component MUST be `*.svelte.ts` (`src/lib/theme/store.svelte.ts`).

**Go identifiers:** exported PascalCase, unexported camelCase; short receivers; mock function fields `xxxFn`. Domain enums are typed UPPERCASE strings (`SortOrderAsc SortOrder = "ASC"`); stored enums are lowercase text with repository converters.

**TS identifiers:** camelCase functions/variables, PascalCase types, SCREAMING_SNAKE for gql documents and constants (`CREATE_PERSPECTIVE`).

**DB:** the owning user column is `user_id`. User-owned visible rows carry `privacy` (`PUBLIC`/`PRIVATE`). Rating-style numerics use the `valid_integer_range` domain (0-10000). Optional JSONB is nullable with no default.

**GraphQL schema:** timestamps are `String` (ISO); lists return `Paginated<X> { items, pageInfo, totalCount }`; owner writes are `create<X>`/`update<X>` with `@auth` and `delete<X>(id: ID!): Boolean! @auth`. Filter/input IDs use the `IntID` scalar (`backend/pkg/graphql/intid.go`).

## Code Style

**Formatting:**
- Go: `gofmt` is mandatory (CI Build job fails on `gofmt -l .` output).
- Frontend (`frontend/.prettierrc`): tabs, single quotes, trailing commas `all`, `printWidth: 120`. `pnpm run format` / `format:check`.
- `make install-hooks` (in `backend/`) enables auto-format on commit (`.hooks/pre-commit`).

**Linting:**
- Go: `golangci-lint` v2 (`backend/.golangci.yml`): standard set plus gocritic, revive, misspell (US), prealloc, unconvert, nilerr. Run `make lint` locally; no workflow runs it.
- Frontend: no ESLint. Type-check with `pnpm run check` (`svelte-check --tsgo`), which CI runs.

**Colours:** the pre-commit hook blocks new raw hex/rgb literals in `src/lib/components/**/*.svelte` and `formatting.ts`. Use `--color-*` theme tokens (`src/app.css` `@theme`); allowlist with a same-line `hex-ok: <reason>`.

**Svelte 5:** runes only.
```svelte
<script lang="ts">
	let { data, children } = $props();
	let count = $state(0);
	let doubled = $derived(count * 2);
</script>
<button onclick={handler}>{@render children()}</button>
```
- Derive with `$derived`, never `$effect`. Copy reactive values to a local `const` before using them in timers/awaits. Do not write then read back the same `$state` in an effect.
- Icons: `import XIcon from '@lucide/svelte/icons/x'`. shadcn primitives live in `src/lib/components/shadcn/` and are exported from its barrel.
- Auth: use `useAuthState()` / `getAuthToken()` / `components/auth/*`, never `svelte-clerk` directly in components.
- User HTML: `sanitizeHtml` (`src/lib/utils/sanitize.ts`) through `SafeHtml.svelte`; change `backend/internal/core/services/sanitize.go` with it.

## Import Organization

**Go:** stdlib, then third-party and module imports (`github.com/CodeWarrior-debug/perspectize/backend/...`). Services import ports (`core/ports/...`), never repository structs.

**TypeScript:** packages first, then project modules.
```ts
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client'; // inside a queries/ folder
import { LIST_CONTENT } from '#lib/queries/content/index.js'; // from elsewhere
```

**Path Aliases:**
- `#lib/*` -> `src/lib/*` (`package.json` `imports`, mirrored in `tsconfig.json` `paths`). Do not write `$lib`.
- Write TS modules with a `.js` extension (`'#lib/queries/client.js'`, `'#lib/queries/users/useMe.svelte.js'`); `.svelte` components keep `.svelte`.
- SvelteKit modules are `$app/*`; the environment module is `$app/env`.

## Error Handling

**Backend:**
- Sentinels live in `internal/core/domain/errors.go`; specific ones wrap general ones (`ErrContentNotFound` wraps `ErrNotFound`, `ErrUsernameTaken` wraps `ErrAlreadyExists`). Branch with `errors.Is` or kinds, never on error text.
- Wrap with `%w`: `fmt.Errorf("%w: user_id must be a positive integer", domain.ErrInvalidInput)`. Use `domain.Unavailable(msg)` for upstream or client outages.
- Repositories translate `gorm.ErrRecordNotFound` to `domain.ErrNotFound` and wrap the rest.
- Client error codes: classify with `domain.KindOf` (`domain/content_errors.go`) and return `kindedError(msg, kind)` (`resolvers/error_kinds.go`), which sets `extensions.code`. Per-operation mappers sit in `resolvers/perspective_errors.go`; log unclassified failures with `slog.Error`.
- Owner-only writes: `auth.RequireAuth(ctx)` in the resolver, actor passed to the service (`ErrForbidden`), SQL scoped `WHERE user_id = ? AND id = ?`.
- Writes use `clause.Returning{}`; never `Save()` behind a scoped WHERE.

**Frontend:**
- Mutation hooks call `graphqlRequest()` (`src/lib/queries/client.ts`), never bare `graphqlClient`.
- Toasts come from `svelte-sonner`. Perspective failures go through `reportPerspectiveError` (`queries/perspectives/perspectiveErrors.ts`), which reads `extensions.code` first. Components save through `usePerspectiveSave`; create/update hooks are internal to it.
- Optimistic updates roll back in `onError`. Branch on `isPending`, not `isLoading`.

## Logging

**Framework:** `log/slog` (setup in `backend/pkg/logger/`); frontend telemetry via Faro/OTel (`src/lib/telemetry.ts`).

**Patterns:** key/value pairs, context variant when a ctx exists: `slog.WarnContext(ctx, "failed to resolve wikipedia url for category", "qid", input.QID, "error", err)`. Metric attributes from request input go through `telemetry.BoundedSet`.

## Comments

**When to Comment:** explain the code as it stands and why. No ticket, PR or issue numbers and no change history (that goes in the commit message); `.hooks/pre-push` enforces this. Mark an intentional exception with `history-ok: <reason>`, temporary learning notes with `*TEMP*`.

**JSDoc/TSDoc:** `/** */` on modules, exported functions and types, stating the contract (see `contentCreatedEviction.ts`). Go: doc comments on exported identifiers and `// Package x ...`.

## Function Design

**Size:** deep modules: small interface, work hidden behind it. No pass-through service methods or wrapper components.

**Parameters:** Go takes `ctx context.Context` first; services take input structs. TS hooks take plain values or a getter for reactive ones (`usePerspectiveSave(() => ({ userId, contentId }))`).

**Return Values:** hooks hide cache wiring. TanStack Query uses `createQuery(() => ({...}))`, read without `$`. Keys come from `queryKeys` (`queries/keys.ts`) and mirror every variable `queryFn` sends.

## Module Design

**Backend (hexagonal):**
- `core/domain` (no GORM or adapters), `core/ports`, `core/services`, `adapters/*`. GORM models are separate from domain models, with mappers.
- Outside-world adapters are chosen in `internal/assembly/externals.go`; `cmd/server/main.go` wires the rest.
- Enums/IDs bind through `backend/gqlgen.yml`; no hand-written enum switches. GraphQL/domain mapping goes in `resolvers/helpers.go`.

**Single-definition modules (extend these, do not copy their rules):**
| Concern | Location |
|---|---|
| Read/write/aggregate audience | `core/domain/audience.go`, `adapters/repositories/postgres/audience_sql.go` |
| Perspective validity | `core/domain/perspective_contract.go` |
| Content creation | `core/services/content_pipeline.go` (a `contentCreation` spec per type) |
| Cursor paging | `listPage` in `adapters/repositories/postgres/paging.go` with a `domain.ResolvePage` window; do not drive the paginator directly |
| Content-type facts (UI) | `src/lib/contentTypes/registry.ts` (`descriptorFor`), `descriptors/` |
| Library columns | `LIBRARY_COLUMNS` in `src/lib/utils/libraryColumns/index.ts` (shape in `definition.ts`); other column lists derive from it |
| Eviction after a create | `evictAfterContentCreated` in `src/lib/queries/content/contentCreatedEviction.ts` |

**Exports / Barrel Files:** one folder per domain in `src/lib/queries/` (`index.ts` plus hooks); `shadcn/index.ts` is the component barrel. A new repository port method requires updating every mock that implements it.

---

*Convention analysis: 2026-11-26*
