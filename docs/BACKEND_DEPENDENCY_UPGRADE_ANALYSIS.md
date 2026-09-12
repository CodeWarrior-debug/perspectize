# Backend Dependency Upgrade Analysis

**Generated:** 2026-09-12
**Scope:** `backend/go.mod` (Go GraphQL API), **direct (non-indirect) dependencies only**
**Tool used:** `go list -m -u -versions ./...` (Go's built-in module tooling — there's no widely-adopted third-party "ncu for Go"; `go list -u` against the module graph is the standard equivalent) plus `go.mod`'s own `go`/`toolchain` directives and `proxy.golang.org` publish timestamps for age.

## Result summary

The backend is in **very good shape**: of 20 direct dependencies, **19 are already on the latest published version**. Only one is behind:

| Package | Current | Latest | Behind | Function | Benefits of upgrading | Drawbacks / Risks | Recommendation |
|---|---|---|---|---|---|---|---|
| `github.com/jackc/pgx/v5` | v5.10.0 | v5.11.0 | ~3 months (2026-06-03 → 2026-09-07) | PostgreSQL driver used under GORM's `gorm.io/driver/postgres` for all DB access | Minor release — bug fixes and small feature additions to the Postgres wire-protocol driver; low-risk to take | Minor version bump, but it's the driver for every DB query in the app — validate connection pooling / `pgxpool` config options haven't changed defaults before deploying | **Upgrade now**, run full backend test suite (`go test ./...`) before merging since this touches every DB-backed code path |

Toolchain: `go.mod` already pins `go 1.26` / `toolchain go1.26.0`, matching the `go version` installed in this environment — no Go toolchain upgrade needed.

## Already up to date (direct deps, no action needed)

| Package | Version | Function |
|---|---|---|
| `github.com/99designs/gqlgen` | v0.17.95 | GraphQL server code generator (schema-first) |
| `github.com/DATA-DOG/go-sqlmock` | v1.5.2 | SQL mock driver for repository-layer unit tests |
| `github.com/clerk/clerk-sdk-go/v2` | v2.7.0 | Clerk auth SDK (session/user verification) |
| `github.com/go-chi/chi/v5` | v5.3.2 | HTTP router |
| `github.com/go-chi/cors` | v1.2.2 | CORS middleware for chi |
| `github.com/go-chi/httprate` | v0.16.0 | Rate-limiting middleware for chi |
| `github.com/golang-jwt/jwt/v5` | v5.3.1 | JWT parsing/verification |
| `github.com/joho/godotenv` | v1.5.1 | `.env` file loading for local dev |
| `github.com/pilagod/gorm-cursor-paginator/v2` | v2.7.0 | Cursor-based pagination helper for GORM queries |
| `github.com/stretchr/testify` | v1.12.1 | Test assertions/mocks |
| `github.com/svix/svix-webhooks` | v1.99.1 | Webhook signature verification (Clerk webhooks) |
| `github.com/unrolled/secure` | v1.17.0 | Security headers middleware |
| `github.com/vektah/gqlparser/v2` | v2.5.37 | GraphQL query parser (gqlgen dependency, also used directly) |
| `github.com/vikstrous/dataloadgen` | v0.0.10 | DataLoader codegen for N+1 batching in GraphQL resolvers |
| `go.opentelemetry.io/otel` | v1.46.0 | OpenTelemetry API |
| `go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp` | v1.46.0 | OTLP trace exporter over HTTP |
| `go.opentelemetry.io/otel/sdk` | v1.46.0 | OpenTelemetry SDK |
| `go.opentelemetry.io/otel/trace` | v1.46.0 | OpenTelemetry tracing API |
| `gorm.io/driver/postgres` | v1.6.2 | GORM's Postgres driver adapter (wraps `pgx`) |
| `gorm.io/gorm` | v1.31.2 | ORM |

*(Note: `go.opentelemetry.io/otel*` has a `v1.47.0-rc.1` pre-release available upstream — intentionally excluded from the "latest" comparison above since it's a release candidate, not a stable release.)*

## Recommendation

Single small PR: bump `github.com/jackc/pgx/v5` to `v5.11.0` via `go get github.com/jackc/pgx/v5@v5.11.0 && go mod tidy` in `backend/`, run `go build ./...` and `go test ./...` per the mandatory self-verification checklist in `CLAUDE.md`, then commit as `chore: bump pgx to v5.11.0`. No other backend action needed at this time — re-run this check periodically (e.g. as part of the monthly maintenance routine) rather than on an ongoing basis, since the surface here is already current.
