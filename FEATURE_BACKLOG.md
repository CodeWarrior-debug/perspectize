# Feature Backlog

Ideas and future enhancements captured during development. Not committed to any milestone — evaluated when planning new work.

---

## Perspective Count + Avg Rating in Content Details Modal

`ActivityDetailsModal.svelte`'s "Perspectives" and "Avg. Rating" stat tiles currently render a hardcoded `—` placeholder — there's no backend support yet. `Content` in `backend/schema.graphql` has no `perspectiveCount`/`averageRating` fields, and no resolver aggregates `Perspective` rows per content item.

**What to do:**
- Add `perspectiveCount: Int!` and `averageRating: Float` to the `Content` type, backed by a resolver that aggregates `Perspective` rows (likely an "overall" rating average — needs a product decision on which field(s) count toward it, given quality/agreement/importance/confidence/like/custom fields).
- Decide eagerness: computing this per row for a large `content` list could be expensive — consider a DataLoader-batched aggregate query, or lazy-loading the two values only when the details modal opens (a small dedicated query keyed on `contentId`) rather than fetching them for every row in the activity table.
- Frontend: replace the two `—` placeholders in `ActivityDetailsModal.svelte` with the real values once available; if lazy-loaded, show a loading state in the tiles while the dedicated query is in flight.

**Priority:** Deferred — flagged during a UI pass (2026-09-05) as more involved than a UI tweak; needs the product decision on rating aggregation before backend work starts.

---

## YouTube Search Proxy (Shared Quota Fix)

Discovered 2026-08-15: the Discover page's search (`fetchYouTubeSearch` in `frontend/src/lib/services/youtubeApi.ts`) calls YouTube's `search.list` **directly from the browser** using a single build-time key (`VITE_YOUTUBE_API_KEY`). `search.list` costs a flat 100 units/call, and the default daily quota is 10,000 units — so the whole deployed app shares roughly **~100 searches/day total**, not per-user, since every browser uses the same key. Client-side caching (TanStack Query, 5 min staleTime for search / 1 hour for trending) helps within a session but doesn't share across users or browser tabs.

**What to do:**
- Move `fetchYouTubeSearch`/`fetchYouTubeTrending` behind a backend endpoint (GraphQL query or REST) that holds the API key server-side
- Add a shared cache keyed on `query + filters` (Postgres or in-memory, TTL ~5-15 min) so identical searches across different users cost one YouTube API call, not N
- `videos.list` (trending, pagination) is cheap (~1-7 units/call) and not the bottleneck — lower priority than fixing `search.list`
- Separately, request a quota increase from Google Cloud Console (YouTube Data API v3 → Quotas) — independent of the code fix, worth doing regardless

**Priority:** Should be addressed before the Discover page sees real multi-user traffic — the shared-key quota exhaustion is a hard outage (`quotaExceeded` error), not a degraded-performance issue.

**Partial progress (2026-09-03):** The `GetVideoMetadata` path (add-video / refresh, called from `ContentService` in the Go backend — separate from `search.list`) now sits behind an in-memory TTL cache (`youtube.CachingClient`, `backend/internal/adapters/youtube/cache.go`), configurable via `YOUTUBE_API_CACHE_TTL_SECONDS` (default 6h). This does **not** touch `search.list` or the frontend proxy problem above — that's still outstanding.

---

## Discover Page (New Page)

The v1 home page is an **Activity** page — a data table of user activity on videos already in the system. This is the correct approach for v1.

A future **Discover** page would be a separate page for finding new content outside the system:
- **Browse** — Show topics/tags from YouTube API endpoint, letting users explore categories
- **Search** — Live YouTube API search to discover new videos directly from YouTube

This is distinct from the Activity page's local search/filter. Discover reaches out to YouTube; Activity shows what's already tracked.

---

## Unpopulated Nested GraphQL Fields — N+1 Guardrail Needed Before Implementing

Discovered 2026-09-02 while investigating whether the Activity page has N+1 issues fetching user perspectives. It doesn't — `content` and `perspectives` are each single batched queries today. But three schema fields are declared and never populated, always resolving to `null`:

- `Content.addedBy: User` (`backend/schema.graphql:91`)
- `Perspective.user: User` (`backend/schema.graphql:51`)
- `Perspective.content: Content` (`backend/schema.graphql:53`)

`helpers.go`'s `domainToModel()`/`perspectiveDomainToModel()` set the scalar ID fields (`AddedByUserID`, `UserID`, `ContentID`) but never hydrate the nested object fields, and no resolver functions exist for them (`gqlgen.yml` only marks `User.email` as `resolver: true`). The frontend also never requests these nested fields today, so there's no live bug — just dead schema.

**What to do when implementing these fields for real:** `perspectives` and `content` are the app's two paginated, potentially-large list queries. A naive per-row resolver (e.g. `UserRepository.GetByID` called once per `Perspective.user` in a list) would be a classic N+1. Implement via batching instead — either a DataLoader (none exists in this codebase yet — would need to be built from scratch) or a single `WHERE id IN (...)` query keyed off the parent list's IDs.

**Priority:** Not urgent — nothing is broken. Address when there's an actual product need for `addedBy`/`user`/`content` to be populated (e.g. showing "added by" attribution or the perspective author inline in the Activity table).

**Acceptance criteria to include when this is implemented:** a resolver/integration test that asserts SQL query count — seed a list (e.g. 20 perspectives, each with a different user), request the nested field (`user { username }`), wrap the DB with a query counter (GORM logger callback or driver-level counter), and assert the query count stays constant (e.g. 1-2) regardless of list size rather than scaling with N. This is the regression guardrail against reintroducing an N+1 — a repository-level unit test won't catch it, since the risk lives in how the resolver hydrates nested fields, not in the existing single-query `List` methods.

---

## gorm-cursor-paginator Integration (HIGH PRIORITY)

Phase 7.1 research recommended [gorm-cursor-paginator](https://github.com/pilagod/gorm-cursor-paginator) (226 stars) to replace hand-rolled cursor encoding in GORM repositories. The executor kept the existing `encodeCursor`/`decodeCursor` helpers from the sqlx migration instead of adding the library.

**Current state:** Hand-rolled cursor logic in `backend/internal/adapters/repositories/postgres/helpers.go` — works but misses benefits of the library (type-safe cursor fields, automatic keyset query building, simpler pagination setup).

**What to do:**
- Add `gorm-cursor-paginator` dependency
- Replace `encodeCursor`/`decodeCursor` and manual keyset WHERE clauses in `gorm_content_repository.go` and `gorm_perspective_repository.go`
- Simplify List methods to use paginator's built-in cursor handling
- Update tests

**Priority:** High — should be addressed in the next backend phase. Was part of the original 7.1 plan but was missed during execution.

---

## Authentication Architecture Design

Discovered during frontend caching review (2026-02-14). The GraphQL client (`frontend/src/lib/queries/client.ts`) has empty `headers: {}` — no auth tokens, no CSRF protection, no per-user cache scoping. Designing the auth architecture involves:

- **Token strategy:** JWT vs session cookies vs OAuth2
- **GraphQL client auth hook:** Dynamic header injection via `requestMiddleware` or client factory
- **Cache scoping:** TanStack Query keys need user identity dimension (e.g., `['content', userId]`)
- **Cache invalidation on logout:** `queryClient.clear()` to prevent data leakage between users
- **CSRF protection:** Backend middleware + frontend token handling
- **Secure token storage:** httpOnly cookies preferred over localStorage/sessionStorage

**Dependencies:** Should be planned alongside Phase 9 (Security Hardening) which covers backend auth middleware.

**Source:** Frontend caching review Finding #4 (CVSS 8.1), Finding #2 (no auth).

---

## AG Grid Power Features Toolbar

Add a toolbar above `ActivityTable` with power-user grid controls. All features below use **AG Grid Community APIs** — no Enterprise license needed.

- **Clear all filters** — `gridApi.setFilterModel(null)`
- **Clear single column filter** — `gridApi.setColumnFilterModel('colId', null)`
- **Multi-column sort** — `multiSortKey: 'ctrl'` in gridOptions (hold Ctrl+click headers)
- ~~**Column show/hide picker**~~ — DONE (2026-09-02): gear-icon modal `ColumnPickerDialog`, session-only, admin-gated internal columns. Branch `feature/INI-ag-grid-column-picker`.
- **Save/restore filter state** — `gridApi.getFilterModel()` / `gridApi.setFilterModel(saved)`
- **Save/restore column state** — `gridApi.getColumnState()` / `gridApi.applyColumnState({state})`

**References:**
- [AG Grid Filter API](https://www.ag-grid.com/javascript-data-grid/filter-api/)
- [AG Grid Column State](https://www.ag-grid.com/javascript-data-grid/column-state/)
- [AG Grid Multi-Sort](https://www.ag-grid.com/javascript-data-grid/row-sorting/#multi-column-sorting)

---

## Saved Views (Activity Table)

Named, persisted presets that capture column visibility + filters + sort +
page size for `ActivityTable`, so a user can switch between "My reading queue",
"Admin audit", etc. without re-toggling each time.

- Persist per user (localStorage first; backend `user_views` table later for
  cross-device).
- Builds directly on the session-only column picker shipped 2026-09-02
  (`ColumnPickerDialog` + `userColumnOverride` in `ActivityTable.svelte`) —
  promote that transient state into a saveable/loadable view object.
- Serialize via `gridApi.getColumnState()` / `getFilterModel()` and restore via
  `applyColumnState()` / `setFilterModel()`.
- UI: a view dropdown next to the gear icon; "Save current as…", rename,
  delete, set default.

**Priority:** Medium — natural follow-up once users start customizing columns.

**Source:** Column picker design discussion (2026-09-02)

---

## YouTube JSONB Storage (resolved — closed out, re-verified 2026-09-12)

**Status: done, no action beyond a minor field drop.** `YouTubeAPIResponse` in `backend/internal/adapters/youtube/client.go` was already trimmed to `items[].{id,snippet.{title,description,channelTitle,publishedAt,tags},contentDetails.duration,statistics.{viewCount,likeCount,commentCount}}` *before* this backlog entry was originally written (confirmed via git history) — the 93.7%/118KB figures above were measured against that already-trimmed shape, not a raw untrimmed API response. There was no further "trim on ingest" left undone.

**Re-verified against the dev DB (2026-09-12, 96 YouTube rows):** `content.response` averages 1,817 bytes/row, ~174 KB total — a small fraction of the whole `perspectize` DB (~8.4 MB via `pg_database_size`). The Sevalla dashboard's larger reported "used storage" figure (~63 MB) is cluster-level overhead (WAL, daily automated backups with 7-day retention, template/system databases) unrelated to `content` table growth. Of the fields still kept, `items[].id` was fetched/stored but never read anywhere in the Go codebase — dropped as a code-cleanliness fix (~18 bytes/row, not a meaningful storage change). No further optimization (column promotion, compression) is justified at this scale — revisit only if the content table grows into the 10,000+ row range. See issue #367 for the investigation.

---

## Multi-Content-Type Schema Design (JSONB Philosophy)

When adding content types beyond YouTube (books, articles, podcasts, etc.), the `content` table needs a clear column vs. JSONB strategy. The guiding principle: **shared fields get columns, type-specific fields stay in JSONB.**

### Column Promotion Candidates

Fields that are common across content types should be promoted to dedicated columns for indexing, sorting, and type safety:

| Promoted Column | YouTube Source | Book Source | Data Type (TBD) |
|----------------|---------------|-------------|------------------|
| `name` | snippet.title | volumeInfo.title | already exists |
| `image_url` | snippet.thumbnails | volumeInfo.imageLinks | already exists |
| `creator` | snippet.channelTitle | volumeInfo.authors (array) | text vs text[] vs jsonb — needs discussion |
| `published_at` | snippet.publishedAt | volumeInfo.publishedDate | timestamptz vs date — YouTube has full timestamps, books often only have year |
| `description` | snippet.description | volumeInfo.description | text (potentially long) |
| `length` | contentDetails.duration (ISO 8601) | volumeInfo.pageCount (integer) | text vs integer — needs discussion (heterogeneous units) |

**Open questions on data types:**
- `creator` — Single author vs. multiple authors (YouTube has one channel, books have co-authors). Store as `text` (comma-joined) or `text[]` or keep in JSONB?
- `published_at` — YouTube provides RFC 3339 timestamps; books may only have "2024" or "2024-03". Use `timestamptz` with day-level precision fallback, or `text`?
- `length` — Duration (PT15M33S) and page count (384) are fundamentally different units. Store as `text` with a `length_unit` column? Or keep type-specific in JSONB?

### JSONB-Only Fields (Type-Specific)

Fields that belong to one content type and don't generalize stay in the JSONB `metadata` column:

| Field | Content Type | Why JSONB |
|-------|-------------|-----------|
| `viewCount`, `likeCount`, `commentCount` | YouTube | Video engagement metrics — no book equivalent |
| `isbn`, `isbn13` | Book | Identifier unique to books |
| `publisher` | Book | Books have publishers; YouTube has channels (→ `creator`) |
| `pageCount` | Book | Could go either way — see `length` discussion above |
| `language` | Book | YouTube has `defaultAudioLanguage` but rarely useful |
| `categories` / `tags` | Both | Similar concept but different taxonomies per source |

### Book API Recommendation: Google Books API

For the first non-YouTube content type, **Google Books API** is the recommended data source:

- **Free tier** — 1,000 req/day without API key, higher with key
- **Shared infrastructure** — Same Google API ecosystem as YouTube (API key, client libs, error patterns, rate limits)
- **Rich metadata** — title, authors, description, thumbnails, page count, categories, publisher, ISBNs, ratings, preview links
- **Similar response structure** — `items[]` with `volumeInfo` parallels YouTube's `items[]` with `snippet`

**Other APIs evaluated:**
- **Open Library** (openlibrary.org) — Free, no key, 20M+ editions. Good fallback if Google quota is insufficient. Less structured metadata.
- **Library of Congress** — Free, authoritative for bibliographic data, but clunky API and inconsistent response formats. Better for archival than consumer use.
- **Goodreads** — API shut down by Amazon in 2020. Not available.
- **ISBNdb** — Paid ($9/mo+). Not worth it when free options exist.

**Priority:** Medium — design the schema strategy before adding the second content type. The column promotion migration (creator, published_at, description) should happen during the JSONB trim work above.

**Source:** Architecture discussion (2026-02-16)

---

## Server-Side Sorting and Filtering for Activity Table

Currently AG Grid sorting and filtering is client-side only — operates on the current page of rows. With server-side pagination (`limit`/`offset`), this means sort/filter only affects the visible page, not the full dataset.

**What to do:**
- Add `orderBy` and `filter` parameters to the `contents` GraphQL query
- Implement sort/filter in the backend resolver and GORM repository
- Wire AG Grid's `onSortChanged`/`onFilterChanged` events to re-fetch with server parameters
- Consider switching to AG Grid's server-side row model for seamless integration

**Priority:** Medium — noticeable UX gap once content exceeds one page (currently 52 items across 6 pages). Sorting "Views" only reorders the 10 visible rows, not all 52.

**Source:** Phase 3.2 UAT (2026-02-16)

---

## Slow COUNT(*) and JSONB Sort Queries

The `SELECT count(*) FROM "content"` query and JSONB-path ORDER BY queries are hitting 200-400ms, triggering GORM's slow query warning (>= 200ms). Observed at ~50 rows — will worsen at scale.

**Slow queries observed:**
- `SELECT count(*) FROM "content"` — 203ms to 382ms
- `SELECT * FROM "content" ORDER BY COALESCE(response->'items'->0->'snippet'->>'publishedAt', '') ASC` — 157ms
- Full GraphQL request latency: 395-541ms

**Potential fixes:**
1. **Add indexes** — GIN index on `response` JSONB, or expression indexes on frequently sorted JSONB paths (`(response->'items'->0->'statistics'->>'viewCount')::BIGINT`, `response->'items'->0->'snippet'->>'publishedAt'`)
2. **Extract to columns** — Promote JSONB-derived sort fields to dedicated columns (related to "Compress/Trim YouTube Raw JSONB Response" item above)
3. **Cache total count** — Avoid `SELECT count(*)` on every paginated request; use estimated count or cache with TTL
4. **Analyze** — Run `EXPLAIN ANALYZE` on slow queries to confirm whether it's sequential scan or JSONB extraction overhead

**Priority:** Low — manageable at 50 rows but a known scaling bottleneck. Consider alongside JSONB trimming/extraction work.

**Source:** Backend logs (2026-02-15)

---

## Technical Debt: Sticky Header Color Token

**Problem:** Sticky header originally used `bg-background` but `--color-background` wasn't defined in `app.css`, causing transparent header and scroll bleed-through.

**Current patch:** Changed `bg-background` to `bg-white` in `Header.svelte` (SHA: b42c457).

**Long-term fix:** Define complete color theme in `app.css` (`--color-background`, `--color-foreground`, `--color-border`, etc.) so semantic utilities resolve correctly and support dark mode. Then revert header to `bg-background`.

**Priority:** Low — cosmetic, works correctly now.

---

## Technical Debt: Client-Side Pagination Prefetch Strategy

**Problem:** `ListContent` query fetches `first: 100` but AG Grid only shows 10 per page. Client-side pagination/filtering works over the pre-fetched set, but total count isn't exposed and fetch size isn't tied to page size.

**Current patch:** `first: 100` hardcoded — covers all client-side page sizes (10/25/50) with room for search filtering. Acceptable for MVP.

**Long-term fix:** Adaptive prefetch with exposed total count:
1. Expose `totalCount` to the UI — if not provided by query, don't show. Total count = total available server-side, not total loaded.
2. Allow items-per-page to be user-specified (max 100).
3. Prefetch a multiple of page size: 1–10 items/page → fetch 5x (up to 50); 11–33 items/page → fetch 3x (up to 100); 34–100 items/page → fetch 1.5x (up to 100).

**Priority:** Medium — related to server-side sorting/filtering work.

**Related:** [#56](https://github.com/CodeWarrior-debug/perspectize/issues/56)

---

## Contributor License Agreement (CLA)

Enable automatic contributor agreement signing for external contributions. One checkbox on first contribution — keeps it simple.

**Options:**
- [CLA Assistant](https://cla-assistant.io/) — Free GitHub integration, stores signatures, auto-comments on PRs from new contributors
- [CLA Assistant Lite](https://github.com/contributor-assistant/github-action) — GitHub Action alternative, signatures stored in repo
- Custom DCO (Developer Certificate of Origin) — Lightweight alternative using `Signed-off-by` in commits

**What contributors agree to:**
- They have the right to submit the contribution
- The contribution is licensed under AGPL-3.0 (same as project)
- No additional obligations — AGPL version stays open and available

**Template reference:** [Apache ICLA](https://www.apache.org/licenses/icla.pdf) (for inspiration, ours would be simpler)

**Priority:** Low — set up before accepting external contributions

---

## Content Categories (Google Content Taxonomy)

Categorize content using [Google's Cloud NL Content Taxonomy](https://cloud.google.com/natural-language/docs/categories) — 27 top-level categories designed for digital content classification. Evaluated against Library of Congress Classification (too academic, book-oriented) and Dewey Decimal (too coarse at 10 categories, proprietary OCLC license).

**Why Google's taxonomy wins for Perspectize:**
- Built for web/digital content, not physical books
- Maps almost 1:1 to YouTube's own category system
- Intuitive labels users understand ("Arts & Entertainment" not "Class P")
- Free to use, actively maintained
- 3-4 levels of depth — enough granularity without overwhelming

**Recommended v1 categories (20 of 27):** Arts & Entertainment, Autos & Vehicles, Beauty & Fitness, Books & Literature, Business & Industrial, Computers & Electronics, Finance, Food & Drink, Games, Health, Hobbies & Leisure, Home & Garden, Jobs & Education, Law & Government, News, People & Society, Pets & Animals, Science, Sports, Travel & Transportation.

**Dropped for v1:** Adult, Internet & Telecom, Online Communities, Real Estate, Reference, Sensitive Subjects, Shopping.

**Implementation approach:**
- One category per content item (single-select)
- Complements tags (tags = specific, categories = broad classification)
- Store as enum or lookup table; plan for custom user-defined categories later
- Consider auto-categorization via Google Cloud NL API or LLM classification on ingest

**Source:** Taxonomy comparison discussion (2026-02-16)

---

## Robustness Score

A computed metric indicating how well-supported a perspective is. Surfaces the difference between a quick hot-take and a thoroughly reasoned perspective.

**Possible signal inputs:**
- Number of supporting arguments or evidence points
- Whether the perspective references specific timestamps/quotes from the content
- Length and depth of the perspective text
- Whether counter-arguments are acknowledged
- Number of tags/categories applied
- Whether the user has engaged with opposing perspectives on the same content

**Design considerations:**
- Display as a visual indicator (progress bar, shield icon, star rating)
- Should encourage thoroughness without gatekeeping — all perspectives welcome, but well-supported ones are surfaced
- Could be computed client-side initially, moved to backend as the formula stabilizes

**Source:** Feature discussion (2026-02-16)

---

## Provenance Icons

Visual indicators showing the source/origin of content items. At a glance, users should know where content came from.

**v1 scope (YouTube only):**
- YouTube icon/badge on all content (since only YouTube is supported initially)

**Future multi-source scope:**
- Distinct icons per content type: YouTube, Podcast, Article, Book, etc.
- Icon displayed in the Activity Table, content detail views, and anywhere content is listed
- Could use platform brand icons (YouTube play button, Spotify waves, etc.) or abstract content-type icons
- Consider a "verified source" variant for content fetched directly via API vs. manually added

**Source:** Feature discussion (2026-02-16)

---

## Chat / Discussion on Content

Enable conversation threads on content items, allowing users to discuss perspectives with each other.

**Possible scope:**
- Comment threads on individual content items
- Reply threads on specific perspectives
- Real-time or near-real-time messaging
- Threaded vs. flat discussion structure

**Design considerations:**
- Moderation strategy (community-driven, AI-assisted, manual)
- Notification system for replies
- How chat interacts with perspectives — is a chat message a lightweight perspective, or a separate concept?
- Could start as simple comment threads and evolve toward real-time chat

**Source:** Feature discussion (2026-02-16)

---

## Migration Tests

Add automated tests for SQL migrations to catch syntax errors and verify up/down roundtrips.

**What to test:**
- **Up/down roundtrip** — Apply all migrations up, then down to zero, then back up. No errors = schema is reversible.
- **Individual migration syntax** — Each `.up.sql` and `.down.sql` runs without errors against a clean or migrated DB
- **Data preservation** — For data-transforming migrations (column renames, type changes), seed test data before `up` and verify it survives the roundtrip
- **Idempotency** — Running `up` twice doesn't break (IF NOT EXISTS patterns)

**Implementation approach:**
- Go integration test that spins up a test PostgreSQL container (testcontainers-go or Docker Compose)
- Iterate through `backend/migrations/` files in order
- Could run in CI as a separate job (slower, needs Docker)

**Priority:** Medium — prevents broken migrations from reaching production. Especially valuable as schema evolves (Phase 11 denormalization, multi-content-type work).

**Source:** Development discussion (2026-02-20)

---

## Jeeves AI Assistant

An AI-powered assistant integrated into the platform to help users discover, refine, and engage with content and perspectives.

**Possible capabilities:**
- **Perspective refinement** — Help users articulate their perspectives more clearly, suggest evidence, flag logical gaps
- **Content discovery** — "Based on your perspectives, you might find this interesting"
- **Summarization** — Summarize the range of perspectives on a given piece of content
- **Challenge mode** — Present counter-arguments to strengthen a user's thinking
- **Category/tag suggestions** — Auto-suggest categories and tags based on content analysis

**Design considerations:**
- Name "Jeeves" evokes a knowledgeable, helpful butler — the AI should feel like a thoughtful assistant, not a chatbot
- Could be a sidebar panel, a chat interface, or contextual suggestions inline
- Start with one focused capability (e.g., perspective refinement) rather than trying to do everything

**Source:** Feature discussion (2026-02-16)

---

## Perspectize Column Sorting & Filtering

The Perspectize column in the ActivityTable currently shows a glasses icon for adding/viewing perspectives but doesn't support AG Grid sorting or filtering. Users should be able to sort and filter content by perspective status.

**Sorting options:**
- Has perspective vs. no perspective (binary)
- Number of perspectives per content item
- Most recently perspectized

**Filtering options:**
- Show only items with perspectives
- Show only items without perspectives (to find content needing review)
- Filter by perspective count range

**Implementation considerations:**
- May require a computed/derived field (perspective count or boolean) exposed in the GraphQL content query
- Backend needs to support sorting/filtering on perspective-related fields (JOIN or denormalized count column)
- AG Grid column definition needs `sortable: true` and appropriate filter type

**Priority:** Medium — improves discoverability of un-perspectized content.

**Source:** User feedback (2026-02-27)

---

## AG Grid Sort Cycle: Unsorted → Descending → Ascending

The default AG Grid sort cycle is ascending → descending → unsorted. Preferred behavior is **unsorted → descending → ascending → unsorted** — so the first click shows highest values first (most views, newest date, etc.), which is the more common use case.

**Implementation:**
- Set `sortingOrder: ['desc', 'asc', null]` on the grid's `defaultColDef` or per-column
- This changes the click cycle to: unsorted → desc → asc → unsorted

**Priority:** Low — UX polish.

**Source:** User preference (2026-03-23)

---

## Server-Side Pagination Sort Inconsistencies

When server-side pagination is active, AG Grid sort events don't consistently trigger server re-fetches. Clicking a column header to sort sometimes only reorders the current page of rows instead of sending the sort parameters to the backend for a full dataset sort.

**Observed issues:**
- Sort change events not firing on every column header click
- Inconsistent behavior between first sort click and subsequent clicks
- May be related to event handler debouncing or AG Grid's `onSortChanged` not always propagating in server-side mode

**What to investigate:**
- Verify `onSortChanged` fires reliably — add debug logging
- Check if AG Grid's `sortModel` is being read and sent to the GraphQL query on every change
- Ensure TanStack Query's `queryKey` includes sort parameters so cache invalidation triggers re-fetch
- Consider using `onGridReady` + `onSortChanged` with a stable callback ref to prevent stale closures

**Priority:** Medium — data correctness issue when using server-side pagination with sorting.

**Source:** User report (2026-03-23)

---

## Grafana Cloud OpenTelemetry Integration

Connect the backend's OTel tracing (merged in PR #175) to Grafana Cloud for production trace visualization and log correlation.

### Setup Steps

1. **Sign up** at [grafana.com/products/cloud](https://grafana.com/products/cloud/) (free tier: 50GB traces/month)

2. **Get OTLP credentials** — In Grafana Cloud, go to **Connections → Add new connection → OpenTelemetry (OTLP)**. It provides:
   - An OTLP endpoint URL
   - An instance ID and API token

3. **Add 3 env vars to Sevalla:**
   ```
   OTEL_EXPORTER_OTLP_ENDPOINT=https://otlp-gateway-prod-us-east-0.grafana.net/otlp
   OTEL_EXPORTER_OTLP_HEADERS=Authorization=Basic <base64(instanceId:token)>
   OTEL_SERVICE_NAME=perspectize-backend
   ```

   To generate the base64 value:
   ```bash
   echo -n "instanceId:yourApiToken" | base64
   ```

4. **Deploy** — The backend already reads these env vars automatically (the OTLP HTTP exporter picks them up). No code changes needed.

### What you'll see

- **Grafana Explore → Tempo** — trace timelines showing request flow with span durations
- **Sevalla logs** — JSON lines with `trace_id` and `span_id` fields matching Grafana traces
- **Correlation** — click a trace in Grafana to see all related logs, or search Sevalla logs by `trace_id` to find a specific request

### Phase 2: Granular Instrumentation

The current implementation creates a TracerProvider but doesn't instrument individual operations. To get richer traces:

- **`otelchi` middleware** — automatic HTTP spans for every request (method, route, status code, duration)
- **GORM OTel plugin** — DB query spans showing SQL, duration, and row counts
- **Custom resolver spans** — wrap GraphQL resolvers to trace individual field resolution

This would give a full waterfall view: HTTP request → GraphQL operation → DB queries, all linked by trace_id.

**Priority:** Medium — the env var setup is zero-effort; granular instrumentation is a follow-up.

**Source:** Architecture discussion (2026-03-23)

---

## Re-run graphify with a Real LLM Backend Token

**Type:** Dev × Feature Request

The initial graphify knowledge-graph build (see CLAUDE.md's `## graphify` section) was run with `graphify extract . --code-only` because no `ANTHROPIC_API_KEY`/`GEMINI_API_KEY` was available in the shell — this skips semantic extraction entirely.

**Current state:** `graphify-out/graph.json` has 2345 nodes / 6398 edges / 192 communities from local AST parsing only. Communities are unlabeled placeholders ("Community 0"–"191") since naming requires an LLM call. 475 doc files, papers, and images were skipped (`--code-only` only indexes code). 29 `.sql` files contributed nothing (missing `tree_sitter_sql` — `pip install "graphifyy[sql]"` fixes that separately).

**What to do:**
- Get an API key (Anthropic from console.anthropic.com — separate billing from the Claude subscription — or Gemini) and export it in a real terminal, not through an AI session
- Re-run `graphify extract . --backend claude` (or `--backend gemini`) with `--force` to get semantic/INFERRED edges and doc/paper/image extraction
- Run `graphify cluster-only .` (without `--no-label`) afterward to get real community names instead of "Community N" placeholders

**Priority:** Low-Medium — the code-only graph is already usable for query/path/explain against code symbols; this upgrade mainly improves natural-language question matching and cross-doc community structure.

**Source:** Dev request (2026-09-02), during graphify initialization.

---

## ~~Verify TypeScript + Go LSPs Are Actually Working~~ (RESOLVED)

**Type:** Dev × Feature Request

Session start on this machine showed: `[vtsls] Installing vtsls... [vtsls] Failed to install. Please run manually: npm install -g @vtsls/language-server typescript`. Root cause turned out to be two competing TypeScript LSP plugins enabled simultaneously at the user level, both registered for `.ts/.tsx/.js/.jsx`:

- `vtsls@claude-code-lsps` — wanted the `vtsls` binary, which was never installed (this was the one erroring at session start)
- `typescript-lsp@claude-plugins-official` — wants `typescript-language-server`, which was already installed (v5.1.3, backed by `typescript` 5.9.3) and working

**Fix applied (2026-09-02):** Disabled `vtsls@claude-code-lsps` at user scope (`claude plugin disable vtsls@claude-code-lsps`) rather than installing a second redundant TS language server. `typescript-lsp@claude-plugins-official` remains enabled and confirmed working. `gopls@claude-code-lsps` was separately confirmed working (`gopls version` → v0.21.1 at `/Users/jamesjordan/go/bin/gopls`) — no fix needed there. Restart Claude Code to pick up the plugin change.

**Source:** Dev request (2026-09-02), observed vtsls install failure at session start.

---

## Cache Clerk ID → Local User Lookup in Auth Middleware

**Type:** Dev × Performance

`clerk_middleware.go` verifies the incoming Clerk JWT (cheap — the SDK caches Clerk's JWKS in-memory, so signature verification is a local check, no network call per request) and then resolves the token's Clerk ID to a local `users` row via `GetByClerkID`, a Postgres query. That DB lookup runs on **every** authenticated request — there's no caching layer between the middleware and the database.

At current traffic this is fine. At real scale (many requests per second from the same signed-in users — polling, rapid successive GraphQL mutations, etc.) it becomes redundant load: the same user's row gets re-fetched on every request in a burst.

**What to do:**
- Add a short-TTL cache (in-memory LRU, or Redis if the app already has one) keyed by Clerk ID → local `domain.User`, TTL ~30–60s.
- Invalidate on the Clerk webhook events the app already listens for (user updated/deactivated) rather than relying purely on TTL expiry, so role/deactivation changes don't have a stale window longer than necessary.

**Priority:** Low — not worth the complexity at current (Sevalla-hosted, low-traffic) scale. Revisit if/when request volume from authenticated users grows meaningfully.

**Source:** Dev discussion (2026-09-10), during PR #356 (issue #246 userID-spoofing fix) — question about whether `auth.RequireAuth`'s context lookup or the upstream middleware's DB call would ever become a cost concern.
