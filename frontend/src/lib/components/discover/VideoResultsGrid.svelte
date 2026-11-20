<script lang="ts">
	import type { LibraryItem } from './libraryItem';
	import type { VideoItem } from '$lib/services/youtubeApi';
	import { toWatchUrl } from '$lib/services/youtubeApi';
	import { Button } from '$lib/components/shadcn';
	import VideoCard from './VideoCard.svelte';

	let {
		items,
		nextPageToken,
		onLoadMore,
		library,
		label,
		onAdd,
		pendingId = null,
		isLoading = false,
		isLoadingMore = false,
		query = '',
	}: {
		items: VideoItem[];
		nextPageToken?: string;
		onLoadMore: () => void;
		library: ReadonlyMap<string, LibraryItem>;
		label?: string;
		onAdd: (videoId: string) => void;
		pendingId?: string | null;
		isLoading?: boolean;
		isLoadingMore?: boolean;
		/** The active search query, if any — used to tailor the empty-state message. */
		query?: string;
	} = $props();
</script>

<!-- SkeletonCard: animated pulse placeholder matching VideoCard's dimensions, used while a search/trending/load-more fetch is in flight. -->
{#snippet skeletonCards(count: number)}
	{#each Array(count) as _, i (i)}
		<div class="flex flex-col sm:flex-row gap-4 p-3 border border-border rounded-lg bg-card animate-pulse">
			<div class="w-full sm:w-80 h-45 sm:h-[180px] bg-muted rounded shrink-0"></div>
			<div class="flex-1 space-y-2 py-1">
				<div class="h-4 bg-muted rounded w-3/4"></div>
				<div class="h-3 bg-muted rounded w-1/3"></div>
				<div class="h-3 bg-muted rounded w-1/4"></div>
				<div class="h-3 bg-muted rounded w-full"></div>
			</div>
		</div>
	{/each}
{/snippet}

<!-- Named generically: renders both search results and trending results (and future Browse results). -->
<div class="flex flex-col gap-4">
	{#if label}
		<p class="text-sm font-medium text-muted-foreground">{label}</p>
	{/if}

	{#if isLoading}
		<div class="flex flex-col gap-4" aria-busy="true" aria-label="Loading videos">
			{@render skeletonCards(6)}
		</div>
	{:else if items.length === 0}
		{#if query}
			<div class="text-center py-12">
				<p class="text-sm text-muted-foreground">No results found for '{query}'</p>
				<p class="text-xs text-muted-foreground mt-1">Try different keywords or check your spelling</p>
			</div>
		{:else}
			<p class="text-sm text-muted-foreground text-center py-12">No trending content available right now</p>
		{/if}
	{:else}
		<div class="flex flex-col gap-4">
			{#each items as video, index (video.id)}
				<VideoCard
					{video}
					{index}
					libraryItem={library.get(toWatchUrl(video.id)) ?? null}
					isPending={pendingId === video.id}
					{onAdd}
				/>
			{/each}

			{#if isLoadingMore}
				{@render skeletonCards(3)}
			{/if}
		</div>

		{#if nextPageToken}
			<div class="flex justify-center py-4">
				<Button variant="outline" onclick={onLoadMore} disabled={isLoadingMore}>
					{isLoadingMore ? 'Loading...' : 'Load More'}
				</Button>
			</div>
		{/if}
	{/if}
</div>
