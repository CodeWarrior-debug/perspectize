<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import PageWrapper from '$lib/components/PageWrapper.svelte';
	import SearchBar from '$lib/components/discover/SearchBar.svelte';
	import FilterBar from '$lib/components/discover/FilterBar.svelte';
	import VideoResultsGrid from '$lib/components/discover/VideoResultsGrid.svelte';
	import { Button } from '$lib/components/shadcn';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_CONTENT, type ContentResponse } from '$lib/queries/content';
	import { queryKeys } from '$lib/queries/keys';
	import { useAddVideo } from '$lib/queries/content/useAddVideo';
	import {
		fetchYouTubeSearch,
		fetchYouTubeTrending,
		toVideoItem,
		toWatchUrl,
		youtubeKeys,
		type SearchFilters,
		type VideoItem,
	} from '$lib/services/youtubeApi';

	let searchQuery = $state('');
	let debouncedQuery = $state('');
	let searchInputRef: HTMLInputElement | null = $state(null);

	// Filters only apply to search (videos.list?chart=mostPopular, used for
	// Trending, does not support duration/date/order params).
	let filters = $state<SearchFilters>({ videoDuration: undefined, publishedAfter: undefined, order: 'relevance' });

	// Internal view seam (not a visible toggle yet): a future Browse mode can
	// extend this union ('search' | 'trending' | 'browse') and slot into the
	// same layout without reworking the page.
	const view = $derived<'search' | 'trending'>(debouncedQuery ? 'search' : 'trending');

	const searchResult = createQuery(() => ({
		queryKey: youtubeKeys.search(debouncedQuery, filters),
		queryFn: () => fetchYouTubeSearch({ query: debouncedQuery, ...filters }),
		enabled: view === 'search',
		staleTime: 5 * 60 * 1000,
	}));

	const trendingResult = createQuery(() => ({
		queryKey: youtubeKeys.trending(),
		queryFn: () => fetchYouTubeTrending(),
		enabled: view === 'trending',
		staleTime: 60 * 60 * 1000,
	}));

	// Accumulated results (first page from the active query + any Load More pages).
	let allResults = $state<VideoItem[]>([]);
	let nextPageToken = $state<string | undefined>(undefined);
	let isLoadingMore = $state(false);
	let loadMoreError = $state<string | null>(null);

	// Sync accumulated results whenever the active query's (first-page) data
	// changes. Because each view has its own dedicated query/queryKey, this
	// also naturally resets accumulation when the search query or view changes.
	$effect(() => {
		if (view === 'search') {
			const data = searchResult.data;
			allResults = data ? data.items.map(toVideoItem) : [];
			nextPageToken = data?.nextPageToken;
		} else {
			const data = trendingResult.data;
			allResults = data ? data.items.map(toVideoItem) : [];
			nextPageToken = data?.nextPageToken;
		}
		loadMoreError = null;
	});

	function filtersEqual(a: SearchFilters, b: SearchFilters): boolean {
		return a.videoDuration === b.videoDuration && a.publishedAfter === b.publishedAfter && a.order === b.order;
	}

	async function handleLoadMore() {
		if (!nextPageToken || isLoadingMore) return;
		// Capture the query/view/filters this request is for. If the user changes
		// the search query, the filters, or the view flips between
		// search/trending while this request is in flight, the $effect above
		// will already have reset allResults/nextPageToken for the new query —
		// the guard below stops this now-stale response from clobbering that
		// newer state.
		const requestView = view;
		const requestQuery = debouncedQuery;
		const requestFilters = { ...filters };
		const requestToken = nextPageToken;

		isLoadingMore = true;
		loadMoreError = null;
		try {
			if (requestView === 'search') {
				const response = await fetchYouTubeSearch({
					query: requestQuery,
					pageToken: requestToken,
					...requestFilters,
				});
				if (view === requestView && debouncedQuery === requestQuery && filtersEqual(filters, requestFilters)) {
					allResults = [...allResults, ...response.items.map(toVideoItem)];
					nextPageToken = response.nextPageToken;
				}
			} else {
				const response = await fetchYouTubeTrending('US', requestToken);
				if (view === requestView && debouncedQuery === requestQuery) {
					allResults = [...allResults, ...response.items.map(toVideoItem)];
					nextPageToken = response.nextPageToken;
				}
			}
		} catch (err) {
			if (view === requestView && debouncedQuery === requestQuery && filtersEqual(filters, requestFilters)) {
				loadMoreError = err instanceof Error ? err.message : 'Failed to load more results';
			}
		} finally {
			// Always clear the in-flight flag (regardless of whether the query
			// changed), otherwise a stale request would leave Load More stuck
			// in its loading state for the new query, which owns its own
			// nextPageToken via the $effect above.
			isLoadingMore = false;
		}
	}

	// Library content, used to determine which results are already added.
	// Note: capped at the API's max page size (100) — an MVP tradeoff for
	// libraries larger than 100 items (see 15-CONTEXT.md quota/caching notes).
	const libraryQuery = createQuery(() => ({
		queryKey: queryKeys.content.lists(),
		queryFn: () => graphqlRequest<ContentResponse>(LIST_CONTENT, { first: 100, includeTotalCount: false }),
	}));

	const libraryUrls = $derived(
		new Set(
			(libraryQuery.data?.content.items ?? []).map((item) => item.url).filter((url): url is string => Boolean(url)),
		),
	);

	const addVideo = useAddVideo();
	let pendingId = $state<string | null>(null);

	function handleAdd(videoId: string) {
		pendingId = videoId;
		addVideo.mutate(toWatchUrl(videoId), {
			onSettled: () => {
				pendingId = null;
			},
		});
	}

	const activeQuery = $derived(view === 'search' ? searchResult : trendingResult);

	// Keyboard shortcuts: Cmd+K (Mac) / Ctrl+K (Win) focuses the search bar from
	// anywhere on the page; Escape clears the query, which flips `view` back to
	// 'trending' via the derived state above.
	//
	// Guard: FilterBar's bits-ui Select popovers also close on Escape. Bits-ui
	// mounts the open listbox's content in the DOM only while it is open (see
	// SelectContent's presence-based mount), so a `[role="listbox"]` element in
	// the document is a reliable "a select dropdown is currently open" signal.
	// When that's the case, treat Escape as "close the dropdown" only — don't
	// also wipe the user's search/filters as a side effect.
	$effect(() => {
		function handleKeydown(event: KeyboardEvent) {
			const isModK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
			if (isModK) {
				event.preventDefault();
				searchInputRef?.focus();
			} else if (event.key === 'Escape') {
				if (document.querySelector('[role="listbox"]')) {
					return;
				}
				event.preventDefault();
				searchQuery = '';
				debouncedQuery = '';
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	interface ErrorInfo {
		message: string;
		showRetry: boolean;
	}

	// Classifies a query error into the specific user-facing message the task
	// calls for: quota exceeded (403) gets a targeted message with no retry
	// (retrying immediately won't help), network failures and anything else
	// get a generic message plus a retry button.
	function classifyError(error: unknown): ErrorInfo {
		if (error instanceof TypeError) {
			return { message: 'Unable to reach YouTube. Check your connection.', showRetry: true };
		}
		const message = error instanceof Error ? error.message : '';
		if (message.includes('403')) {
			return {
				message: 'YouTube API quota exceeded. Try again tomorrow or reduce search frequency.',
				showRetry: false,
			};
		}
		return { message: 'Something went wrong.', showRetry: true };
	}

	const queryClient = useQueryClient();

	function handleRetry() {
		if (view === 'search') {
			queryClient.refetchQueries({ queryKey: youtubeKeys.searches() });
		} else {
			queryClient.refetchQueries({ queryKey: youtubeKeys.trending() });
		}
	}
</script>

<PageWrapper>
	<div class="flex flex-col gap-6">
		<div>
			<h1 class="text-2xl md:text-3xl font-semibold text-foreground">Discover</h1>
			<p class="text-sm text-muted-foreground mt-1">Search YouTube and add videos to your library</p>
		</div>

		<SearchBar bind:value={searchQuery} bind:debouncedQuery bind:inputRef={searchInputRef} />

		{#if view === 'search'}
			<FilterBar bind:filters />
		{/if}

		{#if activeQuery.isError}
			{@const errorInfo = classifyError(activeQuery.error)}
			<div class="flex flex-col items-center gap-3 py-12 text-center">
				<p class="text-sm text-destructive">{errorInfo.message}</p>
				{#if errorInfo.showRetry}
					<Button variant="outline" size="sm" onclick={handleRetry}>Retry</Button>
				{/if}
			</div>
		{:else}
			<VideoResultsGrid
				items={allResults}
				{nextPageToken}
				onLoadMore={handleLoadMore}
				{libraryUrls}
				label={view === 'trending' ? 'Showing Trending Content' : undefined}
				onAdd={handleAdd}
				{pendingId}
				isLoading={activeQuery.isLoading}
				{isLoadingMore}
				query={debouncedQuery}
			/>
			{#if loadMoreError}
				<p class="text-sm text-destructive">{loadMoreError}</p>
			{/if}
		{/if}
	</div>
</PageWrapper>
