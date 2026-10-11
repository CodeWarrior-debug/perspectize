# Movie Content Type Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a `MOVIE` content type ingested from TMDB, with a searchable Cast column (directors first), Box office, Vs. budget and Duration columns.

**Architecture:** One `content` row per movie; type-specific data lives in the `response` JSONB (no new tables). A TMDB adapter sits behind a port; the service builds `Content` with `length` in seconds. Repository gains sort rules, two search fields and a `personId` filter over JSONB. Frontend adds a Movie column set and renderers on top of the existing Activity table.

**Tech Stack:** Go (gqlgen, GORM, gorm-cursor-paginator, testify, sqlmock), PostgreSQL JSONB + GIN, SvelteKit 5, AG Grid, TanStack Query, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-07-movie-content-type-design.md` (amends `2026-09-27-tmdb-content-types-design.md`). Read both. The spec's "Decisions to confirm" are *decided for this run*; do not reopen them.

## Global Constraints

- **No `&&`-chained shell commands.** One command per Bash call. Applies to every subagent.
- **Never run `make migrate-*` or `migrate ... up/down`.** `DATABASE_URL` is the shared Neon DB. Migrations are written only.
- **Never edit any `CLAUDE.md`.** Report proposed learnings in the final summary instead.
- `.env*` files (except `.env.example`) are unreadable; never read or print secrets. `TMDB_API_READ_ACCESS_TOKEN` goes in `.env.example` as a name with a blank value only.
- Never put the Sevalla deployment URL in any file, commit, or issue.
- Enum casing: Go const `MOVIE`, GraphQL `MOVIE`, DB `movie` (existing converter).
- Money is USD integers; **`0` from TMDB means unknown → store null → render "—", never "$0".**
- TMDB Score is out of **10** (`vote_average`), never a percent.
- Duration is stored in `content.length` as **seconds**, `length_units = 'seconds'`.
- Cast stored: top **15** `{id,name,character,order}`; directors: all `{id,name}`. Identity = TMDB person id.
- Frontend colours: theme tokens only, no raw hex/rgb in `src/lib/components/**` or `formatting.ts` (pre-commit guard).
- After `make graphql-gen` delete the stray `resolvers/schema.resolvers.go` after diffing it for new stubs (see `backend/CLAUDE.md`).
- Commit per task, conventional commits. Branch: `feature/movie-content-type`.

## Review Focus

1. **Zero or missing budget/revenue** → null everywhere, Vs. budget null (no divide-by-zero, no "0%").
2. **Same-named people** with different TMDB ids → id filter returns only the exact person; name search returns both.
3. **A movie with no US certification, no cast, no directors, or runtime 0** → empty cells render "—", nothing throws.
4. **Duplicate add** by TMDB URL with/without slug, or via IMDb id that resolves to an existing movie → `ErrAlreadyExists`, no second row.
5. **Duration ≥ 1 hour and exactly 3600s / 59:59** → `1:00:00` and `59:59`; YouTube behaviour unchanged below an hour.

---

## File Structure

| File | Responsibility |
|---|---|
| `backend/internal/core/domain/content.go` | `ContentTypeMovie`, `ContentSearchFieldCast/Director` |
| `backend/internal/core/domain/pagination.go` | new `ContentSortBy` values, `ContentFilter` person fields |
| `backend/schema.graphql`, `gqlgen.yml` | enum value, input, mutation, sort/search enums, filter fields |
| `backend/internal/core/ports/services/movie_client.go` | `MovieClient` port + `MovieMetadata` |
| `backend/internal/adapters/tmdb/` | `client.go` (HTTP), `parse.go` (URL/IMDb parsing + payload shaping), `testdata/` fixtures |
| `backend/internal/core/services/content_service.go` | `CreateFromMovie` |
| `backend/internal/adapters/repositories/postgres/helpers.go`, `gorm_content_repository.go` | sort rules, search fields, personId filter |
| `backend/migrations/000030_add_movie_people_index.{up,down}.sql` | partial GIN index |
| `frontend/src/lib/utils/formatting.ts` | duration, money, vs-budget formatters |
| `frontend/src/lib/utils/grid-config.ts` | Movie `COLUMNS` entries and the per-type default column set |
| `frontend/src/lib/queries/content/` | types, `CREATE_CONTENT_FROM_MOVIE`, `useAddMovie` |
| `frontend/src/lib/components/AddMoviePopover.svelte` | add form |

---

### Task 1: Domain, GraphQL schema and generated code

**Files:**
- Modify: `backend/internal/core/domain/content.go`, `backend/internal/core/domain/pagination.go`
- Modify: `backend/schema.graphql`, `backend/gqlgen.yml` (only if bindings are needed)
- Regenerate: `backend/internal/adapters/graphql/generated/generated.go`, `model/models_gen.go`
- Test: `backend/test/domain/content_test.go`

**Interfaces:**
- Produces: `domain.ContentTypeMovie = "MOVIE"`; `domain.ContentSearchFieldCast = "CAST"`, `ContentSearchFieldDirector = "DIRECTOR"`; `domain.ContentSortByBoxOffice = "BOX_OFFICE"`, `ContentSortByVsBudget = "VS_BUDGET"`, `ContentSortByAgeRating = "AGE_RATING"`; `ContentFilter.PersonID *int`, `ContentFilter.PersonRole *PersonRole` with `PersonRoleCast = "CAST"`, `PersonRoleDirector = "DIRECTOR"`; GraphQL `input CreateContentFromMovieInput { url: String! }`, `mutation createContentFromMovie(input: CreateContentFromMovieInput!): Content!`, `ContentFilter.personId: IntID`, `ContentFilter.personRole: PersonRole`.

- [ ] **Step 1: Failing test** in `content_test.go`: assert `domain.ContentTypeMovie == "MOVIE"`, the two search-field constants, the three sort constants.
- [ ] **Step 2: Run** `go test ./test/domain/...` in `backend/`; expect compile failure.
- [ ] **Step 3: Add the constants** (UPPERCASE) and the filter fields; add the enum value, input, mutation, `PersonRole` enum and filter fields to `schema.graphql`; bind `PersonRole`, `ContentSortBy` additions through the existing model binding in `gqlgen.yml` the same way `ContentSearchField` is bound.
- [ ] **Step 4: Run** `make graphql-gen` in `backend/`; diff then delete `resolvers/schema.resolvers.go`; move the new `CreateContentFromMovie` stub into `content.resolvers.go` returning `errors.New("not implemented")` for now.
- [ ] **Step 5: Run** `go build ./...` then `go test ./test/domain/...`; expect PASS.
- [ ] **Step 6: Commit** `feat(movie): add MOVIE content type, search fields, sort values and person filter to schema`.

### Task 2: TMDB adapter, port and fixtures

**Files:**
- Create: `backend/internal/core/ports/services/movie_client.go`
- Create: `backend/internal/adapters/tmdb/client.go`, `parse.go`, `parse_test.go`, `client_test.go`, `testdata/movie_603.json`, `testdata/movie_no_budget.json`, `testdata/find_imdb.json`
- Test: same dir (Go tests live beside the adapter here; follow where `adapters/youtube` tests live)

**Interfaces:**
- Produces:
  ```go
  type MovieMetadata struct {
      TMDBID        int
      Title         string
      Response      json.RawMessage // shaped payload, see below
      RuntimeSeconds *int           // nil when runtime is 0/unknown
  }
  type MovieClient interface {
      GetMovie(ctx context.Context, tmdbID int) (*MovieMetadata, error)
      FindMovieByIMDbID(ctx context.Context, imdbID string) (int, error) // returns TMDB id or domain.ErrNotFound
  }
  ```
  and in `adapters/tmdb`: `ParseMovieInput(raw string) (tmdbID int, imdbID string, err error)` (accepts `themoviedb.org/movie/603`, `…/movie/603-the-matrix`, `imdb.com/title/tt0133093/`); `CanonicalMovieURL(id int) string` = `https://www.themoviedb.org/movie/<id>`.
- Shaped `Response` JSON keys: `tmdbId, imdbId, title, tagline, overview, releaseDate, year, genres[], certification, runtimeMinutes, runtimeSecondsKnown(false), budget, revenue, voteAverage, voteCount, posterPath, keywords[], cast[{id,name,character,order}] (max 15), directors[{id,name}], collection`. `budget`/`revenue` of 0 are written as JSON `null`.

- [ ] **Step 1: Failing tests** in `parse_test.go`: table for `ParseMovieInput` (slug URL, bare URL, IMDb URL, `tt` id alone, a TV URL → error, garbage → error); a test that shaping `testdata/movie_603.json` yields 15 cast max in `order`, all directors from `credits.crew` where `job=="Director"`, `certification=="R"` from the US `release_dates` entry, and `testdata/movie_no_budget.json` yields `null` budget and revenue and `RuntimeSeconds == nil` when runtime is 0.
- [ ] **Step 2: Run** `go test ./internal/adapters/tmdb/...`; expect FAIL.
- [ ] **Step 3: Implement** `parse.go` (pure functions, no network) and `client.go` (`http.Client`, base `https://api.themoviedb.org/3`, header `Authorization: Bearer <token>`, 10s timeout, errors sanitized exactly like `adapters/youtube`: never include the token or raw upstream body).
- [ ] **Step 4: Client test** with `httptest.NewServer` serving the fixtures: success, 404 → `domain.ErrNotFound`, 401/500 → a generic sanitized error, token not present in the error string.
- [ ] **Step 5: Run** the package tests; expect PASS. `gofmt -l .` empty.
- [ ] **Step 6: Commit** `feat(movie): add TMDB adapter, MovieClient port and fixtures`.

### Task 3: Service, resolver, wiring and config

**Files:**
- Modify: `backend/internal/core/services/content_service.go`, `backend/cmd/server/main.go`, `backend/internal/config/*` (add `TMDBReadAccessToken`), `backend/.env.example`, `internal/adapters/graphql/resolvers/content.resolvers.go`
- Test: `backend/test/services/content_service_test.go`, `backend/test/resolvers/content_resolver_test.go`, plus the mock `MovieClient` in the existing mocks location

**Interfaces:**
- Consumes: `services.MovieClient`, `tmdb.ParseMovieInput`, `tmdb.CanonicalMovieURL`.
- Produces: `func (s *ContentService) CreateFromMovie(ctx context.Context, rawURL string, userID int) (*domain.Content, error)`; `NewContentService` gains a `movieClient` argument (update every caller and test mock).

- [ ] **Step 1: Failing service tests**: success builds `Content{ContentType: ContentTypeMovie, URL: canonical, Length: seconds, LengthUnits: "seconds"}`; duplicate (repo returns existing) → `ErrAlreadyExists` and the existing row; IMDb input resolved via `FindMovieByIMDbID` then deduped; invalid input → `ErrInvalidInput`; adapter error → generic error, details not exposed; repo failure wrapped; nil runtime → `Length == nil`.
- [ ] **Step 2: Run** `go test ./test/services/...`; expect FAIL.
- [ ] **Step 3: Implement** `CreateFromMovie`, copying the `CreateFromYouTube` flow (check-existing → fetch → `GetOrCreateByURL(refreshOnConflict=true)`).
- [ ] **Step 4: Resolver + wiring**: implement the mutation (authed, same guard as `createContentFromYouTube`); construct the tmdb client in `main.go` from the config token. If the token is blank, wire a client that returns a clear "movie lookup is not configured" error so the server still starts (the owner has not set the token yet).
- [ ] **Step 5: Resolver test**: success returns `contentType: MOVIE`; duplicate; invalid URL.
- [ ] **Step 6: Run** `go build ./...`, `go test ./...`, `gofmt -l .`. Expect clean.
- [ ] **Step 7: Commit** `feat(movie): createContentFromMovie service, resolver and wiring`.

### Task 4: Repository — sort rules, people search, personId filter, index migration

**Files:**
- Modify: `backend/internal/adapters/repositories/postgres/helpers.go`, `gorm_content_repository.go`
- Create: `backend/migrations/000030_add_movie_people_index.up.sql`, `.down.sql` (re-check the next free number with `ls migrations | tail -4` first)
- Test: `gorm_content_search_test.go`, `gorm_content_repository_test.go`, plus a query-count test

**Interfaces:**
- Consumes: Task 1 constants and `ContentFilter.PersonID/PersonRole`.
- Produces SQL:
  - `BOX_OFFICE`: `(response->>'revenue')::BIGINT`, `NULLReplacement: int64(0)`.
  - `VS_BUDGET`: `CASE WHEN response->>'budget' IS NULL OR response->>'revenue' IS NULL OR (response->>'budget')::BIGINT = 0 THEN NULL ELSE (response->>'revenue')::FLOAT8 / NULLIF((response->>'budget')::BIGINT,0) END`, `NULLReplacement: float64(-1)`.
  - `AGE_RATING`: `CASE response->>'certification' WHEN 'G' THEN 1 WHEN 'PG' THEN 2 WHEN 'PG-13' THEN 3 WHEN 'R' THEN 4 WHEN 'NC-17' THEN 5 ELSE NULL END`, `NULLReplacement: int64(0)`.
  - `CAST` search: `EXISTS (SELECT 1 FROM jsonb_array_elements(COALESCE(response->'cast','[]'::jsonb)) p WHERE p->>'name' ILIKE ?)`; `DIRECTOR` the same over `response->'directors'`.
  - `personId` filter: `response->'cast' @> ?::jsonb` / `response->'directors' @> ?::jsonb` with `[{"id":N}]` (role any → OR of the two).
  - Migration: `CREATE INDEX IF NOT EXISTS idx_content_movie_cast ON content USING GIN ((response->'cast') jsonb_path_ops) WHERE content_type = 'movie';` and the same for directors; down drops both with `IF EXISTS`.

- [ ] **Step 1: Failing tests** (sqlmock, mirroring how the TAGS search and `PercentLiked` are tested): each sort rule's SQLRepr string; `CAST`/`DIRECTOR` produce the EXISTS expression with the `%term%` argument; `personId` produces the containment condition with the exact JSON; role scoping; nothing changes when `personId` is nil.
- [ ] **Step 2: Run** the repo tests; expect FAIL.
- [ ] **Step 3: Implement** the rules, the two `contentSearchColumns` entries and the filter clause. Use bound parameters only; never interpolate user input.
- [ ] **Step 4: Query-count test** with `internal/perf/querycount`: a filtered list is the page query only (+ count when `includeTotalCount`); setting the budget to what it costs now.
- [ ] **Step 5: Write the migration** SQL files. Do not apply them.
- [ ] **Step 6: Run** `go build ./...`, `go test ./...`, `gofmt -l .`.
- [ ] **Step 7: Commit** `feat(movie): movie sort rules, cast/director search, person filter and GIN index migration (not applied)`.

### Task 5: Frontend formatters (shared Duration, money, vs-budget)

**Files:**
- Modify: `frontend/src/lib/utils/formatting.ts`
- Test: `frontend/tests/unit/formatting.test.ts`

**Interfaces:**
- Produces: `formatDurationSeconds(seconds)` now returns `h:mm:ss` at ≥3600 and `m:ss` below (used by `formatDuration` for `lengthUnits === 'seconds'` too); `formatMoneyCompact(usd: number | null): string` (`$1.2B`, `$316M`, `$950K`, `$12`; null → `EMPTY_VALUE`); `formatMoneyExact(usd): string` (`$1,234,567`); `vsBudgetPercent(revenue: number | null, budget: number | null): number | null`; `formatVsBudget(pct: number | null): string` (`3,455%`; null → `EMPTY_VALUE`).

- [ ] **Step 1: Failing tests** (table-driven): durations `0→0:00`, `59→0:59`, `3599→59:59`, `3600→1:00:00`, `8520→2:22:00`, `8525→2:22:05`; existing YouTube cases below an hour unchanged; money `0`/null → `—`, `999→$999`, `316_000_000→$316M`, `1_150_000_000→$1.2B`; `vsBudgetPercent(2_800_000_000, 80_000_000)=3500`, null when budget null/0 or revenue null.
- [ ] **Step 2: Run** `pnpm run test:run` in `frontend/` (scope with the file); expect FAIL.
- [ ] **Step 3: Implement.** Update any existing test that expected `142:00`-style output for ≥ 1 hour.
- [ ] **Step 4: Run** the full frontend unit suite; expect PASS.
- [ ] **Step 5: Commit** `feat(movie): shared h:mm:ss duration formatter, money and vs-budget formatters`.

### Task 6: Frontend types, columns, renderers, Add Movie form

**Files:**
- Modify: `frontend/src/lib/queries/content/index.ts` (+ `useAddMovie.ts`), `frontend/src/lib/utils/grid-config.ts`, `frontend/src/lib/components/ActivityTable.svelte`, `frontend/src/lib/utils/formatting.ts` (cell renderers), CSP in `frontend/src/app.html`
- Create: `frontend/src/lib/components/AddMoviePopover.svelte`, `frontend/src/lib/utils/movie.ts` (+ tests)
- Test: `frontend/tests/unit/*`, `frontend/tests/components/*`

**Interfaces:**
- Consumes: Task 5 formatters; backend GraphQL from Tasks 1–4 (`CREATE_CONTENT_FROM_MOVIE`, `personId`, `searchFields: [CAST, DIRECTOR]`).
- Produces: `validateMovieInput(raw: string): boolean`; a Movie default column set (spec §6) selected when the content-type filter is exactly `MOVIE`; `castCellRenderer`, `boxOfficeValueGetter`, `vsBudgetValueGetter`.

- [ ] **Step 1: Failing tests**: `validateMovieInput` table (TMDB URL, slug URL, IMDb URL/id valid; YouTube/TV URL/garbage invalid); `castCellRenderer` states — directors only, cast only, both (directors first with `dir.` marker), more than three (`+N`), empty (`—`); money/vs-budget getters with null and zero; `COLUMNS` contains the Movie entries with the right sort keys (`BOX_OFFICE`, `VS_BUDGET`, `AGE_RATING`); the Movie default set omits Date Added and includes Tags; query document exports `CREATE_CONTENT_FROM_MOVIE`.
- [ ] **Step 2: Run** and confirm FAIL.
- [ ] **Step 3: Implement** the types, query + hook (use the authenticated `graphqlRequest()` wrapper, not the bare client), column metadata in the single `COLUMNS` source, both visibility places (colDef `hide` and the responsive `setColumnsVisible` effect), the Add Movie form, and the CSP `img-src` entry for `image.tmdb.org`. Header tooltip copy comes from `tools/content-type-designer/previews`' spec wording where it fits, and states the 15-person search limit.
- [ ] **Step 4: Run** `pnpm run check` and `pnpm run test:run` in `frontend/`; expect no new errors.
- [ ] **Step 5: Commit** `feat(movie): Movie columns, cast renderer, Add Movie form and queries`.

### Task 7: Preview rebuild, docs and whole-branch verification

**Files:**
- Modify: `.claude/skills/content-type-preview/examples/movie.spec.json`, `tools/content-type-designer/previews/movie-activity.html`, `.claude/docs/ADDING_CONTENT_TYPE.md` (only add a "Movie" worked-example pointer if it fits in ≤5 lines — **do not edit CLAUDE.md files**)
- Test: all suites

- [ ] **Step 1:** Update `movie.spec.json` to the spec §6 columns (Cast with `dir.` flag, Box office, Vs. budget, Duration, Tags; no Date Added), keeping the validator's rules; fix the TMDB Score unit (0–10).
- [ ] **Step 2:** `node .claude/skills/content-type-preview/build.mjs <spec> tools/content-type-designer/previews/movie-activity.html`; it must exit 0.
- [ ] **Step 3: Full verification**, one command per call: `go build ./...`, `gofmt -l .`, `go test ./...` in `backend/`; `pnpm run check`, `pnpm run test:run` in `frontend/`. Report exact summary lines.
- [ ] **Step 4:** Grep for stale names: `grep -rn "Runtime" frontend/src` for any Movie header still saying Runtime.
- [ ] **Step 5: Commit** `docs(movie): rebuild Movie preview from the amended spec`.
- [ ] **Step 6:** Write `docs/superpowers/plans/2026-10-07-movie-content-type-STATUS.md`: what is done, what was not verified (no live TMDB token, migration not applied, no browser run), and a morning checklist.

---

## Self-review

- **Spec coverage:** identity/ingestion → T2,T3; people (storage, column, search, id filter, index) → T2,T4,T6; age rating as string with sort → T4; money columns → T4,T5,T6; duration → T3,T5; default columns/Date Added off/Tags → T6; details view → T6 (tiles + top cast, within the existing modal); rollout caveats → T7 status file.
- **Gaps accepted:** the details-modal tile work in T6 is described, not coded here; the implementer follows the existing Bible/YouTube modal pattern. Browser verification needs the signed-in Chrome and a TMDB token, so it is a morning check.
- **Types:** `MovieClient`, `MovieMetadata`, `CreateFromMovie`, constants and sort keys are spelled the same in every task above.
