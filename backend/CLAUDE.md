# Backend: Perspectize Go

Go GraphQL API: gqlgen (schema-first), GORM + pgx, hexagonal architecture.

## Architecture

**Dependencies point inward:** `core/domain` (pure Go) ← `core/ports` (interfaces) ← `core/services` ← `adapters/`; everything is wired in `cmd/server/main.go`. Domain never imports adapters. Layout: [.docs/ARCHITECTURE.md](../.docs/ARCHITECTURE.md); domain rules: [.docs/DOMAIN_GUIDE.md](../.docs/DOMAIN_GUIDE.md); error handling and DB query patterns: [.docs/GO_PATTERNS.md](../.docs/GO_PATTERNS.md).

### Deep Modules

Small interface, lots of work hidden behind it (Ousterhout). Hexagonal decides which way dependencies point; deep modules decides whether each boundary earns its place. Code can be hexagonal yet shallow (a port mirroring every SQL query 1:1, a service method that only calls the repo).

- **One file per domain** — `adapters/graphql/resolvers/{content,perspective,user,category,messaging}.resolvers.go`. Move stubs that `make graphql-gen` drops into `schema.resolvers.go` to the matching domain file.
- **Callers see ports, not structs** — services depend on `core/ports` interfaces; never reach into a repository's SQL helpers.
- **Pull mapping down** — GraphQL model ↔ domain conversion lives once in `adapters/graphql/resolvers/helpers.go` (e.g. `modelToCreatePerspectiveInput`), not inline in each resolver.
- **No pass-through methods** — a service method that only forwards to the repo: give it a rule/validation or call the port directly.

### ORM: GORM (Hex-Clean Separate Model Pattern)

- **Domain models** (`core/domain/`) — zero GORM imports.
- **GORM models** (`adapters/repositories/postgres/gorm_models.go`, `gorm:` tags) ↔ domain via **mappers** (`gorm_mappers.go`); **repositories** (`gorm_*_repository.go`) chain GORM for dynamic queries; **shared helpers** (`helpers.go`): cursor encoding, sort mapping, enum converters.
- **Pagination gotcha (`gorm-cursor-paginator` v2.7.0):** `Paginate()`'s `err` stays nil on a `Find()` failure; only the returned `*gorm.DB`'s `.Error` is set. Always check both: `if err != nil {...}; if pageResult.Error != nil {...}` (#327). `GormUserRepository`/`GormCategoryRepository` still use hand-rolled `encodeCursor`/`decodeCursor`.
- **Cursor pagination:** opaque base64 (`cursor:<id>`), keyset (not OFFSET), fetch `limit+1` for `hasNextPage`, whitelist sort columns (SQL injection prevention).

## Configuration

Env vars override `config/config.json` (local, gitignored; copy `config/config.example.json`). `.env.example` names every variable (values blank on purpose); a human fills `backend/.env` ([../.docs/SECURITY.md](../.docs/SECURITY.md)).

**Database is remote and shared (Neon, us-east-1).** No local DB or `make docker-up` is needed for dev; never run migrations against it (see Migrations). `DATABASE_URL` is a Neon **direct** string (no `-pooler`) with `sslmode=require`: the realtime listener uses LISTEN/NOTIFY, which Neon's pooler doesn't support.

**Sevalla build:** Dockerfile builder, Docker context `backend`, Dockerfile path `backend/Dockerfile` (Sevalla requires the redundant `backend/` prefix).

**CORS** is in the API middleware chain (`internal/server/api.go`, options from `server.CORSOptions()`); origins come from `CORS_ORIGINS` (`internal/config/security.go`, comma-separated), defaulting to `*`. Set it to the frontend origin in every deployed environment. `AllowedHeaders` must list every custom header the frontend sends (`traceparent`, `tracestate`, `X-Client-Version`, `X-Client-Platform`) or browser preflight rejects the request.

## GraphQL

Schema-first in `schema.graphql`: edit schema → `make graphql-gen` → implement resolvers in the per-domain file → wire to services.

**`make graphql-gen` always ends with a colliding `schema.resolvers.go`.** `gqlgen.yml` uses `layout: follow-schema`, so gqlgen writes every resolver into one `resolvers/schema.resolvers.go`, which redeclares the per-domain ones (`method Resolver.Content already declared` / `contentResolver redeclared in this block`). `generated.go` and `models_gen.go` were already written, so the regeneration happened. Recover: **diff the stray file first** (a new field's stub, with its exact signature, is in there and belongs in the per-domain file), then `rm internal/adapters/graphql/resolvers/schema.resolvers.go` and rebuild. Keep the `rm` out of the Makefile for that reason. Real fix: split `schema.graphql` per domain.

**A new query/mutation arg lands positionally** in the regenerated signature, wherever it sits in the schema's arg list. Copy the signature verbatim from the stray stub; never hand-guess param order.

**`make graphql-gen` after a Go upgrade:** `export data version N is greater than maximum supported version` means `golang.org/x/tools` is too old. `go get golang.org/x/tools@<newer>`, then `go mod tidy` (Go 1.27 needs ≥ v0.51.0); confirm regeneration leaves `generated.go` unchanged.

**Schema shape conventions:** timestamps and dates are `String` (ISO; no Date scalar). Lists return `Paginated<X> { items, pageInfo, totalCount }` and take `first`/`after`/`last`/`before`/`sortBy`/`sortOrder`/`includeTotalCount`/`filter` (see `perspectives`). Owner-only writes are `create<X>(input)` / `update<X>(input)` with `@auth` and `delete<X>(id: ID!): Boolean! @auth`, ownership enforced in the service and the SQL (see Gotchas).

## Testing

- **Integration tests `t.Skip()` when the DB is unavailable**, so a green run without `DATABASE_URL` may have tested nothing. In a cloud session: `pg_ctlcluster 16 main start`, migrate a **local** `testdb` (never the shared Neon DB), then `DATABASE_URL=postgres://…/testdb go test -p 1 ./...`. Locally, use a throwaway database on the demo stack (`postgres://demo:demo@localhost:5434/<db>?sslmode=disable`, migrated by hand with the repo's `migrate` binary, never the Neon URL); confirm with `-v` that DB tests PASS rather than SKIP.
- **Build-tagged harnesses rot.** `perf`-tagged code isn't compiled by `go build/test ./...`; CI runs `go vet -tags perf ./internal/perf/...`. Run it after changing `NewResolver` / `dataloader.Middleware` signatures.
- **Env isolation:** tests that load config clear env vars with `t.Setenv("KEY", "")` (see `clearConfigEnvVars` in `test/config/config_test.go`).
- **Adding a method to a port interface** breaks every mock implementing it; update the mocks under `test/`.
- **Mutation testing:** always `make mutate` / `make mutate-diff`, never bare `gremlins`. They run `mutate-preflight` (unmutated suite in an isolated copy of `backend/`, must be green) and skip the tests in `MUTATE_SKIP`. A new test that reads outside `backend/` (`../../../data/…`) goes in `MUTATE_SKIP` or, better, becomes hermetic. Run on an idle machine: a flaky test failing mid-run counts as a catch (#518); the first baseline overstated catches by at least 17. `Killed: 0, Lived: 0, Skipped: N` means nothing was mutated: `mutate-diff` needs git's `diff.relative` (set in the Makefile).
- **Cloud sandbox:** `go: no such tool "covdata"` → `go build -o "$(go env GOROOT)/pkg/tool/linux_amd64/covdata" cmd/covdata`. Gremlins fills the Go build cache fast; `go clean -cache` before a long run if disk is tight.

## Query budget (REQUIRED for DB-touching changes)

Every repository method, service method or resolver that touches the DB asserts its SQL statement count in a test, so a regression fails CI. Use `internal/perf/querycount` (GORM-callback counter; works with go-sqlmock and real Postgres): `c := querycount.Attach(t, db)` … `c.AssertExactly(t, 1)`.

- Batch methods (`...ByIDs`, `Aggregate...`): same count for 1 and 50 inputs; empty input issues 0. List queries: the page (+ count only when `includeTotalCount`).
- A GraphQL field loading per-parent data goes through a dataloader (`adapters/graphql/dataloader`), with a loader test proving N loads → 1 service call.
- Set the budget to what the path costs **today**, not a generous ceiling.
- Reject in review: a repo/service call inside a loop over results, a `Preload` the caller never reads, the same lookup in both middleware and resolver.
- **Whole-request round trips are pinned in `test/roundtrips`** (real middleware, gqlgen, services and GORM against Postgres). A new or changed GraphQL operation gets a count there; `RT_MEASURE=1` prints each statement instead of failing. Opt-in harness: `go test -tags perf ./internal/perf/`.
- Batch lookups use `= ANY(CAST(? AS bigint[]))` with `intsToArray`, so pgx's statement cache hits for any batch size; `querycount` SQL matchers expect that form, not `IN (`.
- **Writes:** GORM runs with `SkipDefaultTransaction` (no BEGIN/COMMIT around a single statement). Use `clause.Returning{}` instead of re-reading the row. Enforce ownership in the `UPDATE`/`DELETE` WHERE clause and read the row only on a zero-row miss to tell not-found from forbidden. Never `Save()` behind a scoped WHERE: its zero-row fallback is an upsert.
- **Cached repositories** (`adapters/repositories/cached/`) wrap small, rarely written, widely read tables (users, categories): id-keyed TTL cache, injected clock, generation counter; writes refresh their entry from the `RETURNING` row. Use the same shape for new lookup tables.

Full table and examples: [.docs/QUERY_BUDGET.md](../.docs/QUERY_BUDGET.md).

## Adding a New Feature

Order: domain model (`core/domain/`) → repository port (`core/ports/repositories/`) → service (`core/services/`) → repository impl (`adapters/repositories/postgres/`) → `schema.graphql` + `make graphql-gen` → resolver in the per-domain file (see GraphQL) → wire in `cmd/server/main.go` → tests in `test/services/`, `test/repositories/`.

## Gotchas

**Owner-only mutations need a guard at every layer, not just `@owner`.** Re-derive the actor in the resolver via `auth.RequireAuth(ctx)` (never trust a client-supplied user ID), pass it to the service (e.g. `Delete(ctx, id, actorUserID)`) which returns `domain.ErrForbidden`, and scope the SQL (`WHERE user_id = ? AND id = ?`). See `deletePerspective`. `updatePerspective`/`deletePerspective` deliberately skip `@owner` (its lookup was a duplicate round trip); the service check plus owner-scoped SQL guard them, with the same not-found / access-denied split. A non-owner hitting someone else's **non-PUBLIC** perspective gets "resource not found", not "access denied", so the ID isn't confirmed (matches `perspectiveByID` returning null).

**The owning user's column is always `user_id`** (FK `users(id)`). Other related users (participants, assignees) go in their own join table, not a second column.

**User-visible, user-owned rows carry `privacy`** (`PUBLIC` / `PRIVATE`, default `PUBLIC`, reusing `domain.Privacy`). List reads return public OR the viewer's own rows (`ViewerID` + `RestrictToPublicOrOwner`); a by-id read returns `null`, not an error, for someone else's private row. Details: [.docs/DOMAIN_GUIDE.md](../.docs/DOMAIN_GUIDE.md#privacy).

**A model-bound schema field with no resolver is always null.** When `gqlgen.yml` binds a type to a Go model lacking the field (e.g. `Perspective.user`), gqlgen silently resolves null. Add `resolver: true` for that field and resolve it through a dataloader.

**gqlgen passes defaults as non-nil pointers:** `first: Int = 10` arrives as a pointer to `10`, not `nil`; tests expect the default.

**JSON scalar:** use `graphql.Map` (bound as `JSON` in `gqlgen.yml`) for JSONB.

**gqlgen test client (`gqlgen/client`)** rejects response keys with no matching struct field (`'x' has invalid keys`). Spell out every selected field in the decode target, or decode into `map[string]json.RawMessage`.

**Non-schema model fields:** `extraFields` under a type in `gqlgen.yml` (e.g. `Content.PrimaryCategoryID`) carries data (like an FK) onto a generated model for a resolver; then `go run github.com/99designs/gqlgen generate` and populate it in `domainToModel`.

**Directive arg introspection:** `graphql.GetFieldContext(ctx).Args["input"]` is the *typed* input struct (e.g. `model.UpdatePerspectiveInput`), not a map. Read it by `json` tag via reflection; a map-only type assertion silently fails for every real request. See `directives/auth.go` `extractResourceID`/`fieldByJSONTag`.

**`encoding/json` runs on the v2 engine (Go 1.27):** Unmarshal is ~35% faster, but each small `json.Marshal` costs +2 allocs (~20–40% slower). A reused `jsontext.Encoder` is slower still; only hand appenders (`jsontext.AppendQuote`) win, and aren't worth it at DB-bound µs scale. Benches: `go test -run '^$' -bench . ./internal/adapters/{repositories/postgres,realtime,tmdb}/`; A/B the old engine with `GOEXPERIMENT=nojsonv2`.

**Metric cardinality:** any metric attribute whose value comes from request input (operation name, client version/platform) goes through `telemetry.BoundedSet` (`pkg/telemetry/bounded.go`).

**GORM tracing is in-house** (`pkg/database/tracing.go`). Don't add `gorm.io/plugin/opentelemetry` (it pulls ClickHouse + MySQL drivers into the binary). SQL spans are named `"<VERB> <table>"` (e.g. `SELECT content`).

**`Perspective.ReviewStatus` is moderation state** (`PENDING`/`APPROVED`/`REJECTED`); put draft/imported markers in `labels` or `customFields`.

### Enum & ID Handling (REQUIRED)

**Bind enums with gqlgen model binding; never write switch statements for enum conversion.**

- Domain enums are typed strings with UPPERCASE values (`SortOrderAsc SortOrder = "ASC"`), bound under `models:` in `gqlgen.yml` to `github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain.<Type>`.
- DB-stored enums: lowercase ↔ UPPERCASE converters in the repository. The column is lowercase `text`, `NOT NULL`, defaulted, and `CHECK (col IN (...))`-constrained (see `000018_harden_perspective_privacy`).
- New enum checklist: UPPERCASE constants → bind in `gqlgen.yml` → DB converter if stored → `make graphql-gen`.
- Filter/input ID fields use the `IntID` scalar (`pkg/graphql/intid.go`), not `ID` + `strconv.Atoi`. Top-level query/mutation ID params (e.g. `contentByID(id: ID!)`) still use `strconv.Atoi`.

## Go Version Management

- `go.mod` pins the exact patch (no `toolchain` line); CI's setup-go reads it via `go-version-file`, so bumping the patch there moves CI. **Never hardcode Go versions in CI or deployment configs**; reference `go.mod`.
- Dockerfiles pin the base image (`golang:1.27-alpine`).
- **Upgrading Go:** `go mod edit -go=<ver>` → `go mod tidy` → bump both Dockerfiles (`Dockerfile`, `Dockerfile.demo`) → README prerequisites.
- Cloud containers ship an older Go; `GOTOOLCHAIN=auto` downloads the go.mod version on first use. Prefix `GOTOOLCHAIN=go1.X.Y` to run a specific one.

## Migrations

**Never run `make migrate-up` / `make migrate-down` (or `migrate ... up/down`) during dev or verification.** `DATABASE_URL` / the Makefile default is the **shared Neon database**. Nothing on Sevalla or in CI applies migrations (no runner in `cmd/server`, no CI step, no pre-deploy hook; the image's `/migrations` dir is never executed); they're applied **manually per environment** at rollout. The only safe local Postgres is the isolated demo stack (`make demo-up` from repo root, port 5434, own volume; start Docker Desktop with `open -a Docker`).

- Migration work = write + review the SQL (`make migrate-create`). The PR states it needs a manual `migrate up` per environment; the `Migration labels` workflow tags it `migrations-unapplied`, swapped for `migrations-applied` by hand once applied everywhere (`.docs/PR_WORKFLOW.md` → Migration labels). Applying one (default `up 1`, snapshot first): [.docs/MIGRATION_ROLLOUT.md](../.docs/MIGRATION_ROLLOUT.md).
- **Numbering:** find the next number with `ls migrations/ | tail -5` (plan-specified numbers may be stale). Numbers on open PRs are **provisional**: don't renumber around other in-flight branches; rename to the next free number on `main` as the last step before merging (golang-migrate won't run with two files sharing a version on `main`). `check-migration-number-before-apply` still on a PR means that rename is due.
- Prefer idempotent DDL (`DROP CONSTRAINT IF EXISTS` before `ADD`, `UPDATE ... WHERE col IS NULL` before `SET NOT NULL`) so a migration is safe on a fresh DB or one patched out of band.

**FK delete behavior depends on the FK's kind** (the "All FKs use ON DELETE RESTRICT" comment in `000006` predates the exceptions):
- Ownership FKs to `users` and FKs to `content` **block** (explicit `ON DELETE RESTRICT` for new ones). `UserService.Delete` reassigns owned rows to the `[deleted]` sentinel first, so a new user-owned table needs a `ReassignByUser` call there (messaging isn't covered yet: #574).
- Optional pointers use **`SET NULL`** (`primary_category_id`, `primary_perspective_id`).
- Child rows of an aggregate use **`CASCADE`** (messaging tables → `message_threads`).

## Agent Delegation

Backend subagents: `go-backend`, `graphql-designer`, `db-migration`, `code-reviewer`, `test-writer` (`.claude/agents/`); architecture decisions stay in the main session. Each agent's model is set in its `model:` frontmatter; don't override it with the Agent tool's `model` parameter.

## Self-Verification

**`go run ./cmd/server` does not hot-reload.** Before manual browser verification, confirm the process on :8080 postdates your changes (`lsof -i :8080`, `ps -p <pid> -o command`) or restart it; use `make dev` (air) for hot-reload.
