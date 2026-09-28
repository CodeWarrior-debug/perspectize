# Discover Page Research: Perspectize v1.1

**Domain:** Video content discovery and browsing platform
**Researched:** 2026-02-16
**Overall confidence:** HIGH

---

## 1. Executive Summary

The Discover page enables users to find new YouTube content outside the system through two primary modes: **Browse** (category-driven exploration) and **Search** (query-driven discovery). This research covers YouTube Data API v3 capabilities, quota management strategies, modern search UX patterns, TanStack Query caching approaches, and integration with Perspectize's existing add-video flow.

### Key Findings

**YouTube API Integration:** YouTube Data API v3 provides comprehensive search (`search.list`, 100 quota units) and category browsing (`videoCategories.list`, 1 quota unit). The default 10,000 units/day quota allows ~100 searches or ~10,000 category lookups daily.

**Quota Management:** Critical constraint—search operations consume 100 units each. Caching search results and category listings with TanStack Query's stale-while-revalidate pattern is essential. Recommend aggressive caching (5-15 minute stale time for searches, 24 hours for categories).

**Search UX:** Modern patterns favor typeahead with debouncing (300-500ms), filters for video duration/publish date, and "Load More" pattern over pure infinite scroll (improves footer accessibility and user control).

**Integration Point:** Reuse existing `AddVideoPopover` mutation flow (`CREATE_CONTENT_FROM_YOUTUBE`) with one-click "Add to Library" buttons from search results. Optimistic updates via TanStack Query's `setQueriesData` prevent full refetches.

**Architecture:** New `/discover` route with category browse view and search interface. Reuse `graphqlClient`, `useAddVideo` hook, and `ActivityTable` styling tokens. No backend changes required—frontend directly calls YouTube API.

---

## 2. YouTube API Integration

### 2.1 Available Endpoints

| Endpoint | Purpose | Quota Cost | Key Parameters |
|----------|---------|------------|----------------|
| `search.list` | Search videos, channels, playlists | 100 units | `q`, `type`, `order`, `maxResults`, `pageToken` |
| `videoCategories.list` | Get browsable categories | 1 unit | `regionCode`, `hl` |
| `videos.list` | Get video metadata (already implemented) | 1 unit | `id`, `part=snippet,statistics,contentDetails` |

**Current Implementation:** Perspectize already uses `videos.list` via `backend/internal/adapters/youtube/client.go` for the add-video flow. Fetches snippet (title, description, channel, tags), statistics (views, likes, comments), and content details (duration).

**New Requirements:**
- **Search:** Frontend calls `https://www.googleapis.com/youtube/v3/search?part=snippet&q={query}&type=video&maxResults=25&pageToken={token}&key={apiKey}`
- **Categories:** Frontend calls `https://www.googleapis.com/youtube/v3/videoCategories?part=snippet&regionCode=US&key={apiKey}`

### 2.2 Search Parameters

**Core Parameters:**
```typescript
interface SearchParams {
  part: 'snippet';           // Required
  q: string;                 // Search query (supports Boolean NOT - and OR |)
  type: 'video';             // Restrict to videos only
  maxResults: number;        // 1-50 (default 5, recommend 25)
  pageToken?: string;        // For pagination
  order?: 'relevance' | 'date' | 'rating' | 'viewCount' | 'title';
  key: string;               // API key
}
```

**Filtering (Optional):**
```typescript
interface AdvancedFilters {
  videoDuration?: 'short' | 'medium' | 'long'; // <4min, 4-20min, >20min
  publishedAfter?: string;   // RFC 3339 (e.g., 2026-01-01T00:00:00Z)
  publishedBefore?: string;
  videoDefinition?: 'high' | 'standard'; // HD filter
  regionCode?: string;       // ISO 3166-1 alpha-2 (e.g., 'US')
}
```

**Search Response Structure:**
```typescript
interface SearchResponse {
  items: Array<{
    id: { videoId: string };
    snippet: {
      title: string;
      description: string;
      channelTitle: string;
      publishedAt: string;      // RFC 3339
      thumbnails: {
        default: { url: string; width: 120; height: 90 };
        medium: { url: string; width: 320; height: 180 };
        high: { url: string; width: 480; height: 360 };
      };
    };
  }>;
  nextPageToken?: string;
  prevPageToken?: string;
  pageInfo: {
    totalResults: number;
    resultsPerPage: number;
  };
}
```

**Critical Limitation:** `search.list` does NOT return statistics (views, likes) or duration. These require a follow-up `videos.list` call (1 unit per batch of 50 video IDs).

### 2.3 Category Browsing

**videoCategories.list** returns region-specific categories:

```typescript
interface VideoCategoriesResponse {
  items: Array<{
    id: string;              // Category ID (e.g., "10" for Music)
    snippet: {
      title: string;         // Display name (e.g., "Music")
      assignable: boolean;   // Can videos be tagged with this?
    };
  }>;
}
```

**US Categories (Common IDs):**
- 1: Film & Animation
- 2: Autos & Vehicles
- 10: Music
- 15: Pets & Animals
- 17: Sports
- 19: Travel & Events
- 20: Gaming
- 22: People & Blogs
- 23: Comedy
- 24: Entertainment
- 25: News & Politics
- 26: Howto & Style
- 27: Education
- 28: Science & Technology

**Category Search:** Add `videoCategoryId` parameter to `search.list` to filter by category:
```
GET /youtube/v3/search?part=snippet&type=video&videoCategoryId=10&maxResults=25
```

---

## 3. Quota Management Strategy

### 3.1 Quota Costs

**Daily Limit:** 10,000 units (free tier, no rollover)

**Operation Breakdown:**
- Search: 100 units per request
- Category list: 1 unit (one-time per region)
- Video details: 1 unit per batch (up to 50 IDs)

**Example Usage:**
- 50 searches/day = 5,000 units (50% quota)
- 25 searches + 25 video detail fetches = 2,525 units (25% quota)
- 100 searches (no video details) = 10,000 units (100% quota)

**Risk:** Search-heavy usage can exhaust quota quickly. Mitigation: aggressive client-side caching.

### 3.2 Caching Strategy

**TanStack Query Caching:**

```typescript
// Search results — 5 minute stale time
const searchQuery = createQuery(() => ({
  queryKey: ['youtube', 'search', query, filters],
  queryFn: () => fetchYouTubeSearch(query, filters),
  staleTime: 5 * 60 * 1000,        // 5 minutes
  gcTime: 15 * 60 * 1000,           // 15 minutes (formerly cacheTime)
  enabled: query.length > 0,
}));

// Categories — 24 hour stale time (rarely changes)
const categoriesQuery = createQuery(() => ({
  queryKey: ['youtube', 'categories', regionCode],
  queryFn: () => fetchYouTubeCategories(regionCode),
  staleTime: 24 * 60 * 60 * 1000,  // 24 hours
  gcTime: 7 * 24 * 60 * 60 * 1000, // 7 days
}));

// Paginated search — keep previous data during page transitions
const paginatedSearchQuery = createQuery(() => ({
  queryKey: ['youtube', 'search', query, filters, pageToken],
  queryFn: () => fetchYouTubeSearch(query, filters, pageToken),
  staleTime: 5 * 60 * 1000,
  placeholderData: keepPreviousData, // Prevent loading flicker
}));
```

**Quota Savings:**
- Without caching: 10 users searching 10 times = 1,000 units (10% quota)
- With 5-min cache: Same 10 users = ~200 units (2% quota) if searches overlap

**Cache Invalidation:** Manual invalidation not needed—stale time ensures freshness. Background refetch when user returns to stale query.

### 3.3 Debouncing

**Typeahead Search:** Debounce user input to prevent quota waste on every keystroke.

```typescript
let debounceTimer: ReturnType<typeof setTimeout>;
let searchQuery = $state('');
let debouncedQuery = $state('');

function handleInput(e: Event) {
  searchQuery = (e.target as HTMLInputElement).value;
  clearTimeout(debounceTimer);
  debounceTimer = setTimeout(() => {
    debouncedQuery = searchQuery;
  }, 300); // 300ms delay
}

// Use debouncedQuery in TanStack Query key
const query = createQuery(() => ({
  queryKey: ['youtube', 'search', debouncedQuery],
  queryFn: () => fetchYouTubeSearch(debouncedQuery),
  enabled: debouncedQuery.length > 0,
}));
```

**Debounce Duration:**
- 300ms: Recommended for fast typists (balances responsiveness + quota)
- 500ms: Conservative (fewer API calls, slight lag perception)

---

## 4. Search UX Design

### 4.1 Interface Layout

**Wireframe Concept:**
```
+----------------------------------------------------------+
|  [Perspectize Logo]    Discover    Activity    [User ▾]  |
+----------------------------------------------------------+
|                                                           |
|  🔍 [Search YouTube...................................] |
|                                                           |
|  Filters:  Duration [All ▾]  Date [Any ▾]  Sort [Relevance ▾] |
|                                                           |
+----------------------------------------------------------+
|  📹 Video Title Here                           [+ Add]   |
|  Channel Name • 1.2M views • 2 days ago                  |
|  Short description excerpt from the video...              |
|                                                           |
|  📹 Another Video Title                        [+ Add]   |
|  Channel Name • 450K views • 1 week ago                  |
|  Description preview...                                   |
|                                                           |
|  [Load More Results]                                     |
+----------------------------------------------------------+
```

**Components:**
1. **Search Input:** Full-width, autofocus, clear button
2. **Filters Row:** Dropdown menus (duration, date, sort order)
3. **Results List:** Thumbnail + metadata + "Add" button per result
4. **Pagination:** "Load More" button (not infinite scroll—see rationale below)

### 4.2 Typeahead vs. Instant Search

**Recommendation: Debounced instant search** (no autocomplete dropdown)

**Rationale:**
- YouTube's autocomplete suggestions API is NOT part of Data API v3 (different service, separate quota)
- Debounced instant search (300ms) achieves similar UX without additional API calls
- Users type query → see results below (no dropdown overlay)

**Pattern:**
```typescript
// Input triggers debounced search
<input
  type="text"
  placeholder="Search YouTube..."
  bind:value={searchQuery}
  oninput={handleInput}
/>

// Results appear below (not as dropdown)
{#if query.isLoading}
  <LoadingSpinner />
{:else if query.data}
  <SearchResults items={query.data.items} />
{/if}
```

### 4.3 Filters

**Duration Filter:**
```typescript
const durationOptions = [
  { label: 'Any duration', value: undefined },
  { label: 'Under 4 minutes', value: 'short' },
  { label: '4-20 minutes', value: 'medium' },
  { label: 'Over 20 minutes', value: 'long' },
];
```

**Upload Date Filter:**
```typescript
const dateOptions = [
  { label: 'Any time', value: undefined },
  { label: 'Last hour', value: () => subtractHours(new Date(), 1) },
  { label: 'Today', value: () => startOfDay(new Date()) },
  { label: 'This week', value: () => subtractDays(new Date(), 7) },
  { label: 'This month', value: () => subtractMonths(new Date(), 1) },
  { label: 'This year', value: () => subtractYears(new Date(), 1) },
];
```

**Sort Order:**
```typescript
const sortOptions = [
  { label: 'Relevance', value: 'relevance' },
  { label: 'Upload date', value: 'date' },
  { label: 'View count', value: 'viewCount' },
  { label: 'Rating', value: 'rating' },
];
```

**Filter State Management:**
```typescript
let filters = $state({
  duration: undefined as 'short' | 'medium' | 'long' | undefined,
  publishedAfter: undefined as Date | undefined,
  order: 'relevance' as 'relevance' | 'date' | 'viewCount' | 'rating',
});

// Include in query key for automatic refetch on change
const query = createQuery(() => ({
  queryKey: ['youtube', 'search', debouncedQuery, filters],
  queryFn: () => fetchYouTubeSearch(debouncedQuery, filters),
}));
```

### 4.4 Pagination: "Load More" vs. Infinite Scroll

**Recommendation: "Load More" button**

**Rationale (from research):**
- **Footer accessibility:** Pure infinite scroll makes footer unreachable (critical for compliance, navigation, user trust)
- **User control:** Button gives users agency (scroll to footer without triggering loads)
- **Performance:** Predictable render cycles (no scroll event throttling complexity)
- **Mobile-friendly:** Clear tap target, no accidental loads

**2026 Best Practice:** "Hybrid approach—auto-load first 2-3 pages, then button appears"

**Implementation:**
```typescript
let pageToken = $state<string | undefined>(undefined);
let autoLoadCount = $state(0);
const MAX_AUTO_LOADS = 2;

function loadMore() {
  if (query.data?.nextPageToken) {
    pageToken = query.data.nextPageToken;
    autoLoadCount++;
  }
}

// Auto-load first 2 pages on scroll-near-bottom
$effect(() => {
  if (autoLoadCount < MAX_AUTO_LOADS && isNearBottom && query.data?.nextPageToken) {
    loadMore();
  }
});
```

**UI:**
```svelte
{#if query.data?.nextPageToken}
  {#if autoLoadCount >= MAX_AUTO_LOADS}
    <button onclick={loadMore}>Load More Results</button>
  {:else}
    <LoadingSpinner /> <!-- Auto-loading -->
  {/if}
{:else}
  <p>No more results</p>
{/if}
```

---

## 5. Category Browsing

### 5.1 Category Navigation

**Browse View:** Grid of category cards with thumbnails (use category-representative video thumbnails or icons)

**Wireframe:**
```
+----------------------------------------------------------+
|  Discover    Activity                                     |
+----------------------------------------------------------+
|  Browse by Category                                       |
|                                                           |
|  [🎵 Music]     [🎮 Gaming]     [🏀 Sports]              |
|  [🎬 Film]      [📚 Education]  [🔬 Science]             |
|  [🍳 Howto]     [😂 Comedy]     [🎭 Entertainment]       |
|                                                           |
+----------------------------------------------------------+
```

**Category Card → Search Results:**
Clicking "Music" navigates to `/discover?category=10` and triggers:
```typescript
const categorySearchQuery = createQuery(() => ({
  queryKey: ['youtube', 'search', 'category', categoryId],
  queryFn: () => fetchYouTubeSearch('', { videoCategoryId: categoryId, order: 'viewCount' }),
  staleTime: 5 * 60 * 1000,
}));
```

### 5.2 Category Icons/Thumbnails

**Option 1: Static Icons** (Recommended for MVP)
- Use Lucide icons (`Music`, `Gamepad2`, `Trophy`, `Film`, `GraduationCap`, etc.)
- Consistent styling, no API calls
- Fast, accessible

**Option 2: Dynamic Thumbnails**
- Fetch 1 trending video per category → use thumbnail
- Requires additional `search.list` calls (100 units × categories)
- Defer to post-MVP

**Recommendation:** Static icons for MVP. Dynamic thumbnails in v1.2+.

---

## 6. Content Preview & Add Flow

### 6.1 Search Result Card

**Card Structure:**
```svelte
<div class="result-card">
  <img src={item.snippet.thumbnails.medium.url} alt={item.snippet.title} />
  <div class="details">
    <h3>{item.snippet.title}</h3>
    <p class="meta">
      {item.snippet.channelTitle} • {formatPublishDate(item.snippet.publishedAt)}
    </p>
    <p class="description">{truncate(item.snippet.description, 120)}</p>
  </div>
  <button onclick={() => handleAdd(item.id.videoId)}>+ Add</button>
</div>
```

**Styling Reuse:**
- Card: `bg-card border rounded-lg` (from shadcn)
- Button: Primary button variant (from `$lib/components/shadcn/button`)
- Text: `text-foreground`, `text-muted-foreground` (from `app.css` tokens)

### 6.2 One-Click Add Integration

**Reuse Existing Mutation:** `useAddVideo` hook already handles adding videos via `CREATE_CONTENT_FROM_YOUTUBE`.

**Current Flow (from AddVideoPopover):**
```typescript
const mutation = useAddVideo();
mutation.mutate(youtubeUrl); // URL string
```

**Adaptation for Discover:**
```typescript
function handleAdd(videoId: string) {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  mutation.mutate(url);
}
```

**Benefits:**
- Reuses toast notifications (`toast.success`, `toast.error`)
- Reuses optimistic updates (inserts new item at top of Activity table cache)
- No backend changes required

**UX Enhancement:**
```svelte
<button
  onclick={() => handleAdd(item.id.videoId)}
  disabled={mutation.isPending || isAlreadyAdded(item.id.videoId)}
>
  {#if mutation.isPending}
    Adding...
  {:else if isAlreadyAdded(item.id.videoId)}
    ✓ Added
  {:else}
    + Add
  {/if}
</button>
```

**Already-Added Detection:**
```typescript
const contentQuery = createQuery(() => ({
  queryKey: queryKeys.content.lists(),
  queryFn: () => graphqlClient.request(LIST_CONTENT),
}));

function isAlreadyAdded(videoId: string): boolean {
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  return contentQuery.data?.content.items.some(item => item.url === url) ?? false;
}
```

### 6.3 Embedded Player (Future Enhancement)

**NOT recommended for MVP:**
- Increases page weight
- Distracts from discovery → addition flow
- YouTube embeds can't preview without autoplay (bad UX)

**Post-MVP Option:** Modal preview with YouTube iframe embed on click.

---

## 7. Caching Strategy (Detailed)

### 7.1 TanStack Query Configuration

**Global Defaults:**
```typescript
// frontend/src/routes/+layout.svelte
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 0,            // Immediate refetch by default
      gcTime: 5 * 60 * 1000,   // 5 min garbage collection
      retry: 1,                // Retry once on failure
      refetchOnWindowFocus: false, // Don't refetch on tab switch (for Discover)
    },
  },
});
```

**Discover-Specific Overrides:**
```typescript
// Per-query overrides in Discover page
const searchQuery = createQuery(() => ({
  queryKey: ['youtube', 'search', debouncedQuery, filters],
  queryFn: () => fetchYouTubeSearch(debouncedQuery, filters),
  staleTime: 5 * 60 * 1000,        // 5 minutes (override default 0)
  gcTime: 15 * 60 * 1000,           // 15 minutes
  refetchOnWindowFocus: false,      // Don't refetch YouTube data on focus
  enabled: debouncedQuery.length > 0,
}));
```

### 7.2 Query Key Structure

**Best Practice:** Hierarchical keys with filter dependencies

```typescript
// Query key patterns
export const youtubeKeys = {
  all: ['youtube'] as const,
  searches: () => [...youtubeKeys.all, 'search'] as const,
  search: (query: string, filters: SearchFilters) =>
    [...youtubeKeys.searches(), query, filters] as const,
  categories: () => [...youtubeKeys.all, 'categories'] as const,
  category: (regionCode: string) =>
    [...youtubeKeys.categories(), regionCode] as const,
};
```

**Why This Structure:**
- Enables targeted invalidation (`queryClient.invalidateQueries({ queryKey: youtubeKeys.searches() })`)
- Automatic cache segregation by query + filters
- No manual cache key string concatenation

### 7.3 keepPreviousData Pattern

**Use Case:** Prevent UI flicker when paginating search results.

```typescript
const paginatedSearchQuery = createQuery(() => ({
  queryKey: ['youtube', 'search', query, filters, pageToken],
  queryFn: () => fetchYouTubeSearch(query, filters, pageToken),
  placeholderData: keepPreviousData, // Show previous page while loading next
}));

// UI indicator for background loading
{#if query.isPlaceholderData}
  <div class="loading-indicator">Loading next page...</div>
{/if}
```

**Result:** Old results stay visible → new results swap in smoothly (no blank screen).

---

## 8. Component Architecture

### 8.1 Route Structure

**New Routes:**
```
frontend/src/routes/
├── discover/
│   ├── +page.svelte          # Main Discover page
│   └── +page.ts              # Route config (prerender: false for API calls)
├── activity/
│   └── +page.svelte          # (Move existing ActivityTable here)
└── +layout.svelte            # Root layout (Header, QueryClientProvider)
```

**Navigation Update (Header.svelte):**
```svelte
<nav>
  <a href="/discover">Discover</a>
  <a href="/activity">Activity</a>
</nav>
```

### 8.2 Component Hierarchy

**Discover Page Components:**

```
DiscoverPage (+page.svelte)
├── SearchBar.svelte
│   ├── Input (shadcn)
│   └── ClearButton
├── FilterBar.svelte
│   ├── DurationSelect (shadcn Select)
│   ├── DateSelect
│   └── SortSelect
├── CategoryGrid.svelte (conditionally rendered)
│   └── CategoryCard.svelte (repeating)
└── SearchResults.svelte (conditionally rendered)
    ├── SearchResultCard.svelte (repeating)
    │   ├── Thumbnail (img)
    │   ├── VideoDetails
    │   └── AddButton
    └── LoadMoreButton
```

**Component Responsibilities:**

| Component | Responsibility | Data Source |
|-----------|---------------|-------------|
| `DiscoverPage` | State management, query orchestration | TanStack Query |
| `SearchBar` | Input handling, debouncing | Local state |
| `FilterBar` | Filter selection, state updates | Props + callbacks |
| `CategoryGrid` | Category listing, navigation | `videoCategories.list` query |
| `SearchResults` | Result list, pagination | `search.list` query |
| `SearchResultCard` | Display metadata, add button | Props (search result item) |

### 8.3 Shared Utilities

**Reuse from ActivityTable:**
```typescript
// frontend/src/lib/utils/formatting.ts
export function formatPublishDate(isoDate: string): string {
  const date = new Date(isoDate);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  if (diffDays < 7) return `${diffDays} days ago`;
  if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
  if (diffDays < 365) return `${Math.floor(diffDays / 30)} months ago`;
  return `${Math.floor(diffDays / 365)} years ago`;
}

export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength).trim() + '...';
}
```

**New Utilities:**
```typescript
// frontend/src/lib/utils/youtube.ts
export function buildYouTubeSearchUrl(params: SearchParams): string {
  const url = new URL('https://www.googleapis.com/youtube/v3/search');
  url.searchParams.set('part', 'snippet');
  url.searchParams.set('type', 'video');
  url.searchParams.set('key', import.meta.env.VITE_YOUTUBE_API_KEY);

  if (params.q) url.searchParams.set('q', params.q);
  if (params.maxResults) url.searchParams.set('maxResults', String(params.maxResults));
  if (params.pageToken) url.searchParams.set('pageToken', params.pageToken);
  if (params.order) url.searchParams.set('order', params.order);
  if (params.videoDuration) url.searchParams.set('videoDuration', params.videoDuration);
  if (params.publishedAfter) url.searchParams.set('publishedAfter', params.publishedAfter.toISOString());

  return url.toString();
}

export async function fetchYouTubeSearch(params: SearchParams): Promise<SearchResponse> {
  const url = buildYouTubeSearchUrl(params);
  const response = await fetch(url);

  if (!response.ok) {
    throw new Error(`YouTube API error: ${response.status}`);
  }

  return response.json();
}
```

---

## 9. Implementation Phases

### Phase 1: Basic Search (MVP)

**Scope:** Search input + results list + "Add to Library" button

**Tasks:**
1. Create `/discover` route and page component
2. Implement `SearchBar` with debounced input (300ms)
3. Create TanStack Query hook for `search.list` API
4. Build `SearchResultCard` component (thumbnail, title, channel, description)
5. Integrate `useAddVideo` mutation for one-click add
6. Add "Already Added" check (disable button if video in library)
7. Implement "Load More" pagination with `nextPageToken`
8. Add loading states (spinner, skeleton cards)
9. Add error handling (API errors, quota exceeded, network failures)

**Duration:** 2-3 days
**Deliverables:** Functional search interface, full quota management

**Testing:**
- Search for "svelte tutorial" → results appear
- Click "Add" → video added to Activity table
- Click "Load More" → next page fetches
- Test quota exhaustion → error message displays
- Test duplicate add → button disabled with "✓ Added"

---

### Phase 2: Filters & Sort

**Scope:** Duration, date, sort order filters

**Tasks:**
1. Create `FilterBar` component with shadcn Select dropdowns
2. Add filter state to query key (auto-refetch on change)
3. Implement filter UI (duration, date, sort)
4. Add "Clear Filters" button
5. Test filter combinations (e.g., "long videos, last week, by view count")

**Duration:** 1-2 days
**Deliverables:** Fully functional filters

**Testing:**
- Select "Under 4 minutes" → only short videos
- Select "This week" → only recent videos
- Select "View count" sort → results ordered by popularity

---

### Phase 3: Category Browsing

**Scope:** Category grid + category-filtered search

**Tasks:**
1. Create TanStack Query hook for `videoCategories.list`
2. Build `CategoryGrid` component with static icons
3. Implement category click → navigate to `/discover?category={id}`
4. Update search query to handle `videoCategoryId` filter
5. Add "All Categories" breadcrumb navigation

**Duration:** 1-2 days
**Deliverables:** Browsable category interface

**Testing:**
- Load Discover page → categories grid appears
- Click "Music" → music videos load
- Click breadcrumb → return to all categories

---

### Phase 4: Polish & Optimization

**Scope:** UX improvements, performance tuning

**Tasks:**
1. Add skeleton loading states (placeholder cards during fetch)
2. Implement empty states ("No results found for '{query}'")
3. Add search history (localStorage, max 10 recent searches)
4. Add "Trending" category (no search query, `order=viewCount`, `publishedAfter=lastWeek`)
5. Optimize thumbnail lazy loading (IntersectionObserver)
6. Add keyboard shortcuts (Cmd+K → focus search, Esc → clear)
7. Add Analytics events (search performed, video added, category clicked)

**Duration:** 2-3 days
**Deliverables:** Polished, production-ready Discover page

**Testing:**
- Search with no results → empty state shows
- Lazy load thumbnails → images load on scroll
- Cmd+K → search bar focuses
- Check analytics events in console

---

## 10. Sources

**YouTube Data API v3:**
- [Search: list | YouTube Data API](https://developers.google.com/youtube/v3/docs/search/list)
- [VideoCategories: list | YouTube Data API](https://developers.google.com/youtube/v3/docs/videoCategories/list)
- [Quota Calculator | YouTube Data API](https://developers.google.com/youtube/v3/determine_quota_cost)
- [YouTube API Quota: 10,000 Units/Day Breakdown & Every Endpoint Cost [2026]](https://www.contentstats.io/blog/youtube-api-quota-tracking)
- [YouTube API Complete Guide 2026: Data API v3 Tutorial](https://getlate.dev/blog/youtube-api)

**TanStack Query Caching:**
- [Caching Examples | TanStack Query React Docs](https://tanstack.com/query/v4/docs/react/guides/caching)
- [♻️ Caching, Pagination, and Infinite Scrolling with TanStack Query](https://medium.com/@lakshaykapoor08/%EF%B8%8F-caching-pagination-and-infinite-scrolling-with-tanstack-query-4212b24d3806)
- [Paginated / Lagged Queries | TanStack Query React Docs](https://tanstack.com/query/v4/docs/framework/react/guides/paginated-queries)

**Search UX Patterns:**
- [Infinite Scroll UX Done Right: Guidelines and Best Practices — Smashing Magazine](https://www.smashingmagazine.com/2022/03/designing-better-infinite-scroll/)
- [Master Search UX in 2026: Best Practices, UI Tips & Design Patterns](https://www.designmonks.co/blog/search-ux-best-practices)
- [YouTube's 2026 Search Revamp: Shorts Filter and Prioritize Overhaul](https://www.webpronews.com/youtubes-2026-search-revamp-shorts-filter-and-prioritize-overhaul/)

**Video Discovery UI Patterns:**
- [What Is AI Video Discovery? An Updated Guide for 2026 - Moments Lab Blog](https://www.momentslab.com/blog/what-is-ai-video-discovery-an-updated-guide-for-2026)
- [UX/UI Trends in Discoverability](https://medium.com/@rayna27/ux-ui-trends-in-discoverability-5ead3ac0f331)

**Save Later UX:**
- [The Ultimate Video Inspiration Organizer for YouTube and Vimeo | Eagle Blog](https://eagle.cool/blog/post/the-ultimate-video-inspiration-organizer-for-youtube-and-vimeo)

---

## 11. Open Questions & Future Enhancements

### Open Questions

1. **API Key Security:** Should the YouTube API key be exposed in frontend code (via `VITE_YOUTUBE_API_KEY`)?
   - **Risk:** API key visible in client bundle → quota exhaustion attacks
   - **Mitigation:** Backend proxy endpoint (`/api/youtube/search` → internal YouTube API call)
   - **Decision:** MVP uses client-side calls (acceptable for 10k quota). Post-MVP: backend proxy.

2. **Already-Added Detection Performance:** Checking `isAlreadyAdded` for every search result loops through full content list.
   - **Risk:** Slow with 1,000+ videos in library
   - **Mitigation:** Build URL→ID lookup Map in derived state
   - **Defer:** Not a problem until 500+ videos

3. **Search Result Freshness:** Should search results update in real-time as videos are added?
   - **Current:** "Add" button updates to "✓ Added" immediately (via optimistic update)
   - **Good enough:** No need for WebSocket/polling
   - **Decision:** Current approach sufficient

### Future Enhancements (Post-v1.1)

**v1.2: Video Details Modal**
- Click thumbnail → modal with full description, tags, embedded player preview
- "Add to Library" button in modal

**v1.3: Playlist Import**
- Paste YouTube playlist URL → bulk import all videos
- Progress indicator (e.g., "Adding 15/50 videos...")

**v1.4: Trending Section**
- Dedicated "Trending" tab using `chart=mostPopular` parameter
- Regional trending (use user's location or manual selection)

**v1.5: Advanced Search**
- Search within specific channels (`channelId` filter)
- Search by upload date range (start + end dates)
- Search by view count range

**v1.6: Search History & Saved Searches**
- Persist recent searches in localStorage
- "Save Search" button → bookmark query + filters for quick access

**v2.0: Recommendation Engine**
- "Videos similar to [content you've rated highly]"
- Uses YouTube's `relatedToVideoId` search parameter
- Personalized feed based on user's perspective patterns

---

## 12. Risk Assessment

| Risk | Severity | Likelihood | Mitigation |
|------|----------|------------|------------|
| **Quota exhaustion** | High | Medium | Aggressive caching (5-15 min stale time), debouncing, "Load More" over infinite scroll |
| **API key exposure** | Medium | High | Accept for MVP (10k quota sufficient); post-MVP backend proxy |
| **Duplicate video detection** | Low | Low | Check existing content URLs before adding (already implemented) |
| **YouTube API downtime** | Medium | Low | Error handling with user-friendly messages, retry logic |
| **Slow search performance** | Low | Low | Debouncing (300ms), loading indicators, skeleton states |
| **CORS errors** | Low | Medium | YouTube API supports CORS; if issues arise, use backend proxy |

---

## 13. Success Criteria

**Phase 1 (Search MVP) Complete When:**
- [ ] User can search YouTube and see 25 results
- [ ] Results display thumbnail, title, channel, description, publish date
- [ ] "Add to Library" button works for all results
- [ ] "Already Added" detection disables button for duplicates
- [ ] "Load More" pagination fetches next page
- [ ] Loading/error states handle all API responses
- [ ] Quota usage <500 units/day (50 searches with caching)

**Phase 3 (Full Discover) Complete When:**
- [ ] Category grid displays 15+ categories with icons
- [ ] Clicking category filters search results
- [ ] Duration, date, sort filters work correctly
- [ ] Search + filters can be combined
- [ ] Empty states show when no results
- [ ] Page is responsive (mobile, tablet, desktop)

**Quality Gates:**
- [ ] No XSS vulnerabilities (sanitize search input, video metadata)
- [ ] No layout shift (skeleton loaders for images)
- [ ] Accessibility: Keyboard navigation works (Tab, Enter, Esc)
- [ ] Performance: Time to Interactive <3s on 3G

---

**End of Research Document**
