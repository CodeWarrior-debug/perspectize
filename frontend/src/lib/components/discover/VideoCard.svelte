<script lang="ts">
	import type { VideoItem } from '$lib/services/youtubeApi';
	import { Button } from '$lib/components/shadcn';
	import { cleanDescription, formatDate } from '$lib/utils/formatting';
	import CheckIcon from '@lucide/svelte/icons/check';

	let {
		video,
		isInLibrary = false,
		isPending = false,
		onAdd,
	}: {
		video: VideoItem;
		isInLibrary?: boolean;
		isPending?: boolean;
		onAdd: (videoId: string) => void;
	} = $props();

	const description = $derived(cleanDescription(video.description, video.title));

	const thumbnailUrl = $derived(
		video.thumbnails.medium?.url ?? video.thumbnails.high?.url ?? video.thumbnails.default?.url ?? '',
	);

	let thumbnailContainer: HTMLDivElement | null = $state(null);
	let isVisible = $state(false);

	// Lazy-load the thumbnail image: only fetch it once the card scrolls near
	// the viewport, so a long results/trending list doesn't fire dozens of
	// image requests up front.
	$effect(() => {
		if (!thumbnailContainer || isVisible) return;
		const observer = new IntersectionObserver(
			(entries) => {
				if (entries[0]?.isIntersecting) {
					isVisible = true;
				}
			},
			{ rootMargin: '200px' },
		);
		observer.observe(thumbnailContainer);
		return () => observer.disconnect();
	});
</script>

<!-- Named generically: renders both search.list and videos.list (trending) items identically. -->
<div class="flex flex-col sm:flex-row gap-4 p-3 border border-border rounded-lg bg-card text-card-foreground shadow-sm">
	<div bind:this={thumbnailContainer} class="w-full sm:w-80 h-45 sm:h-[180px] shrink-0">
		{#if isVisible}
			<img src={thumbnailUrl} alt={video.title} width="320" height="180" class="w-full h-full object-cover rounded" />
		{:else}
			<div class="w-full h-full bg-muted rounded"></div>
		{/if}
	</div>
	<div class="flex-1 min-w-0">
		<h3 class="font-medium line-clamp-2">{video.title}</h3>
		<p class="text-sm text-muted-foreground mt-1">{video.channelTitle}</p>
		<p class="text-xs text-muted-foreground mt-1">{formatDate(video.publishedAt)}</p>
		{#if description}
			<p class="text-sm text-muted-foreground mt-2 line-clamp-2">{description}</p>
		{/if}
	</div>
	<div class="shrink-0 self-start">
		{#if isInLibrary}
			<Button variant="outline" size="sm" disabled>
				<CheckIcon class="size-4" />
				In Library
			</Button>
		{:else}
			<Button variant="default" size="sm" onclick={() => onAdd(video.id)} disabled={isPending}>
				{isPending ? 'Adding...' : 'Add to Library'}
			</Button>
		{/if}
	</div>
</div>
