# Phase 15: Discover Page — Context

## Phase Goal

Enable YouTube search and category browsing to discover new content outside the library.

## Problem Statement

From FEATURE_BACKLOG.md:

"The v1 home page is an Activity page — a data table of user activity on videos already in the system. A future Discover page would be a separate page for finding new content outside the system."

Current flow requires users to:
1. Find video on YouTube
2. Copy URL
3. Paste in Add Video dialog

Target flow:
1. Search directly in Perspectize
2. One-click add

## Research Summary

See `.planning/v1.1-research/DISCOVER-PAGE.md` for full research.

**YouTube API endpoints:**
- `search.list` — 100 quota units per call, returns video IDs with snippets
- `videoCategories.list` — 1 quota unit, returns category list
- Default quota: 10,000 units/day (~100 searches)

**Quota management:**
- 300ms debounce on search input
- 5-minute stale time for search results
- 24-hour cache for categories
- Display quota usage to user

**UX decision:** "Load More" button over infinite scroll
- Better footer accessibility
- User control (calm browsing philosophy)
- Clear stopping points

## Page Structure

**Scope note (2026-08-14):** Category Browse is deferred out of v1 — see `15-03-PLAN.md` (marked `status: skipped`). The default (no-query) view is now YouTube Trending (`videos.list?chart=mostPopular`) rather than a category grid. The page holds an internal `view: 'search' | 'trending'` state as a code seam so Browse can be added as a third view later without restructuring — no visible tab/toggle UI ships yet.

```
/discover
├── SearchBar (debounced input, placeholder "Search Content Sources...")
├── FilterBar (duration, date, sort — search view only)
└── VideoResultsGrid (video cards, "Add to Library" button)
    ├── trending view: label "Showing Trending Content" + mostPopular chart results
    └── search view: search.list results
```

`VideoResultsGrid`/`VideoCard` are generic (not search-specific) so the same components render both trending and search result sets, and can later render Browse results too. A small adapter in `youtubeApi.ts` normalizes `search.list` and `videos.list` snippet shapes into one common `VideoItem` type before either component sees them.

## Component Architecture

```svelte
<!-- /discover/+page.svelte -->
<script lang="ts">
    import { SearchBar, FilterBar, VideoResultsGrid } from '$lib/components/discover';

    let searchQuery = $state('');
    let debouncedQuery = $state('');
    let filters = $state({ duration: 'any', date: 'any', sort: 'relevance' });
    const view = $derived<'search' | 'trending'>(debouncedQuery ? 'search' : 'trending');
</script>

<PageWrapper>
    <h1 class="text-2xl font-bold mb-4">Discover</h1>

    <SearchBar bind:value={searchQuery} bind:debouncedQuery />

    {#if view === 'search'}
        <FilterBar bind:filters />
    {/if}

    <VideoResultsGrid
        items={/* normalized VideoItem[] from active query */}
        label={view === 'trending' ? 'Showing Trending Content' : undefined}
    />
</PageWrapper>
```

## YouTube API Integration

```typescript
// Direct frontend call (MVP approach)
// Note: API key exposed in frontend code — acceptable for MVP with 10k quota

const YOUTUBE_API_KEY = import.meta.env.VITE_YOUTUBE_API_KEY;

interface SearchParams {
    query: string;
    maxResults?: number;
    pageToken?: string;
    duration?: 'any' | 'short' | 'medium' | 'long';
    uploadDate?: 'any' | 'hour' | 'today' | 'week' | 'month' | 'year';
    order?: 'relevance' | 'date' | 'viewCount' | 'rating';
    categoryId?: string;
}

async function searchYouTube(params: SearchParams) {
    const url = new URL('https://www.googleapis.com/youtube/v3/search');
    url.searchParams.set('key', YOUTUBE_API_KEY);
    url.searchParams.set('part', 'snippet');
    url.searchParams.set('type', 'video');
    url.searchParams.set('q', params.query);
    url.searchParams.set('maxResults', String(params.maxResults ?? 10));

    if (params.pageToken) url.searchParams.set('pageToken', params.pageToken);
    if (params.duration !== 'any') url.searchParams.set('videoDuration', params.duration);
    if (params.order) url.searchParams.set('order', params.order);
    if (params.categoryId) url.searchParams.set('videoCategoryId', params.categoryId);

    // Upload date filter
    if (params.uploadDate !== 'any') {
        const now = new Date();
        const published = {
            hour: new Date(now.getTime() - 60 * 60 * 1000),
            today: new Date(now.setHours(0, 0, 0, 0)),
            week: new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000),
            month: new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000),
            year: new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000),
        }[params.uploadDate];
        url.searchParams.set('publishedAfter', published.toISOString());
    }

    const response = await fetch(url);
    return response.json();
}
```

## TanStack Query Integration

```typescript
// Query key for search
export const discoverKeys = {
    all: ['discover'] as const,
    search: (query: string, filters: Filters) =>
        [...discoverKeys.all, 'search', query, filters] as const,
    categories: () => [...discoverKeys.all, 'categories'] as const,
};

// Search query with debouncing
const searchResults = createQuery(() => ({
    queryKey: discoverKeys.search(debouncedQuery, filters),
    queryFn: () => searchYouTube({ query: debouncedQuery, ...filters }),
    enabled: !!debouncedQuery,
    staleTime: 5 * 60 * 1000, // 5 minutes
}));

// Categories query (long cache)
const categories = createQuery(() => ({
    queryKey: discoverKeys.categories(),
    queryFn: () => fetchYouTubeCategories(),
    staleTime: 24 * 60 * 60 * 1000, // 24 hours
}));
```

## Add to Library Integration

```svelte
<!-- SearchResultCard.svelte -->
<script lang="ts">
    import { useAddVideo } from '$lib/hooks/useAddVideo';

    let { video, isInLibrary } = $props<{
        video: YouTubeSearchResult;
        isInLibrary: boolean;
    }>();

    const addVideo = useAddVideo();

    function handleAdd() {
        const url = `https://www.youtube.com/watch?v=${video.id.videoId}`;
        addVideo.mutate({ url });
    }
</script>

<Card class="flex gap-4 p-3">
    <img
        src={video.snippet.thumbnails.medium.url}
        alt={video.snippet.title}
        class="w-40 h-24 object-cover rounded"
    />
    <div class="flex-1">
        <h3 class="font-medium line-clamp-2">{video.snippet.title}</h3>
        <p class="text-sm text-muted-foreground">{video.snippet.channelTitle}</p>
    </div>
    {#if isInLibrary}
        <Badge variant="outline">In Library</Badge>
    {:else}
        <Button
            variant="outline"
            size="sm"
            onclick={handleAdd}
            disabled={addVideo.isPending}
        >
            {addVideo.isPending ? 'Adding...' : '+ Add'}
        </Button>
    {/if}
</Card>
```

## Requirements Covered

- DISC-01 through DISC-12 (all Discover page requirements)

## Success Metrics

| Metric | Current | Target |
|--------|---------|--------|
| Video discovery | External (YouTube) | In-app search |
| Clicks to add | 4+ (find, copy, paste, submit) | 2 (search, click add) |
| Category browsing | None | 15 YouTube categories |
| API quota usage | N/A | < 5,000 units/day |

## Dependencies

- Phase 13 (categories for browsing)
- YouTube API key (already have for existing YouTube integration)

## Risks

- **API quota exhaustion:** Aggressive caching mitigates, but monitor usage
- **API key exposure:** Frontend exposure acceptable for MVP, move to backend proxy later
- **Search quality:** YouTube's relevance ranking may not match user expectations

## Open Questions

1. Should search results show video duration? (Requires additional API call per video)
2. Should we track "already added" by caching all library video IDs?
3. Should category browsing show trending videos or just filter search?

---

*Context gathered: 2026-02-16*
