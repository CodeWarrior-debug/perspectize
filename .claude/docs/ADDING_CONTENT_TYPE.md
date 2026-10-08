# Adding a New Content Type

Decision guide for adding a new content type (e.g., Article, Podcast, Book) to Perspectize end-to-end.

## Architecture Context

Content types use a **discriminator pattern** — a single `Content` table/type with a `contentType` field. Type-specific metadata is stored in a `response` JSONB column. This means **no new tables are needed** for most content types.

## Key Files by Layer

| Layer | File | Purpose |
|-------|------|---------|
| Domain | `backend/internal/core/domain/content.go` | ContentType enum, Content struct |
| Domain | `backend/internal/core/domain/pagination.go` | Sort/filter enums |
| Schema | `backend/schema.graphql` | GraphQL types, mutations, enums |
| Service | `backend/internal/core/services/content_service.go` | Business logic |
| Adapter | `backend/internal/adapters/{type}/` | External API client (new directory) |
| Repository | `backend/internal/adapters/repositories/postgres/helpers.go` | JSONB sort rules |
| Repository | `backend/internal/adapters/repositories/postgres/gorm_models.go` | GORM virtual fields |
| Resolver | `backend/internal/adapters/graphql/resolvers/schema.resolvers.go` | GraphQL mutation handler |
| Wiring | `backend/cmd/server/main.go` | Dependency injection |
| Frontend types | `frontend/src/lib/queries/content.ts` | TS types, GraphQL queries |
| Frontend UI | `frontend/src/lib/components/AddVideoPopover.svelte` | Content creation form |
| Frontend table | `frontend/src/lib/components/ActivityTable.svelte` | Column definitions |
| Frontend render | `frontend/src/lib/utils/formatting.ts` | Cell renderers |
| Frontend validate | `frontend/src/lib/utils/youtube.ts` | URL validation |
| Frontend hooks | `frontend/src/lib/queries/hooks/useAddVideo.ts` | Mutation hook |

### Test Files

| Layer | File | What It Tests |
|-------|------|---------------|
| Domain | `backend/test/domain/content_test.go` | ContentType enum, struct fields |
| Service | `backend/test/services/content_service_test.go` | CreateFromYouTube, GetByID, mock repo/client |
| Resolver | `backend/test/resolvers/content_resolver_test.go` | GraphQL queries, mutations, pagination, filtering |
| Formatting | `frontend/tests/unit/formatting.test.ts` | Cell renderers, formatters, value getters |
| Queries | `frontend/tests/unit/queries-content.test.ts` | GraphQL query definitions, TS type exports |
| Component | `frontend/tests/components/ActivityTable.test.ts` | AG Grid component rendering |

## Per-type surface checklist

The Movie type (PR #565) shipped without column filters even though the designer marked them filterable, plus several other misses. Rows marked ✱ were missed on Movie (see [Movie retrospective](#movie-retrospective)).

**Rule:** every row below must be answered in the type's spec before implementation starts — with an answer, or "n/a because …". An unanswered row is a blocker. The content-type designer (`tools/content-type-designer`) lists unanswered rows under "Undecided surfaces".

| Surface | Questions to answer (answer, or n/a because …) | Test that pins it |
|---|---|---|
| **Grid columns** ✱ | Per-type header label in the single-type view (e.g. "Item" becomes "Film")? Does it fit the 1212px min-width budget? Do unknown/null values sort last in both directions? Do long values truncate with a tooltip? | `grid-config` / `formatting` unit tests; ActivityTable component test for the header swap |
| **Sort** ✱ | Server sort key, or client-only (then disable it in All Items mode)? Are computed sort keys scanned so cursor pagination encodes the real value, not the zero value (C-02: page 2 repeated page 1)? | Resolver/repo test paging across 2+ pages in both directions; query-count test |
| **Filters** ✱ | Per filterable column: filter kind (text / number / date / set), `ContentFilter` field(s), identical results in Loaded (client) and All Items (server) modes, URL key, chip label, index needed? Derived columns with no backend field: say "no filter" — do not ship a Loaded-only filter. | Repo condition test, resolver mapping test, `filterContentRows` parity test, `gridUrlState` round-trip, FilterChips label test |
| **Data modes** ✱ | In Loaded mode (100-row cap) does the Type filter reach the server, and does the footer total reflect it? | Component/unit test on the Loaded-mode request filter and footer total |
| **Search** | Which fields does the search box cover for this type? Does the scope picker need new options? | `ContentSearchField` repo test + scope-picker test |
| **Details modal** ✱ | Type-specific layout; no YouTube-only controls (embed, channel link, etc.). | ActivityDetailsModal test per type state |
| **Mobile card list** ✱ | Which facts replace views / likes / channel? | Card-list component test for this type |
| **Add form** ✱ | Accepted inputs? Duplicate-add feedback (surface the `already existed` flag, not a silent success)? Specific error messages per failure? Does the popover close on success? | Form/hook tests for each state: success, duplicate, each error, closes on success |
| **Content policy** ✱ | Adult / rating gate and the exact message (Movie: NC-17 and TMDB `adult: true` are rejected with `CONTENT_NOT_ALLOWED`). | Service tests per rejected input; frontend test showing the server message |
| **Licensing / attribution** | Required attribution text, logo, API terms of use? | Details-modal attribution test |
| **Formatting edge values** ✱ | null, 0, huge ($1T, not $1000B), tiny (<1%, not 0%). | `formatting.test.ts` cases for each |
| **Rollout** | API token per environment? Deploy backend before frontend? Migration number collisions with other branches? Indexes? Evidence on a throwaway Neon branch with a recorded clip. | Checklist in the PR body; never run `make migrate-*` against the shared DB |

---

---

## Decision 1: How Is Content Ingested?

| Method | Example | What You Build |
|--------|---------|----------------|
| **URL + external API** | YouTube (fetch metadata from API) | Adapter client, API key config, rate limiting |
| **URL + scraping** | Article (extract Open Graph / meta tags) | HTML parser adapter, less reliable metadata |
| **Manual entry** | Book (user types title, author) | No adapter, more form fields in frontend |
| **URL only** | Bookmark (just store the link) | Minimal adapter, optional metadata enrichment |

This determines whether you need an external API adapter or just a form.

---

## Decision 2: What Metadata Does This Type Have?

Define type-specific fields and categorize them:

| Category | Examples | Storage | Needs Migration? |
|----------|----------|---------|-----------------|
| **Universal** (all types) | name, url, createdAt, updatedAt | Dedicated DB columns (already exist) | No |
| **Type-specific display** | viewCount, author, episodeNumber | Extracted from `response` JSONB at read time | No |
| **Type-specific sortable** | publishedAt, duration, rating | JSONB + SQL extraction path in `helpers.go` | No |
| **Shared across 2+ types** | e.g., "author" used by articles AND podcasts | Consider promoting to dedicated column | Yes |

**Key question**: Which fields need to be **sortable or filterable**? Each one needs a SQL extraction path in `helpers.go`. Sorting and filtering are separate work: a sortable field needs a sort enum and rule (Step E); a filterable field needs a `ContentFilter` field, repo condition, resolver mapping and frontend filter wiring (Step E2). Record both in the checklist above.

---

## Decision 3: Does the Content Struct Need New Shared Columns?

```
Is the field unique to this content type?
├── YES → Store in response JSONB (no migration)
│
└── NO → Is it shared across 2+ content types AND frequently queried/sorted?
    ├── YES → Add a dedicated DB column (migration required)
    │   Steps:
    │   1. Create migration in backend/migrations/
    │   2. Add field to domain.Content struct
    │   3. Add field to GORM ContentModel
    │   4. Update mappers (gorm_mappers.go)
    │   5. Add to schema.graphql Content type
    │
    └── NO → Store in response JSONB (no migration)
```

---

## Decision 4: URL Validation Rules

- What URL patterns are valid? (specific domains, path formats)
- Is a URL **required** or optional for this type?
- **Cross-type uniqueness**: Currently `UNIQUE(url)` constraint means the same URL can't exist as both YouTube and Article. Do you need to relax this? (requires migration to alter constraint)

---

## Decision 5: Frontend Form Approach

| Approach | When | Example |
|----------|------|---------|
| **New component** (`AddArticlePopover.svelte`) | Different form fields than YouTube | Article needs title + author fields |
| **Extend existing** (generic `AddContentPopover`) | Same form shape (just a URL input) | Podcast URL works same as YouTube |
| **Unified with type selector** | User picks type, form adapts | Dropdown: YouTube / Article / Podcast |

---

## Decision 6: Table Display

- **Type column icon**: What icon represents this type? (YouTube has red play button SVG)
- **Item column thumbnail**: What image/thumbnail to show? (YouTube uses `i.ytimg.com` thumbnail)
- **New columns needed?** If the type has fields not in the current table (e.g., "Author"), see [ADDING_AG_GRID_COLUMN.md](./ADDING_AG_GRID_COLUMN.md)

---

## Implementation Steps

### Step A: Backend Domain

1. Add enum constant in `domain/content.go`:
   ```go
   const ContentTypeArticle ContentType = "ARTICLE"
   ```

2. Add sort fields if needed in `domain/pagination.go`:
   ```go
   const ContentSortByAuthor ContentSortBy = "AUTHOR"
   ```

### Step B: External Adapter (if applicable)

Create `backend/internal/adapters/{type}/`:
- `client.go` — API client or HTML parser
- `parser.go` — URL validation, data extraction

Define a port interface in `backend/internal/core/ports/services/`:
```go
type ArticleClient interface {
    GetMetadata(ctx context.Context, url string) (*ArticleMetadata, error)
}
```

### Step C: GraphQL Schema

In `backend/schema.graphql`:

1. Add to ContentType enum:
   ```graphql
   enum ContentType {
     YOUTUBE_VIDEO
     ARTICLE
   }
   ```

2. Add mutation + input:
   ```graphql
   input CreateContentFromArticleInput {
     url: String!
   }

   type Mutation {
     createContentFromArticle(input: CreateContentFromArticleInput!): Content!
   }
   ```

3. Regenerate: `make graphql-gen` in `backend/`

### Step D: Service Method

Add creation method in `content_service.go`:
```go
func (s *ContentService) CreateFromArticle(ctx context.Context, url string) (*domain.Content, error) {
    // 1. Check URL uniqueness via repo.GetByURL()
    // 2. Validate URL format
    // 3. Fetch metadata via adapter
    // 4. Build domain.Content with ContentTypeArticle
    // 5. Save via repo.Create()
}
```

Update constructor signature and `main.go` wiring if injecting a new adapter.

### Step E: Repository / Sort Rules

If the type has sortable JSONB fields, add SQL extraction paths in `helpers.go`:
```go
case domain.ContentSortByAuthor:
    return []paginator.Rule{{
        Key:     "Author",
        SQLRepr: "response->>'author'",
        Order:   order,
    }}
```

Add virtual field to GORM model in `gorm_models.go`:
```go
Author string `gorm:"-"`
```

### Step E2: Filters (for every filterable column)

Skipping this step is how Movie shipped without filters. Per filterable column:

1. Backend: add the field(s) to `ContentFilter` in `backend/schema.graphql` (e.g. `genreContains: String`, `minX`/`maxX`, `xAfter`/`xBefore`, or `x: [String!]`) and to `ContentFilter` in `backend/internal/core/domain/pagination.go`; run `make graphql-gen`.
2. Repository: add the condition in `backend/internal/adapters/repositories/postgres/gorm_content_repository.go` (where `MinViewCount` etc. are applied); add an index migration if the query would scan JSONB (write only; never apply to the shared DB).
3. Resolver: map the GraphQL input to the domain filter in `backend/internal/adapters/graphql/resolvers/content.resolvers.go`.
4. Frontend grid config: in `frontend/src/lib/utils/grid-config.ts` add `filterKey`, `filterValue` and, as applicable, `filterRange: 'number' | 'date'` or `filterSet: true` to the column in `COLUMNS` (this also derives `COL_TO_FILTER_KEY` and `COLUMN_LABELS`).
5. URL/GraphQL mapping: `frontend/src/lib/utils/gridUrlState.ts` (`filterToUrlParams`, `urlParamsToFilter`, `ContentFilterInput`, `urlParamsToGraphQLFilter`) must carry the new key to the server filter.
6. Client parity: extend `filterContentRows` in `grid-config.ts` so Loaded mode returns the same rows as the server does in All Items mode.
7. Chip: confirm the label in `frontend/src/lib/components/FilterChips.svelte` (via `COLUMN_LABELS`).
8. A derived column with no backend field gets no filter (set no `filterKey`) — never ship a Loaded-only filter.

### Step F: Resolver

Implement mutation resolver in `schema.resolvers.go`:
```go
func (r *mutationResolver) CreateContentFromArticle(ctx context.Context, input model.CreateContentFromArticleInput) (*model.Content, error) {
    content, err := r.ContentService.CreateFromArticle(ctx, input.URL)
    // handle errors
    return domainToModel(content), nil
}
```

### Step G: Wiring

In `cmd/server/main.go`:
```go
articleClient := article.NewClient(httpClient)
contentService := services.NewContentService(contentRepo, youtubeClient, articleClient)
```

### Step H: Frontend — Types & Queries

In `frontend/src/lib/queries/content.ts`:
1. Add any new fields to `ContentItem` interface
2. Add new mutation query (e.g., `CREATE_CONTENT_FROM_ARTICLE`)
3. Add new fields to `LIST_CONTENT` selection set if applicable

### Step I: Frontend — URL Validation

Create `frontend/src/lib/utils/{type}.ts`:
```typescript
export function validateArticleUrl(url: string): boolean {
    // URL validation logic
}
```

### Step J: Frontend — Add Content Form

Create component and mutation hook (e.g., `AddArticlePopover.svelte` + `useAddArticle.ts`).

### Step K: Frontend — Table Renderers

Update `formatting.ts`:

1. **`typeCellRenderer`** — add icon branch for new type:
   ```typescript
   if (contentType === 'ARTICLE') {
     // return article icon element
   }
   ```

2. **`itemCellRenderer`** — add thumbnail/display for new type:
   ```typescript
   if (contentType === 'ARTICLE') {
     // return article thumbnail (Open Graph image?) or fallback icon
   }
   ```

### Step L: Frontend — Table Columns (if applicable)

If the type introduces new columns, see [ADDING_AG_GRID_COLUMN.md](./ADDING_AG_GRID_COLUMN.md).

---

## Testing

### Backend tests to add/update

**`backend/test/domain/content_test.go`**:
- Add test for new `ContentType` constant (e.g., verify `ContentTypeArticle == "ARTICLE"`)
- If new domain fields added, test they exist and handle nil

**`backend/test/services/content_service_test.go`**:
- Add `describe` block for `CreateFromArticle()` (or equivalent) covering:
  - Success case with metadata fetch
  - Duplicate URL handling (returns `ErrAlreadyExists`)
  - Invalid URL format
  - Adapter/API errors
  - Repository create failures
- Add mock implementation for new adapter client interface

**`backend/test/resolvers/content_resolver_test.go`**:
- Add mutation test for `createContentFromArticle` covering:
  - Success case — returns Content with correct `contentType`
  - Duplicate URL error handling
  - Invalid URL error handling
- Update content filtering tests:
  - Add test filtering by new `ContentType` enum value
- If new sort fields added:
  - Add sorting test case for each new sortable field
  - Add a pagination test that fetches page 1 and page 2 (both directions) and asserts page 2 differs from page 1 (cursor encodes the real sort value)
- If new filterable fields added:
  - Add a filter test per `ContentFilter` field (match, no match, boundaries, null values)
  - Add a query-count test if the filter adds a join or subquery

### Frontend tests to add/update

**`frontend/tests/unit/formatting.test.ts`**:
- Update `typeCellRenderer` tests — add case for new content type icon
- Update `itemCellRenderer` tests — add case for new content type thumbnail/display
- If new formatters created, add full test coverage (normal, null, edge cases)

**`frontend/tests/unit/queries-content.test.ts`**:
- Add `describe` block for new mutation query (e.g., `CREATE_CONTENT_FROM_ARTICLE`)
  - Verify it's a mutation operation
  - Verify input type structure
  - Verify returned fields
- If new fields added to `LIST_CONTENT`, update the field presence tests
- If new types exported, verify they're exported

**New test file** (e.g., `frontend/tests/unit/{type}.test.ts`):
- URL validation function tests (valid URLs, invalid URLs, edge cases)
- Follow pattern from existing YouTube validation if applicable

**`frontend/tests/unit/grid-config.test.ts` / `gridUrlState.test.ts`**:
- For each filterable column: URL round-trip (`filterToUrlParams` / `urlParamsToFilter`), `urlParamsToGraphQLFilter` mapping, `filterContentRows` returns the same rows the server filter would (Loaded/All parity), chip label

**`frontend/tests/components/ActivityTable.test.ts`**:
- Currently limited by JSDOM — update if new props or state logic introduced

---

## Enum Casing Convention

| Layer | Format | Example |
|-------|--------|---------|
| Go domain constant | UPPERCASE | `ContentTypeArticle = "ARTICLE"` |
| Database storage | lowercase | `"article"` |
| GraphQL schema | UPPERCASE | `ARTICLE` |
| Frontend TypeScript | UPPERCASE string | `contentType === 'ARTICLE'` |
| Mappers handle conversion | `strings.ToLower()` / `strings.ToUpper()` | automatic |

---

## Decisions Summary Matrix

| Decision | Options | Impact |
|----------|---------|--------|
| Ingestion method | API / scrape / manual / URL-only | Adapter complexity |
| Metadata fields | What to store and expose | JSONB structure, resolvers |
| Sortable fields | Which ones | SQL paths, backend enums, sort rules |
| Filterable fields | Which ones, and what kind | `ContentFilter` fields, repo conditions, grid-config filter keys, client parity |
| Per-type surfaces | Every row of the surface checklist | Spec blockers if unanswered |
| New DB columns | Yes / No | Migration required |
| URL required | Yes / No | Validation, form design |
| Cross-type URL uniqueness | Keep / Relax | Migration to alter constraint |
| Frontend form | New / Extend / Unified | Component architecture |
| Table display | Icon, thumbnail, new columns | Renderer updates, see AG Grid guide |

---

## Verification

After adding a content type:
1. `go build ./...` in `backend/` — compiles
2. `go test ./...` in `backend/` — all tests pass (including new tests)
3. `pnpm run test:run` in `frontend/` — all tests pass (including new tests)
4. Manual test: create content via new mutation (GraphQL playground or UI)
5. Verify it appears in the table with correct icon and formatting
6. Verify sorting works for new sortable fields, including paging to page 2+ in both directions
7. Verify every filter in both modes: All Items (server) and Loaded (client) return the same rows; the URL round-trips; the chip label reads correctly; the Type filter reaches the server in Loaded mode and the footer total reflects it
8. Verify mobile responsiveness (card list shows the type's own facts)
9. Re-walk the Per-type surface checklist and confirm every row has an answer and a pinning test
