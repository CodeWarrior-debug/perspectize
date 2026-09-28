# Phase 7: Backend Architecture - Research

**Researched:** 2026-02-13
**Domain:** Go hexagonal architecture, server hardening, dependency injection
**Confidence:** HIGH

## Summary

This phase addresses 11 specific concerns (H-01, H-02, H-09, M-01, M-02, M-05, M-06, M-09, M-10, M-12, M-17) involving hexagonal architecture violations, dependency injection improvements, and server infrastructure hardening in a Go backend using gqlgen, sqlx, and pgx.

The codebase is already well-structured with hexagonal layers (`domain` -> `ports` -> `services` -> `adapters`) and has repository port interfaces defined. The main violations are: (1) the resolver imports the YouTube adapter directly to pass `ExtractVideoID` as a function parameter, (2) the resolver depends on concrete service types instead of port interfaces, and (3) `lib/pq` is used for PostgreSQL array types alongside `pgx`. Server infrastructure needs graceful shutdown improvements, health/ready endpoints, request logging middleware, and configuration hardening.

**Primary recommendation:** Define service port interfaces in `core/ports/services/`, make `ExtractVideoID` a method on the YouTube client (injected via constructor), replace `lib/pq` array types with `pgx` equivalents, and add chi router for middleware support.

## Standard Stack

### Core (Already in use)
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| gqlgen | v0.17.86 | Schema-first GraphQL | Already in project, schema-first is standard for Go |
| pgx/v5 | v5.7.6 | PostgreSQL driver | Pure Go, best perf, already primary driver |
| sqlx | v1.4.0 | SQL extensions | Wraps database/sql, used throughout |
| log/slog | stdlib | Structured logging | Go 1.21+ standard library, already used |

### To Add
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| chi | v5 | HTTP router | Replace `net/http` DefaultServeMux for middleware support |
| pgx/v5/pgtype | v5.7.6 | PostgreSQL types | Replace `lib/pq` for array types (Int4Array, TextArray) |

### To Remove
| Library | Reason | Replacement |
|---------|--------|-------------|
| `lib/pq` | Dual driver concern M-01; only used for `pq.StringArray`, `pq.Int64Array`, `pq.Array()` | `pgx/v5/pgtype` types or custom scanner implementations |

### Alternatives Considered
| Instead of | Could Use | Tradeoff |
|------------|-----------|----------|
| chi router | gorilla/mux | chi is more lightweight, better middleware chaining, idiomatic |
| chi router | standard `net/http` mux (Go 1.22+) | Go 1.22+ has pattern matching, but chi has built-in middleware library |

**Installation:**
```bash
go get github.com/go-chi/chi/v5
# pgx/v5/pgtype is already available via pgx/v5 dependency
```

## Architecture Patterns

### Current State (What Exists)

The codebase already has hexagonal architecture with clear layers:

```
backend/internal/
├── core/
│   ├── domain/           # Pure domain models (no external deps) - GOOD
│   ├── ports/
│   │   ├── repositories/ # Repository interfaces - GOOD (3 interfaces defined)
│   │   └── services/     # YouTubeClient interface - GOOD (1 interface defined)
│   └── services/         # Business logic - uses ports correctly
├── adapters/
│   ├── graphql/resolvers/ # VIOLATION: imports concrete services, imports youtube adapter
│   ├── repositories/     # VIOLATION: uses lib/pq (dual driver)
│   └── youtube/          # Implements YouTubeClient port correctly
└── config/               # VIOLATION: hardcoded path
```

### Pattern 1: Service Port Interfaces

**What:** Define interfaces for each service in `core/ports/services/` so resolvers depend on interfaces, not concrete types.
**When to use:** This is the fix for H-02.

```go
// core/ports/services/content_service.go
package services

import (
    "context"
    "github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// ContentService defines the contract for content business logic
type ContentService interface {
    CreateFromYouTube(ctx context.Context, url string) (*domain.Content, error)
    GetByID(ctx context.Context, id int) (*domain.Content, error)
    ListContent(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error)
}
```

**Key change:** `CreateFromYouTube` no longer takes `extractVideoID func(string) (string, error)` as a parameter. The video ID extraction is an internal implementation detail of the service that uses its injected `YouTubeClient`.

### Pattern 2: VideoIDExtractor as Interface Method

**What:** Move `ExtractVideoID` from a standalone function to a method on the `YouTubeClient` interface or a separate `VideoIDExtractor` interface.
**When to use:** This is the fix for M-05 and H-01.

**Option A (recommended): Add to YouTubeClient interface**
```go
// core/ports/services/youtube_client.go
type YouTubeClient interface {
    GetVideoMetadata(ctx context.Context, videoID string) (*VideoMetadata, error)
    ExtractVideoID(url string) (string, error)
}
```

**Option B: Inject via constructor**
```go
// core/services/content_service.go
type ContentService struct {
    repo          repositories.ContentRepository
    youtubeClient portservices.YouTubeClient
    extractVideoID func(string) (string, error) // injected at construction
}
```

Option A is cleaner because the YouTube client already owns video ID extraction logic. The `parser.go` functions become methods on the `Client` struct.

### Pattern 3: Resolver Using Interfaces

**What:** Resolver struct holds port interfaces, not concrete types.
**When to use:** This is the fix for H-01 and H-02.

```go
// adapters/graphql/resolvers/resolver.go
package resolvers

import (
    portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

type Resolver struct {
    ContentService     portservices.ContentService
    UserService        portservices.UserService
    PerspectiveService portservices.PerspectiveService
}
```

### Pattern 4: Chi Router with Middleware

**What:** Use chi router for structured middleware (logging, CORS, recovery).
**When to use:** This is the fix for M-06.

```go
import (
    "github.com/go-chi/chi/v5"
    "github.com/go-chi/chi/v5/middleware"
)

r := chi.NewRouter()
r.Use(middleware.RequestID)
r.Use(middleware.RealIP)
r.Use(middleware.Logger)    // M-06: request logging
r.Use(middleware.Recoverer) // panic recovery
r.Use(corsMiddleware)

r.Get("/health", healthHandler)
r.Get("/ready", readyHandler)
r.Handle("/graphql", srv)
if !isProduction {
    r.Handle("/", playground.Handler("GraphQL Playground", "/graphql"))
}
```

### Pattern 5: Config Path from Environment

**What:** Load config path from `CONFIG_PATH` env var with fallback.
**When to use:** This is the fix for H-09.

```go
configPath := os.Getenv("CONFIG_PATH")
if configPath == "" {
    configPath = "config/config.example.json"
}
cfg, err := config.Load(configPath)
```

### Anti-Patterns to Avoid
- **Adapter-to-adapter imports:** Resolver must never import `youtube` package. The import `"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"` in `schema.resolvers.go` must be removed.
- **Concrete service dependencies:** `*services.ContentService` in the Resolver struct couples the adapter to the service implementation.
- **Function parameter injection for stable dependencies:** Passing `extractVideoID` as a function parameter on every call instead of injecting it at construction time.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Request logging | Custom middleware | `chi/middleware.Logger` | Handles timing, status codes, panic recovery |
| PostgreSQL arrays | Custom Scan/Value with `lib/pq` | `pgx/v5/pgtype` types | Consistent single driver, type-safe |
| Health checks | One-liner handlers | Proper health/ready with DB ping | K8s/Sevalla needs `/ready` to check DB connectivity |
| DATABASE_URL validation | Manual string checks | `url.Parse` + check required fields | Handles edge cases (special chars in passwords, etc.) |
| Graceful shutdown | Ad-hoc signal handling | Go standard pattern (already partially implemented) | Current code is mostly correct, just needs `/ready` coordination |

## Common Pitfalls

### Pitfall 1: Breaking Test Mocks When Adding Service Interfaces
**What goes wrong:** Adding service port interfaces means all existing test mocks in `test/` that use concrete service types will need updating.
**Why it happens:** Tests currently construct real service instances with mock repositories. Switching resolvers to interfaces doesn't break service tests, but any resolver-level tests would need mock services.
**How to avoid:** Change resolver types to interfaces but keep service construction the same in `main.go`. Tests that test services directly (not through resolvers) are unaffected.
**Warning signs:** Compilation errors in `test/` directory after changing resolver struct.

### Pitfall 2: lib/pq Array Type Replacement
**What goes wrong:** `pq.StringArray` and `pq.Int64Array` implement `sql.Scanner` and `driver.Valuer`. The pgx equivalents (`pgtype.FlatArray[string]`, etc.) have different APIs.
**Why it happens:** pgx v5's type system is more sophisticated but different from lib/pq's simple array helpers.
**How to avoid:** For sqlx compatibility, create thin wrapper types that implement `sql.Scanner` and `driver.Valuer` using pgx's stdlib registration, OR use `pgx/v5/pgtype.Array[T]`. Since the project uses `sqlx` (which uses `database/sql` interface), the simplest approach is to implement custom `StringArray` and `Int64Array` types with `Scan`/`Value` methods that use native PostgreSQL array format parsing.
**Warning signs:** Runtime panics when scanning NULL arrays, or incorrect array serialization.

### Pitfall 3: gqlgen Regeneration Gotcha
**What goes wrong:** `schema.resolvers.go` is auto-generated by gqlgen. Changes to method signatures (like removing the `extractVideoID` parameter from `CreateFromYouTube`) require updating both the service AND the resolver call site.
**Why it happens:** gqlgen generates resolver stubs but preserves hand-written implementations.
**How to avoid:** Update the service method signature first, then update the resolver call in `schema.resolvers.go`. Do NOT run `make graphql-gen` for this change since it's an implementation change, not a schema change.

### Pitfall 4: Health vs Ready Semantics
**What goes wrong:** Using `/health` and `/ready` interchangeably.
**Why it happens:** Confusion about Kubernetes/PaaS probe types.
**How to avoid:**
- `/health` (liveness): "Is the process alive?" Always returns 200 if the server can respond.
- `/ready` (readiness): "Can it serve traffic?" Checks DB connection, critical dependencies.
**Warning signs:** Load balancer sending traffic to a server that can't reach the database.

### Pitfall 5: Credential Leakage in Error Messages
**What goes wrong:** `DATABASE_URL` contains password; if logged on connection failure, credentials are exposed.
**Why it happens:** Current code logs connection failures with `log.Fatalf` which may include the DSN.
**How to avoid:** Always sanitize DSN before any logging. Parse the URL string, redact password, then log.

## Code Examples

### Service Port Interface Definition
```go
// core/ports/services/content_service.go
package services

import (
    "context"
    "github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

type ContentService interface {
    CreateFromYouTube(ctx context.Context, url string) (*domain.Content, error)
    GetByID(ctx context.Context, id int) (*domain.Content, error)
    ListContent(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error)
}

type UserService interface {
    Create(ctx context.Context, username, email string) (*domain.User, error)
    GetByID(ctx context.Context, id int) (*domain.User, error)
    GetByUsername(ctx context.Context, username string) (*domain.User, error)
    ListAll(ctx context.Context) ([]*domain.User, error)
}

type PerspectiveService interface {
    Create(ctx context.Context, input CreatePerspectiveInput) (*domain.Perspective, error)
    GetByID(ctx context.Context, id int) (*domain.Perspective, error)
    Update(ctx context.Context, input UpdatePerspectiveInput) (*domain.Perspective, error)
    Delete(ctx context.Context, id int) error
    ListPerspectives(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error)
}
```

**Note:** The input types `CreatePerspectiveInput` and `UpdatePerspectiveInput` currently live in the `services` package. They should either be moved to the ports package or to the domain package so the port interface can reference them without circular imports.

### DATABASE_URL Validation
```go
// config/validation.go
package config

import (
    "fmt"
    "net/url"
    "strings"
)

func ValidateDatabaseURL(raw string) error {
    if raw == "" {
        return nil // Not using DATABASE_URL
    }
    u, err := url.Parse(raw)
    if err != nil {
        return fmt.Errorf("invalid DATABASE_URL format: %w", err)
    }
    if u.Scheme != "postgres" && u.Scheme != "postgresql" {
        return fmt.Errorf("DATABASE_URL must use postgres:// or postgresql:// scheme, got %s", u.Scheme)
    }
    if u.Hostname() == "" {
        return fmt.Errorf("DATABASE_URL must include a hostname")
    }
    path := strings.TrimPrefix(u.Path, "/")
    if path == "" {
        return fmt.Errorf("DATABASE_URL must include a database name")
    }
    return nil
}

// SanitizeDSN removes credentials from a DSN string for safe logging
func SanitizeDSN(dsn string) string {
    u, err := url.Parse(dsn)
    if err != nil {
        // Key-value format: mask password field
        return maskKeyValueDSN(dsn)
    }
    if u.User != nil {
        u.User = url.UserPassword(u.User.Username(), "***")
    }
    return u.String()
}
```

### Ready Endpoint with DB Check
```go
r.Get("/ready", func(w http.ResponseWriter, r *http.Request) {
    if err := database.Ping(r.Context(), db); err != nil {
        w.WriteHeader(http.StatusServiceUnavailable)
        w.Write([]byte("not ready: database unreachable"))
        return
    }
    w.WriteHeader(http.StatusOK)
    w.Write([]byte("ready"))
})
```

### Replacing lib/pq Array Types
```go
// adapters/repositories/postgres/array_types.go
package postgres

import (
    "database/sql/driver"
    "fmt"
    "strconv"
    "strings"
)

// StringArray is a PostgreSQL text[] compatible type (replaces pq.StringArray)
type StringArray []string

func (a *StringArray) Scan(src interface{}) error {
    if src == nil {
        *a = nil
        return nil
    }
    // Parse PostgreSQL array literal: {val1,val2,val3}
    b, ok := src.([]byte)
    if !ok {
        return fmt.Errorf("StringArray.Scan: expected []byte, got %T", src)
    }
    *a = parsePostgresArray(string(b))
    return nil
}

func (a StringArray) Value() (driver.Value, error) {
    if a == nil {
        return nil, nil
    }
    // Format as PostgreSQL array literal
    return formatPostgresArray(a), nil
}
```

### Configurable DB Pool Settings
```go
// pkg/database/postgres.go
type PoolConfig struct {
    MaxOpenConns    int
    MaxIdleConns    int
    ConnMaxLifetime time.Duration
}

func DefaultPoolConfig() PoolConfig {
    return PoolConfig{
        MaxOpenConns:    25,
        MaxIdleConns:    5,
        ConnMaxLifetime: 5 * time.Minute,
    }
}

func PoolConfigFromEnv() PoolConfig {
    cfg := DefaultPoolConfig()
    if v := os.Getenv("DB_MAX_OPEN_CONNS"); v != "" {
        if n, err := strconv.Atoi(v); err == nil {
            cfg.MaxOpenConns = n
        }
    }
    if v := os.Getenv("DB_MAX_IDLE_CONNS"); v != "" {
        if n, err := strconv.Atoi(v); err == nil {
            cfg.MaxIdleConns = n
        }
    }
    if v := os.Getenv("DB_CONN_MAX_LIFETIME"); v != "" {
        if d, err := time.ParseDuration(v); err == nil {
            cfg.ConnMaxLifetime = d
        }
    }
    return cfg
}
```

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `net/http` DefaultServeMux | chi/mux routers with middleware | Go ecosystem standard since ~2018 | Better middleware composition, route grouping |
| `lib/pq` as PostgreSQL driver | `pgx/v5` as primary driver | pgx v5 released 2022 | Better performance, native types, pure Go |
| Hardcoded pool settings | Env-configurable pools | Best practice | Tunable per environment without code changes |

**Already correct:**
- Graceful shutdown pattern in `main.go` is already mostly correct (SIGINT/SIGTERM handler with timeout)
- `/health` endpoint already exists (line 105-108 of main.go)
- slog structured logging already used throughout

**Partially done (needs completion):**
- Health endpoint exists but `/ready` with DB check is missing (M-10)
- Graceful shutdown exists but could coordinate with readiness (M-09 partially done)
- DB credentials are partially masked in logging (main.go lines 43-47) but not fully sanitized on error paths (M-12)

## Open Questions

1. **Input type location for service interfaces**
   - What we know: `CreatePerspectiveInput` and `UpdatePerspectiveInput` live in `services` package. To define service interfaces in `ports/services/`, the interfaces need to reference these types.
   - What's unclear: Should these input types move to `domain` or `ports/services`?
   - Recommendation: Move input types to `ports/services/` alongside the interface definitions. They are part of the service contract. Alternatively, keep them in `services` and have the port interface reference the concrete types (less pure but simpler).

2. **chi v5 vs standard library router**
   - What we know: Go 1.22+ has improved routing with method-based patterns. Go 1.25 (used in this project) supports `http.NewServeMux()` with `GET /health` patterns.
   - What's unclear: Whether the team prefers adding chi as a dependency or using stdlib.
   - Recommendation: Use chi. The built-in `middleware.Logger` alone justifies it. Stdlib mux lacks middleware chaining.

3. **lib/pq removal scope**
   - What we know: `lib/pq` is used in `perspective_repository.go` (for `pq.StringArray`, `pq.Int64Array`, `pq.Array()`) and `gorm_models.go` (for array types).
   - What's unclear: Whether gorm_*.go files (Phase 7.1 prototypes) should be updated in this phase or deferred.
   - Recommendation: Update `perspective_repository.go` (active code) in this phase. Leave `gorm_*.go` files for Phase 7.1 since they are prototypes.

## Sources

### Primary (HIGH confidence)
- Codebase analysis: Direct reading of all relevant source files in `backend/`
- Go standard library: `os/signal`, `net/http`, `context`, `log/slog` patterns

### Secondary (MEDIUM confidence)
- chi router: Well-established Go HTTP router, widely used with gqlgen projects
- pgx/v5 pgtype: Part of pgx v5 which is already a dependency

### Tertiary (LOW confidence)
- None needed. All findings are based on direct codebase analysis and standard Go patterns.

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH - all libraries already in use or well-established Go ecosystem choices
- Architecture: HIGH - hexagonal pattern is already established, changes are well-defined refactoring
- Pitfalls: HIGH - based on direct analysis of actual code and known Go patterns
- lib/pq replacement: MEDIUM - pgtype array handling with sqlx needs validation at implementation time

**Research date:** 2026-02-13
**Valid until:** 2026-03-13 (stable domain, no fast-moving dependencies)
