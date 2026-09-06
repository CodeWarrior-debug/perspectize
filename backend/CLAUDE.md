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
│   └── middleware/    # HTTP middleware
├── pkg/              # database/ (connection), graphql/ (IntID scalar)
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

## Stack

Go 1.25+ (pinned via `toolchain` in go.mod + Dockerfile) · gqlgen (schema-first) · PostgreSQL 17 (GORM + pgx/v5) · golang-migrate · go-playground/validator · testify · log/slog · godotenv

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
go mod download && make docker-up && make migrate-up && cp .env.example .env
make install-hooks    # Activate pre-commit (gofmt + prettier)

# Daily
make run              # Server on :8080
make dev              # Hot-reload (air)
make test             # All tests
make test-coverage    # Coverage → coverage.html
make fmt && make lint # Format + lint
make graphql-gen      # Regen after schema changes

# Migrations
make migrate-up       # Apply pending
make migrate-down     # Rollback last
make migrate-create   # New migration (prompts for name)
make migrate-version  # Current version
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

**Database is remote (Sevalla)** — `DATABASE_URL` in `.env` points to `us-east1-001.proxy.sevalla.app`. No `make docker-up` needed for development. Migrations run against the remote DB.

## GraphQL

Schema-first in `schema.graphql`. After changes: `make graphql-gen` → implement resolvers in `internal/adapters/graphql/resolvers/` → wire to services.

## Testing

- **Unit:** Mock deps, no DB. `make test`.
- **Integration:** Auto-skip when DB unavailable (`t.Skip()`).
- **Env isolation:** Tests loading config must clear env vars via `t.Setenv("KEY", "")`. See `clearConfigEnvVars` in `test/config/config_test.go`.

## Code Style

Structured logging with `slog` · dependency injection via ports.

Error handling & DB query patterns: [.docs/GO_PATTERNS.md](../.docs/GO_PATTERNS.md)

## Adding a New Feature

1. Domain model: `internal/core/domain/feature.go`
2. Repository port: `internal/core/ports/repositories/feature_repository.go`
3. Service: `internal/core/services/feature_service.go`
4. Repository impl: `internal/adapters/repositories/postgres/feature_repository.go`
5. Schema: `schema.graphql` → `make graphql-gen`
6. Resolver: `internal/adapters/graphql/resolvers/feature_resolver.go`
7. Wire: `cmd/server/main.go`
8. Tests: `test/services/`, `test/repositories/`

## CORS

CORS middleware is configured in `cmd/server/main.go` for local development. Currently allows all origins (`*`). Restrict to frontend's production origin before deploying.

## Gotchas

**GraphQL defaults:** gqlgen passes `first: Int = 10` as non-nil pointer (value `10`), not `nil`. Tests must expect the default value.

**Adding repository interface methods:** When adding a new method to a port interface (e.g., `ListAll` on `UserRepository`), all test mocks that implement that interface must also be updated or compilation fails. Check `test/` for mock implementations.

**JSON scalar:** Use `graphql.Map` (configured as `JSON` in `gqlgen.yml`) for JSONB data.

**gqlgen test client (`gqlgen/client`):** rejects response keys with no matching struct field (`'x' has invalid keys`). Spell out *every* selected field in the decode target, or decode into `map[string]json.RawMessage`.

**Non-schema model fields:** use `extraFields` under a type in `gqlgen.yml` (e.g. `Content.PrimaryCategoryID`) to carry data (like an FK) onto a generated model for a resolver to use, then `go run github.com/99designs/gqlgen generate`. Populate it in `domainToModel`.

**Directive arg introspection:** `graphql.GetFieldContext(ctx).Args["input"]` is the *typed* input struct (e.g. `model.UpdatePerspectiveInput`), not `map[string]interface{}`. Directive/middleware code that digs a value out of an input object must read the struct (by `json` tag via reflection), not just type-assert to a map — a map-only assertion silently fails for every real request. See `directives/auth.go` `extractResourceID`/`fieldByJSONTag`.

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
- `go 1.25` — minimum required (set by dependencies like gqlgen)
- `toolchain go1.26.0` — version used for local development

**Dockerfile pins the base image** (`golang:1.26-alpine`) so Sevalla builds always use a known-good version.

**CI uses `go-version-file`** (`backend/go.mod`) so GitHub Actions auto-detects the version.

**When Go updates locally** (e.g., Homebrew): only the `toolchain` line changes. The `go` minimum stays stable unless a dependency forces it up. Update the Dockerfile base image to match.

**Never hardcode Go versions** in CI or deployment configs. Always reference `go.mod`.

## Self-Verification

**Stale server check:** `go run ./cmd/server` does not hot-reload. Before manual browser verification, confirm the running process postdates your changes — check with `lsof -i :8080` + `ps -p <pid> -o command`, or just kill and restart. Use `make dev` (air) if you need actual hot-reload across a session.

```bash
curl -s -X POST http://localhost:8080/graphql \
  -H "Content-Type: application/json" \
  -d '{"query": "{ __typename }"}' | grep -q '"Query"' && echo "OK" || echo "FAIL"
```
