# Multi-Content-Type Schema Design Research

**Project:** Perspectize v1.1
**Researched:** 2026-02-16
**Domain:** Content platform expanding from YouTube-only to multi-type (Books, Articles, Podcasts)
**Overall confidence:** HIGH

---

## 1. Executive Summary

Perspectize currently stores YouTube video metadata in a single `content` table with a JSONB `response` column containing the full YouTube API response (93.7% of row data). To support books, articles, and podcasts, the schema needs a clear strategy for handling shared vs type-specific fields.

**Recommendation: Enhanced Single-Table Inheritance with Column Promotion**

Use a single `content` table with:
- **Promoted columns** for universally-shared, frequently-queried fields (name, creator, published_at, description, length)
- **Type-specific JSONB** in a `metadata` column for content type-specific fields
- **Trimmed raw response** in `response` column for audit/replay (optional compression)
- **Discriminator column** `content_type` (already exists)

This hybrid approach balances:
- **Performance:** B-tree indexed columns for common queries (10-100x faster than GIN on JSONB)
- **Flexibility:** JSONB for type-specific fields without schema migrations per content type
- **Query planner visibility:** PostgreSQL can build accurate statistics on promoted columns
- **Storage efficiency:** Compression and trimming reduce JSONB overhead

**Why not table-per-type (Class Table Inheritance)?**
- Current scale (49-1000s of rows) doesn't justify JOIN overhead
- GraphQL resolver complexity increases significantly (separate loaders per type)
- Migration complexity higher (data copying across tables)
- Can migrate to table-per-type later if scale demands it

**Why not PostgreSQL native table inheritance?**
- Foreign key constraints don't cascade to child tables (breaks referential integrity)
- Unique constraints are per-table, not across inheritance tree
- Not integrated with GORM or most ORMs

---

## 2. Schema Design Options

### Option A: Single-Table Inheritance (Recommended)

**Structure:**
```sql
CREATE TABLE content (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    url VARCHAR UNIQUE,
    content_type VARCHAR NOT NULL, -- 'youtube', 'book', 'article', 'podcast'

    -- Universal promoted fields
    creator TEXT, -- or TEXT[] for multiple authors
    published_at TIMESTAMPTZ,
    description TEXT,
    length INTERVAL, -- ISO 8601 durations (videos/podcasts)
    length_pages INT, -- Books/articles

    -- Type-specific metadata (JSONB)
    metadata JSONB, -- viewCount, likeCount, isbn, publisher, etc.

    -- Raw API response (trimmed, optionally compressed)
    response JSONB,

    -- Existing fields
    added_by_user_id INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

**Advantages:**
- Simplest querying (no JOINs required)
- Single GraphQL query for mixed content lists
- Easy to understand and maintain
- Flexible for adding new content types
- Optimal for current scale (49-1000s rows)

**Disadvantages:**
- NULL columns for type-specific promoted fields (mitigated by using JSONB for most type-specific data)
- Cannot use NOT NULL constraints on type-specific promoted columns
- Table can grow wide if too many fields are promoted

**Confidence:** HIGH - Best fit for Perspectize's current scale and query patterns.

### Option B: Class Table Inheritance (Table-Per-Type)

**Structure:**
```sql
CREATE TABLE content (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    url VARCHAR UNIQUE,
    content_type VARCHAR NOT NULL,
    creator TEXT,
    published_at TIMESTAMPTZ,
    description TEXT,
    added_by_user_id INT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE content_video (
    content_id INT PRIMARY KEY REFERENCES content(id),
    duration INTERVAL NOT NULL,
    view_count BIGINT,
    like_count BIGINT,
    comment_count BIGINT,
    channel_title VARCHAR,
    tags TEXT[]
);

CREATE TABLE content_book (
    content_id INT PRIMARY KEY REFERENCES content(id),
    page_count INT,
    isbn VARCHAR(13),
    isbn_10 VARCHAR(10),
    publisher VARCHAR,
    authors TEXT[] NOT NULL
);
```

**Advantages:**
- Stronger data integrity (type-specific NOT NULL constraints)
- No wasted space from NULL columns
- Clear schema documentation (each table documents its type)
- Better for very large scale (millions of rows)

**Disadvantages:**
- Every query needs JOINs for full data
- GraphQL resolvers become more complex (separate loaders)
- Adding new types requires migration + application code
- Overkill for current scale

**Confidence:** MEDIUM - Valid pattern but premature optimization for Perspectize.

### Option C: PostgreSQL Native Table Inheritance

**Structure:**
```sql
CREATE TABLE content (
    id SERIAL PRIMARY KEY,
    name VARCHAR NOT NULL,
    url VARCHAR UNIQUE,
    content_type VARCHAR NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE content_video (
    duration INTERVAL,
    view_count BIGINT
) INHERITS (content);

CREATE TABLE content_book (
    page_count INT,
    isbn VARCHAR(13)
) INHERITS (content);
```

**Critical Limitations:**
- **Foreign key constraints** only apply to single tables, not inheritance children
- **Unique constraints** (including PRIMARY KEY) are per-table, not across inheritance tree
- **ORM support** is poor (GORM doesn't support PostgreSQL inheritance)
- Queries on parent table require `SELECT * FROM ONLY content` to exclude children

**Confidence:** HIGH that this should be avoided.

**Verdict:** Do not use native table inheritance. PostgreSQL's documentation explicitly warns: "inheritance has not been integrated with unique constraints or foreign keys, which limits its usefulness."

---

## 3. Recommended Approach: Enhanced Single-Table with Column Promotion

### Column Promotion Decision Framework

**Promote to dedicated column when:**
1. Field is queried frequently (used in WHERE, ORDER BY, JOIN)
2. Field is shared across >= 50% of content types
3. Field benefits from PostgreSQL query planner statistics
4. Field needs indexing for performance

**Keep in JSONB when:**
1. Field is type-specific (e.g., `viewCount` for videos only)
2. Field structure is complex or variable (e.g., `categorizedRatings`)
3. Field is rarely queried
4. Field is primarily for display, not filtering/sorting

### Proposed Schema Changes

```sql
-- Migration: Promote common fields and reorganize JSONB

-- Step 1: Add promoted columns
ALTER TABLE content ADD COLUMN creator TEXT;
ALTER TABLE content ADD COLUMN published_at TIMESTAMPTZ;
ALTER TABLE content ADD COLUMN description TEXT;
ALTER TABLE content ADD COLUMN duration INTERVAL; -- For videos/podcasts
ALTER TABLE content ADD COLUMN page_count INT; -- For books/articles

-- Step 2: Add metadata column for type-specific fields
ALTER TABLE content ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;

-- Step 3: Create indexes
CREATE INDEX idx_content_creator ON content(creator);
CREATE INDEX idx_content_published_at ON content(published_at);
CREATE INDEX idx_content_duration ON content(duration) WHERE duration IS NOT NULL;
CREATE INDEX idx_content_page_count ON content(page_count) WHERE page_count IS NOT NULL;
CREATE INDEX idx_content_metadata_gin ON content USING GIN(metadata jsonb_path_ops);

-- Step 4: Backfill data from response JSONB (migration script)
-- Example for YouTube:
UPDATE content
SET
    creator = response->'items'->0->'snippet'->>'channelTitle',
    published_at = (response->'items'->0->'snippet'->>'publishedAt')::timestamptz,
    description = response->'items'->0->'snippet'->>'description',
    duration = (response->'items'->0->'contentDetails'->>'duration')::interval,
    metadata = jsonb_build_object(
        'viewCount', (response->'items'->0->'statistics'->>'viewCount')::bigint,
        'likeCount', (response->'items'->0->'statistics'->>'likeCount')::bigint,
        'commentCount', (response->'items'->0->'statistics'->>'commentCount')::bigint,
        'tags', response->'items'->0->'snippet'->'tags'
    )
WHERE content_type = 'youtube';

-- Step 5: Trim response JSONB to essential paths only (optional)
-- Keep only what's needed for audit/replay, remove redundant data now in promoted columns
```

### Why This Works

**Performance Benefits:**
- B-tree indexes on promoted columns are 10-100x faster than GIN indexes on JSONB for equality/range queries
- PostgreSQL query planner can build accurate statistics (most common values, histograms) on promoted columns
- Eliminates JSONB extraction overhead (`response->'items'->0->...`) on every query

**Storage Benefits:**
- Reduces `response` JSONB size by moving data to typed columns (smaller on-disk footprint)
- Enables per-column compression (LZ4 for JSONB, TOAST for large TEXT)
- Can further trim `response` to remove redundant nested objects

**Flexibility Benefits:**
- Adding new content types doesn't require schema changes (use `metadata` JSONB)
- Type-specific fields stay in JSONB where they belong
- Can selectively promote fields to columns later if query patterns emerge

---

## 4. Field Mapping per Content Type

### YouTube Video

| Field | Promoted Column | JSONB Path (metadata) | Notes |
|-------|----------------|----------------------|-------|
| Title | `name` | - | Already promoted |
| Channel | `creator` | - | Promote (shared concept) |
| Published | `published_at` | - | Promote (universal, sortable) |
| Description | `description` | - | Promote (full-text search) |
| Duration | `duration` (INTERVAL) | - | Promote (filterable/sortable) |
| Thumbnail | `image_url` | - | Already promoted (existing column) |
| View count | - | `metadata.viewCount` | Type-specific metric |
| Like count | - | `metadata.likeCount` | Type-specific metric |
| Comment count | - | `metadata.commentCount` | Type-specific metric |
| Tags | - | `metadata.tags` | Type-specific, variable length |
| Video ID | - | `response.items[0].id` | Keep in raw response |

### Book (Google Books API)

| Field | Promoted Column | JSONB Path (metadata) | Notes |
|-------|----------------|----------------------|-------|
| Title | `name` | - | Already promoted |
| Authors | `creator` (TEXT or TEXT[]) | - | Promote (see discussion below) |
| Published | `published_at` | - | Promote (may only have year) |
| Description | `description` | - | Promote (full-text search) |
| Page count | `page_count` (INT) | - | Promote (filterable) |
| Cover image | `image_url` | - | Already promoted |
| ISBN-13 | - | `metadata.isbn` | Type-specific identifier |
| ISBN-10 | - | `metadata.isbn10` | Type-specific identifier |
| Publisher | - | `metadata.publisher` | Type-specific, not universal |
| Categories | - | `metadata.categories` | Type-specific taxonomy |
| Language | - | `metadata.language` | Type-specific, rarely queried |
| Average rating | - | `metadata.averageRating` | Type-specific metric |

### Podcast Episode (RSS/iTunes)

| Field | Promoted Column | JSONB Path (metadata) | Notes |
|-------|----------------|----------------------|-------|
| Episode title | `name` | - | Already promoted |
| Show name | - | `metadata.showName` | Type-specific (episode vs show) |
| Author/Host | `creator` | - | Promote (shared concept) |
| Published | `published_at` | - | Promote (RFC 2822 or ISO 8601) |
| Description | `description` | - | Promote (full-text search) |
| Duration | `duration` (INTERVAL) | - | Promote (filterable/sortable) |
| Cover art | `image_url` | - | Already promoted |
| Episode number | - | `metadata.episodeNumber` | Type-specific |
| Season number | - | `metadata.seasonNumber` | Type-specific |
| Episode type | - | `metadata.episodeType` | Type-specific (full, trailer, bonus) |

### Article (Web/Open Graph)

| Field | Promoted Column | JSONB Path (metadata) | Notes |
|-------|----------------|----------------------|-------|
| Title | `name` | - | Already promoted |
| Author | `creator` | - | Promote (shared concept) |
| Published | `published_at` | - | Promote (article:published_time) |
| Modified | - | `metadata.modifiedAt` | Type-specific |
| Description | `description` | - | Promote (og:description) |
| Word count | `page_count` (INT) | - | Overload page_count for articles |
| Cover image | `image_url` | - | Already promoted (og:image) |
| Publisher | - | `metadata.publisher` | Type-specific (news site, blog) |
| Section | - | `metadata.section` | Type-specific (article:section) |
| Tags | - | `metadata.tags` | Type-specific |

---

## 5. Open Design Questions & Recommendations

### Question 1: How to store multiple authors/creators?

**Options:**

**A) Single TEXT column (comma-separated)** ❌ NOT RECOMMENDED
```sql
creator TEXT -- "Author One, Author Two, Author Three"
```
- Cannot query individual authors efficiently
- String splitting required in application layer
- No database-level validation

**B) TEXT[] array column** ✅ RECOMMENDED
```sql
creator TEXT[] -- {'Author One', 'Author Two', 'Author Three'}
```
- Native PostgreSQL array support
- Can index with GIN for fast containment queries (`WHERE 'Author One' = ANY(creator)`)
- Query planner understands array operations
- 2-5x faster than JSONB for simple string lists
- Works well with GraphQL `[String!]` type

**C) JSONB array** ⚠️ ACCEPTABLE FALLBACK
```sql
creator_metadata JSONB -- {"authors": ["Author One", "Author Two"]}
```
- More flexible if author objects have additional fields (e.g., `{"name": "...", "role": "..."}`)
- GIN index required for queries
- Slower than TEXT[] for simple arrays
- Use if authors need structured data (name, affiliation, role)

**Recommendation:** Use `creator TEXT[]` for simple author lists. Migrate to JSONB if rich author metadata is needed later.

**Migration Strategy:**
```sql
-- Phase 1: Add array column
ALTER TABLE content ADD COLUMN creators TEXT[];

-- Phase 2: Backfill from existing creator (single value)
UPDATE content SET creators = ARRAY[creator] WHERE creator IS NOT NULL AND content_type = 'youtube';

-- Phase 3: Backfill from metadata for books
UPDATE content
SET creators = ARRAY(
    SELECT jsonb_array_elements_text(metadata->'authors')
)
WHERE content_type = 'book';

-- Phase 4: Drop old creator column
ALTER TABLE content DROP COLUMN creator;
ALTER TABLE content RENAME COLUMN creators TO creator;
```

### Question 2: How to handle varying date precision?

YouTube provides full timestamps (`2024-03-15T14:30:00Z`), but books may only have year (`2024`) or year-month (`2024-03`).

**Options:**

**A) TIMESTAMPTZ with default values** ✅ RECOMMENDED
```sql
published_at TIMESTAMPTZ -- Store as '2024-01-01 00:00:00+00' for year-only dates
```
- Use PostgreSQL's native date/time type
- Store year-only as `YYYY-01-01`, year-month as `YYYY-MM-01`
- Add `date_precision` column to track granularity:
  ```sql
  date_precision VARCHAR(10) -- 'year', 'month', 'day', 'timestamp'
  ```
- Application layer formats display based on precision
- Queries/sorting work correctly (chronological order preserved)

**B) Separate columns per precision** ❌ NOT RECOMMENDED
```sql
published_year INT
published_month INT
published_day INT
published_timestamp TIMESTAMPTZ
```
- Query complexity explodes (COALESCE across 4 columns)
- Index strategy unclear
- GraphQL schema becomes convoluted

**C) TEXT column with validation** ❌ NOT RECOMMENDED
```sql
published_at TEXT -- '2024', '2024-03', '2024-03-15', '2024-03-15T14:30:00Z'
```
- Cannot sort chronologically without casting
- No database-level date validation
- Index performance poor (string comparison, not temporal)

**Recommendation:** Use `published_at TIMESTAMPTZ` + `date_precision VARCHAR(10)`. Application layer handles display formatting.

**GraphQL Schema:**
```graphql
type Content {
  publishedAt: String! # ISO 8601 string
  publishedAtPrecision: DatePrecision! # YEAR, MONTH, DAY, TIMESTAMP
}

enum DatePrecision {
  YEAR
  MONTH
  DAY
  TIMESTAMP
}
```

### Question 3: How to handle heterogeneous length units?

Videos/podcasts use duration (`PT15M33S`), books/articles use page count or word count.

**Options:**

**A) Separate typed columns** ✅ RECOMMENDED
```sql
duration INTERVAL -- For videos/podcasts (ISO 8601 durations)
page_count INT    -- For books/articles
word_count INT    -- For articles (optional)
```
- Type-safe (database validates data types)
- Separate indexes for separate use cases
- Clear semantics (no ambiguity)
- Filtering works correctly: `WHERE duration > '15 minutes'::interval`

**B) Single length column + length_units** ❌ CURRENT APPROACH, REPLACE
```sql
length INT         -- Either seconds or pages
length_units TEXT  -- 'seconds', 'pages', 'words'
```
- Type ambiguity (is 500 seconds or pages?)
- Query complexity: `WHERE length_units = 'seconds' AND length > 900`
- No database-level validation
- Index selectivity poor (length without units is meaningless)

**C) JSONB** ❌ NOT RECOMMENDED
```sql
length JSONB -- {"value": 933, "unit": "seconds"} or {"value": 384, "unit": "pages"}
```
- Query complexity high
- No type validation
- Index performance poor

**Recommendation:** Replace `length` + `length_units` with `duration INTERVAL` and `page_count INT`. Use partial indexes:

```sql
-- Drop existing columns
ALTER TABLE content DROP COLUMN length;
ALTER TABLE content DROP COLUMN length_units;

-- Add typed columns
ALTER TABLE content ADD COLUMN duration INTERVAL;
ALTER TABLE content ADD COLUMN page_count INT;
ALTER TABLE content ADD COLUMN word_count INT;

-- Partial indexes (only index non-NULL values)
CREATE INDEX idx_content_duration ON content(duration) WHERE duration IS NOT NULL;
CREATE INDEX idx_content_page_count ON content(page_count) WHERE page_count IS NOT NULL;
```

**GraphQL Schema:**
```graphql
type Content {
  # Videos/Podcasts
  duration: Int # Duration in seconds (extracted from INTERVAL)
  durationISO: String # ISO 8601 duration string (PT15M33S)

  # Books/Articles
  pageCount: Int
  wordCount: Int
}
```

**ISO 8601 Duration Handling:**

PostgreSQL's `INTERVAL` type natively supports ISO 8601 durations:
```sql
-- Parse ISO 8601 duration
SELECT 'PT15M33S'::interval; -- Returns '00:15:33'

-- Extract seconds
SELECT EXTRACT(EPOCH FROM 'PT15M33S'::interval); -- Returns 933

-- Format as ISO 8601
SELECT justify_interval('PT15M33S'::interval); -- Normalizes intervals
```

---

## 6. API Integration Patterns

### YouTube Data API v3 (Existing)

**Status:** Already integrated
**Response Structure:**
```json
{
  "items": [{
    "id": "VIDEO_ID",
    "snippet": {
      "title": "...",
      "channelTitle": "...",
      "publishedAt": "2024-03-15T14:30:00Z",
      "description": "...",
      "thumbnails": { "high": { "url": "..." } }
    },
    "contentDetails": {
      "duration": "PT15M33S"
    },
    "statistics": {
      "viewCount": "12345",
      "likeCount": "678",
      "commentCount": "90"
    }
  }]
}
```

**Mapping to Schema:**
- `snippet.title` → `name`
- `snippet.channelTitle` → `creator`
- `snippet.publishedAt` → `published_at` (already TIMESTAMPTZ)
- `snippet.description` → `description`
- `contentDetails.duration` → `duration` (cast to INTERVAL)
- `snippet.thumbnails.high.url` → `image_url`
- `statistics.*` → `metadata.{viewCount, likeCount, commentCount}`

**Trim Strategy:**
Keep only `items[0].{id, snippet, contentDetails.duration, statistics}`. Drop:
- `items[0].status`
- `items[0].topicDetails`
- `items[0].recordingDetails`
- `items[0].player`

**Storage Reduction:** ~60-70% (2,469 bytes → ~700-900 bytes per row)

### Google Books API v1 (Recommended for Books)

**Why Google Books:**
- Same Google ecosystem as YouTube (API key, client libs, rate limits)
- Free tier: 1,000 req/day without key, higher with key
- Rich metadata: authors, publisher, ISBN, page count, categories, ratings
- Similar response structure to YouTube (items array)

**API Endpoint:**
```
GET https://www.googleapis.com/books/v1/volumes?q=isbn:9780143127741
GET https://www.googleapis.com/books/v1/volumes?q=intitle:{{title}}+inauthor:{{author}}
```

**Response Structure:**
```json
{
  "items": [{
    "id": "BOOK_ID",
    "volumeInfo": {
      "title": "...",
      "authors": ["Author One", "Author Two"],
      "publisher": "...",
      "publishedDate": "2024-03-15",
      "description": "...",
      "pageCount": 384,
      "categories": ["Fiction", "Science Fiction"],
      "imageLinks": { "thumbnail": "..." },
      "language": "en",
      "industryIdentifiers": [
        { "type": "ISBN_13", "identifier": "9780143127741" },
        { "type": "ISBN_10", "identifier": "0143127748" }
      ],
      "averageRating": 4.5,
      "ratingsCount": 1234
    }
  }]
}
```

**Mapping to Schema:**
- `volumeInfo.title` → `name`
- `volumeInfo.authors` → `creator` (TEXT[])
- `volumeInfo.publishedDate` → `published_at` (may be YYYY, YYYY-MM, or YYYY-MM-DD)
- `volumeInfo.description` → `description`
- `volumeInfo.pageCount` → `page_count`
- `volumeInfo.imageLinks.thumbnail` → `image_url`
- `volumeInfo.{publisher, isbn, categories, language, ratings}` → `metadata`

**Date Precision Handling:**
```go
// Parse varying precision dates
func parsePublishedDate(dateStr string) (time.Time, string, error) {
    if len(dateStr) == 4 { // "2024"
        t, err := time.Parse("2006", dateStr)
        return t, "year", err
    } else if len(dateStr) == 7 { // "2024-03"
        t, err := time.Parse("2006-01", dateStr)
        return t, "month", err
    } else { // "2024-03-15"
        t, err := time.Parse("2006-01-02", dateStr)
        return t, "day", err
    }
}
```

**GraphQL Mutation:**
```graphql
mutation CreateBook($input: CreateContentFromBookInput!) {
  createContentFromBook(input: $input) {
    id
    name
    contentType
    creator
    publishedAt
    pageCount
  }
}

input CreateContentFromBookInput {
  isbn: String     # ISBN-13 or ISBN-10
  title: String    # Alternative to ISBN
  author: String   # For title+author search
  userId: IntID!
}
```

**Implementation Strategy:**
1. Add `backend/internal/adapters/external/googlebooks/client.go` (mirror YouTube adapter structure)
2. Add `backend/internal/core/services/book_service.go` (mirror content_service.go)
3. Add `createContentFromBook` resolver
4. Reuse existing `Content` domain model (polymorphic)

### Podcast RSS Feeds (Recommended for Podcasts)

**Why RSS over Spotify/Apple APIs:**
- RSS is the canonical source for podcast metadata
- Spotify/Apple APIs require registration and quotas
- RSS is open, standardized, and free
- Both Spotify and Apple generate RSS feeds automatically

**Feed Discovery:**
1. User provides podcast URL (Spotify/Apple/RSS)
2. Backend extracts RSS feed URL:
   - **Apple Podcasts:** Use iTunes Lookup API (`https://itunes.apple.com/lookup?id={podcast_id}`)
   - **Spotify:** Use Spotify Web API (requires OAuth)
   - **Direct RSS:** Use provided URL

**RSS Structure (iTunes Tags):**
```xml
<rss xmlns:itunes="http://www.itunes.com/dtds/podcast-1.0.dtd">
  <channel>
    <title>Show Name</title>
    <itunes:author>Host Name</itunes:author>
    <item>
      <title>Episode Title</title>
      <itunes:author>Episode Host</itunes:author>
      <pubDate>Thu, 15 Mar 2024 14:30:00 GMT</pubDate>
      <description>Episode description...</description>
      <itunes:duration>00:15:33</itunes:duration>
      <itunes:image href="https://..." />
      <itunes:episode>42</itunes:episode>
      <itunes:season>3</itunes:season>
      <itunes:episodeType>full</itunes:episodeType>
      <enclosure url="https://..." type="audio/mpeg" />
    </item>
  </channel>
</rss>
```

**Mapping to Schema:**
- `<title>` → `name`
- `<itunes:author>` → `creator`
- `<pubDate>` → `published_at` (RFC 2822 format)
- `<description>` → `description`
- `<itunes:duration>` → `duration` (HH:MM:SS format, convert to INTERVAL)
- `<itunes:image>` → `image_url`
- `<itunes:episode>`, `<itunes:season>`, etc. → `metadata`

**Duration Parsing:**
```go
// Parse iTunes duration formats
// Accepts: "HH:MM:SS", "MM:SS", or "SSS" (total seconds)
func parseDuration(durationStr string) (time.Duration, error) {
    parts := strings.Split(durationStr, ":")
    switch len(parts) {
    case 3: // HH:MM:SS
        // Parse hours, minutes, seconds
    case 2: // MM:SS
        // Parse minutes, seconds
    case 1: // SSS
        // Parse total seconds
    }
}
```

**GraphQL Mutation:**
```graphql
mutation CreatePodcast($input: CreateContentFromPodcastInput!) {
  createContentFromPodcast(input: $input) {
    id
    name
    contentType
    creator
    publishedAt
    duration
  }
}

input CreateContentFromPodcastInput {
  url: String!    # Apple/Spotify URL or direct RSS feed
  userId: IntID!
}
```

**RSS Parsing Library:**
- **Recommended:** `github.com/mmcdole/gofeed` (1.2k stars, active maintenance)
- Supports RSS 2.0, Atom, iTunes tags
- Handles malformed feeds gracefully

### Web Articles (Open Graph + Schema.org)

**Why Open Graph:**
- Near-universal adoption (Facebook, Twitter, LinkedIn, Discord)
- Standardized metadata tags (`og:title`, `og:description`, `og:image`, `og:type`)
- Enriched with article-specific tags (`article:author`, `article:published_time`)

**Why Schema.org:**
- Google's structured data standard
- JSON-LD format embeds metadata in `<script>` tags
- Covers cases where Open Graph is insufficient

**Extraction Strategy:**
1. Fetch HTML content from URL
2. Parse `<meta property="og:*">` tags
3. Parse `<script type="application/ld+json">` for Schema.org
4. Fallback to HTML `<title>`, `<meta name="description">`, etc.

**Open Graph Tags:**
```html
<meta property="og:title" content="Article Title" />
<meta property="og:description" content="Article summary..." />
<meta property="og:image" content="https://..." />
<meta property="og:type" content="article" />
<meta property="article:author" content="Author Name" />
<meta property="article:published_time" content="2024-03-15T14:30:00Z" />
<meta property="article:modified_time" content="2024-03-16T10:00:00Z" />
<meta property="article:section" content="Technology" />
<meta property="article:tag" content="AI" />
```

**Schema.org JSON-LD:**
```json
{
  "@context": "https://schema.org",
  "@type": "Article",
  "headline": "Article Title",
  "author": {
    "@type": "Person",
    "name": "Author Name"
  },
  "datePublished": "2024-03-15T14:30:00Z",
  "dateModified": "2024-03-16T10:00:00Z",
  "description": "Article summary...",
  "image": "https://...",
  "publisher": {
    "@type": "Organization",
    "name": "Publisher Name"
  },
  "wordCount": 1500
}
```

**Mapping to Schema:**
- `og:title` or `Article.headline` → `name`
- `article:author` or `Article.author.name` → `creator`
- `article:published_time` or `Article.datePublished` → `published_at`
- `og:description` or `Article.description` → `description`
- `Article.wordCount` → `word_count` (or `page_count` as proxy)
- `og:image` or `Article.image` → `image_url`
- `article:section`, `article:tag`, `publisher` → `metadata`

**Extraction Library:**
- **Recommended:** `github.com/PuerkitoBio/goquery` (HTML parsing) + custom Open Graph extractor
- Alternative: `github.com/otiai10/opengraph` (270 stars, focused on Open Graph)

**GraphQL Mutation:**
```graphql
mutation CreateArticle($input: CreateContentFromArticleInput!) {
  createContentFromArticle(input: $input) {
    id
    name
    contentType
    creator
    publishedAt
    wordCount
  }
}

input CreateContentFromArticleInput {
  url: String!
  userId: IntID!
}
```

**Challenges:**
- Not all sites implement Open Graph correctly
- Paywalls may block metadata extraction
- Rate limiting on scrapers (implement backoff)

---

## 7. PostgreSQL Schema (DDL)

### Migration Plan

**Phase 1: Column Promotion (v1.1)**

```sql
-- 000011_promote_common_fields.up.sql

-- Add promoted columns
ALTER TABLE content ADD COLUMN creator TEXT[];
ALTER TABLE content ADD COLUMN published_at TIMESTAMPTZ;
ALTER TABLE content ADD COLUMN published_at_precision VARCHAR(10) DEFAULT 'timestamp';
ALTER TABLE content ADD COLUMN description TEXT;
ALTER TABLE content ADD COLUMN duration INTERVAL;
ALTER TABLE content ADD COLUMN page_count INT;
ALTER TABLE content ADD COLUMN word_count INT;

-- Add metadata column for type-specific fields
ALTER TABLE content ADD COLUMN metadata JSONB DEFAULT '{}'::jsonb;

-- Create indexes
CREATE INDEX idx_content_creator_gin ON content USING GIN(creator);
CREATE INDEX idx_content_published_at ON content(published_at);
CREATE INDEX idx_content_duration ON content(duration) WHERE duration IS NOT NULL;
CREATE INDEX idx_content_page_count ON content(page_count) WHERE page_count IS NOT NULL;
CREATE INDEX idx_content_description_fts ON content USING GIN(to_tsvector('english', description));
CREATE INDEX idx_content_metadata_gin ON content USING GIN(metadata jsonb_path_ops);

-- Backfill YouTube data
UPDATE content
SET
    creator = ARRAY[response->'items'->0->'snippet'->>'channelTitle'],
    published_at = (response->'items'->0->'snippet'->>'publishedAt')::timestamptz,
    published_at_precision = 'timestamp',
    description = response->'items'->0->'snippet'->>'description',
    duration = (response->'items'->0->'contentDetails'->>'duration')::interval,
    metadata = jsonb_build_object(
        'viewCount', (response->'items'->0->'statistics'->>'viewCount')::bigint,
        'likeCount', (response->'items'->0->'statistics'->>'likeCount')::bigint,
        'commentCount', (response->'items'->0->'statistics'->>'commentCount')::bigint,
        'tags', response->'items'->0->'snippet'->'tags'
    )
WHERE content_type = 'youtube';

-- Drop old length columns (replaced by duration/page_count)
ALTER TABLE content DROP COLUMN IF EXISTS length;
ALTER TABLE content DROP COLUMN IF EXISTS length_units;
```

**Phase 1 Rollback:**

```sql
-- 000011_promote_common_fields.down.sql

-- Restore old length columns
ALTER TABLE content ADD COLUMN length VARCHAR;
ALTER TABLE content ADD COLUMN length_units VARCHAR;

-- Drop new columns
DROP INDEX IF EXISTS idx_content_metadata_gin;
DROP INDEX IF EXISTS idx_content_description_fts;
DROP INDEX IF EXISTS idx_content_page_count;
DROP INDEX IF EXISTS idx_content_duration;
DROP INDEX IF EXISTS idx_content_published_at;
DROP INDEX IF EXISTS idx_content_creator_gin;

ALTER TABLE content DROP COLUMN word_count;
ALTER TABLE content DROP COLUMN page_count;
ALTER TABLE content DROP COLUMN duration;
ALTER TABLE content DROP COLUMN description;
ALTER TABLE content DROP COLUMN published_at_precision;
ALTER TABLE content DROP COLUMN published_at;
ALTER TABLE content DROP COLUMN creator;
ALTER TABLE content DROP COLUMN metadata;
```

**Phase 2: Response Trimming (Optional, v1.2+)**

```sql
-- 000012_trim_response_jsonb.up.sql

-- Trim YouTube response to essential paths
UPDATE content
SET response = jsonb_build_object(
    'items', jsonb_build_array(
        jsonb_build_object(
            'id', response->'items'->0->'id',
            'snippet', jsonb_build_object(
                'title', response->'items'->0->'snippet'->'title',
                'channelTitle', response->'items'->0->'snippet'->'channelTitle',
                'publishedAt', response->'items'->0->'snippet'->'publishedAt'
            ),
            'contentDetails', jsonb_build_object(
                'duration', response->'items'->0->'contentDetails'->'duration'
            ),
            'statistics', response->'items'->0->'statistics'
        )
    )
)
WHERE content_type = 'youtube';

-- Optional: Enable LZ4 compression on response column (PG 14+)
ALTER TABLE content ALTER COLUMN response SET COMPRESSION lz4;
```

**Phase 3: Add New Content Types (v1.2+)**

```sql
-- 000013_add_book_content_type.up.sql

-- Add BOOK to content_type enum (if using CHECK constraint)
-- Note: PostgreSQL doesn't have native enum alterations, use CHECK constraint or separate enum type

-- No schema changes needed! Just add new content_type values.
-- Metadata JSONB handles type-specific fields.
```

### Full Schema (After Migrations)

```sql
CREATE TABLE content (
    -- Primary key
    id SERIAL PRIMARY KEY,

    -- Universal fields (all content types)
    name VARCHAR NOT NULL,
    url VARCHAR UNIQUE,
    content_type VARCHAR NOT NULL, -- 'youtube', 'book', 'article', 'podcast'
    added_by_user_id INT NOT NULL REFERENCES users(id),

    -- Promoted common fields
    creator TEXT[], -- Multiple authors/creators
    published_at TIMESTAMPTZ,
    published_at_precision VARCHAR(10) DEFAULT 'timestamp', -- 'year', 'month', 'day', 'timestamp'
    description TEXT,

    -- Length fields (type-specific columns)
    duration INTERVAL, -- Videos, podcasts (ISO 8601)
    page_count INT,    -- Books, articles
    word_count INT,    -- Articles

    -- Image
    image_url VARCHAR, -- Already exists

    -- Type-specific structured data
    metadata JSONB DEFAULT '{}'::jsonb,

    -- Raw API response (trimmed, optionally compressed)
    response JSONB,

    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW() NOT NULL,

    -- Constraints
    CONSTRAINT content_url_not_empty CHECK (url IS NULL OR url <> ''),
    CONSTRAINT content_type_valid CHECK (content_type IN ('youtube', 'book', 'article', 'podcast'))
);

-- Indexes
CREATE INDEX idx_content_content_type ON content(content_type);
CREATE INDEX idx_content_creator_gin ON content USING GIN(creator);
CREATE INDEX idx_content_published_at ON content(published_at DESC);
CREATE INDEX idx_content_duration ON content(duration) WHERE duration IS NOT NULL;
CREATE INDEX idx_content_page_count ON content(page_count) WHERE page_count IS NOT NULL;
CREATE INDEX idx_content_description_fts ON content USING GIN(to_tsvector('english', description));
CREATE INDEX idx_content_metadata_gin ON content USING GIN(metadata jsonb_path_ops);
CREATE INDEX idx_content_created_at ON content(created_at DESC);
CREATE INDEX idx_content_updated_at ON content(updated_at DESC);

-- Trigger for updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER set_updated_at_content
    BEFORE UPDATE ON content
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at();
```

### Index Strategy

**B-tree indexes (promoted columns):**
- `creator` (GIN for array containment)
- `published_at` (range queries, sorting)
- `created_at`, `updated_at` (sorting)

**Partial indexes (type-specific columns):**
- `duration WHERE duration IS NOT NULL` (only videos/podcasts)
- `page_count WHERE page_count IS NOT NULL` (only books/articles)

**GIN indexes (JSONB and full-text search):**
- `metadata` (type-specific field queries)
- `description` (full-text search)

**Why this strategy:**
- B-tree indexes on promoted columns are 10-100x faster than GIN on JSONB for equality/range queries
- Partial indexes save space (don't index NULL values)
- GIN on `metadata` enables flexible type-specific queries without schema changes

---

## 8. GraphQL Schema Design

### Option A: Interface (Recommended)

**Advantages:**
- Clean abstraction for shared fields
- Single query endpoint for mixed content lists
- Type-safe with GraphQL validation
- Aligns with "shared columns" database strategy

**Schema:**

```graphql
# Shared interface
interface Content {
  id: ID!
  name: String!
  url: String
  contentType: ContentType!
  addedByUserID: ID!
  addedBy: User

  # Promoted common fields
  creator: [String!]
  publishedAt: String
  publishedAtPrecision: DatePrecision
  description: String
  imageUrl: String

  # Timestamps
  createdAt: String!
  updatedAt: String!
}

# Concrete types
type VideoContent implements Content {
  # ... all Content fields

  # Video-specific
  duration: Int! # Seconds
  durationISO: String! # PT15M33S
  viewCount: Int
  likeCount: Int
  commentCount: Int
  channelTitle: String
  tags: [String!]
}

type BookContent implements Content {
  # ... all Content fields

  # Book-specific
  pageCount: Int
  isbn: String
  isbn10: String
  publisher: String
  authors: [String!]! # Alias for creator
  categories: [String!]
  language: String
  averageRating: Float
}

type PodcastContent implements Content {
  # ... all Content fields

  # Podcast-specific
  duration: Int!
  durationISO: String!
  showName: String
  episodeNumber: Int
  seasonNumber: Int
  episodeType: String
}

type ArticleContent implements Content {
  # ... all Content fields

  # Article-specific
  wordCount: Int
  pageCount: Int # Estimated read time
  publisher: String
  section: String
  tags: [String!]
  modifiedAt: String
}

# Enums
enum ContentType {
  YOUTUBE
  BOOK
  PODCAST
  ARTICLE
}

enum DatePrecision {
  YEAR
  MONTH
  DAY
  TIMESTAMP
}

# Query with union return type
type Query {
  contentByID(id: ID!): Content

  content(
    first: Int = 10
    after: String
    sortBy: ContentSortBy = CREATED_AT
    sortOrder: SortOrder = DESC
    filter: ContentFilter
  ): PaginatedContent!
}

type PaginatedContent {
  items: [Content!]!
  pageInfo: PageInfo!
  totalCount: Int
}
```

**Resolver Implementation (gqlgen):**

```go
// backend/internal/adapters/graphql/resolvers/content_resolver.go

func (r *queryResolver) ContentByID(ctx context.Context, id string) (model.Content, error) {
    // Parse ID
    idInt, err := strconv.Atoi(id)
    if err != nil {
        return nil, fmt.Errorf("invalid ID: %w", err)
    }

    // Fetch from service
    content, err := r.contentService.GetByID(ctx, idInt)
    if err != nil {
        return nil, err
    }

    // Map domain → GraphQL model (returns interface)
    return mapContentToGraphQL(content), nil
}

// Map domain.Content → GraphQL interface implementation
func mapContentToGraphQL(c *domain.Content) model.Content {
    switch c.ContentType {
    case domain.ContentTypeYouTube:
        return &model.VideoContent{
            ID:          strconv.Itoa(c.ID),
            Name:        c.Name,
            ContentType: model.ContentTypeYoutube,
            // ... map fields from domain + metadata JSONB
            Duration:    extractDuration(c.Duration),
            ViewCount:   extractMetadata(c.Metadata, "viewCount"),
        }
    case domain.ContentTypeBook:
        return &model.BookContent{
            ID:          strconv.Itoa(c.ID),
            Name:        c.Name,
            ContentType: model.ContentTypeBook,
            // ... map fields
            PageCount:   c.PageCount,
            ISBN:        extractMetadata(c.Metadata, "isbn"),
        }
    // ... other types
    default:
        return nil
    }
}
```

**gqlgen.yml Configuration:**

```yaml
# Bind GraphQL interface to Go interface
models:
  Content:
    model:
      - github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model.Content

  VideoContent:
    model:
      - github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model.VideoContent

  BookContent:
    model:
      - github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model.BookContent
```

**Frontend Query (with Fragments):**

```graphql
query GetContent($id: ID!) {
  contentByID(id: $id) {
    __typename
    id
    name
    contentType
    creator
    publishedAt

    ... on VideoContent {
      duration
      viewCount
      likeCount
    }

    ... on BookContent {
      pageCount
      isbn
      publisher
    }

    ... on PodcastContent {
      duration
      episodeNumber
      showName
    }

    ... on ArticleContent {
      wordCount
      publisher
      section
    }
  }
}
```

### Option B: Union Type

**Advantages:**
- More flexible (types don't need shared fields)
- Clearer type discrimination in frontend

**Disadvantages:**
- Cannot query shared fields without fragments
- More verbose frontend queries
- Less aligned with database schema (shared promoted columns)

**Schema:**

```graphql
union Content = VideoContent | BookContent | PodcastContent | ArticleContent

type Query {
  contentByID(id: ID!): Content
}
```

**Frontend Query:**

```graphql
query GetContent($id: ID!) {
  contentByID(id: $id) {
    __typename
    ... on VideoContent {
      id
      name
      creator
      duration
    }
    ... on BookContent {
      id
      name
      creator
      pageCount
    }
  }
}
```

**Why Interface is Better for Perspectize:**
- Promoted columns (creator, published_at, description) are truly shared
- Frontend can query shared fields without fragments
- Aligns with database schema (single table with promoted columns)
- Easier to add new content types (implement interface, add to switch statement)

---

## 9. Migration Strategy

### Phase 1: Preparation (v1.1 - Beta)

**Goal:** Promote common fields without breaking YouTube functionality.

**Steps:**
1. Add new columns (`creator`, `published_at`, `description`, `duration`, `page_count`, `metadata`) via migration
2. Backfill YouTube data from `response` JSONB to new columns
3. Update GraphQL schema to use new fields (keep old resolvers as fallback)
4. Deploy and validate with existing YouTube data
5. Monitor performance (slow query log, index usage)

**Rollback Strategy:**
- Keep `response` column intact (can revert to old resolvers)
- Migration has explicit `.down.sql` script

**Success Criteria:**
- All existing YouTube content queries return correct data
- No slow queries (all < 100ms)
- Storage overhead acceptable (< 20% increase)

### Phase 2: New Content Types (v1.2)

**Goal:** Add book support using promoted schema.

**Steps:**
1. Implement Google Books API adapter
2. Add `createContentFromBook` GraphQL mutation
3. Update frontend to handle `BookContent` type
4. Deploy and test with small dataset
5. Open to users

**Success Criteria:**
- Book creation works end-to-end
- Mixed content queries (videos + books) work correctly
- GraphQL interface resolvers handle both types

### Phase 3: Response Trimming (v1.3+)

**Goal:** Reduce storage overhead from raw API responses.

**Steps:**
1. Analyze which `response` fields are actually read by resolvers
2. Create migration to trim `response` to essential paths only
3. Enable LZ4 compression on `response` column (PostgreSQL 14+)
4. Deploy and monitor storage reduction

**Success Criteria:**
- Storage reduction of 60-70% on `response` column
- No resolver breakage (all fields still accessible)
- Compression overhead acceptable (< 2x query time)

### Phase 4: Additional Content Types (v2.0+)

**Goal:** Add podcasts and articles.

**Steps:**
1. Repeat Phase 2 pattern for podcasts (RSS adapter)
2. Repeat Phase 2 pattern for articles (Open Graph extractor)
3. Iterate on `metadata` JSONB schema based on usage

**Success Criteria:**
- All four content types supported
- Metadata queries performant (GIN index effective)
- No schema migrations required for new types

### Zero-Downtime Migration Tactics

**For schema changes:**
1. **Add columns** in one deploy (nullable, with defaults)
2. **Backfill data** in background job or maintenance window
3. **Update application** to read from new columns (keep old columns as fallback)
4. **Drop old columns** in subsequent deploy after validation

**For index changes:**
1. Use `CREATE INDEX CONCURRENTLY` (doesn't block writes)
2. Monitor index build progress: `SELECT * FROM pg_stat_progress_create_index;`
3. Drop old indexes only after new indexes are verified

**For JSONB restructuring:**
1. Add `metadata` column (new structure)
2. Dual-write to both `response` and `metadata` during transition
3. Backfill `metadata` from `response` in background
4. Switch reads to `metadata` after backfill complete
5. Trim `response` in later migration

---

## 10. Performance Considerations

### Index Performance: B-tree vs GIN

**B-tree (promoted columns):**
- Equality query: ~0.01-0.07 ms (cached)
- Range query: ~0.1-1 ms
- Sort: ~0.1-10 ms (depending on cardinality)

**GIN (JSONB):**
- Containment query (`@>`, `?`): ~0.7-1.2 ms per operator (cached)
- Extraction overhead: ~0.5-2 ms per JSONB navigation

**Takeaway:** B-tree is 10-100x faster for equality/range queries. Promote fields that are filtered/sorted frequently.

### Storage Efficiency

**Current (v1.0):**
- Average row size: ~2,600 bytes
- `response` column: ~2,469 bytes (93.7%)
- All other columns: ~136 bytes (6.3%)

**After promotion (v1.1):**
- Average row size: ~2,800 bytes (+7.7%)
- `response` (trimmed): ~700-900 bytes
- Promoted columns: ~300-500 bytes
- `metadata` JSONB: ~200-400 bytes

**After compression (v1.3):**
- Average row size: ~1,200-1,500 bytes (-45-55%)
- LZ4 compression ratio: ~2-3x on JSONB

**Takeaway:** Promotion increases storage slightly, but trimming + compression reduces total storage significantly.

### Query Planner Statistics

**Problem:** PostgreSQL doesn't collect statistics on JSONB field values.

**Example:**
```sql
-- Query planner has no statistics on response->'items'->0->'statistics'->>'viewCount'
-- Assumes 0.1% selectivity (hardcoded estimate)
SELECT * FROM content WHERE (response->'items'->0->'statistics'->>'viewCount')::bigint > 10000;
```

**Solution:** Promote to column.

```sql
-- Query planner has statistics on metadata->>'viewCount' via GIN index
-- Or even better: promote to dedicated column
SELECT * FROM content WHERE view_count > 10000;
```

**Benefit:** Accurate selectivity estimates → better query plans → faster queries.

### Compression Trade-offs

**LZ4 (PostgreSQL 14+ default):**
- Fast compression/decompression (~2x slower than uncompressed)
- Lower compression ratio (~2-3x)
- Recommended for frequently-accessed JSONB

**PGLZ (PostgreSQL < 14 default):**
- Slower compression/decompression (~5x slower than uncompressed)
- Higher compression ratio (~3-4x)
- Not recommended for hot data

**Recommendation:** Use LZ4 compression on `response` column. The 2x performance penalty is acceptable for infrequently-accessed audit data.

### TOAST Strategy

PostgreSQL automatically TOASTs (out-of-line storage) values > 2KB. JSONB columns are prime candidates.

**Default strategy:** `EXTENDED` (compress, then move to TOAST table if still > 2KB)

**Alternative:** `EXTERNAL` (move to TOAST table without compression)

**Recommendation:** Keep default `EXTENDED` strategy. Let PostgreSQL handle TOAST automatically.

**Monitor TOAST performance:**
```sql
-- Check if a column is TOASTed
SELECT pg_column_compression(response) FROM content LIMIT 10;

-- Check TOAST chunk ID (PG 17+)
SELECT pg_column_toast_chunk_id(response) FROM content LIMIT 10;

-- Check on-disk size
SELECT pg_column_size(response) FROM content LIMIT 10;
```

---

## 11. Risks & Mitigations

### Risk 1: JSONB Query Performance Degrades at Scale

**Scenario:** GIN indexes on `metadata` JSONB become slow at 10K+ rows.

**Likelihood:** MEDIUM - GIN indexes are 10x slower than B-tree for equality queries.

**Impact:** HIGH - Activity page queries timeout.

**Mitigation:**
1. Monitor slow query log (set `log_min_duration_statement = 200`)
2. Identify frequently-queried metadata fields (e.g., `viewCount`, `likeCount`)
3. Promote those fields to dedicated columns via migration
4. Add B-tree indexes on promoted columns

**Contingency:** Fall back to expression indexes on extracted JSONB values:
```sql
CREATE INDEX idx_content_view_count ON content((metadata->>'viewCount')::bigint);
```

### Risk 2: Date Precision Ambiguity

**Scenario:** Book published date "2024" is stored as `2024-01-01 00:00:00`, user interprets as "January 1st".

**Likelihood:** MEDIUM - Users may not notice `date_precision` field.

**Impact:** LOW - Cosmetic, doesn't break functionality.

**Mitigation:**
1. Always display dates with precision context: "2024" (year only), "March 2024" (month), "March 15, 2024" (day)
2. GraphQL schema includes `publishedAtPrecision` field
3. Frontend formats based on precision:
   ```typescript
   function formatPublishedDate(date: string, precision: DatePrecision): string {
     switch (precision) {
       case 'YEAR': return new Date(date).getFullYear().toString();
       case 'MONTH': return format(new Date(date), 'MMMM yyyy');
       case 'DAY': return format(new Date(date), 'MMMM d, yyyy');
       case 'TIMESTAMP': return format(new Date(date), 'MMMM d, yyyy h:mm a');
     }
   }
   ```

### Risk 3: Multiple Authors Array Complexity

**Scenario:** TEXT[] array is hard to query or manipulate in GraphQL resolvers.

**Likelihood:** LOW - PostgreSQL array support is mature, GORM handles arrays well.

**Impact:** MEDIUM - Resolver complexity, potential N+1 queries if authors are entities.

**Mitigation:**
1. Keep authors as simple TEXT[] (strings, not entities) in v1.1
2. GraphQL resolver maps TEXT[] → [String!] directly (no joins)
3. If rich author metadata needed later, migrate to join table:
   ```sql
   CREATE TABLE authors (
     id SERIAL PRIMARY KEY,
     name TEXT UNIQUE NOT NULL,
     bio TEXT
   );

   CREATE TABLE content_authors (
     content_id INT REFERENCES content(id),
     author_id INT REFERENCES authors(id),
     role TEXT, -- 'author', 'co-author', 'editor'
     position INT, -- Order in author list
     PRIMARY KEY (content_id, author_id)
   );
   ```

### Risk 4: API Rate Limits

**Scenario:** Google Books API or podcast RSS feeds rate-limit or block scraping.

**Likelihood:** MEDIUM - Free tiers have quotas (Google Books: 1,000 req/day).

**Impact:** HIGH - Content creation fails for users.

**Mitigation:**
1. **Cache API responses:** Don't re-fetch same ISBN/URL
2. **Rate limit client-side:** Queue requests, implement backoff
3. **Provide manual entry:** Let users manually enter metadata if API fails
4. **Upgrade API tier:** Google Books allows higher quotas with API key
5. **Fallback APIs:** Use Open Library if Google Books fails

**Monitoring:**
- Log API response codes (429 = rate limit, 503 = service unavailable)
- Alert on failure rate > 10%
- Dashboard showing API quota usage

---

## 12. Sources

### Schema Design Patterns
- [PostgreSQL Table Inheritance Documentation](https://www.postgresql.org/docs/current/ddl-inherit.html)
- [Table Inheritance Patterns: Single Table vs. Class Table vs. Concrete Table Inheritance | Medium](https://medium.com/@artemkhrenov/table-inheritance-patterns-single-table-vs-class-table-vs-concrete-table-inheritance-1aec1d978de1)
- [How to Represent Inheritance in a Database? | Baeldung on SQL](https://www.baeldung.com/sql/database-inheritance)
- [Polymorphism in Database Schema Design | bugfree.ai](https://bugfree.ai/knowledge-hub/polymorphism-in-database-schema-design)

### JSONB Performance
- [When To Avoid JSONB In A PostgreSQL Schema | Heap](https://www.heap.io/blog/when-to-avoid-jsonb-in-a-postgresql-schema)
- [PostgreSQL JSONB - Powerful Storage for Semi-Structured Data](https://www.architecture-weekly.com/p/postgresql-jsonb-powerful-storage)
- [The Postgres Showdown Text Columns vs JSONB Fields | Medium](https://medium.com/lumigo/the-postgres-showdown-text-columns-vs-jsonb-fields-0ffff011ac46)
- [Understanding Postgres GIN Indexes: The Good and the Bad | pganalyze](https://pganalyze.com/blog/gin-index)
- [Indexing JSONB in Postgres | Crunchy Data Blog](https://www.crunchydata.com/blog/indexing-jsonb-in-postgres)

### JSONB Compression
- [TOASTed JSONB data in PostgreSQL: performance tests | credativ](https://www.credativ.de/en/blog/postgresql-en/toasted-jsonb-data-in-postgresql-performance-tests-of-different-compression-algorithms/)
- [PostgreSQL TOAST Strategy | Michal Drozd](https://www.michal-drozd.com/en/blog/postgresql-toast-optimization/)
- [PostgreSQL LZ4 Compression | Medium](https://medium.com/@rahul.saini.biz/just-checked-and-postgres-provides-lz4-compression-and-it-can-be-applied-to-table-a7646a76e9b6)

### GraphQL Schema Design
- [Unions and Interfaces - Apollo GraphQL Docs](https://www.apollographql.com/docs/apollo-server/schema/unions-interfaces)
- [All About GraphQL Abstract Types | Medium](https://medium.com/swlh/all-about-graphql-abstract-types-2da8f18e11a0)
- [Polymorphism in GraphQL | Salsify](https://www.salsify.com/blog/engineering/polymorphism-in-graphql)
- [gqlgen](https://gqlgen.com/)

### API Integration
- [Google Books API Documentation | Google for Developers](https://developers.google.com/books/docs/v1/using)
- [Volume | Google Books API Reference](https://developers.google.com/books/docs/v1/reference/volumes)
- [iTunes Podcast RSS Spec | Podcastindex-org](https://github.com/Podcastindex-org/podcast-namespace/blob/main/itunes_reference.md)
- [The Open Graph Protocol](https://ogp.me/)
- [Article - Schema.org Type](https://schema.org/Article)

### PostgreSQL Data Types
- [PostgreSQL Date/Time Types Documentation](https://www.postgresql.org/docs/current/datatype-datetime.html)
- [Working with Time in Postgres | Crunchy Data](https://www.crunchydata.com/developers/playground/working-with-time-in-postgres)
- [Time, TIMETZ, Timestamp, and TimestampTZ in PostgreSQL | CockroachDB](https://www.cockroachlabs.com/blog/time-data-types-postgresql/)

### Migration Strategies
- [Database Schema Migration | Liquibase](https://www.liquibase.com/resources/guides/database-schema-migration)
- [Database Migrations: Safe, Downtime-Free Strategies](https://vadimkravcenko.com/shorts/database-migrations/)
- [Evolutionary Database Design | Martin Fowler](https://martinfowler.com/articles/evodb.html)

---

## 13. Confidence Assessment

| Area | Confidence | Rationale |
|------|-----------|-----------|
| **Schema pattern recommendation** | HIGH | Single-table inheritance is well-documented for this scale and use case. PostgreSQL limitations on native inheritance are well-known. |
| **Column promotion strategy** | HIGH | B-tree vs GIN performance differences are quantified in multiple sources. Query planner statistics gap is documented. |
| **Field mappings** | MEDIUM | YouTube API structure is verified (existing integration). Google Books API structure is verified via official docs. Podcast RSS/iTunes tags are standardized but may vary by feed. Articles depend on site compliance with Open Graph. |
| **JSONB compression** | HIGH | LZ4 vs PGLZ trade-offs are documented in PostgreSQL 14+ release notes and performance benchmarks. |
| **GraphQL interface design** | HIGH | Interface vs union trade-offs are well-documented in Apollo/gqlgen docs. Interface aligns with database schema strategy. |
| **Migration strategy** | MEDIUM | Zero-downtime tactics are standard (expand/contract pattern), but actual performance at scale unknown until tested. |
| **API integration feasibility** | MEDIUM | Google Books API is well-documented and free. Podcast RSS is standardized but feed quality varies. Article extraction depends on site cooperation. |
| **Performance at scale** | LOW | Performance estimates are based on documented benchmarks (B-tree vs GIN), but actual Perspectize query patterns at 10K+ rows are untested. Monitoring and iteration required. |

**Overall confidence:** HIGH for v1.1 schema design. MEDIUM for v1.2+ content type integrations (depends on API availability and site compliance).

---

## 14. Next Steps for Implementation

### Immediate (v1.1 - Column Promotion)

1. **Create migration 000011_promote_common_fields.up.sql**
   - Add columns: `creator TEXT[]`, `published_at TIMESTAMPTZ`, `published_at_precision VARCHAR(10)`, `description TEXT`, `duration INTERVAL`, `page_count INT`, `metadata JSONB`
   - Create indexes
   - Backfill YouTube data
   - Drop `length`/`length_units` columns

2. **Update domain models** (`backend/internal/core/domain/content.go`)
   - Add new fields to `Content` struct
   - Update validation rules

3. **Update GORM models** (`backend/internal/adapters/repositories/postgres/gorm_models.go`)
   - Add GORM tags for new columns
   - Update mappers (`gorm_mappers.go`)

4. **Update GraphQL resolvers** (`backend/internal/adapters/graphql/resolvers/content_resolver.go`)
   - Read from new columns instead of extracting from `response` JSONB
   - Keep `response` extraction as fallback during transition

5. **Update tests**
   - Unit tests for domain models
   - Repository tests for new columns
   - Resolver tests for new fields

6. **Deploy and validate**
   - Run migration on staging database
   - Verify all queries return correct data
   - Monitor slow query log
   - Validate storage overhead acceptable

### Phase 2 (v1.2 - Books)

1. **Implement Google Books adapter**
   - `backend/internal/adapters/external/googlebooks/client.go`
   - Mirror YouTube adapter structure
   - Handle ISBN and title+author search
   - Parse varying date precision

2. **Update GraphQL schema**
   - Add `BookContent` type implementing `Content` interface
   - Add `createContentFromBook` mutation
   - Add `CreateContentFromBookInput` type

3. **Update frontend**
   - Handle `BookContent` type in ActivityTable
   - Add book creation form
   - Format fields based on content type

4. **Test with small dataset**
   - Create 10-20 books manually
   - Verify mixed queries (videos + books)
   - Validate date precision display

### Phase 3 (v1.3 - Response Trimming)

1. **Analyze response usage**
   - Grep codebase for `response->'items'` patterns
   - Document which paths are actually read

2. **Create trimming migration**
   - Restructure `response` JSONB to keep only essential paths
   - Enable LZ4 compression

3. **Deploy and monitor**
   - Validate storage reduction
   - Ensure no resolver breakage

### Phase 4 (v2.0 - Podcasts & Articles)

1. **Repeat Phase 2 for podcasts**
   - RSS feed parsing adapter
   - iTunes tags extraction
   - Duration parsing (HH:MM:SS)

2. **Repeat Phase 2 for articles**
   - Open Graph extraction adapter
   - Schema.org JSON-LD parsing
   - Fallback to HTML metadata

3. **Iterate on metadata schema**
   - Add type-specific indexes as query patterns emerge
   - Consider promoting frequently-queried metadata fields to columns

---

**END OF RESEARCH DOCUMENT**
