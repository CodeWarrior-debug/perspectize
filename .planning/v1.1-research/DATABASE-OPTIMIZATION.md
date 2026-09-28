# Database Optimization Research

**Project:** Perspectize v1.1
**Domain:** PostgreSQL 17 Performance Optimization
**Researched:** 2026-02-16
**Overall confidence:** HIGH

---

## Executive Summary

Perspectize's PostgreSQL database faces three interconnected performance challenges at 50 rows that will worsen at scale:

1. **JSONB bloat** — 93.7% of storage (118KB / 2,469 bytes per row) is the `response` JSONB column
2. **Slow COUNT(*)** — 200-400ms per query, triggering GORM's slow query warning
3. **Slow JSONB ORDER BY** — 157ms for sorting by extracted JSONB paths like `publishedAt`

**Root cause:** Sequential scans on unindexed JSONB data with no column extraction.

**Recommended solution:** Multi-phase column extraction + indexing strategy that balances storage efficiency, query performance, and migration complexity.

**Expected outcome:** Sub-10ms queries for COUNT(*) and ORDER BY at 1,000+ rows while reducing storage by 60-70%.

---

## 1. Current Performance Baseline

### 1.1 Storage Analysis (49 rows)

| Column | Total Bytes | % of Row Data | Bytes/Row |
|--------|-------------|---------------|-----------|
| `response` (JSONB) | 118 KB | 93.7% | 2,469 |
| `name` | 2.4 KB | 1.9% | 49 |
| `url` | 2.2 KB | 1.7% | 45 |
| Row overhead | 1.5 KB | 1.2% | 31 |
| All other columns | ~1.6 KB | 1.3% | 33 |

**Conclusion:** JSONB response dominates storage. All other schema columns combined are **18x smaller** than the JSONB field.

### 1.2 Query Performance (50 rows)

| Query | Latency | Trigger |
|-------|---------|---------|
| `SELECT count(*) FROM "content"` | 203-382ms | GORM slow query warning (>=200ms) |
| `ORDER BY COALESCE(response->'items'->0->'snippet'->>'publishedAt', '')` | 157ms | Keyset pagination sort |
| Full GraphQL request (`contents` query) | 395-541ms | Frontend Activity Table load |

**Conclusion:** At 50 rows, queries already trigger slow query warnings. Extrapolated to 1,000 rows: 4-8 seconds for COUNT(*), 3 seconds for ORDER BY.

### 1.3 Current Schema

```sql
CREATE TABLE public.content (
    id serial PRIMARY KEY,
    url varchar UNIQUE,
    name varchar NOT NULL,
    content_type varchar NOT NULL,
    length varchar,
    length_units varchar,
    response jsonb,  -- YouTube API response (entire object)
    added_by_user_id integer,
    created_at timestamptz DEFAULT NOW() NOT NULL,
    updated_at timestamptz DEFAULT NOW() NOT NULL
);
```

**No indexes** beyond primary key and unique constraints.

### 1.4 JSONB Path Usage

The application currently extracts these paths from `response` on every query:

**Snippet fields:**
- `response->'items'->0->'snippet'->>'title'` (duplicates `name` column)
- `response->'items'->0->'snippet'->>'channelTitle'`
- `response->'items'->0->'snippet'->>'publishedAt'` ← **sorted/filtered**
- `response->'items'->0->'snippet'->>'description'`
- `response->'items'->0->'snippet'->'tags'`

**Statistics fields:**
- `(response->'items'->0->'statistics'->>'viewCount')::BIGINT` ← **sorted/filtered**
- `(response->'items'->0->'statistics'->>'likeCount')::BIGINT` ← **sorted/filtered**
- `(response->'items'->0->'statistics'->>'commentCount')::BIGINT`

**Content details:**
- `response->'items'->0->'contentDetails'->>'duration'` (parsed to `length`)

**Source:** GraphQL resolver helpers (`backend/internal/adapters/graphql/resolvers/helpers.go`), GORM repository sort rules (`backend/internal/adapters/repositories/postgres/helpers.go`).

---

## 2. JSONB Optimization Strategy

### 2.1 Three Approaches Evaluated

| Approach | Storage Savings | Query Speedup | Migration Complexity | Recommended |
|----------|-----------------|---------------|---------------------|-------------|
| **Trim on ingest** | 40-60% | None (still sequential scan) | Low | Phase 1 |
| **Extract to columns** | 60-70% | 50-100x (index usage) | Medium | Phase 2 |
| **Compress TOAST** | 50-60% | 20% faster (decompression overhead) | Low | Not recommended |

### 2.2 Recommended Strategy: Trim + Extract (Two Phases)

**Phase 1: Trim JSONB on ingest** (Quick win, no schema change)
- Modify `backend/internal/adapters/youtube/client.go` to strip unused fields before storing
- Keep only: `items[0].{snippet, statistics, contentDetails}`
- Drop: `items[0].{etag, kind, status, topicDetails, recordingDetails, player, liveStreamingDetails}`
- **Expected savings:** 40-60% storage reduction
- **Query improvement:** None (still requires JSONB extraction)
- **Migration:** Application-only change, no DB migration

**Phase 2: Extract frequently queried paths to columns** (Schema change, indexable)
- Promote 8 high-value paths to dedicated columns
- Keep trimmed JSONB as fallback for rare/new fields
- Add indexes on extracted columns
- **Expected savings:** 60-70% total storage reduction
- **Query improvement:** 50-100x faster (B-tree index scans)
- **Migration:** Schema change, backfill required

### 2.3 Why Not Compression?

**TOAST Compression (LZ4 vs PGLZ):**
- PostgreSQL 17 supports LZ4 compression (default is PGLZ)
- Benchmarks: LZ4 is 5x faster compression, 20% faster decompression
- **Problem:** Decompression happens on EVERY read, adding 10-30ms per query
- **Conclusion:** Compression helps storage but worsens query latency for high-read JSONB fields

**When to use compression:**
- Archive/audit tables (rarely queried)
- Large text blobs (descriptions > 1KB)
- Write-heavy, read-light workloads

**Not appropriate for Perspectize:** Activity Table is read-heavy with frequent sorting/filtering.

**Sources:**
- [PostgreSQL TOAST compression performance tests](https://www.credativ.de/en/blog/postgresql-en/toasted-jsonb-data-in-postgresql-performance-tests-of-different-compression-algorithms/)
- [What is the new LZ4 TOAST compression in PostgreSQL 14](https://www.postgresql.fastware.com/blog/what-is-the-new-lz4-toast-compression-in-postgresql-14)
- [PostgreSQL Compression: pglz vs. LZ4](https://www.tigerdata.com/blog/optimizing-postgresql-performance-compression-pglz-vs-lz4)
- [Using JSON: json vs. jsonb, pglz vs. lz4](https://www.depesz.com/2025/11/29/using-json-json-vs-jsonb-pglz-vs-lz4-key-optimization-parsing-speed/)

---

## 3. Column Extraction Recommendations

### 3.1 Fields to Promote (8 columns)

Based on GraphQL schema usage and query patterns:

| New Column | Source JSONB Path | Type | Nullable | Indexed | Use Case |
|------------|-------------------|------|----------|---------|----------|
| `channel_title` | `items[0].snippet.channelTitle` | `text` | YES | B-tree | Display, filter |
| `published_at` | `items[0].snippet.publishedAt` | `timestamptz` | YES | B-tree | **Sort, filter** |
| `description` | `items[0].snippet.description` | `text` | YES | GIN (full-text) | Search |
| `tags` | `items[0].snippet.tags` | `text[]` | YES | GIN | Filter, search |
| `view_count` | `items[0].statistics.viewCount` | `bigint` | YES | B-tree | **Sort, filter** |
| `like_count` | `items[0].statistics.likeCount` | `bigint` | YES | B-tree | **Sort, filter** |
| `comment_count` | `items[0].statistics.commentCount` | `bigint` | YES | B-tree | Display, future filter |
| `duration_seconds` | Derived from `contentDetails.duration` | `integer` | YES | B-tree | Filter (already exists as `length`) |

**Note:** `duration_seconds` already exists as `length` (varchar). Recommend renaming/converting to `integer` for numeric comparisons.

### 3.2 Fields to Keep in JSONB (Trimmed)

- `items[0].id` — YouTube video ID (redundant with `url` but harmless)
- Any future YouTube API fields not yet used by the app

**Rationale:** Keeping trimmed JSONB allows adding new features (e.g., `likeCount` trends, `categoryId`) without migrations.

### 3.3 Multi-Content-Type Consideration

**From FEATURE_BACKLOG.md:** Future content types (books, articles, podcasts) need a shared schema.

**Column Promotion Philosophy:**
- **Shared fields → columns** (title, creator, published_at, description, tags)
- **Type-specific fields → JSONB** (viewCount, likeCount, ISBN, pageCount)

**Recommended now (YouTube-only):**
- Extract columns for YouTube-specific fields (`viewCount`, `likeCount`, etc.)
- When adding books: extract shared fields (`creator`, `published_at`), keep `pageCount` in JSONB
- Use `content_type` column to discriminate JSONB schema

**Migration path:** Column extraction now does NOT block multi-content-type later. Type-specific columns can be nullable and ignored by other content types.

---

## 4. Index Design

### 4.1 Current State: No Indexes

Only implicit indexes:
- `content_pk PRIMARY KEY (id)` — B-tree
- `content_unique_url UNIQUE (url)` — B-tree

**Problem:** All queries except `WHERE id = ?` and `WHERE url = ?` trigger sequential scans.

### 4.2 Recommended Indexes (Phase 2: After Column Extraction)

#### 4.2.1 Single-Column B-tree Indexes

```sql
-- Sorting/filtering on numeric statistics
CREATE INDEX idx_content_view_count ON content (view_count DESC NULLS LAST);
CREATE INDEX idx_content_like_count ON content (like_count DESC NULLS LAST);
CREATE INDEX idx_content_published_at ON content (published_at DESC NULLS LAST);

-- Filtering by content type
CREATE INDEX idx_content_type ON content (content_type);

-- Filtering by creator (channel for YouTube, author for books)
CREATE INDEX idx_content_channel_title ON content (channel_title);
```

**Rationale:**
- `DESC NULLS LAST` matches the most common sort order (Activity Table defaults to newest/highest first)
- Partial indexes not recommended yet (low NULL ratio expected for YouTube data)

#### 4.2.2 Composite Indexes for Keyset Pagination

**Current pagination:** Cursor-based keyset pagination using `(sort_column, id)` tuples.

**GORM helper example:**
```go
primaryRule := paginator.Rule{
    Key:     "ViewCount",
    Order:   paginator.DESC,
    SQLRepr: "(response->'items'->0->'statistics'->>'viewCount')::BIGINT",
}
tieBreaker := paginator.Rule{
    Key:   "ID",
    Order: paginator.DESC,
}
```

**Generated WHERE clause:**
```sql
WHERE ((view_count, id) < (1234, 56))
ORDER BY view_count DESC, id DESC
LIMIT 11
```

**Required indexes:**
```sql
-- Keyset pagination on view_count
CREATE INDEX idx_content_keyset_view_count ON content (view_count DESC, id DESC);

-- Keyset pagination on like_count
CREATE INDEX idx_content_keyset_like_count ON content (like_count DESC, id DESC);

-- Keyset pagination on published_at
CREATE INDEX idx_content_keyset_published_at ON content (published_at DESC, id DESC);

-- Default sort: created_at (already fast with single-column index + PK)
CREATE INDEX idx_content_created_at ON content (created_at DESC);
```

**Why composite indexes?**
- PostgreSQL can use tuple comparison `(col1, col2) < (val1, val2)` efficiently with matching composite index
- Single-column index on `view_count` cannot satisfy `ORDER BY view_count, id` without separate sort step
- Benchmark: 17x speedup for keyset pagination with composite indexes vs single-column

**Sources:**
- [Keyset Cursors for Postgres Pagination](https://www.stacksync.com/blog/keyset-cursors-postgres-pagination-fast-accurate-scalable)
- [How to Implement Keyset Pagination](https://oneuptime.com/blog/post/2026-02-02-keyset-pagination/view)
- [Optimizing SQL Pagination in Postgres](https://readyset.io/blog/optimizing-sql-pagination-in-postgres)

#### 4.2.3 GIN Indexes for Array and Full-Text Search

```sql
-- Tag filtering (future feature: "show me all Python videos")
CREATE INDEX idx_content_tags_gin ON content USING GIN (tags);

-- Full-text search on description (future feature: search video descriptions)
CREATE INDEX idx_content_description_gin ON content USING GIN (to_tsvector('english', description));
```

**Not needed immediately** — Activity Table doesn't filter by tags yet. Add when implementing tag-based filtering.

#### 4.2.4 GIN Index on JSONB (Fallback for Unmigrated Data)

If column extraction is delayed or partial:

```sql
-- GIN index with jsonb_path_ops for containment queries
CREATE INDEX idx_content_response_gin ON content USING GIN (response jsonb_path_ops);
```

**Operator class choice:**
- `jsonb_ops` (default) — Supports `@>`, `?`, `?&`, `?|`, `@?`, `@@`
- `jsonb_path_ops` — **Recommended** — Supports only `@>` but 40% smaller index, 2-3x faster queries

**Use case:** If querying `WHERE response @> '{"items": [{"snippet": {"channelTitle": "Fireship"}}]}'`

**Not recommended for Perspectize:** Column extraction is better for sort/filter. JSONB GIN index only helps containment queries, not `ORDER BY (response->>'field')::bigint`.

**Sources:**
- [PostgreSQL GIN Indexes documentation](https://www.postgresql.org/docs/current/gin.html)
- [Indexing JSONB in Postgres](https://www.crunchydata.com/blog/indexing-jsonb-in-postgres)
- [Understanding Postgres GIN Indexes](https://pganalyze.com/blog/gin-index)
- [PostgreSQL 17 Performance Tuning: GIN](https://medium.com/@jramcloud1/19-postgresql-17-performance-tuning-gin-generalized-inverted-index-757c7a670b92)

#### 4.2.5 Expression Indexes (Alternative to Column Extraction)

If column extraction is deemed too complex, expression indexes can index JSONB paths directly:

```sql
-- Index JSONB-extracted view count
CREATE INDEX idx_content_view_count_expr ON content (
    ((response->'items'->0->'statistics'->>'viewCount')::BIGINT) DESC NULLS LAST
);

-- Index JSONB-extracted published date
CREATE INDEX idx_content_published_at_expr ON content (
    (response->'items'->0->'snippet'->>'publishedAt') DESC NULLS LAST
);
```

**Trade-offs:**
- **Pro:** No schema change, no backfill migration
- **Con:** Index still stores extracted value (no storage savings vs column extraction)
- **Con:** Harder to read queries (`ORDER BY (response->>'field')::bigint` vs `ORDER BY view_count`)
- **Con:** Easier to break (if JSONB structure changes, index silently returns NULL)

**Recommendation:** Use column extraction for primary sort/filter fields. Expression indexes only for rarely-used JSONB paths.

**Sources:**
- [How to Implement PostgreSQL JSONB Path Queries](https://oneuptime.com/blog/post/2026-01-30-postgresql-jsonb-path-queries/view)
- [JSONB PostgreSQL: How To Store & Index JSON Data](https://scalegrid.io/blog/using-jsonb-in-postgresql-how-to-effectively-store-index-json-data-in-postgresql/)
- [How to Index JSONB Data in PostgreSQL](https://www.tigerdata.com/learn/how-to-index-json-columns-in-postgresql)

### 4.3 Index Maintenance Considerations

**Index bloat:**
- GIN indexes are prone to bloat under frequent updates
- Monitor with `pg_stat_user_indexes` and `pgstattuple` extension
- Rebuild with `REINDEX CONCURRENTLY` (PostgreSQL 12+) to avoid downtime

**Write overhead:**
- Each index adds 10-20% write latency per INSERT/UPDATE
- 8 recommended indexes = 80-160% write overhead
- **Acceptable for Perspectize:** Activity Table is read-heavy (100:1 read:write ratio)

**Partial indexes (future optimization):**
- If most queries filter by `content_type = 'youtube'`, use partial index:
  ```sql
  CREATE INDEX idx_content_youtube_view_count ON content (view_count DESC)
  WHERE content_type = 'youtube';
  ```
- 50-90% smaller index, faster queries, lower maintenance cost

**Sources:**
- [Speeding Up PostgreSQL With Partial Indexes](https://www.heap.io/blog/speeding-up-postgresql-queries-with-partial-indexes)
- [Partial Indexes in PostgreSQL](https://atlasgo.io/guides/postgres/partial-indexes)
- [PostgreSQL Partial Index](https://neon.com/postgresql/postgresql-indexes/postgresql-partial-index)
- [PostgreSQL Performance Tuning: Optimizing Database Indexes](https://www.tigerdata.com/learn/postgresql-performance-tuning-optimizing-database-indexes)

---

## 5. COUNT(*) Solutions

### 5.1 Problem Analysis

`SELECT count(*) FROM "content"` is slow (200-400ms at 50 rows) because:
1. PostgreSQL MVCC requires checking **every row's visibility** to determine if it's visible to the current transaction
2. Cannot use index-only scan (no index covers the entire table)
3. Must scan the entire table (sequential scan)

**Projected at 1,000 rows:** 4-8 seconds per COUNT(*).

### 5.2 Three Solutions

| Solution | Accuracy | Latency | Implementation Complexity | Recommended |
|----------|----------|---------|---------------------------|-------------|
| **Exact COUNT(*)** | 100% | 200-400ms (current) | None (already implemented) | Keep for admin views |
| **Estimated count (pg_class.reltuples)** | ±5-10% | <1ms | Low | Use for pagination |
| **Cached count (materialized view)** | 100% (stale) | <1ms | Medium | Not needed yet |

### 5.3 Recommended Approach: Hybrid Strategy

**For pagination (Activity Table):**
- **Don't query total count on every page load**
- AG Grid's server-side row model doesn't require total count for infinite scroll
- If total count is needed for "Showing X of Y" display: use estimated count

**For admin dashboards:**
- Use exact `COUNT(*)` with caching layer (Redis, TanStack Query 5-minute TTL)

**Implementation:**

```go
// Exact count (for admin)
func (r *GormContentRepository) CountExact(ctx context.Context) (int64, error) {
    var count int64
    err := r.db.WithContext(ctx).Model(&ContentModel{}).Count(&count).Error
    return count, err
}

// Estimated count (for pagination)
func (r *GormContentRepository) CountEstimated(ctx context.Context) (int64, error) {
    var estimate int64
    err := r.db.WithContext(ctx).Raw(`
        SELECT n_live_tup FROM pg_stat_user_tables WHERE relname = 'content'
    `).Scan(&estimate).Error
    return estimate, err
}
```

**GraphQL resolver:**
```graphql
type ContentConnection {
    edges: [ContentEdge!]!
    pageInfo: PageInfo!
    totalCount: Int  # Exact count (slow, optional field)
    totalCountEstimate: Int  # Fast estimate (always present)
}
```

**Frontend:**
- Show `totalCountEstimate` by default: "Showing ~1,234 videos"
- Optionally fetch `totalCount` for "Show exact count" button

### 5.4 Alternative: pg_class.reltuples

If `pg_stat_user_tables` is insufficient (requires stats collector enabled):

```sql
SELECT reltuples::bigint AS estimate FROM pg_class WHERE relname = 'content';
```

**Accuracy:**
- Updated by `VACUUM` and `ANALYZE`
- ±5-10% error for active tables
- Can be stale if autovacuum is lagging

**When to use:** Static/archive tables where ±10% error is acceptable.

**Sources:**
- [Faster PostgreSQL Counting](https://www.citusdata.com/blog/2016/10/12/count-performance/)
- [PostgreSQL count(*) made fast](https://www.cybertec-postgresql.com/en/postgresql-count-made-fast/)
- [Understanding PostgreSQL's COUNT(*) Performance and Workarounds](https://medium.com/@PlanB./understanding-postgresqls-count-performance-and-workarounds-8b9a412aab2d)
- [How to Optimize Slow Queries in PostgreSQL](https://oneuptime.com/blog/post/2026-01-21-postgresql-slow-query-optimization/view)

---

## 6. Server-Side Sort/Filter Implementation

### 6.1 Current State: Client-Side Only

**Problem:** AG Grid's row model is client-side:
- Fetches `first: 100` rows in a single GraphQL query
- Sorting/filtering operates only on the 100 loaded rows
- User cannot sort/filter the full dataset (e.g., "show me top 10 by views" across all 1,000 videos)

**From FEATURE_BACKLOG.md:**
> "Currently AG Grid sorting and filtering is client-side only — operates on the current page of rows. With server-side pagination, this means sort/filter only affects the visible page, not the full dataset."

### 6.2 Recommended Solution: GraphQL Query Parameters

**Add to `contents` query:**
```graphql
enum ContentSortField {
    VIEW_COUNT
    LIKE_COUNT
    PUBLISHED_AT
    CREATED_AT
    NAME
}

input ContentFilter {
    contentType: ContentType
    minLengthSeconds: Int
    maxLengthSeconds: Int
    channelTitle: String
    tags: [String!]
    publishedAfter: DateTime
    publishedBefore: DateTime
}

type Query {
    contents(
        first: Int = 10
        after: String
        sortBy: ContentSortField = CREATED_AT
        sortOrder: SortOrder = DESC
        filter: ContentFilter
    ): ContentConnection!
}
```

**GORM repository implementation (already partially exists):**
```go
func (r *GormContentRepository) List(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
    query := r.db.WithContext(ctx).Model(&ContentModel{})

    // Apply filters
    if params.Filter != nil {
        if params.Filter.ContentType != nil {
            query = query.Where("content_type = ?", *params.Filter.ContentType)
        }
        if params.Filter.MinViewCount != nil {
            query = query.Where("view_count >= ?", *params.Filter.MinViewCount)
        }
        if params.Filter.ChannelTitle != nil {
            query = query.Where("channel_title ILIKE ?", "%"+*params.Filter.ChannelTitle+"%")
        }
        // ... more filters
    }

    // Build sort rules for keyset pagination
    rules := buildContentSortRules(params.SortBy, params.SortOrder)

    // Apply pagination
    p := paginator.New(
        paginator.WithRules(rules...),
        paginator.WithLimit(params.First),
        paginator.WithAfter(params.After),
    )

    var models []ContentModel
    cursor, err := p.Paginate(query, &models)
    // ...
}
```

**Frontend integration:**
```typescript
// AG Grid onSortChanged callback
const onSortChanged = (event: SortChangedEvent) => {
    const sortModel = event.api.getColumnState().find(col => col.sort);
    if (sortModel) {
        setQueryParams({
            sortBy: mapColumnToSortField(sortModel.colId),
            sortOrder: sortModel.sort.toUpperCase()
        });
    }
};

// TanStack Query refetch with new params
const { data } = useQuery({
    queryKey: ['content', { sortBy, sortOrder, filter }],
    queryFn: () => graphqlClient.request(LIST_CONTENT, { sortBy, sortOrder, filter })
});
```

### 6.3 AG Grid Server-Side Row Model Consideration

**Alternative:** Use AG Grid's Server-Side Row Model instead of Infinite Row Model.

**Trade-offs:**

| Feature | Infinite Row Model (current) | Server-Side Row Model |
|---------|------------------------------|------------------------|
| **Pagination** | Cursor-based (keyset) | Offset-based (LIMIT/OFFSET) |
| **Sort/Filter** | Manual implementation | Built-in callbacks |
| **Performance** | Better at scale (no skipped rows) | Degrades with deep offsets |
| **Complexity** | Higher (custom GraphQL params) | Lower (AG Grid handles it) |

**Recommendation:**
- **Keep Infinite Row Model + keyset pagination** for performance at scale
- **Manually wire AG Grid callbacks to GraphQL params** (more work, better long-term performance)
- Avoid Server-Side Row Model (requires OFFSET pagination, which is 10-100x slower at deep pages)

**Sources:**
- [AG Grid Server-Side Row Model](https://www.ag-grid.com/javascript-data-grid/server-side-model/)
- [AG Grid Infinite Row Model](https://www.ag-grid.com/javascript-data-grid/infinite-scrolling/)
- Note: AG Grid does not natively support keyset/cursor pagination. Custom implementation required.

---

## 7. GORM Query Optimization Patterns

### 7.1 Current GORM Usage Assessment

**Good practices already in place:**
- Cursor-based pagination with `gorm-cursor-paginator`
- Context propagation (`WithContext(ctx)`)
- Dynamic query building with method chaining
- Separate GORM models from domain models (hexagonal architecture)

**Opportunities for optimization:**
- No query hints or index hints
- No `EXPLAIN ANALYZE` logging for slow queries
- Preload vs Joins not yet relevant (no associations loaded in content queries)

### 7.2 Optimization Strategies

#### 7.2.1 Use `.Select()` to Avoid Over-Fetching

**Problem:** `SELECT *` fetches all columns, including large JSONB `response` field.

**Solution:** Specify columns when JSONB is not needed.

```go
// Before: Fetches 2,469 bytes/row (includes response JSONB)
query.Find(&models)

// After: Fetches ~150 bytes/row (excludes response)
query.Select("id, name, url, content_type, view_count, like_count, published_at, created_at, updated_at").Find(&models)
```

**Use case:** Activity Table pagination only needs `id`, `name`, `view_count`, `like_count`, `published_at`. GraphQL resolver fetches full record (`GetByID`) only when user clicks a row.

**Expected improvement:** 90% reduction in I/O for list queries.

#### 7.2.2 Avoid N+1 Queries with Preload

**Not applicable yet:** Content queries don't load associations (no `Preload("User")` or `Preload("Perspectives")`).

**Future:** When adding "show perspectives per content" feature:
```go
// N+1 problem: 1 query for contents, N queries for perspectives
query.Find(&contents)
for _, c := range contents {
    db.Where("content_id = ?", c.ID).Find(&c.Perspectives) // BAD
}

// Solution: Preload with single JOIN
query.Preload("Perspectives").Find(&contents) // GOOD
```

**Trade-off:** Preload uses `LEFT JOIN`, which can be slower than separate queries for large associations. Benchmark both approaches.

**Sources:**
- [GORM Preloading](https://gorm.io/docs/preload.html)
- [Performance on joins/preload](https://groups.google.com/g/elixir-ecto/c/DOT9y676E_k)
- [Lazy loading, eager loading best practices](https://techwasti.com/advanced-techniques-and-best-practices-for-gorm)

#### 7.2.3 Raw SQL for Complex Queries

**When to use:**
- Queries requiring `WITH` CTEs, window functions, or subqueries
- Queries where GORM's query builder generates inefficient SQL

**Example:** Top 10 videos by views with percentile ranking:
```go
// GORM doesn't support PERCENT_RANK() window function
var results []struct {
    ID int
    Name string
    ViewCount int
    Percentile float64
}
err := r.db.Raw(`
    SELECT id, name, view_count,
           PERCENT_RANK() OVER (ORDER BY view_count DESC) AS percentile
    FROM content
    ORDER BY view_count DESC
    LIMIT 10
`).Scan(&results).Error
```

**Guidance:** Use GORM's query builder for 80% of queries (CRUD, simple filters, sorting). Use raw SQL for complex analytics.

**Sources:**
- [GORM SQL Builder](https://gorm.io/docs/sql_builder.html)
- [Comparing the best Go ORMs (2026)](https://encore.cloud/resources/go-orms)
- [GORM in Go: My Experience and Trade-offs](https://medium.com/@felipe.ascari_49171/gorm-in-go-my-experience-and-trade-offs-9eb89408ee34)

#### 7.2.4 Enable Slow Query Logging with EXPLAIN ANALYZE

**Current:** GORM logs slow queries (>=200ms) but doesn't show query plan.

**Enhancement:** Add middleware to log `EXPLAIN ANALYZE` for slow queries.

```go
// In cmd/server/main.go
db.Callback().Query().Before("gorm:query").Register("explain_slow_query", func(db *gorm.DB) {
    start := time.Now()
    db.Statement.Dest // Trigger query execution
    duration := time.Since(start)

    if duration > 200*time.Millisecond {
        var plan string
        explainSQL := "EXPLAIN ANALYZE " + db.Statement.SQL.String()
        db.Raw(explainSQL, db.Statement.Vars...).Scan(&plan)
        slog.Warn("slow query detected", "duration", duration, "sql", db.Statement.SQL.String(), "plan", plan)
    }
})
```

**Output:**
```
WARN slow query detected duration=382ms sql="SELECT count(*) FROM content" plan="Seq Scan on content (cost=0.00..1.62 rows=50 width=0)"
```

**Benefit:** Immediate visibility into missing indexes, sequential scans, inefficient joins.

#### 7.2.5 Benchmark: GORM vs Raw SQL

**Hypothesis:** GORM's query builder adds 5-10% overhead vs raw SQL.

**Test methodology:**
```go
func BenchmarkGORMQuery(b *testing.B) {
    for i := 0; i < b.N; i++ {
        var models []ContentModel
        db.Model(&ContentModel{}).
            Where("view_count > ?", 1000).
            Order("view_count DESC").
            Limit(10).
            Find(&models)
    }
}

func BenchmarkRawQuery(b *testing.B) {
    for i := 0; i < b.N; i++ {
        var models []ContentModel
        db.Raw("SELECT * FROM content WHERE view_count > ? ORDER BY view_count DESC LIMIT 10", 1000).
            Scan(&models)
    }
}
```

**Expected result:** GORM and raw SQL within 5-10% (insignificant vs network/I/O latency).

**Conclusion:** Use GORM for developer productivity. Drop to raw SQL only for complex queries where GORM generates suboptimal plans.

**Sources:**
- [GORM Performance documentation](https://gorm.io/docs/performance.html)
- [Using GORM Versus Plain SQL](https://medium.com/hyperskill/using-gorm-versus-plain-sql-to-interact-with-databases-in-go-39728974edc8)

---

## 8. Migration Plan

### 8.1 Phase 1: Trim JSONB on Ingest (Week 1)

**Goal:** Reduce storage by 40-60% with no schema changes.

**Tasks:**
1. Modify `backend/internal/adapters/youtube/client.go`:
   - Current: Stores full YouTube API response
   - New: Unmarshal, keep only `{items[0].{id, snippet, statistics, contentDetails}}`, re-marshal
2. Add unit test: Verify trimmed response contains only required fields
3. Deploy to production
4. **No backfill needed** — new ingests automatically trimmed, old data pruned on next update

**Validation:**
```sql
-- Before: avg(pg_column_size(response)) = 2469 bytes
-- After: avg(pg_column_size(response)) = 1000-1200 bytes (40-50% reduction)
SELECT avg(pg_column_size(response)) FROM content;
```

**Risk:** Low (application-only change, no schema change)

### 8.2 Phase 2: Extract Columns + Add Indexes (Week 2-3)

**Goal:** Enable sub-10ms queries for COUNT(*) and ORDER BY.

**Tasks:**

**Step 1: Schema migration (000011_extract_youtube_fields.up.sql)**
```sql
-- Add extracted columns
ALTER TABLE content
    ADD COLUMN channel_title text,
    ADD COLUMN published_at timestamptz,
    ADD COLUMN description text,
    ADD COLUMN tags text[],
    ADD COLUMN view_count bigint,
    ADD COLUMN like_count bigint,
    ADD COLUMN comment_count bigint;

-- Backfill from JSONB (idempotent, safe to re-run)
UPDATE content
SET
    channel_title = response->'items'->0->'snippet'->>'channelTitle',
    published_at = (response->'items'->0->'snippet'->>'publishedAt')::timestamptz,
    description = response->'items'->0->'snippet'->>'description',
    tags = ARRAY(SELECT jsonb_array_elements_text(response->'items'->0->'snippet'->'tags')),
    view_count = (response->'items'->0->'statistics'->>'viewCount')::bigint,
    like_count = (response->'items'->0->'statistics'->>'likeCount')::bigint,
    comment_count = (response->'items'->0->'statistics'->>'commentCount')::bigint
WHERE content_type = 'youtube' AND response IS NOT NULL;

-- Add indexes (CONCURRENTLY to avoid table locks)
CREATE INDEX CONCURRENTLY idx_content_view_count ON content (view_count DESC NULLS LAST);
CREATE INDEX CONCURRENTLY idx_content_like_count ON content (like_count DESC NULLS LAST);
CREATE INDEX CONCURRENTLY idx_content_published_at ON content (published_at DESC NULLS LAST);
CREATE INDEX CONCURRENTLY idx_content_channel_title ON content (channel_title);
CREATE INDEX CONCURRENTLY idx_content_tags_gin ON content USING GIN (tags);

-- Keyset pagination composite indexes
CREATE INDEX CONCURRENTLY idx_content_keyset_view_count ON content (view_count DESC, id DESC);
CREATE INDEX CONCURRENTLY idx_content_keyset_like_count ON content (like_count DESC, id DESC);
CREATE INDEX CONCURRENTLY idx_content_keyset_published_at ON content (published_at DESC, id DESC);
```

**Step 2: Update GORM model (gorm_models.go)**
```go
type ContentModel struct {
    ID            int             `gorm:"primaryKey;autoIncrement"`
    Name          string          `gorm:"not null"`
    URL           string
    ContentType   string          `gorm:"not null;column:content_type"`
    AddedByUserID int             `gorm:"column:added_by_user_id"`
    Length        string
    LengthUnits   string          `gorm:"column:length_units"`

    // Extracted YouTube fields
    ChannelTitle  *string         `gorm:"column:channel_title"`
    PublishedAt   *time.Time      `gorm:"column:published_at"`
    Description   *string         `gorm:"column:description"`
    Tags          pq.StringArray  `gorm:"type:text[];column:tags"`
    ViewCount     *int64          `gorm:"column:view_count"`
    LikeCount     *int64          `gorm:"column:like_count"`
    CommentCount  *int64          `gorm:"column:comment_count"`

    Response      json.RawMessage `gorm:"type:jsonb"` // Trimmed fallback
    CreatedAt     time.Time       `gorm:"autoCreateTime;column:created_at"`
    UpdatedAt     time.Time       `gorm:"autoUpdateTime;column:updated_at"`
}
```

**Step 3: Update repository sort rules (helpers.go)**
```go
// Before: SQLRepr extracts from JSONB
primaryRule := paginator.Rule{
    Key:     "ViewCount",
    Order:   paginatorOrder,
    SQLRepr: "(response->'items'->0->'statistics'->>'viewCount')::BIGINT",
}

// After: Use column directly
primaryRule := paginator.Rule{
    Key:   "ViewCount",
    Order: paginatorOrder,
}
```

**Step 4: Update GraphQL resolver helpers (helpers.go)**
```go
// Before: Unmarshal JSONB on every query
var resp struct { Items []struct { Statistics struct { ViewCount string } } }
json.Unmarshal(c.Response, &resp)
m.ViewCount = parseStatCount(resp.Items[0].Statistics.ViewCount)

// After: Use extracted column directly
m.ViewCount = c.ViewCount // Already extracted
```

**Step 5: Update YouTube client (client.go)**
```go
// After fetching and trimming JSONB, also populate extracted fields
content := &domain.Content{
    Name:        item.Snippet.Title,
    URL:         fmt.Sprintf("https://www.youtube.com/watch?v=%s", videoID),
    ContentType: domain.ContentTypeYouTube,
    Response:    trimmed, // Trimmed JSONB

    // Populate extracted columns
    ChannelTitle: &item.Snippet.ChannelTitle,
    PublishedAt:  parseRFC3339(item.Snippet.PublishedAt),
    Description:  &item.Snippet.Description,
    Tags:         item.Snippet.Tags,
    ViewCount:    parseInt64(item.Statistics.ViewCount),
    LikeCount:    parseInt64(item.Statistics.LikeCount),
    CommentCount: parseInt64(item.Statistics.CommentCount),
}
```

**Step 6: Deploy and validate**
```sql
-- Validate indexes are being used
EXPLAIN ANALYZE SELECT * FROM content ORDER BY view_count DESC LIMIT 10;
-- Expected: Index Scan using idx_content_view_count (cost=0.15..1.37 rows=10)
-- NOT: Seq Scan on content (cost=0.00..1.62 rows=50)

-- Validate extracted columns match JSONB
SELECT
    id,
    view_count AS extracted,
    (response->'items'->0->'statistics'->>'viewCount')::bigint AS jsonb
FROM content
WHERE view_count != (response->'items'->0->'statistics'->>'viewCount')::bigint
LIMIT 10;
-- Expected: 0 rows (perfect match)
```

**Rollback plan (000011_extract_youtube_fields.down.sql):**
```sql
DROP INDEX CONCURRENTLY IF EXISTS idx_content_keyset_published_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_content_keyset_like_count;
DROP INDEX CONCURRENTLY IF EXISTS idx_content_keyset_view_count;
DROP INDEX CONCURRENTLY IF EXISTS idx_content_tags_gin;
DROP INDEX CONCURRENTLY IF EXISTS idx_content_channel_title;
DROP INDEX CONCURRENTLY IF EXISTS idx_content_published_at;
DROP INDEX CONCURRENTLY IF EXISTS idx_content_like_count;
DROP INDEX CONCURRENTLY IF EXISTS idx_content_view_count;

ALTER TABLE content
    DROP COLUMN IF EXISTS comment_count,
    DROP COLUMN IF EXISTS like_count,
    DROP COLUMN IF EXISTS view_count,
    DROP COLUMN IF EXISTS tags,
    DROP COLUMN IF EXISTS description,
    DROP COLUMN IF EXISTS published_at,
    DROP COLUMN IF EXISTS channel_title;
```

**Risk:** Medium (schema change, backfill required, indexes can take 5-10 seconds on large tables)

### 8.3 Phase 3: Implement Server-Side Sort/Filter (Week 4)

**Goal:** Enable AG Grid server-side sorting/filtering.

**Tasks:**
1. Add `sortBy`, `sortOrder`, `filter` parameters to `contents` GraphQL query
2. Update GORM repository to accept filter params (partially done, extend)
3. Wire AG Grid callbacks to GraphQL refetch with new params
4. Add query param state management (URL query string or React state)

**No migration required** — application-only changes.

### 8.4 Phase 4: Autovacuum Tuning (Ongoing)

**Goal:** Keep statistics fresh for accurate query plans.

**Tasks:**

**1. Enable autovacuum analyze on content table:**
```sql
-- Refresh statistics when 3% of table changes (default is 10%)
ALTER TABLE content SET (
    autovacuum_analyze_scale_factor = 0.03,
    autovacuum_analyze_threshold = 50
);
```

**2. Monitor statistics staleness:**
```sql
SELECT
    schemaname,
    relname,
    n_live_tup,
    n_dead_tup,
    last_autovacuum,
    last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'content';
```

**3. Manual ANALYZE after large data imports:**
```bash
# After importing 1,000+ videos
psql $DATABASE_URL -c "ANALYZE content;"
```

**Sources:**
- [PostgreSQL 17: Complete Tuning Guide for VACUUM & AUTOVACUUM](https://medium.com/@jramcloud1/08-postgresql-17-complete-tuning-guide-for-vacuum-autovacuum-aa36b945a7cf)
- [How to Implement VACUUM and Autovacuum in PostgreSQL](https://oneuptime.com/blog/post/2026-01-21-postgresql-vacuum-autovacuum/view)
- [Tuning autovacuum for PostgreSQL databases](https://www.cybertec-postgresql.com/en/tuning-autovacuum-postgresql/)

### 8.5 Success Metrics

| Metric | Baseline (50 rows) | Target (1,000 rows) | How to Measure |
|--------|-------------------|---------------------|----------------|
| Storage per row | 2,469 bytes (JSONB) | 600-800 bytes | `SELECT avg(pg_total_relation_size('content')::float / count(*)) FROM content` |
| COUNT(*) latency | 200-400ms | <10ms (estimated count) | GORM slow query logs |
| ORDER BY view_count | 157ms | <10ms | `EXPLAIN ANALYZE` |
| GraphQL request latency | 395-541ms | <50ms | Frontend network timing |

---

## 9. Open Questions and Future Research

### 9.1 Questions Requiring Phase-Specific Research

**Q1: Should `length` be renamed to `duration_seconds` and converted from varchar to integer?**
- Current: `length varchar`, `length_units varchar` (stores "PT15M33S" and "seconds" separately)
- Proposed: `duration_seconds integer` (stores 933)
- **Blocker:** Migration complexity (requires parsing ISO 8601 durations in SQL)
- **Decision point:** Phase 2 migration or separate cleanup phase?

**Q2: How to handle multi-content-type column extraction when adding books?**
- YouTube: `view_count`, `like_count` (type-specific, numeric)
- Books: `page_count` (type-specific, numeric)
- Shared: `creator` (channel vs author, varchar vs text[])
- **Blocker:** Need to design unified schema strategy before second content type
- **Decision point:** Covered in FEATURE_BACKLOG.md, defer to v1.2 planning

**Q3: Should `name` column be dropped after extracting `snippet.title`?**
- Current: `name varchar NOT NULL` duplicates `response->'items'->0->'snippet'->>'title'`
- Proposed: Drop `name`, use extracted `title` column
- **Blocker:** Unique constraint on `name` (migration 000010 dropped it)
- **Decision point:** Phase 2 migration or keep for backward compatibility?

### 9.2 Areas for Future Optimization (v1.2+)

**Materialized Views for Leaderboards:**
- "Top 10 videos by views (all time)" — refresh every 5 minutes
- Avoids repeated sorting of entire table

**Partitioning by content_type:**
- Split `content` table into `content_youtube`, `content_books`, etc.
- Reduces index size, speeds up type-specific queries
- **Complexity:** High (requires foreign key strategy, query routing)

**Redis Caching Layer:**
- Cache `CountEstimated` result for 1 minute
- Cache frequently queried content records (TTL 5 minutes)
- **Complexity:** Medium (requires Redis setup, cache invalidation strategy)

**Full-Text Search (PostgreSQL tsvector):**
- Index `description` for keyword search: "Find videos mentioning 'Rust async'"
- Already included in Phase 2 indexes (GIN on `to_tsvector('english', description)`)

---

## 10. Sources

### JSONB Optimization & GIN Indexes
- [PostgreSQL GIN Indexes documentation](https://www.postgresql.org/docs/current/gin.html)
- [PostgreSQL Just Got Its Biggest Upgrade (2026)](https://medium.com/@DevBoostLab/postgresql-17-performance-upgrade-2026-f4222e71f577)
- [Indexing JSONB in Postgres](https://www.crunchydata.com/blog/indexing-jsonb-in-postgres)
- [Understanding Postgres GIN Indexes](https://pganalyze.com/blog/gin-index)
- [PostgreSQL 17 Performance Tuning: GIN](https://medium.com/@jramcloud1/19-postgresql-17-performance-tuning-gin-generalized-inverted-index-757c7a670b92)
- [JSONB and GIN index operators in PostgreSQL](https://medium.com/google-cloud/jsonb-and-gin-index-operators-in-postgresql-cea096fbb373)
- [How to avoid performance bottlenecks when using JSONB](https://www.metisdata.io/blog/how-to-avoid-performance-bottlenecks-when-using-jsonb-in-postgresql)

### COUNT(*) Optimization
- [Faster PostgreSQL Counting - Citus Data](https://www.citusdata.com/blog/2016/10/12/count-performance/)
- [PostgreSQL count(*) made fast](https://www.cybertec-postgresql.com/en/postgresql-count-made-fast/)
- [Understanding PostgreSQL's COUNT(*) Performance and Workarounds](https://medium.com/@PlanB./understanding-postgresqls-count-performance-and-workarounds-8b9a412aab2d)
- [How to Optimize Slow Queries in PostgreSQL](https://oneuptime.com/blog/post/2026-01-21-postgresql-slow-query-optimization/view)
- [PostgreSQL Documentation: Cumulative Statistics System](https://www.postgresql.org/docs/current/monitoring-stats.html)

### Expression Indexes & JSONB Paths
- [How to Implement PostgreSQL JSONB Path Queries](https://oneuptime.com/blog/post/2026-01-30-postgresql-jsonb-path-queries/view)
- [JSONB PostgreSQL: How To Store & Index JSON Data](https://scalegrid.io/blog/using-jsonb-in-postgresql-how-to-effectively-store-index-json-data-in-postgresql/)
- [How to Index JSONB Data in PostgreSQL](https://www.tigerdata.com/learn/how-to-index-json-columns-in-postgresql)
- [PostgreSQL JSON Index](https://neon.com/postgresql/postgresql-indexes/postgresql-json-index)

### Keyset Pagination & Composite Indexes
- [Keyset Cursors for Postgres Pagination](https://www.stacksync.com/blog/keyset-cursors-postgres-pagination-fast-accurate-scalable)
- [How to Implement Keyset Pagination](https://oneuptime.com/blog/post/2026-02-02-keyset-pagination/view)
- [Optimizing SQL Pagination in Postgres](https://readyset.io/blog/optimizing-sql-pagination-in-postgres)
- [Five ways to paginate in Postgres](https://www.citusdata.com/blog/2016/03/30/five-ways-to-paginate/)
- [Efficient Pagination in PostgreSQL](https://reintech.io/blog/efficient-pagination-postgresql)

### TOAST Compression
- [TOASTed JSONB data in PostgreSQL: performance tests](https://www.credativ.de/en/blog/postgresql-en/toasted-jsonb-data-in-postgresql-performance-tests-of-different-compression-algorithms/)
- [What is the new LZ4 TOAST compression in PostgreSQL 14](https://www.postgresql.fastware.com/blog/what-is-the-new-lz4-toast-compression-in-postgresql-14)
- [PostgreSQL Compression: pglz vs. LZ4](https://www.tigerdata.com/blog/optimizing-postgresql-performance-compression-pglz-vs-lz4)
- [Using JSON: json vs. jsonb, pglz vs. lz4](https://www.depesz.com/2025/11/29/using-json-json-vs-jsonb-pglz-vs-lz4-key-optimization-parsing-speed/)
- [PostgreSQL TOAST Strategy](https://www.michal-drozd.com/en/blog/postgresql-toast-optimization/)

### Partial Indexes
- [PostgreSQL Partial Indexes documentation](https://www.postgresql.org/docs/current/indexes-partial.html)
- [Speeding Up PostgreSQL With Partial Indexes](https://www.heap.io/blog/speeding-up-postgresql-queries-with-partial-indexes)
- [Partial Indexes in PostgreSQL](https://atlasgo.io/guides/postgres/partial-indexes)
- [PostgreSQL Partial Index](https://neon.com/postgresql/postgresql-indexes/postgresql-partial-index)
- [PostgreSQL Performance Tuning: Optimizing Database Indexes](https://www.tigerdata.com/learn/postgresql-performance-tuning-optimizing-database-indexes)

### GORM Performance
- [GORM Performance documentation](https://gorm.io/docs/performance.html)
- [Comparing the best Go ORMs (2026)](https://encore.cloud/resources/go-orms)
- [GORM in Go: My Experience and Trade-offs](https://medium.com/@felipe.ascari_49171/gorm-in-go-my-experience-and-trade-offs-9eb89408ee34)
- [Using GORM Versus Plain SQL](https://medium.com/hyperskill/using-gorm-versus-plain-sql-to-interact-with-databases-in-go-39728974edc8)
- [GORM Preloading](https://gorm.io/docs/preload.html)
- [GORM SQL Builder](https://gorm.io/docs/sql_builder.html)

### Autovacuum & ANALYZE
- [PostgreSQL 17: Complete Tuning Guide for VACUUM & AUTOVACUUM](https://medium.com/@jramcloud1/08-postgresql-17-complete-tuning-guide-for-vacuum-autovacuum-aa36b945a7cf)
- [How to Implement VACUUM and Autovacuum in PostgreSQL](https://oneuptime.com/blog/post/2026-01-21-postgresql-vacuum-autovacuum/view)
- [Tuning autovacuum for PostgreSQL databases](https://www.cybertec-postgresql.com/en/tuning-autovacuum-postgresql/)
- [PostgreSQL Documentation: Automatic Vacuuming](https://www.postgresql.org/docs/17/runtime-config-autovacuum.html)

### AG Grid Server-Side Models
- [AG Grid Server-Side Row Model](https://www.ag-grid.com/javascript-data-grid/server-side-model/)
- [AG Grid Infinite Row Model](https://www.ag-grid.com/javascript-data-grid/infinite-scrolling/)
- [AG Grid SSRM Pagination](https://www.ag-grid.com/javascript-data-grid/server-side-model-pagination/)

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| JSONB optimization | HIGH | Multiple authoritative sources (PostgreSQL docs, Crunchy Data, pganalyze), benchmarks from 2025-2026 |
| Column extraction | HIGH | Standard PostgreSQL pattern, verified with official docs and recent blog posts |
| Index design | HIGH | Keyset pagination patterns well-documented, composite index strategy confirmed by multiple sources |
| COUNT(*) solutions | HIGH | Official PostgreSQL docs, industry best practices from Citus Data, CYBERTEC |
| GORM patterns | MEDIUM | Official GORM docs, but community discussions show ongoing performance debates |
| Migration plan | MEDIUM | Based on standard PostgreSQL migration patterns, but Perspectize-specific complexity not fully tested |

---

## Gaps to Address

**Gaps requiring phase-specific research (v1.2+):**
1. Multi-content-type schema strategy (covered in FEATURE_BACKLOG.md, defer to books integration)
2. Full-text search implementation (tsvector syntax, ranking, stop words)
3. Redis caching layer design (cache invalidation, TTL tuning)

**Gaps requiring validation (testing):**
1. Actual query performance improvement (need to run EXPLAIN ANALYZE on production-like dataset)
2. GORM query builder vs raw SQL benchmarks (need Go benchmarks)
3. Index write overhead measurement (need to test INSERT performance with 8 indexes)

**No critical blockers.** Research is sufficient to proceed with Phase 1 (trim JSONB) and Phase 2 (column extraction + indexes).
