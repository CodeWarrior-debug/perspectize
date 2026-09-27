<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import PageWrapper from '$lib/components/PageWrapper.svelte';
	import SearchBar from '$lib/components/discover/SearchBar.svelte';
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
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { fetchYouTubeTrending, toWatchUrl, youtubeKeys, type VideoItem } from '$lib/services/youtubeApi';

	// The search box hands off to youtube.com (search.list is capped at 100
	// calls a day per project), so Trending is the page's only in-app feed.
	// It is served from the backend cache — see youtubeApi.ts.
	let searchQuery = $state('');
	let searchInputRef: HTMLInputElement | null = $state(null);

	const trendingResult = createQuery(() => ({
		queryKey: youtubeKeys.trending(),
		queryFn: () => fetchYouTubeTrending(),
		staleTime: 60 * 60 * 1000,
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

	// Keyboard shortcuts: Cmd+K (Mac) / Ctrl+K (Win) focuses the search box from
	// anywhere on the page; Escape clears it.
	$effect(() => {
		function handleKeydown(event: KeyboardEvent) {
			const isModK = (event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k';
			if (isModK) {
				event.preventDefault();
				searchInputRef?.focus();
			} else if (event.key === 'Escape' && searchQuery) {
				event.preventDefault();
				searchQuery = '';
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
			<p class="text-sm text-muted-foreground mt-1">Browse what's trending on YouTube and add videos to Perspectize</p>
		</div>

		<SearchBar bind:value={searchQuery} bind:inputRef={searchInputRef} onAddUrl={handleAddUrl} isAdding={isAddingUrl} />

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
	</div>
</PageWrapper>
