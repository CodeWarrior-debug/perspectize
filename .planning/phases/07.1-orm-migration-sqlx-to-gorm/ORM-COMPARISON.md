# ORM Approach Comparison for Perspectize Backend

**Date:** 2026-02-13
**Decision:** GORM with separate GORM models (hex-clean)

## Selection Criteria

1. Must be well-established with strong community and future prospects
2. Must allow custom SQL to be written
3. Must provide enough % code savings to justify the rewrite

## Approach Comparison (against current 991 lines)

| Approach | Lines removed | Lines added | Net savings | Dynamic query support | Hex arch clean? |
|----------|-------------|-------------|-------------|----------------------|-----------------|
| **Stay sqlx + Squirrel + guregu/null** | ~300 | ~100 | **~200 (20%)** | Squirrel handles dynamic WHERE/ORDER natively | Yes |
| **Stay sqlx + extract dbutil** | ~100 | ~30 | **~70 (7%)** | No change (manual) | Yes |
| **GORM (separate model layer)** | ~500 | ~150 | **~350 (35%)** | Excellent — chaining + scopes + gorm-cursor-paginator | Yes (with mapping cost) |
| **GORM (tags on domain models)** | ~550 | ~50 | **~500 (50%)** | Same as above | No — domain leaks persistence |
| **sqlc** | ~370 | ~140 | **~230 (23%)** | BLOCKED — no dynamic ORDER BY, poor dynamic WHERE | Yes |

## ORM/Library Evaluation

| Criteria | sqlx (current) | GORM | sqlc | Bun |
|----------|---------------|------|------|-----|
| **GitHub Stars** | 16k | 37k | 13k | 3.5k |
| **Maturity** | 10+ years | 10+ years | 6 years | 4 years |
| **Community/Ecosystem** | Large, stable | Largest in Go | Growing fast | Small but active |
| **Future prospects** | Stable/maintenance | Strong, active | Strong, rising | Uncertain |
| **Custom SQL support** | Native — it IS raw SQL | `db.Raw()`, `db.Exec()` | Native — you write SQL, it generates Go | `db.QueryContext()`, raw mode |
| **JSONB/arrays** | Manual but full control | Basic; `jsonb[]` still manual | Full — your SQL, generated types | Good native support |
| **Dynamic queries** | Build strings yourself | Scope chaining | Limited — queries are static | Query builder included |
| **CRUD boilerplate saved** | 0% (baseline) | ~60-70% | ~80-90% | ~50-60% |
| **Pagination boilerplate saved** | 0% (baseline) | ~10-20% | ~30-40% | ~20-30% |
| **Overall code reduction** | 0% (baseline) | ~35-45% | ~50-60% | ~35-45% |
| **Worth the rewrite?** | N/A — already here | **Yes** | No (blockers) | No (immature) |
| **Keeps hexagonal arch clean?** | Yes | Yes (separate models) | Yes | Partially |

## sqlc Blockers (why it was rejected)

1. **Dynamic ORDER BY — HARD BLOCKER** ([issue #2061](https://github.com/sqlc-dev/sqlc/issues/2061), open since Feb 2023). Content repo sorts by JSONB path expressions like `(response->'items'->0->'statistics'->>'viewCount')::BIGINT`. CASE WHEN workaround would be more verbose than current code.
2. **Dynamic WHERE + Cursor Pagination — poor fit.** Boolean flag pattern for optional filters generates bloated param structs.
3. **`jsonb[]` — active bugs** ([issue #3484](https://github.com/sqlc-dev/sqlc/issues/3484), open since July 2024). Perspective repo's `categorized_ratings jsonb[]` column needs custom handling regardless.

## GORM Hex-Clean Pattern

```
domain/              ← Pure Go, zero ORM imports
  user.go
  content.go
  perspective.go

adapters/repositories/postgres/
  gorm_models.go     ← GORM-tagged structs (UserModel, ContentModel, PerspectiveModel)
  gorm_mappers.go    ← Domain ↔ GORM bidirectional conversion
  gorm_user_repository.go
  gorm_content_repository.go
  gorm_perspective_repository.go
```

## Per-File Impact Estimate

| File | Current (sqlx) | GORM prototype | Reduction |
|------|---------------|----------------|-----------|
| user_repository | 132 lines | ~90 lines | 32% |
| content_repository | 364 lines | ~180 lines | 51% |
| perspective_repository | 495 lines | ~260 lines | 47% |
| **Total** | **991 lines** | **~640 lines** | **~35%** |

### What sqlc WOULD eliminate vs. what stays

| Category | Lines | sqlc eliminates? | GORM eliminates? |
|----------|-------|-----------------|-----------------|
| Row structs + db tags | ~45 | Yes (generated) | Yes (GORM models are simpler) |
| rowToDomain converters | ~95 | Partially (~30) | Partially (~30) |
| Null helpers (toNullString, etc.) | ~35 | Yes | Yes (pointer types) |
| Simple CRUD methods | ~200 | Yes | Yes |
| Enum converters | ~40 | Configurable | Still needed |
| Dynamic pagination (List) | ~260 | **NO** (blocker) | Yes (GORM chaining) |
| Cursor encode/decode | ~20 | No | Yes (gorm-cursor-paginator) |
| JSONBArray custom type | ~25 | **NO** (bugs) | Still needed |

## Performance

No meaningful hit expected. GORM's overhead is reflection-based struct scanning (~microseconds) vs DB round-trips (~milliseconds). The only GORM performance trap is accidental N+1 queries from lazy loading — mitigated by writing explicit queries (not using auto-preload).

## References

- [GORM docs](https://gorm.io/docs/)
- [gorm-cursor-paginator](https://github.com/pilagod/gorm-cursor-paginator) (226 stars)
- Full library research: `ORM-RESEARCH.md` (this directory)
- Prototype code: `perspectize-go/internal/adapters/repositories/postgres/gorm_*.go`
