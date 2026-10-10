<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import PageWrapper from '$lib/components/PageWrapper.svelte';
	import SearchBar from '$lib/components/discover/SearchBar.svelte';
	import MovieSearchPanel from '$lib/components/discover/MovieSearchPanel.svelte';
	import VideoResultsGrid from '$lib/components/discover/VideoResultsGrid.svelte';
	import { Button } from '$lib/components/shadcn';
	import { graphqlRequest } from '$lib/queries/client';
	import {
		LIST_CONTENT,
		type ContentResponse,
		type ContentItem,
		type CreateContentResponse,
	} from '$lib/queries/content';
	import { queryKeys } from '$lib/queries/keys';
	import { useAddVideo } from '$lib/queries/content/useAddVideo';
	import { useAddMovie } from '$lib/queries/content/useAddMovie';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { fetchYouTubeTrending, toWatchUrl, youtubeKeys, type VideoItem } from '$lib/services/youtubeApi';

	// Two sources share this page. The choice lives in the URL (?source=movies),
	// so a reload or a shared link lands on the same tab. YouTube is the default.
	type Source = 'youtube' | 'movies';
	const source = $derived<Source>(page.url.searchParams.get('source') === 'movies' ? 'movies' : 'youtube');

	function setSource(next: Source) {
		if (next === source) return;
		const url = new URL(page.url);
		if (next === 'movies') url.searchParams.set('source', 'movies');
		else url.searchParams.delete('source');
		goto(`${url.pathname}${url.search}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	// The search box hands off to youtube.com (search.list is capped at 100
	// calls a day per project), so Trending is the page's only in-app feed.
	// It is served from the backend cache — see youtubeApi.ts.
	let searchQuery = $state('');
	let searchInputRef: HTMLInputElement | null = $state(null);

	// Movies source: the panel owns its search; the page owns the input ref
	// (for Cmd/Ctrl+K), the typed text (for Escape), and the add mutation.
	let movieQuery = $state('');
	let movieInputRef: HTMLInputElement | null = $state(null);
	let pendingMovieUrl = $state<string | null>(null);
	const addMovie = useAddMovie();

	function handleAddMovie(url: string, { clearOnSuccess = false } = {}) {
		pendingMovieUrl = url;
		addMovie.mutate(url, {
			onSuccess: () => {
				// A pasted link is cleared once added, like the YouTube search box.
				if (clearOnSuccess) movieQuery = '';
			},
			onSettled: () => {
				pendingMovieUrl = null;
			},
		});
	}

	const trendingResult = createQuery(() => ({
		queryKey: youtubeKeys.trending(),
		queryFn: () => fetchYouTubeTrending(),
		staleTime: 60 * 60 * 1000,
		gcTime: 24 * 60 * 60 * 1000,
		enabled: source === 'youtube',
	}));

	// Accumulated results (first page from the query + any Load More pages).
	let allResults = $state<VideoItem[]>([]);
	let nextPageToken = $state<string | undefined>(undefined);
	let isLoadingMore = $state(false);
	let loadMoreError = $state<string | null>(null);

	// Reset accumulation whenever the first page changes (initial load, refetch).
	$effect(() => {
		const data = trendingResult.data;
		allResults = data ? data.items : [];
		nextPageToken = data?.nextPageToken;
		loadMoreError = null;
	});

	async function handleLoadMore() {
		if (!nextPageToken || isLoadingMore) return;
		const requestToken = nextPageToken;
		isLoadingMore = true;
		loadMoreError = null;
		try {
			const response = await fetchYouTubeTrending('US', requestToken);
			// Ignore a response that lands after a refetch replaced the first page.
			if (nextPageToken === requestToken) {
				allResults = [...allResults, ...response.items];
				nextPageToken = response.nextPageToken;
			}
		} catch {
			if (nextPageToken === requestToken) {
				loadMoreError = 'Could not load more trending videos. Try again in a moment.';
			}
		} finally {
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

	// Full content metadata for videos added THIS session, keyed by video id —
	// populated from CreateContentFromYouTube's response so VideoCard can
	// render the inline details card (duration/views/likes/channel/category)
	// plus working Add-perspective/Compare links right after a successful add.
	// Pre-existing already-tracked videos (found via libraryUrls below) don't
	// get an entry here and fall back to VideoCard's disabled "In Library"
	// state — see VideoCard.svelte's isInLibrary branch for why.
	let addedContentByVideoId = $state<Map<string, ContentItem>>(new Map());

	const meCtx = useMe();
	const currentUserId = $derived(meCtx.me ? parseInt(meCtx.me.id, 10) : null);

	function handleAdd(videoId: string) {
		pendingId = videoId;
		addVideo.mutate(toWatchUrl(videoId), {
			onSuccess: (data: CreateContentResponse) => {
				const content = data?.createContentFromYouTube?.content;
				if (content) {
					addedContentByVideoId = new Map(addedContentByVideoId).set(videoId, content);
				}
			},
			onSettled: () => {
				pendingId = null;
			},
		});
	}

	// A YouTube link pasted into the search box is added directly.
	let isAddingUrl = $state(false);
	function handleAddUrl(url: string) {
		isAddingUrl = true;
		addVideo.mutate(url, {
			onSuccess: () => {
				searchQuery = '';
			},
			onSettled: () => {
				isAddingUrl = false;
			},
		});
	}

	// Keyboard shortcuts: Cmd+K (Mac) / Ctrl+K (Win) focuses the search box of the
	// active source from anywhere on the page; Escape clears it.
	$effect(() => {
		function handleKeydown(event: KeyboardEvent) {
			const isModK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
			if (isModK) {
				event.preventDefault();
				(source === 'movies' ? movieInputRef : searchInputRef)?.focus();
			} else if (event.key === 'Escape') {
				if (source === 'movies' && movieQuery) {
					event.preventDefault();
					movieQuery = '';
				} else if (source === 'youtube' && searchQuery) {
					event.preventDefault();
					searchQuery = '';
				}
			}
		}
		window.addEventListener('keydown', handleKeydown);
		return () => window.removeEventListener('keydown', handleKeydown);
	});

	interface ErrorInfo {
		message: string;
		showRetry: boolean;
	}

	// Network failures get a connection message; anything else (quota, YouTube
	// outage — the backend reports both as "trending is unavailable") gets a
	// generic one. Both can be retried: the backend cache refills on success.
	function classifyError(error: unknown): ErrorInfo {
		if (error instanceof TypeError) {
			return { message: 'Unable to reach Perspectize. Check your connection.', showRetry: true };
		}
		return { message: 'Trending is unavailable right now.', showRetry: true };
	}

	const queryClient = useQueryClient();

	function handleRetry() {
		queryClient.refetchQueries({ queryKey: youtubeKeys.trending() });
	}
</script>

<PageWrapper>
	<div class="flex flex-col gap-6">
		<div>
			<h1 class="text-2xl md:text-3xl font-semibold text-foreground">Discover</h1>
			<p class="text-sm text-muted-foreground mt-1">
				{source === 'movies'
					? 'Search TMDB or browse trending movies and add them to Perspectize'
					: "Browse what's trending on YouTube and add videos to Perspectize"}
			</p>
		</div>

		<div
			role="tablist"
			aria-label="Discover source"
			class="flex gap-1 p-1 w-fit rounded-md bg-muted/60 border border-border"
		>
			<Button
				role="tab"
				aria-selected={source === 'youtube'}
				variant={source === 'youtube' ? 'default' : 'ghost'}
				size="sm"
				onclick={() => setSource('youtube')}
			>
				YouTube
			</Button>
			<Button
				role="tab"
				aria-selected={source === 'movies'}
				variant={source === 'movies' ? 'default' : 'ghost'}
				size="sm"
				onclick={() => setSource('movies')}
			>
				Movies
			</Button>
		</div>

		{#if source === 'movies'}
			<MovieSearchPanel
				bind:value={movieQuery}
				bind:inputRef={movieInputRef}
				{libraryUrls}
				pendingUrl={pendingMovieUrl}
				onAdd={handleAddMovie}
				onAddUrl={(url) => handleAddMovie(url, { clearOnSuccess: true })}
			/>
		{:else}
			<SearchBar
				bind:value={searchQuery}
				bind:inputRef={searchInputRef}
				onAddUrl={handleAddUrl}
				isAdding={isAddingUrl}
			/>

			{#if trendingResult.isError}
				{@const errorInfo = classifyError(trendingResult.error)}
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
					label="Trending on YouTube"
					onAdd={handleAdd}
					{pendingId}
					isLoading={trendingResult.isPending}
					{isLoadingMore}
					{addedContentByVideoId}
					userId={currentUserId}
				/>
				{#if loadMoreError}
					<p class="text-sm text-destructive">{loadMoreError}</p>
				{/if}
			{/if}
		{/if}
	</div>
</PageWrapper>
