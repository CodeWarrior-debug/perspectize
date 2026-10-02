# Backend: Perspectize Go

Go GraphQL API built with gqlgen, PostgreSQL 17, and Hexagonal Architecture.

## Architecture

```
backend/
├── cmd/server/       # Entry point
├── internal/
│   ├── core/         # domain/ (models), ports/ (interfaces), services/ (logic)
│   ├── adapters/     # graphql/ (primary), repositories/ (DB), youtube/ (API)
│   ├── config/       # Configuration loading
│   ├── demo/         # Demo-mode seeding
│   └── perf/         # Performance helpers
├── pkg/              # database/ (connection), graphql/ (IntID scalar), logger/, middleware/ (HTTP)
└── migrations/       # SQL migration files
```

Full structure: [.docs/ARCHITECTURE.md](../.docs/ARCHITECTURE.md)

**Dependency Rule:** Dependencies point inward. Domain never depends on adapters. Adapters depend on domain ports.

### Hexagonal Architecture

1. **Domain** — Models in `core/domain/` (pure Go, no external deps)
2. **Ports** — Interfaces in `core/ports/`
3. **Services** — Business logic in `core/services/`
4. **Adapters** — Infrastructure in `adapters/`
5. **Wiring** — Connect in `cmd/server/main.go`

Domain layer rules: [.docs/DOMAIN_GUIDE.md](../.docs/DOMAIN_GUIDE.md)

### Deep Modules

Small interface, lots of work hidden behind it (Ousterhout). Test: *how little must a caller know vs. how much does it handle?*

**Not the same as hexagonal — they stack.** Hexagonal decides *which way dependencies point* (core never imports adapters). Deep modules decides *whether each boundary is worth having*. Code can be perfectly hexagonal yet shallow: a port that mirrors every SQL query 1:1, or a service method that only calls the repo. Hexagonal draws the walls; deep modules makes each door earn its place.

- **One file per domain** — `adapters/graphql/resolvers/{content,perspective,user,category,messaging}.resolvers.go`. When `make graphql-gen` drops new stubs into `schema.resolvers.go`, move them to the matching domain file.
- **Callers see ports, not structs** — services depend on `core/ports` interfaces; never reach into a repository's SQL helpers.
- **Pull mapping down** — GraphQL model ↔ domain conversion lives once in `adapters/graphql/resolvers/helpers.go` (e.g. `modelToCreatePerspectiveInput`), not inline in each resolver.
- **No pass-through methods** — a service method that only forwards to the repo with no rule/validation is a smell; give it responsibility or call the port directly.

Refs: Ousterhout, *A Philosophy of Software Design*; Matt Pocock, [How To Make Codebases AI Agents Love](https://www.aihero.dev/how-to-make-codebases-ai-agents-love) (why deep modules help agents navigate). Origin: PR #339.

## Stack

Go 1.26+ (pinned via `toolchain` in go.mod + Dockerfile) · gqlgen (schema-first) · PostgreSQL 17 (GORM + pgx/v5) · golang-migrate · go-playground/validator · testify · log/slog · godotenv

### ORM: GORM (Hex-Clean Separate Model Pattern)

- **Domain models** (`core/domain/`) — pure Go, zero GORM imports
- **GORM models** (`adapters/repositories/postgres/gorm_models.go`) — `gorm:` tagged structs
- **Mappers** (`gorm_mappers.go`) — bidirectional domain ↔ GORM conversion
- **Repositories** (`gorm_*_repository.go`) — GORM chaining for dynamic queries
- **Shared helpers** (`helpers.go`) — cursor encoding, sort mapping, enum converters
- **Pagination** — `gorm-cursor-paginator` (`Paginate()`, used by `GormContentRepository`/`GormPerspectiveRepository`). **Gotcha (v2.7.0):** `Paginate()`'s named `err` return stays nil on a `Find()` failure — it only sets `.Error` on the returned `*gorm.DB`. Always check both: `if err != nil {...}; if pageResult.Error != nil {...}` (see issue #327). `GormUserRepository`/`GormCategoryRepository` still use hand-rolled `encodeCursor`/`decodeCursor`.

## Commands

```bash
# Setup
go mod download && cp .env.example .env   # then fill .env by hand; no local DB setup (see Configuration)
make install-hooks    # Activate pre-commit (gofmt + prettier)

# Daily
make run              # Server on :8080
make dev              # Hot-reload (air)
make test             # All tests
make test-coverage    # Coverage → coverage.html
make fmt && make lint # Format + lint
make graphql-gen      # Regen after schema changes

# Migrations — create/inspect only during dev; see Migrations below before any up/down
make migrate-create   # New migration (prompts for name)
make migrate-version  # Current version
make migrate-up       # Rollout only, per environment — never in dev
make migrate-down     # Rollout only — never in dev
make migrate-force    # Force version (recovery)

# Docker (PostgreSQL)
make docker-up / make docker-down / make docker-logs
```

## Configuration

Two sources (precedence order): **env vars** > `config/config.json`.
Required: `DATABASE_URL`. Optional: `YOUTUBE_API_KEY`, `DATABASE_PASSWORD`.
See `.env.example` — it lists every variable by name (values blank on purpose).
Copy it to `backend/.env` and fill in real values by hand; the agent cannot read
`.env` (see [../.docs/SECURITY.md](../.docs/SECURITY.md)). Production note: Sevalla
may require `?sslmode=disable`.

**Sevalla build strategy:** Dockerfile builder. Dockerfile path = `backend/Dockerfile` (relative to repo root, not context). Docker context = `backend`. Sevalla requires the redundant `backend/` prefix on the Dockerfile path even though context is already `backend`.

**Database is remote (Sevalla)** — `DATABASE_URL` in `.env` points to `us-east1-001.proxy.sevalla.app`. No `make docker-up` needed for development. Because it is shared, never run migrations against it from dev — see Migrations.

## GraphQL

Schema-first in `schema.graphql`. After changes: `make graphql-gen` → implement resolvers in `internal/adapters/graphql/resolvers/` → wire to services.

**`make graphql-gen` always leaves a colliding `schema.resolvers.go` behind.** `gqlgen.yml` uses `layout: follow-schema`, which names resolver files after the schema file — one `schema.graphql` means gqlgen insists on writing one `resolvers/schema.resolvers.go` holding *every* resolver. The resolvers were since split by domain (`content`/`category`/`perspective`/`user.resolvers.go`), so that file redeclares all of them and the run ends with `method Resolver.Content already declared` / `contentResolver redeclared in this block`.

The failure is confined to that last step: `generated.go` and `models_gen.go` are written *before* it, so the regeneration you wanted did happen. Recover by deleting the stray file (`rm internal/adapters/graphql/resolvers/schema.resolvers.go`) and rebuilding — but **diff it first** when the schema gained a field, because the stub for that new field is in there and belongs in the matching per-domain file. Don't automate the `rm` in the Makefile for that reason. The real fix is to split `schema.graphql` per domain so `follow-schema` lines up with the resolver files.

**Adding a query/mutation arg regenerates the resolver signature, positionally.** After `make graphql-gen`, the new arg lands wherever it sits in the schema's arg list — not appended at the end of the Go signature. Read the stub in the stray `schema.resolvers.go` (see above) to get the exact updated signature, then copy it verbatim into the real per-domain resolver file; don't hand-guess the param order.

## Testing

- **Unit:** Mock deps, no DB. `make test`.
- **Integration:** Auto-skip when DB unavailable (`t.Skip()`), so a green run without `DATABASE_URL` may have tested nothing. In a cloud session, run `pg_ctlcluster 16 main start`, migrate a **local** `testdb` (never the shared Sevalla DB), then run `DATABASE_URL=postgres://…/testdb go test -p 1 ./...`.
- **Query counts:** assert statement counts with `internal/perf/querycount` — see Query budget below.
- **Build-tagged harnesses rot.** Code behind the `perf` tag isn't compiled by `go build/test ./...`; CI vets it (`go vet -tags perf ./internal/perf/...`). Run that vet after changing `NewResolver` / `dataloader.Middleware` signatures.
- **Env isolation:** Tests loading config must clear env vars via `t.Setenv("KEY", "")`. See `clearConfigEnvVars` in `test/config/config_test.go`.
- **Mutation testing:** always `make mutate` / `make mutate-diff`, never bare `gremlins`. They run `mutate-preflight` (unmutated suite in an isolated copy of `backend/`, must be green) and skip the tests in `MUTATE_SKIP`. A new test that reads outside `backend/` (`../../../data/…`) must be added to `MUTATE_SKIP` or, better, made hermetic. Run on an idle machine: a flaky test failing mid-run counts as a catch (#518), and the first baseline overstated catches by at least 17.
- **Cloud sandbox:** `go: no such tool "covdata"` (auto-downloaded toolchain) → `go build -o "$(go env GOROOT)/pkg/tool/linux_amd64/covdata" cmd/covdata`. Gremlins fills the Go build cache fast; `go clean -cache` before a long run if disk is tight.

## Query budget (REQUIRED for DB-touching changes)

Every repository method, service method or resolver that touches the database has a **query budget**: the number of SQL statements it issues, asserted in a test so a regression fails CI. Use `internal/perf/querycount` (GORM-callback counter; works with go-sqlmock and real Postgres):

```go
c := querycount.Attach(t, db)
_, _ = repo.GetByIDs(ctx, seqIDs(50))
c.AssertExactly(t, 1) // batch: 1 query for 50 ids, never 50
```

- Batch methods (`...ByIDs`, `Aggregate...`): same count for 1 and 50 inputs; empty input issues 0. List queries: assert the page (+ count only when `includeTotalCount`).
- A GraphQL field that loads per-parent data goes through a dataloader (`adapters/graphql/dataloader`), with a loader test proving N loads → 1 service call.
- Set the budget to what the path costs **today**, not a generous ceiling.
- Reject in review: a repo/service call inside a loop over results, a `Preload` the caller never reads, the same lookup in both middleware and resolver.
- **Whole-request round trips are pinned in `test/roundtrips`**, which runs the real middleware, gqlgen, services and GORM stack against Postgres. A new or changed GraphQL operation gets a count there. `RT_MEASURE=1` prints each statement instead of failing.
- Batch lookups use `= ANY(CAST(? AS bigint[]))` with `intsToArray`, so pgx's statement cache hits for any batch size. `querycount` SQL matchers should expect that form, not `IN (`.
- **Writes:** GORM runs with `SkipDefaultTransaction` (no BEGIN/COMMIT around a single statement). Use `clause.Returning{}` instead of re-reading the row. Enforce ownership in the `UPDATE`/`DELETE` WHERE clause, and read the row only on a zero-row miss to tell not-found from forbidden. Never `Save()` behind a scoped WHERE: its zero-row fallback is an upsert.
- Opt-in whole-request harness: `go test -tags perf ./internal/perf/` (CI compiles it via `go vet -tags perf`).

Full table and examples: [.docs/QUERY_BUDGET.md](../.docs/QUERY_BUDGET.md).

## Code Style

Structured logging with `slog` · dependency injection via ports.

Error handling & DB query patterns: [.docs/GO_PATTERNS.md](../.docs/GO_PATTERNS.md)

## Adding a New Feature

1. Domain model: `internal/core/domain/feature.go`
2. Repository port: `internal/core/ports/repositories/feature_repository.go`
3. Service: `internal/core/services/feature_service.go`
4. Repository impl: `internal/adapters/repositories/postgres/feature_repository.go`
5. Schema: `schema.graphql` → `make graphql-gen`
6. Resolver: `internal/adapters/graphql/resolvers/<domain>.resolvers.go` (move stubs out of `schema.resolvers.go`, see GraphQL)
7. Wire: `cmd/server/main.go`
8. Tests: `test/services/`, `test/repositories/`

## CORS

CORS middleware is part of the API middleware chain in `internal/server/api.go` (`server.Middleware`, built from `server.Deps`, which `cmd/server/main.go` fills in). The allowed origins come from `CORS_ORIGINS` (`internal/config/security.go`, comma-separated). It defaults to `*` when unset (and the example env file sets `*`), so set it to the frontend's origin in every deployed environment.

## Gotchas

**Owner-only mutations need a guard at every layer, not just `@owner`.** The directive is one check; also re-derive the actor in the resolver via `auth.RequireAuth(ctx)` (never trust a client-supplied user ID), pass it into the service method (e.g. `Delete(ctx, id, actorUserID)`) and return `domain.ErrForbidden` there, and scope the SQL itself (`WHERE user_id = ? AND id = ?`). See `deletePerspective`. `updatePerspective` and `deletePerspective` deliberately skip `@owner`, because its lookup was a duplicate round trip. The service check plus owner-scoped SQL are the two guards there, and the service returns the same not-found / access-denied split. When a non-owner hits someone else's **non-PUBLIC** perspective, `@owner` answers "resource not found", not "access denied", so the ID isn't confirmed to exist (matches `perspectiveByID` returning null).

**A model-bound schema field with no resolver is always null.** When `gqlgen.yml` binds a type to a Go model that lacks the field (e.g. `Perspective.user`), gqlgen resolves it silently to null. Add `resolver: true` for that field in `gqlgen.yml` and resolve it through a dataloader.

**GraphQL defaults:** gqlgen passes `first: Int = 10` as non-nil pointer (value `10`), not `nil`. Tests must expect the default value.

**Adding repository interface methods:** When adding a new method to a port interface (e.g., `ListAll` on `UserRepository`), all test mocks that implement that interface must also be updated or compilation fails. Check `test/` for mock implementations.

**JSON scalar:** Use `graphql.Map` (configured as `JSON` in `gqlgen.yml`) for JSONB data.

**gqlgen test client (`gqlgen/client`):** rejects response keys with no matching struct field (`'x' has invalid keys`). Spell out *every* selected field in the decode target, or decode into `map[string]json.RawMessage`.

**Non-schema model fields:** use `extraFields` under a type in `gqlgen.yml` (e.g. `Content.PrimaryCategoryID`) to carry data (like an FK) onto a generated model for a resolver to use, then `go run github.com/99designs/gqlgen generate`. Populate it in `domainToModel`.

**Directive arg introspection:** `graphql.GetFieldContext(ctx).Args["input"]` is the *typed* input struct (e.g. `model.UpdatePerspectiveInput`), not `map[string]interface{}`. Directive/middleware code that digs a value out of an input object must read the struct (by `json` tag via reflection), not just type-assert to a map — a map-only assertion silently fails for every real request. See `directives/auth.go` `extractResourceID`/`fieldByJSONTag`.

**`Perspective.ReviewStatus`** is moderation state (`PENDING`/`APPROVED`/`REJECTED`) — don't reuse it for draft/imported markers; use `labels` or `customFields`.

**Cursor pagination:** Opaque base64 (`cursor:<id>`), keyset (not OFFSET), fetch `limit+1` for `hasNextPage`, whitelist sort columns (SQL injection prevention). Helpers in `helpers.go`.

### Enum & ID Handling (REQUIRED)

**Always use gqlgen model binding** — never write switch statements for enum conversion.

```go
// 1. Domain enums with UPPERCASE values
type SortOrder string
const (
    SortOrderAsc  SortOrder = "ASC"
    SortOrderDesc SortOrder = "DESC"
)
```

```yaml
# 2. Bind in gqlgen.yml
models:
  SortOrder:
    model:
      - github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain.SortOrder
```

3. DB-stored enums: add repository converters (lowercase ↔ UPPERCASE).
4. Use `IntID` scalar (`pkg/graphql/intid.go`) instead of `ID` with `strconv.Atoi` for filter/input fields. Top-level query/mutation ID params (e.g., `contentByID(id: ID!)`) still use `strconv.Atoi`.

**New enum checklist:** UPPERCASE constants → bind in `gqlgen.yml` → DB converter if stored → `make graphql-gen`

## Go Version Management

**`go.mod` uses `toolchain` directive** to decouple minimum version from local dev version:
- `go 1.26` — minimum required (set by dependencies like gqlgen)
- `toolchain go1.26.0` — version used for local development

**Dockerfile pins the base image** (`golang:1.27-alpine`) so Sevalla builds always use a known-good version.

**CI uses `go-version-file`** (`backend/go.mod`) so GitHub Actions auto-detects the version.

**When Go updates locally** (e.g., Homebrew): only the `toolchain` line changes. The `go` minimum stays stable unless a dependency forces it up. Update the Dockerfile base image to match.

**Never hardcode Go versions** in CI or deployment configs. Always reference `go.mod`.

## Migrations

**Never run `make migrate-up` / `make migrate-down` (or `migrate ... up/down`) during dev or verification.** Docker itself is installed (Docker Desktop; start it with `open -a Docker`), but the normal dev setup has no local Postgres — `DATABASE_URL` / the Makefile default points at the **shared Sevalla dev database**, so `make migrate-up` mutates shared state. The only local Postgres is the isolated demo stack's (`make demo-up` from the repo root, port 5434, its own volume) — that one is safe to reset and never touches Sevalla. Migrations are applied **manually per environment** at rollout time (verified: nothing on Sevalla runs them — no runner in `cmd/server`, no CI step, no release/pre-deploy hook; the `/migrations` dir baked into the image is never executed). Migration work = write + review the SQL only; a PR that adds a migration must state it needs a manual `migrate up` against each environment. The `Migration labels` workflow tags it `migrations-unapplied`. Swap that for `migrations-applied` by hand once it's applied everywhere (`.docs/PR_WORKFLOW.md` → Migration labels).

**Migration numbering:** Always check existing migration files before creating new ones. Plan-specified numbers may be stale — use `ls migrations/ | tail -5` to find the next available number. Numbers on open PRs are **provisional**: don't renumber around other in-flight branches. Finalize the number as the last step before merging (rename to the next free number on `main`). It can't wait until after merge, because golang-migrate won't run with two files sharing a version on `main`. `check-migration-number-before-apply` still on a PR means that rename is due. Prefer idempotent DDL (`DROP CONSTRAINT IF EXISTS` before `ADD`, `UPDATE ... WHERE col IS NULL` before `SET NOT NULL`) so a migration is safe on a fresh DB or one already patched out of band.

## Agent Delegation

| Task Type | Model | Subagent | Rationale |
|-----------|-------|----------|-----------|
| Architecture decisions | Opus | - | Complex multi-file reasoning |
| Go implementation | Sonnet | `go-backend` | Balanced quality/cost |
| GraphQL schema design | Sonnet | `graphql-designer` | Schema patterns |
| Database migrations | Sonnet | `db-migration` | SQL generation |
| Code review | Haiku | `code-reviewer` | Fast pattern matching |
| Test generation | Haiku | `test-writer` | Boilerplate generation |

## References

[gqlgen](https://gqlgen.com/) | [Hexagonal Architecture](https://alistair.cockburn.us/hexagonal-architecture/) | [Effective Go](https://go.dev/doc/effective_go) | [PostgreSQL 17](https://www.postgresql.org/docs/17/)

## Self-Verification

**Stale server check:** `go run ./cmd/server` does not hot-reload. Before manual browser verification, confirm the running process postdates your changes — check with `lsof -i :8080` + `ps -p <pid> -o command`, or just kill and restart. Use `make dev` (air) if you need actual hot-reload across a session.

```bash
curl -s -X POST http://localhost:8080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}' | grep -q '"Query"' && echo "OK" || echo "FAIL"
```
