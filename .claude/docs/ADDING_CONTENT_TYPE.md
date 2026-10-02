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

**Key question**: Which fields need to be **sortable or filterable**? Each one needs a SQL extraction path in `helpers.go`.

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
6. Verify sorting/filtering works for new sortable fields
7. Verify mobile responsiveness
