# Phase 11: Database Optimization — Context

## Phase Goal

Fix performance issues (JSONB bloat, slow queries) before adding new features. Establish schema foundation for multi-content-type support.

## Problem Statement

From FEATURE_BACKLOG.md and CONCERNS.md:

1. **JSONB bloat:** content.response stores full YouTube API response (93.7% of row data, ~2,469 bytes/row)
2. **Slow COUNT(*):** 200-400ms at 50 rows, triggering GORM slow query warning (>=200ms)
3. **Slow JSONB ORDER BY:** `ORDER BY COALESCE(response->'items'->0->'snippet'->>'publishedAt', '')` takes 157ms
4. **Client-side sorting/filtering:** AG Grid operates on current page only, not full dataset

## Research Summary

See `.planning/v1.1-research/DATABASE-OPTIMIZATION.md` for full research.

**Key findings:**
- Column extraction provides 10-100x speedup (B-tree vs GIN on JSONB)
- JSONB trimming gives 40-60% storage reduction
- Compression (LZ4/PGLZ) NOT recommended — adds 10-30ms decompression overhead

**Recommended approach:**
1. Trim JSONB on ingest (immediate, no schema change)
2. Extract 8 frequently queried fields to columns
3. Add composite indexes for keyset pagination
4. Update GraphQL resolvers to use promoted columns

## Current Schema

```sql
CREATE TABLE content (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL DEFAULT 'youtube_video',
    image_url TEXT,
    response JSONB,  -- Full YouTube API response (~2.5KB avg)
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

## Target Schema

```sql
CREATE TABLE content (
    id BIGSERIAL PRIMARY KEY,
    name TEXT NOT NULL,
    url TEXT NOT NULL UNIQUE,
    content_type TEXT NOT NULL DEFAULT 'youtube_video',
    image_url TEXT,

    -- Promoted columns (from JSONB)
    creator TEXT,                    -- snippet.channelTitle
    published_at TIMESTAMPTZ,        -- snippet.publishedAt
    description TEXT,                -- snippet.description
    duration INTERVAL,               -- contentDetails.duration (parsed from ISO 8601)
    view_count BIGINT,               -- statistics.viewCount
    like_count BIGINT,               -- statistics.likeCount
    comment_count BIGINT,            -- statistics.commentCount
    tags TEXT[],                     -- snippet.tags

    -- Type-specific metadata (trimmed)
    metadata JSONB,                  -- Trimmed to essential paths only

    -- Keep original for audit/replay (compressed)
    response JSONB,                  -- Original response (consider dropping after backfill)

    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes for server-side sort/filter
CREATE INDEX idx_content_published_at ON content (published_at DESC NULLS LAST, id DESC);
CREATE INDEX idx_content_view_count ON content (view_count DESC NULLS LAST, id DESC);
CREATE INDEX idx_content_like_count ON content (like_count DESC NULLS LAST, id DESC);
CREATE INDEX idx_content_name ON content (name, id DESC);
CREATE INDEX idx_content_creator ON content (creator, id DESC);
```

## GraphQL Changes

Current resolvers extract from JSONB:
```graphql
type Content {
  viewCount: Int  # Resolved from response->'items'->0->'statistics'->>'viewCount'
}
```

Target resolvers use columns:
```graphql
type Content {
  viewCount: Int  # Direct column access
}
```

## Requirements Covered

- DBOPT-01: JSONB trimming
- DBOPT-02: Column extraction
- DBOPT-03: Composite indexes
- DBOPT-04: Server-side sort
- DBOPT-05: Server-side filter
- DBOPT-06: COUNT(*) optimization
- DBOPT-07: Query performance

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| response column size | ~2,469 bytes avg | < 500 bytes avg |
| COUNT(*) at 50 rows | 200-400ms | < 50ms |
| ORDER BY published_at | 157ms | < 20ms |
| GORM slow query warnings | Yes | None |

## Dependencies

- None (first phase of v1.1)

## Risks

- **Migration complexity:** Backfill script must handle NULL values, data type conversions
- **Downtime:** May need maintenance window for index creation on large tables
- **Rollback:** Keep original response column until backfill verified

## Open Questions

1. Should we drop the original `response` column after backfill, or keep for audit?
2. Should `duration` be stored as INTERVAL or TEXT (ISO 8601)?
3. Should we add full-text search index on description?

---

*Context gathered: 2026-02-16*
