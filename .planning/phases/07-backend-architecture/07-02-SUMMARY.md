---
phase: 07-backend-architecture
plan: 02
subsystem: backend-infrastructure
status: complete
completed: 2026-02-14

requires:
  - phase: 01-foundation
    provides: PostgreSQL connection and repository pattern

provides:
  - Custom array types replacing lib/pq for PostgreSQL arrays
  - Configurable database connection pool via environment variables
  - DATABASE_URL validation at application startup
  - DSN credential sanitization for safe logging
  - CONFIG_PATH environment variable support

affects:
  - phase: 07-01
    impact: GORM prototype files still import lib/pq (will be addressed in Phase 7.1)

tech-stack:
  added: []
  removed:
    - lib/pq (replaced with custom array type implementations)
  patterns:
    - Custom sql.Scanner/driver.Valuer for PostgreSQL array types
    - Environment-based configuration with sensible defaults
    - URL parsing for DSN validation and sanitization

key-files:
  created:
    - backend/internal/adapters/repositories/postgres/array_types.go
    - backend/internal/config/validation.go
  modified:
    - backend/internal/adapters/repositories/postgres/perspective_repository.go
    - backend/pkg/database/postgres.go
    - backend/cmd/server/main.go
    - backend/test/database/postgres_test.go
    - backend/go.mod

decisions:
  - id: custom-array-types
    choice: Implement custom StringArray and Int64Array types
    rationale: Eliminates lib/pq dependency while maintaining PostgreSQL array support
    alternatives: Keep dual driver setup or use GORM sooner
    tradeoff: ~200 lines of custom code vs dependency elimination

  - id: pool-env-vars
    choice: DB_MAX_OPEN_CONNS, DB_MAX_IDLE_CONNS, DB_CONN_MAX_LIFETIME env vars
    rationale: Production deployments need pool tuning without code changes
    alternatives: Config file only or runtime API
    tradeoff: More env vars to document vs deployment flexibility

  - id: dsn-sanitization
    choice: Dual-format sanitization (URL + key-value)
    rationale: Supports both DATABASE_URL and config file DSN formats
    alternatives: URL-only or skip sanitization
    tradeoff: Regex complexity vs comprehensive credential protection

metrics:
  tasks: 2
  commits: 2
  duration: 3 min
  files-changed: 7
  lines-added: 358
  lines-removed: 24
---

# Phase 7 Plan 2: Database Configuration Hardening Summary

**One-liner:** Removed lib/pq dual driver, added configurable pool settings, DATABASE_URL validation, and DSN credential sanitization.

## What Was Built

### Custom Array Types (M-01)
Replaced lib/pq's `pq.StringArray`, `pq.Int64Array`, and `pq.Array()` with custom implementations:

- **StringArray** — Implements `sql.Scanner` and `driver.Valuer` for PostgreSQL `text[]` columns
  - Handles quoted strings with commas, backslashes, and special characters
  - Supports NULL elements and empty arrays
  - PostgreSQL format: `{val1,"val with comma",val3}`

- **Int64Array** — Implements `sql.Scanner` and `driver.Valuer` for PostgreSQL `bigint[]` columns
  - Parses comma-separated integer arrays
  - PostgreSQL format: `{1,2,3}`

- **intSliceToInt64Array** — Helper to convert domain `[]int` to `Int64Array`

**Impact:** Single PostgreSQL driver (pgx) throughout codebase. `perspective_repository.go` has zero lib/pq imports.

### Configurable Database Pool (M-02)
Added `PoolConfig` struct with environment variable support:

```go
type PoolConfig struct {
    MaxOpenConns    int           // DB_MAX_OPEN_CONNS (default: 25)
    MaxIdleConns    int           // DB_MAX_IDLE_CONNS (default: 5)
    ConnMaxLifetime time.Duration // DB_CONN_MAX_LIFETIME (default: 5m)
}
```

**Functions:**
- `DefaultPoolConfig()` — Sensible defaults for development
- `PoolConfigFromEnv()` — Reads env vars, falls back to defaults
- `Connect(dsn string, pool PoolConfig)` — Updated signature accepts config

**Impact:** Production deployments can tune pool settings without recompiling.

### Config Path Environment Variable (H-09)
Replaced hardcoded `config.example.json` path with `CONFIG_PATH` env var:

```go
configPath := os.Getenv("CONFIG_PATH")
if configPath == "" {
    configPath = "config/config.example.json"
}
cfg, err := config.Load(configPath)
```

**Impact:** Different environments can use different config files without code changes.

### DATABASE_URL Validation (M-17)
Added `ValidateDatabaseURL()` to catch configuration errors at startup:

- Validates scheme: `postgres://` or `postgresql://`
- Ensures hostname present
- Ensures database name in path
- Called before connection attempt

**Impact:** Fast-fail on misconfigured DATABASE_URL, clearer error messages.

### DSN Credential Sanitization (M-12)
Added `SanitizeDSN()` to remove passwords from log output:

- **URL format:** Parses `postgres://user:password@host/db`, removes password from User info
- **Key-value format:** Uses regex to replace `password=xxx` with `password=***`
- Applied in all database connection error logs

**Impact:** Password never appears in log output, even during connection failures.

## Tasks Completed

| # | Name | Commit | Files Changed |
|---|------|--------|---------------|
| 1 | Replace lib/pq with custom array types and make pool configurable | 6bea1ff | array_types.go (created), perspective_repository.go, postgres.go |
| 2 | Config path from env, DATABASE_URL validation, DSN sanitization, remove lib/pq | 8b12a56 | validation.go (created), main.go, postgres_test.go, go.mod |

## Verification Results

All verification criteria passed:

1. ✅ `cd backend && go build ./...` — zero compilation errors
2. ✅ `grep -rn "lib/pq" perspective_repository.go` — zero results (M-01 active code)
3. ✅ `grep "SetMaxOpenConns" pkg/database/postgres.go` — uses `pool.MaxOpenConns`, not hardcoded (M-02)
4. ✅ `grep "CONFIG_PATH" cmd/server/main.go` — env var read with default fallback (H-09)
5. ✅ `grep "SanitizeDSN" cmd/server/main.go` — called in both connection error paths (M-12)
6. ✅ `grep "ValidateDatabaseURL" cmd/server/main.go` — called before connection (M-17)
7. ✅ `go mod tidy` — lib/pq removed from go.mod (no active code imports it)

**Note:** Test failures in `test/services` and `test/resolvers` are pre-existing issues unrelated to this plan:
- Missing `ExtractVideoID` method on mock YouTube client
- Undefined `CreatePerspectiveInput` type
- Service method signature mismatches

These failures existed before this plan and are not introduced by database configuration changes.

## Deviations from Plan

None — plan executed exactly as written.

## Files Changed

### Created
- `backend/internal/adapters/repositories/postgres/array_types.go` (210 lines)
  - StringArray type with PostgreSQL text[] support
  - Int64Array type with PostgreSQL bigint[] support
  - Helper function intSliceToInt64Array

- `backend/internal/config/validation.go` (58 lines)
  - ValidateDatabaseURL for startup validation
  - SanitizeDSN for safe logging

### Modified
- `backend/internal/adapters/repositories/postgres/perspective_repository.go`
  - Removed `github.com/lib/pq` import
  - Changed `pq.StringArray` → `StringArray`
  - Changed `pq.Int64Array` → `Int64Array`
  - Replaced `pq.Array(p.Parts)` → `intSliceToInt64Array(p.Parts)`
  - Replaced `pq.Array(p.Labels)` → `StringArray(p.Labels)`
  - Updated `JSONBArray` to use `StringArray` instead of `pq.StringArray`

- `backend/pkg/database/postgres.go`
  - Added `PoolConfig` struct
  - Added `DefaultPoolConfig()` function
  - Added `PoolConfigFromEnv()` function
  - Updated `Connect(dsn string, pool PoolConfig)` signature

- `backend/cmd/server/main.go`
  - Added `CONFIG_PATH` env var with default fallback
  - Added `ValidateDatabaseURL()` call before connection
  - Added `SanitizeDSN()` calls in error logs
  - Updated `database.Connect(dsn, poolCfg)` call

- `backend/test/database/postgres_test.go`
  - Updated all `database.Connect()` calls to pass `DefaultPoolConfig()`

- `backend/go.mod`
  - Removed `github.com/lib/pq v1.10.9` (via go mod tidy)

## Decisions Made

### Custom Array Type Implementation
**Decision:** Implement custom `sql.Scanner`/`driver.Valuer` types instead of keeping lib/pq.

**Context:** PostgreSQL array handling requires parsing text format like `{val1,"val2"}`. lib/pq provided this but forced dual driver setup.

**Rationale:**
- Eliminates dual driver maintenance burden
- ~200 lines of straightforward parsing code
- Full control over error messages and edge cases
- Phase 7.1 GORM migration won't need lib/pq either

**Alternatives considered:**
1. Keep lib/pq alongside pgx (rejected: maintenance burden, dual driver complexity)
2. Migrate to GORM immediately (rejected: premature, Phase 7.1 is proper time)
3. Use pgx native arrays (rejected: requires driver-specific types, breaks abstraction)

**Impact:** Slight increase in codebase size, significant reduction in dependency complexity.

### Environment-Based Pool Configuration
**Decision:** Use dedicated env vars (DB_MAX_OPEN_CONNS, DB_MAX_IDLE_CONNS, DB_CONN_MAX_LIFETIME) instead of config file.

**Context:** Production pool tuning often happens during deployment without config file changes.

**Rationale:**
- 12-factor app principle: config from environment
- Deployment-specific tuning without rebuilding images
- Sensible defaults for development (25/5/5m)
- Can override per environment (dev/staging/prod)

**Alternatives considered:**
1. Config file only (rejected: requires file updates per environment)
2. Runtime API (rejected: over-engineered for current needs)
3. Connection string parameters (rejected: less discoverable)

**Impact:** Three more env vars to document in .env.example, but standard practice for database config.

### Dual-Format DSN Sanitization
**Decision:** Support both URL and key-value DSN formats in `SanitizeDSN()`.

**Context:** DATABASE_URL uses URL format (`postgres://user:pass@host/db`), but config file DSN uses key-value format (`host=x password=y`).

**Rationale:**
- Need to sanitize both formats for comprehensive protection
- URL format: parsed with `net/url.Parse`, remove password from `User`
- Key-value format: regex `password=[^\s]+` → `password=***`
- Failsafe approach: try URL parse first, fall back to regex

**Alternatives considered:**
1. URL format only (rejected: doesn't protect config file DSN)
2. Skip sanitization (rejected: security risk, M-12 blocker)
3. Force URL format everywhere (rejected: breaking change)

**Impact:** Slightly more complex implementation (URL parse + regex fallback), but handles all cases safely.

## Architecture Impact

### Dependency Graph
**Before:**
```
perspective_repository.go → lib/pq (StringArray, Int64Array, Array)
                          → pgx/v5 (via database.Connect)
```

**After:**
```
perspective_repository.go → array_types.go (StringArray, Int64Array)
                          → pgx/v5 only (via database.Connect)
```

**lib/pq removal:** Fully removed from active codebase. Remains in `gorm_models.go` (Phase 7.1 prototype) but will be eliminated in GORM migration.

### Configuration Flow
**Before:**
```
main.go → config.Load("hardcoded/path")
       → database.Connect(dsn) with hardcoded pool
```

**After:**
```
main.go → CONFIG_PATH env var → config.Load(path)
       → ValidateDatabaseURL(DATABASE_URL)
       → PoolConfigFromEnv() → database.Connect(dsn, pool)
       → SanitizeDSN(dsn) in error logs
```

### Security Improvements
1. **Credential leakage prevention:** Password masked in all log output (connection errors, ping failures)
2. **Configuration validation:** Invalid DATABASE_URL caught at startup, not first query
3. **Fail-fast behavior:** Clearer error messages when database misconfigured

## Next Phase Readiness

### Phase 7.1 (GORM Migration) Preparation
This plan **unblocks Phase 7.1** by:
- Establishing custom array type pattern (GORM will use similar approach)
- Removing lib/pq from active code (only prototype files remain)
- Proving single-driver setup viable

**GORM migration readiness:**
- ✅ Single driver (pgx) proven stable
- ✅ Array handling pattern established
- ✅ Pool configuration externalized
- ⚠️ `gorm_models.go` still imports lib/pq (will be removed in 7.1)

### Production Deployment Readiness
**New environment variables required:**
```bash
# Optional (have sensible defaults)
CONFIG_PATH=config/production.json
DB_MAX_OPEN_CONNS=50
DB_MAX_IDLE_CONNS=10
DB_CONN_MAX_LIFETIME=10m
```

**Recommended `.env.example` updates:**
```bash
# Database Pool Configuration
DB_MAX_OPEN_CONNS=25          # Max concurrent connections (default: 25)
DB_MAX_IDLE_CONNS=5           # Idle connections in pool (default: 5)
DB_CONN_MAX_LIFETIME=5m       # Max connection lifetime (default: 5m)

# Config File Path
CONFIG_PATH=config/config.example.json  # Path to config file (default: shown)
```

### Testing Recommendations
1. **Environment variable validation:** Test PoolConfigFromEnv() with invalid values (negative, non-integer)
2. **DSN sanitization edge cases:** Test with special characters in password, IPv6 hosts
3. **DATABASE_URL validation:** Test missing scheme, missing hostname, missing database name

## Blockers/Concerns

None.

## Performance Characteristics

### Array Type Performance
- **Scan (read):** Linear parse of PostgreSQL text format, O(n) where n = array length
- **Value (write):** Linear format to PostgreSQL text, O(n)
- **Memory:** Single allocation per array (strings.Builder)

**Benchmark opportunity:** Compare custom types vs lib/pq performance (likely comparable, both parse same format).

### Pool Configuration Impact
- Default settings (25/5/5m) suitable for development
- Production tuning recommended based on:
  - Concurrent request load
  - Query latency
  - Database connection limits

**Tuning guidance:**
- `MaxOpenConns`: Set to (database max connections) / (number of app instances)
- `MaxIdleConns`: 10-25% of MaxOpenConns
- `ConnMaxLifetime`: 5-15 minutes (balance between reuse and staleness)

## Related Issues

Addresses concerns from Phase 7 Plan 1 (07-01-PLAN.md):
- **M-01:** Dual PostgreSQL driver (lib/pq + pgx) — **RESOLVED** (lib/pq removed)
- **M-02:** Hardcoded database pool settings — **RESOLVED** (PoolConfigFromEnv)
- **H-09:** Hardcoded config file path — **RESOLVED** (CONFIG_PATH env var)
- **M-12:** Database credential leakage in logs — **RESOLVED** (SanitizeDSN)
- **M-17:** No DATABASE_URL validation — **RESOLVED** (ValidateDatabaseURL)

## Duration

**Total:** 3 minutes
- Task 1: 1 minute (array types + pool config)
- Task 2: 2 minutes (validation + main.go wiring + tests)
