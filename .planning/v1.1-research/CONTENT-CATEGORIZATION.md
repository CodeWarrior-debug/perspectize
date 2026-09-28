# Content Categorization System Research

**Project:** Perspectize v1.1
**Researched:** 2026-02-16
**Overall confidence:** HIGH

---

## Executive Summary

Perspectize needs a content categorization system that complements the existing tag system with broad classification. Google Cloud Natural Language API's Content Taxonomy provides 27 top-level categories (1,091 total with subcategories) specifically designed for digital content classification.

**Key findings:**
- Google's taxonomy maps well to YouTube's categories and is future-proof for multi-content-type support (books, podcasts, articles)
- Auto-categorization via Google Cloud NL API is cost-effective ($0.0001-$0.002 per request after 30K free) compared to Claude API ($0.25-$1.25 per MTok)
- PostgreSQL lookup table recommended over enum for hierarchical categories and future extensibility
- Single-select category + multi-select tags provides optimal UX (categories = broad classification, tags = specific descriptors)

**Implementation approach:** Start with single-select category assignment (user-driven or auto-suggested), store in lookup table with hierarchical path support (ltree extension), expose via GraphQL enum for filtering, build autocomplete UI with category scope indicators.

---

## 1. Taxonomy Design

### 1.1 Google Cloud NL Content Taxonomy

Google's taxonomy includes **27 top-level categories** expanded to **1,091 total categories** across 3-4 levels of hierarchy. The v2 model (latest) supports 11 languages and was distilled from a Large Language Model.

**Complete list of 27 top-level categories:**
1. /Adult
2. /Arts & Entertainment
3. /Autos & Vehicles
4. /Beauty & Fitness
5. /Books & Literature
6. /Business & Industrial
7. /Computers & Electronics
8. /Finance
9. /Food & Drink
10. /Games
11. /Health
12. /Hobbies & Leisure
13. /Home & Garden
14. /Internet & Telecom
15. /Jobs & Education
16. /Law & Government
17. /News
18. /Online Communities
19. /People & Society
20. /Pets & Animals
21. /Real Estate
22. /Reference
23. /Science
24. /Sensitive Subjects
25. /Shopping
26. /Sports
27. /Travel & Transportation

**Source:** [Google Cloud NL Categories Documentation](https://docs.cloud.google.com/natural-language/docs/categories)

### 1.2 Recommended v1 Subset (20 Categories)

Based on FEATURE_BACKLOG.md analysis, Perspectize v1 should include **20 of 27** categories, dropping those unsuitable for a public content-sharing platform or unlikely for user content:

**Included (20):**
- Arts & Entertainment
- Autos & Vehicles
- Beauty & Fitness
- Books & Literature
- Business & Industrial
- Computers & Electronics
- Finance
- Food & Drink
- Games
- Health
- Hobbies & Leisure
- Home & Garden
- Jobs & Education
- Law & Government
- News
- People & Society
- Pets & Animals
- Science
- Sports
- Travel & Transportation

**Excluded for v1 (7):**
- Adult (moderation concerns)
- Internet & Telecom (too technical/infrastructure-focused)
- Online Communities (meta-category, hard to apply to individual content)
- Real Estate (narrow commercial use case)
- Reference (overlaps with Books & Literature)
- Sensitive Subjects (flagging system, not categorization)
- Shopping (commercial/transactional, not perspective-worthy)

### 1.3 YouTube Category Mapping

**Finding:** YouTube Data API provides **32 region-specific video categories** (e.g., Film & Animation, Music, Gaming, Education, Science & Technology) that do NOT directly map 1:1 to Google's Content Taxonomy despite both being Google products.

YouTube categories are retrieved via [`videoCategories.list`](https://developers.google.com/youtube/v3/docs/videoCategories/list) endpoint with `regionCode` parameter (quota cost: 1 unit per request).

**Mapping strategy for YouTube content ingestion:**
1. Fetch YouTube category via API (`snippet.categoryId`)
2. Apply heuristic mapping to Google taxonomy top-level categories:
   - YouTube "Film & Animation" → /Arts & Entertainment
   - YouTube "Music" → /Arts & Entertainment
   - YouTube "Gaming" → /Games
   - YouTube "Education" → /Jobs & Education
   - YouTube "Science & Technology" → /Science or /Computers & Electronics
   - YouTube "Sports" → /Sports
   - YouTube "Autos & Vehicles" → /Autos & Vehicles
3. Fall back to auto-categorization if no clear mapping exists

**Confidence:** MEDIUM — mapping requires manual heuristic table since no official Google mapping exists.

**Sources:**
- [YouTube videoCategories API](https://developers.google.com/youtube/v3/docs/videoCategories)
- [YouTube category IDs reference](https://gist.github.com/dgp/1b24bf2961521bd75d6c)

### 1.4 Hierarchical Structure

Google's taxonomy uses **path notation** (`/Science/Computer Science/Artificial Intelligence`) with 3-4 levels of depth. V1 should support:

- **Top-level only** for user-facing selection (20 categories)
- **Full hierarchy** stored in database for future drill-down (e.g., filter by `/Science/*` to include all science subcategories)
- **Subcategory expansion** in future versions (e.g., user selects `/Science`, system suggests `/Science/Biology` based on content analysis)

---

## 2. Auto-Categorization Options

### 2.1 Google Cloud Natural Language API

**Endpoint:** `classifyText` method
**Model:** V2 (latest, 1,091 categories, 11 languages)

**Pricing:**
| Usage Tier | Price per 1,000 characters |
|-----------|---------------------------|
| 0-30K characters/month | FREE |
| 30K-250K | $0.0020 |
| 250K-5M | $0.00050 |
| 5M+ | $0.0001 |

**Free tier:** 30,000 characters/month = ~30 video descriptions (avg 1,000 characters each)

**Estimated v1 costs:**
- 100 videos/month × 1,000 chars = 100,000 characters
- Breaks down: 30K free + 70K paid
- 70 units × $0.002 = **$0.14/month**

**Response format:**
```json
{
  "categories": [
    {
      "name": "/Science/Computer Science/Artificial Intelligence",
      "confidence": 0.91
    },
    {
      "name": "/Science",
      "confidence": 0.87
    }
  ]
}
```

**Filtering behavior:** V2 model returns **all applicable categories** with reasonable confidence scores (both parent and child categories), unlike v1 which filtered to most specific only.

**Character counting:** Requests are rounded to nearest 1,000-character unit. A 1,500-character description = 2 units.

**Limitations:**
- Text-based classification only (no video/audio analysis)
- Requires substantial text input (descriptions, transcripts)
- May miss nuance without full transcript

**Confidence:** HIGH — official API, transparent pricing, proven accuracy for digital content.

**Sources:**
- [Google Cloud NL Pricing](https://cloud.google.com/natural-language/pricing)
- [Classifying Content Documentation](https://cloud.google.com/natural-language/docs/classifying-text)

### 2.2 Claude API (Haiku 3.5)

**Model:** Claude Haiku 3.5
**Pricing:** $0.25 input / $1.25 output per million tokens (~$0.001 per classification)

**Estimated v1 costs:**
- 100 videos/month
- Avg 1,000 tokens input (description + prompt) + 50 tokens output (category path)
- (100 × 1,000 / 1M × $0.25) + (100 × 50 / 1M × $1.25) = **$0.031/month**

**Approach:**
```
Prompt: "Classify the following content into one of these categories: [list].
Content: {title} | {description}
Return only the category path."
```

**Advantages over Google Cloud NL:**
- 5x cheaper per classification ($0.0003 vs $0.002 after free tier)
- Supports custom category taxonomies (not locked to Google's)
- Can incorporate additional context (tags, user perspectives, thumbnail analysis via multimodal)

**Disadvantages:**
- Requires prompt engineering and category list injection
- No official content taxonomy (must maintain own)
- Potential hallucination/inconsistency

**Batch API discount:** 50% off if using async batch processing (drops to $0.015/month for 100 videos)

**Confidence:** HIGH — Claude is well-suited for classification tasks, significantly cheaper than Google Cloud NL at scale.

**Sources:**
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)
- [Claude API Pricing Comparison 2026](https://intuitionlabs.ai/articles/ai-api-pricing-comparison-grok-gemini-openai-claude)

### 2.3 Hybrid Approach (Recommended)

**Best of both worlds:**
1. **Auto-suggest on ingest** — Use Claude Haiku 3.5 to suggest category from Perspectize's curated 20-category list
2. **User confirmation** — Present suggestion as default, allow user to change before saving
3. **Confidence threshold** — If Claude returns low confidence (<70%), require manual selection
4. **Google Cloud NL fallback** — Use for audit/validation when user disputes auto-suggestion

**Workflow:**
```
1. User adds YouTube video
2. System calls Claude API with title + description + tags
3. Claude suggests "/Science" with 87% confidence
4. UI shows category picker pre-filled with "Science"
5. User confirms or changes
6. System stores final category
```

**Cost comparison (100 videos/month):**
- Claude Haiku 3.5: $0.031/month
- Google Cloud NL: $0.14/month
- **Savings: 78% cheaper with Claude**

**Future enhancement:** Batch process auto-categorization nightly for uncategorized content using Claude Batch API (50% discount → $0.015/month).

---

## 3. PostgreSQL Schema Design

### 3.1 Enum vs. Lookup Table Decision

**Key finding:** For hierarchical, extensible categories, **lookup table is strongly recommended** over PostgreSQL enum.

**Comparison:**

| Criterion | Enum | Lookup Table |
|-----------|------|--------------|
| **Performance** | 4 bytes, inlined in index | 2-4 bytes (smallint/int FK) |
| **Flexibility** | Hard to modify (requires migration) | Easy to add/remove rows |
| **Hierarchy** | Not supported | Supported (parent_id, path) |
| **User-defined categories** | Not feasible | Native support |
| **GraphQL enum generation** | Direct mapping | Requires runtime query |
| **Migration complexity** | Painful (can't remove values) | Standard FK migration |

**Recommendation:** Use **lookup table** with PostgreSQL **ltree extension** for hierarchical path queries.

**Sources:**
- [CYBERTEC: Lookup Table or Enum Type](https://www.cybertec-postgresql.com/en/lookup-table-or-enum-type/)
- [PostgreSQL ltree Documentation](https://www.postgresql.org/docs/current/ltree.html)
- [Hierarchical Models in PostgreSQL](https://www.ackee.agency/blog/hierarchical-models-in-postgresql)

### 3.2 Recommended Schema (Lookup Table with ltree)

**Categories table:**
```sql
CREATE EXTENSION IF NOT EXISTS ltree;

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL UNIQUE,  -- "Science"
    path ltree NOT NULL UNIQUE,         -- "science"
    full_path ltree NOT NULL UNIQUE,    -- "science.computer_science.ai"
    parent_id INT REFERENCES categories(id),
    level INT NOT NULL DEFAULT 1,       -- 1 = top-level, 2 = subcategory, etc.
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    is_user_defined BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_categories_path ON categories USING GIST(full_path);
CREATE INDEX idx_categories_parent ON categories(parent_id);
```

**Content table addition:**
```sql
ALTER TABLE content
ADD COLUMN category_id INT REFERENCES categories(id);

CREATE INDEX idx_content_category ON content(category_id);
```

**Why ltree?**
- **Path queries:** Find all content in `/Science/*` subcategories via `full_path <@ 'science'`
- **Ancestry queries:** Get category ancestors via `full_path ~ 'science.*{1}'` (direct children)
- **Performance:** GIST index supports efficient prefix matching
- **Limitations:** Maximum path length ~65KB (not a problem for 3-4 level taxonomy)

**Alternative: Closure table** — stores all ancestor-descendant pairs. Better for very deep trees (10+ levels) but higher storage overhead. Not needed for Google's 3-4 level taxonomy.

**Sources:**
- [PostgreSQL ltree Tutorial](https://tudborg.com/posts/2022-02-04-postgres-hierarchical-data-with-ltree/)
- [ltree vs Closure Table Comparison](https://hoverbear.org/blog/postgresql-hierarchical-structures/)

### 3.3 Migration Strategy (Enum to Lookup Table)

**If initially implemented as enum:**
1. Create `categories` lookup table with current enum values
2. Add `category_id` column to `content` table
3. Backfill `category_id` from enum column using mapping function
4. Drop enum column
5. Add NOT NULL constraint to `category_id` after backfill

**Recommended:** Start with lookup table from v1 to avoid migration pain.

**Sources:**
- [Managing PostgreSQL Enums](https://supabase.com/docs/guides/database/postgres/enums)
- [Migrating Enum to Lookup Table](https://www.cybertec-postgresql.com/en/lookup-table-or-enum-type/)

### 3.4 Seeding Google Taxonomy Categories

**Migration seed approach:**
```sql
-- 000011_add_categories.up.sql
INSERT INTO categories (name, path, full_path, level) VALUES
    ('Arts & Entertainment', 'arts_entertainment', 'arts_entertainment', 1),
    ('Autos & Vehicles', 'autos_vehicles', 'autos_vehicles', 1),
    ('Beauty & Fitness', 'beauty_fitness', 'beauty_fitness', 1),
    -- ... (20 total)
ON CONFLICT (path) DO NOTHING;

-- Subcategories (future)
INSERT INTO categories (name, path, full_path, parent_id, level)
SELECT
    'Computer Science',
    'computer_science',
    'science.computer_science',
    (SELECT id FROM categories WHERE path = 'science'),
    2
WHERE NOT EXISTS (SELECT 1 FROM categories WHERE path = 'computer_science');
```

**Naming convention:**
- `name`: Human-readable ("Arts & Entertainment")
- `path`: Single-level slug ("arts_entertainment")
- `full_path`: Hierarchical ltree path ("arts_entertainment.movies")

---

## 4. GraphQL Integration

### 4.1 Schema Design

**Enum for filtering (gqlgen model binding):**
```graphql
enum ContentCategory {
  ARTS_ENTERTAINMENT
  AUTOS_VEHICLES
  BEAUTY_FITNESS
  BOOKS_LITERATURE
  BUSINESS_INDUSTRIAL
  COMPUTERS_ELECTRONICS
  FINANCE
  FOOD_DRINK
  GAMES
  HEALTH
  HOBBIES_LEISURE
  HOME_GARDEN
  JOBS_EDUCATION
  LAW_GOVERNMENT
  NEWS
  PEOPLE_SOCIETY
  PETS_ANIMALS
  SCIENCE
  SPORTS
  TRAVEL_TRANSPORTATION
}
```

**Domain enum (backend):**
```go
// internal/core/domain/category.go
type ContentCategory string

const (
    ContentCategoryArtsEntertainment     ContentCategory = "ARTS_ENTERTAINMENT"
    ContentCategoryAutosVehicles         ContentCategory = "AUTOS_VEHICLES"
    // ... (20 total)
)
```

**gqlgen.yml binding:**
```yaml
models:
  ContentCategory:
    model:
      - github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain.ContentCategory
```

**Content type with category:**
```graphql
type Content {
  id: ID!
  name: String!
  # ... existing fields
  category: ContentCategory
  categoryPath: String  # Full hierarchical path for display
}
```

**Filter input:**
```graphql
input ContentFilter {
  contentType: ContentType
  category: ContentCategory        # Filter by top-level category
  categoryPath: String             # Filter by ltree path (e.g., "science.*")
  minLengthSeconds: Int
  maxLengthSeconds: Int
  search: String
}
```

### 4.2 Resolver Pattern

**Category lookup (string to ID):**
```go
// internal/adapters/repositories/postgres/gorm_category_repository.go
func (r *GormCategoryRepository) GetByPath(ctx context.Context, path string) (*domain.Category, error) {
    var categoryModel CategoryModel
    if err := r.db.WithContext(ctx).
        Where("path = ?", path).
        First(&categoryModel).Error; err != nil {
        return nil, err
    }
    return mapGormToDomainCategory(&categoryModel), nil
}
```

**Content resolver with category:**
```go
// internal/adapters/graphql/resolvers/content_resolver.go
func (r *queryResolver) Content(ctx context.Context, first *int, after *string, filter *model.ContentFilter) (*model.PaginatedContent, error) {
    opts := domain.ListContentOptions{
        First: first,
        After: after,
    }

    if filter != nil && filter.Category != nil {
        // Convert enum to category ID via repository lookup
        category, err := r.categoryService.GetByPath(ctx, string(*filter.Category))
        if err != nil {
            return nil, err
        }
        opts.CategoryID = &category.ID
    }

    // ... rest of query
}
```

### 4.3 gqlgen Enum Best Practices

**REQUIRED per backend/CLAUDE.md:**
1. **UPPERCASE enum values** in domain layer
2. **Bind in gqlgen.yml** — never write switch statements
3. **Repository converters** if stored lowercase in DB

**Example converter:**
```go
// helpers.go
func dbCategoryToGraphQL(dbPath string) domain.ContentCategory {
    // DB stores "arts_entertainment", GraphQL expects "ARTS_ENTERTAINMENT"
    return domain.ContentCategory(strings.ToUpper(dbPath))
}
```

**Sources:**
- [gqlgen Enum Binding Recipe](https://gqlgen.com/recipes/enum/)
- Perspectize backend/CLAUDE.md (lines 134-152)

---

## 5. Frontend UI Patterns

### 5.1 Category Selector Component

**Recommended pattern:** Searchable dropdown (combobox) with autocomplete for 20 categories.

**Key UX principles (2026 research):**
- **Display 4-8 items on mobile**, 10 items on desktop (avoid scrollbars on mobile)
- **Autocomplete on focus** — show full list immediately, filter as user types
- **Keyboard navigation** — Up/Down arrow keys, Enter to select
- **Visual grouping** — Not needed for flat 20-item list; defer to hierarchical implementation
- **Category scope indicators** — Use italics or indentation for subcategories (future)

**Component structure:**
```svelte
<!-- CategoryPicker.svelte -->
<script lang="ts">
  import { createQuery } from '@tanstack/svelte-query';

  export let value: string | null = null;

  const categoriesQuery = createQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const response = await graphqlClient.request(GET_CATEGORIES);
      return response.categories;
    }
  });

  function handleSelect(category: string) {
    value = category;
  }
</script>

<select bind:value={value}>
  {#if $categoriesQuery.isLoading}
    <option>Loading...</option>
  {:else if $categoriesQuery.data}
    <option value={null}>Select a category...</option>
    {#each $categoriesQuery.data as category}
      <option value={category.path}>{category.name}</option>
    {/each}
  {/if}
</select>
```

**With autocomplete (future enhancement):**
- Use Svelte 5 `$derived` for filtered list
- Debounce search input (200ms) to avoid excessive re-renders
- Highlight matching text in results

**Sources:**
- [Autocomplete UX Best Practices (2026)](https://smart-interface-design-patterns.com/articles/autocomplete-ux/)
- [Dropdown Interaction Patterns Guide](https://www.uxpin.com/studio/blog/dropdown-interaction-patterns-a-complete-guide/)

### 5.2 Category Display in ActivityTable

**Recommended:** Badge/chip component with category color coding.

**Design considerations:**
- **Color palette:** Assign semantic colors to category groups (blue = Technology/Science, green = Health/Fitness, red = News/Law, etc.)
- **Icon pairing:** Optional category icons for visual scanning (science beaker, sports trophy, etc.)
- **Truncation:** Display full category name on hover (tooltip)

**AG Grid column definition:**
```typescript
{
  field: 'category',
  headerName: 'Category',
  width: 150,
  cellRenderer: (params: ICellRendererParams) => {
    if (!params.value) return '';
    const category = params.value as string;
    return `<span class="category-badge">${category}</span>`;
  }
}
```

### 5.3 Category vs. Tags UX Distinction

**Research finding:** Single-select categories + multi-select tags is the standard pattern.

**User mental model:**
- **Category** = "What broad topic is this?" (single answer: "Science")
- **Tags** = "What specific aspects does this cover?" (multiple: "AI", "ethics", "tutorial")

**UI differentiation:**
| Aspect | Category | Tags |
|--------|----------|------|
| **Selection** | Dropdown (single-select) | Multi-select or tag input |
| **Display** | Single badge | Multiple chips |
| **Filter UI** | Dropdown/checkbox list | Tag cloud or multi-select |
| **Required** | Recommended (or auto-suggested) | Optional |

**Sources:**
- [Multi-Select UI Patterns (2026)](https://medium.com/@karthiban/multi-select-dropdown-usability-meets-scalability-d803f6911a32)
- [Dropdown vs. Checkbox Study](https://uxplanet.org/checkboxes-vs-multi-select-dropdown-a-comparative-study-f4c8876a7fe4)

### 5.4 Category Filter in ActivityTable

**Current state:** `ContentFilter` GraphQL input supports `category: ContentCategory` enum.

**UI implementation:**
1. Add category dropdown above/beside search box
2. On selection, update `contentFilter` variable in `ListContent` query
3. AG Grid refetches with new filter
4. Display active filter as removable chip

**Filter state management:**
```typescript
let activeFilters = $state({
  category: null as string | null,
  search: '',
});

const contentQuery = createQuery({
  queryKey: ['content', activeFilters],
  queryFn: async () => {
    return await graphqlClient.request(LIST_CONTENT, {
      filter: {
        category: activeFilters.category,
        search: activeFilters.search,
      }
    });
  }
});
```

---

## 6. Cost Analysis

### 6.1 API Cost Comparison (100 videos/month)

| Service | Pricing Model | Monthly Cost | Notes |
|---------|---------------|--------------|-------|
| **Google Cloud NL** | $0.002/1K chars (after 30K free) | $0.14 | 30K free = ~30 videos, then $0.002/video |
| **Claude Haiku 3.5** | $0.25/$1.25 per MTok | $0.031 | ~5x cheaper, custom taxonomy |
| **Claude Batch API** | 50% discount on async | $0.015 | Nightly batch processing |

**At scale (1,000 videos/month):**
- Google Cloud NL: $2.00/month (1M characters × $0.002)
- Claude Haiku 3.5: $0.31/month
- Claude Batch API: $0.15/month

**Recommendation:** Start with **Claude Haiku 3.5** for auto-suggestions. Google Cloud NL becomes cost-competitive only at <100 videos/month due to free tier.

### 6.2 Storage Costs

**Lookup table storage (20 categories):**
- Categories table: ~20 rows × 200 bytes = 4 KB
- Content FK: 4 bytes per content item (INT)
- At 10K content items: 10K × 4 bytes = 40 KB

**Negligible storage overhead.** JSONB would be ~50-100 bytes per category stored inline.

### 6.3 Performance Benchmarks

**Query performance (estimated, 10K rows):**
- **Indexed FK lookup:** <1ms (B-tree index on `content.category_id`)
- **ltree path query:** 1-5ms (GIST index on `categories.full_path`)
- **Enum comparison:** <1ms (inline 4-byte value)

**Conclusion:** Lookup table performance is comparable to enum for filtering, with massive flexibility advantage.

---

## 7. Implementation Phases

### Phase 1: Core Schema & Manual Selection (v1.1 MVP)

**Goal:** Add category field with manual selection, no auto-categorization.

**Tasks:**
1. **Database migration:**
   - Create `categories` table with ltree
   - Seed 20 top-level categories
   - Add `category_id` to `content` table
2. **GraphQL schema:**
   - Add `ContentCategory` enum (20 values)
   - Update `Content` type with `category` field
   - Update `ContentFilter` input with `category` filter
3. **Backend implementation:**
   - Create `CategoryRepository` port and GORM implementation
   - Add category lookup to `ContentService`
   - Update `content` resolver to accept category filter
4. **Frontend:**
   - Create `CategoryPicker.svelte` component (dropdown)
   - Add category column to ActivityTable
   - Add category filter dropdown above table
5. **Testing:**
   - Unit tests for category repository
   - Integration tests for category filtering
   - E2E test for category selection workflow

**Success criteria:**
- Users can manually assign one category per content item
- ActivityTable displays category badges
- Category filter works in ActivityTable

**Estimated effort:** 1 phase (8-12 hours)

---

### Phase 2: Auto-Categorization with Claude API (v1.2)

**Goal:** Suggest category on content ingest using Claude Haiku 3.5.

**Tasks:**
1. **Claude API integration:**
   - Add `internal/adapters/ai/claude_client.go`
   - Implement `SuggestCategory(title, description, tags) -> (category, confidence)`
2. **Service layer:**
   - Add `AutoCategorizeContent` method to `ContentService`
   - Call Claude API on YouTube ingest
3. **GraphQL mutation update:**
   - Return suggested category with confidence in `createContentFromYouTube` response
4. **Frontend:**
   - Display suggested category in creation dialog
   - Pre-fill CategoryPicker with suggestion
   - Show confidence indicator ("87% confident")
   - Allow user to override

**Success criteria:**
- Claude API suggests category on YouTube ingest
- Suggestion accuracy >80% on manual review of 20 videos
- User can accept or change suggestion

**Estimated effort:** 1 phase (6-10 hours)

---

### Phase 3: Hierarchical Categories & Batch Processing (v1.3)

**Goal:** Add subcategory support and batch auto-categorization.

**Tasks:**
1. **Database:**
   - Seed subcategories (level 2-3) from Google taxonomy
   - Update ltree queries to support `science.*` path filtering
2. **Batch processing:**
   - Implement nightly cron job to categorize uncategorized content
   - Use Claude Batch API for 50% cost savings
3. **GraphQL:**
   - Add `categoryPath` field to `Content` type
   - Add `categoryPath` filter to `ContentFilter` (ltree query)
4. **Frontend:**
   - Update CategoryPicker to show hierarchical tree (indent subcategories)
   - Add breadcrumb display for full category path

**Success criteria:**
- Users can assign subcategories (e.g., `/Science/Biology`)
- Batch processing categorizes 100+ videos overnight
- ltree path queries work correctly

**Estimated effort:** 1 phase (10-14 hours)

---

### Phase 4: User-Defined Categories (v2.0)

**Goal:** Allow users to create custom categories.

**Tasks:**
1. **Database:**
   - Set `is_user_defined = TRUE` for custom categories
   - Add `user_id` FK to `categories` table
2. **GraphQL:**
   - Add `createCategory` mutation
   - Add `userCategories` query (filter by user)
3. **Service layer:**
   - Validate category names (uniqueness, length)
   - Restrict depth (max 3 levels for user-defined)
4. **Frontend:**
   - "Create new category" button in CategoryPicker
   - Category management page (list, edit, delete)

**Success criteria:**
- Users can create custom categories
- Custom categories appear in category picker alongside system categories
- Users can only edit their own categories

**Estimated effort:** 1 phase (8-12 hours)

---

## Confidence Assessment

| Area | Confidence | Reason |
|------|------------|--------|
| **Taxonomy** | HIGH | Google's taxonomy is proven, well-documented, and maps to YouTube categories |
| **Auto-categorization** | HIGH | Both Google Cloud NL and Claude API are production-ready; Claude is cheaper |
| **PostgreSQL schema** | HIGH | Lookup table + ltree is standard pattern for hierarchical categories |
| **GraphQL integration** | HIGH | Follows gqlgen enum binding patterns per backend/CLAUDE.md |
| **Frontend UI** | MEDIUM | Standard patterns exist, but category-specific UX needs user testing |
| **Cost estimates** | MEDIUM | Based on documented API pricing; actual usage may vary |

---

## Open Questions & Recommendations

### Research Flags for Future Phases

1. **YouTube category mapping:** Manual heuristic table needed. Consider ML model to learn mapping from user corrections (Phase 2 data collection opportunity).

2. **Multi-content-type categories:** When adding books/podcasts, verify Google taxonomy covers those domains. May need domain-specific subcategories.

3. **Category hierarchy depth:** Google supports 3-4 levels. User testing needed to determine optimal depth for Perspectize UI (Phase 3).

4. **Category migration from tags:** Some existing tags may be better suited as categories. Analyze tag usage patterns and provide one-time migration tool.

### Immediate Next Steps

1. **Implement Phase 1** (core schema + manual selection) in v1.1
2. **Collect baseline data** — track how users categorize content manually to validate auto-categorization accuracy in Phase 2
3. **Design category color palette** — assign semantic colors to 20 top-level categories for consistent UI
4. **Create migration plan** — document rollback strategy if lookup table causes performance issues (fallback to denormalized category name column)

---

## Sources

### API Documentation
- [Google Cloud NL Categories](https://docs.cloud.google.com/natural-language/docs/categories)
- [Google Cloud NL Pricing](https://cloud.google.com/natural-language/pricing)
- [Google Cloud NL Classifying Text](https://cloud.google.com/natural-language/docs/classifying-text)
- [YouTube videoCategories API](https://developers.google.com/youtube/v3/docs/videoCategories)
- [Claude API Pricing](https://platform.claude.com/docs/en/about-claude/pricing)

### PostgreSQL & Schema Design
- [CYBERTEC: Lookup Table or Enum Type](https://www.cybertec-postgresql.com/en/lookup-table-or-enum-type/)
- [PostgreSQL ltree Documentation](https://www.postgresql.org/docs/current/ltree.html)
- [Hierarchical Models in PostgreSQL](https://www.ackee.agency/blog/hierarchical-models-in-postgresql)
- [ltree Tutorial by Tudborg](https://tudborg.com/posts/2022-02-04-postgres-hierarchical-data-with-ltree/)
- [Hierarchical Structures in PostgreSQL](https://hoverbear.org/blog/postgresql-hierarchical-structures/)
- [Managing PostgreSQL Enums](https://supabase.com/docs/guides/database/postgres/enums)

### GraphQL & Backend Patterns
- [gqlgen Enum Binding Recipe](https://gqlgen.com/recipes/enum/)
- [GraphQL Filtering and Pagination Tutorial](https://www.howtographql.com/graphql-js/8-filtering-pagination-and-sorting/)

### Frontend UX Research
- [Autocomplete UX Best Practices](https://smart-interface-design-patterns.com/articles/autocomplete-ux/)
- [Baymard: Autocomplete Design Patterns](https://baymard.com/blog/autocomplete-design)
- [Dropdown Interaction Patterns Guide](https://www.uxpin.com/studio/blog/dropdown-interaction-patterns-a-complete-guide/)
- [Multi-Select Dropdown Usability](https://medium.com/@karthiban/multi-select-dropdown-usability-meets-scalability-d803f6911a32)
- [Checkboxes vs Multi-Select Study](https://uxplanet.org/checkboxes-vs-multi-select-dropdown-a-comparative-study-f4c8876a7fe4)

### API Pricing & Comparison
- [Claude API Pricing Comparison 2026](https://intuitionlabs.ai/articles/ai-api-pricing-comparison-grok-gemini-openai-claude)
- [LLM API Pricing Comparison 2025](https://intuitionlabs.ai/articles/llm-api-pricing-comparison-2025)

### Content Moderation & Workflows
- [Automated Content Moderation Logic](https://logic.inc/resources/automate-ecommerce-content-moderation)
- [AWS Content Moderation Design Patterns](https://aws.amazon.com/blogs/machine-learning/content-moderation-design-patterns-with-aws-managed-ai-services/)

---

## Appendix: Alternative Taxonomies Evaluated

### Library of Congress Classification (LCC)
- **Pros:** Authoritative, comprehensive (21 top-level classes)
- **Cons:** Academic focus, book-oriented, complex notation (QA75-76 = Computer Science), not digital-native
- **Verdict:** Too academic for general content platform

### Dewey Decimal Classification (DDC)
- **Pros:** Widely known, simple structure (10 classes)
- **Cons:** Proprietary (OCLC license required), too coarse (only 10 categories), outdated (1876 design)
- **Verdict:** Insufficient granularity, licensing concerns

### YouTube Categories (Native)
- **Pros:** Native to primary content source, 32 categories
- **Cons:** Region-specific, not generalizable to books/podcasts, controlled by YouTube (may change)
- **Verdict:** Good for YouTube-only, but not future-proof for multi-content-type platform

### Open Directory Project (DMOZ)
- **Pros:** 16 top-level categories, web-focused
- **Cons:** Defunct since 2017, no maintenance, outdated
- **Verdict:** Historical artifact, not viable

**Winner: Google Cloud NL Content Taxonomy** — digital-native, actively maintained, free, maps to YouTube, future-proof for multi-content types.
