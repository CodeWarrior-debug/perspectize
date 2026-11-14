<script lang="ts">
	import { tick } from 'svelte';
	import type { VideoItem } from '$lib/services/youtubeApi';
	import { Button } from '$lib/components/shadcn';
	import LibraryStatus from './LibraryStatus.svelte';
	import type { LibraryItem } from './libraryItem';
	import { formatDate, formatIsoDuration } from '$lib/utils/formatting';
	import GlassesIcon from '@lucide/svelte/icons/glasses';
	import PlayIcon from '@lucide/svelte/icons/play';

	let {
		video,
		libraryItem = null,
		isPending = false,
		onAdd,
		index = null,
	}: {
		video: VideoItem;
		/** The video's library row when it is already in the user's library, else null. */
		libraryItem?: LibraryItem | null;
		isPending?: boolean;
		onAdd: (videoId: string) => void;
		/** Position within the results list — the first couple of cards get fetchpriority="high"/eager loading on their thumbnail, since they're likely above the fold. */
		index?: number | null;
	} = $props();

	const durationLabel = $derived(video.duration ? formatIsoDuration(video.duration) : null);

	let mediaContainer: HTMLDivElement | null = $state(null);
	let iframeEl: HTMLIFrameElement | null = $state(null);
	// True once the player has been activated via an explicit "watch inline"
	// click/Enter/Space on the card — the iframe (a full YouTube document with
	// its own player JS/CSS/fonts) is never mounted just because the card
	// scrolled into view. Until then we show a static thumbnail <img> facade.
	let activated = $state(false);

	const iframeSrc = $derived(`https://www.youtube-nocookie.com/embed/${video.id}?autoplay=1`);

	const thumbnail = $derived(video.thumbnails.medium ?? video.thumbnails.high ?? video.thumbnails.default ?? null);
	const thumbnailSrcset = $derived.by(() => {
		const candidates = [video.thumbnails.medium, video.thumbnails.high].filter((t): t is NonNullable<typeof t> =>
			Boolean(t?.url && t.width),
		);
		return candidates.map((t) => `${t.url} ${t.width}w`).join(', ');
	});
	const isPriorityThumbnail = $derived(index !== null && index < 2);

	/** Preconnects the document to `origin` once, so the actual DNS/TLS/TCP handshake for the embed/thumbnail host isn't on the critical path when it's needed. */
	function preconnect(origin: string) {
		if (document.head.querySelector(`link[rel="preconnect"][href="${origin}"]`)) return;
		const link = document.createElement('link');
		link.rel = 'preconnect';
		link.href = origin;
		document.head.appendChild(link);
	}

	/** Warms the embed host connection on hover/focus, ahead of an activation click. */
	function preconnectEmbed() {
		if (!activated) preconnect('https://www.youtube-nocookie.com');
	}

	/**
	 * Card-body click/keyboard activation: "watch this now inline", not a
	 * link-out to YouTube. Mounts the iframe (with autoplay) on first
	 * activation; if it's already mounted, just focus it — no navigation, no
	 * new tab, no restart.
	 */
	async function activatePlayer() {
		activated = true;
		await tick();
		iframeEl?.focus();
		mediaContainer?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}

	function handleCardKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' || event.key === ' ') {
			event.preventDefault();
			activatePlayer();
		}
	}

	/** Stops the Add-to-Perspectize button from also triggering the card's own click-to-watch handler. */
	function stopPropagation(event: Event) {
		event.stopPropagation();
	}
</script>

<!-- Named generically: renders both search.list and videos.list (trending) items identically. -->
<!-- svelte-ignore a11y_no_static_element_interactions, a11y_interactive_supports_focus, a11y_click_events_have_key_events: role="button" is on the div itself with an explicit onkeydown handler; the a11y lints don't see that pairing. -->
<div
	role="button"
	tabindex="0"
	aria-label={`Watch ${video.title} inline`}
	onclick={activatePlayer}
	onkeydown={handleCardKeydown}
	onpointerenter={preconnectEmbed}
	onfocusin={preconnectEmbed}
	class="group flex flex-col sm:flex-row gap-4 p-3 border border-border rounded-lg bg-card text-card-foreground shadow-sm cursor-pointer outline-none transition-colors hover:bg-accent/40 focus-visible:ring-[3px] focus-visible:ring-ring/50"
>
	<div bind:this={mediaContainer} class="w-full sm:w-80 h-45 sm:h-[180px] shrink-0 relative">
		{#if activated}
			<iframe
				bind:this={iframeEl}
				src={iframeSrc}
				title={video.title}
				class="w-full h-full rounded"
				allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
				allowfullscreen
				loading="lazy"
			></iframe>
		{:else if thumbnail}
			<img
				src={thumbnail.url}
				srcset={thumbnailSrcset || undefined}
				sizes="(min-width: 640px) 320px, 100vw"
				width={thumbnail.width ?? 320}
				height={thumbnail.height ?? 180}
				alt={video.title}
				loading={isPriorityThumbnail ? 'eager' : 'lazy'}
				decoding="async"
				fetchpriority={isPriorityThumbnail ? 'high' : 'auto'}
				class="w-full h-full object-cover rounded"
			/>
			<span
				aria-hidden="true"
				class="absolute inset-0 flex items-center justify-center rounded bg-black/10 transition-colors group-hover:bg-black/20"
			>
				<span class="flex items-center justify-center size-12 rounded-full bg-black/60 text-white">
					<PlayIcon class="size-6 translate-x-0.5" fill="currentColor" />
				</span>
			</span>
		{:else}
			<div class="w-full h-full bg-muted rounded flex items-center justify-center">
				<span aria-hidden="true" class="flex items-center justify-center size-12 rounded-full bg-black/60 text-white">
					<PlayIcon class="size-6 translate-x-0.5" fill="currentColor" />
				</span>
			</div>
		{/if}
		{#if durationLabel}
			<span class="absolute bottom-1 right-1 bg-black/80 text-white text-xs px-1.5 py-0.5 rounded pointer-events-none">
				{durationLabel}
			</span>
		{/if}
	</div>
	<div class="flex-1 min-w-0">
		<h3 class="font-medium line-clamp-2">{video.title}</h3>
		<p class="text-sm text-muted-foreground mt-1">{video.channelTitle}</p>
		<p class="text-xs text-muted-foreground mt-1">{formatDate(video.publishedAt)}</p>
		<p class="text-sm text-muted-foreground mt-2 line-clamp-2">{video.description}</p>
	</div>
	<div class="shrink-0 self-start w-full sm:w-56">
		{#if libraryItem}
			<LibraryStatus contentId={libraryItem.id} contentName={libraryItem.name} />
		{:else}
			<Button
				variant="default"
				size="sm"
				onclick={(event: MouseEvent) => {
					stopPropagation(event);
					onAdd(video.id);
				}}
				disabled={isPending}
			>
				<GlassesIcon class="size-4" />
				{isPending ? 'Adding...' : 'Add to Perspectize'}
			</Button>
		{/if}
	</div>
</div>
