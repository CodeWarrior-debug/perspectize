<script lang="ts">
	import { embedUrl, parseEmbedMessage, EMBED_ORIGIN } from '$lib/utils/mediaPlayer';

	let {
		queue,
		title,
		fallbackUrl,
		fallbackLabel = 'Open in YouTube Music',
		onUnplayable,
	}: {
		/** Video IDs in the order to try them. */
		queue: string[];
		title: string;
		fallbackUrl: string | null;
		fallbackLabel?: string;
		/** Called once per video that turns out not to be embeddable. */
		onUnplayable?: (videoId: string) => void;
	} = $props();

	let index = $state(0);
	let iframe = $state<HTMLIFrameElement | null>(null);
	const current = $derived(queue[index] ?? null);
	const origin = typeof window === 'undefined' ? '' : window.location.origin;

	// A new queue (another track opened) starts from the top.
	$effect(() => {
		void queue;
		index = 0;
	});

	// The embed only posts events after the parent says it is listening.
	function handleLoad() {
		iframe?.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'perspectize-player' }), EMBED_ORIGIN);
	}

	$effect(() => {
		const id = current;
		const frame = iframe;
		if (!id || !frame) return;
		const onMessage = (e: MessageEvent) => {
			if (e.source !== frame.contentWindow) return;
			const event = parseEmbedMessage(e.origin, e.data);
			if (event?.type === 'unplayable') {
				onUnplayable?.(id);
				index += 1;
			}
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});
</script>

<div data-testid="media-player">
	{#if current}
		{#key current}
			<div class="aspect-video w-full overflow-hidden rounded-md bg-muted">
				<iframe
					bind:this={iframe}
					src={embedUrl(current, origin)}
					{title}
					class="h-full w-full"
					allow="encrypted-media; picture-in-picture; fullscreen"
					referrerpolicy="strict-origin-when-cross-origin"
					onload={handleLoad}
				></iframe>
			</div>
		{/key}
		{#if index > 0}
			<p class="mt-1.5 text-[12px] text-muted-foreground">
				The main upload can't be played here, so this is another upload of the same song.
			</p>
		{/if}
	{:else}
		<div class="rounded-md border border-border bg-muted px-3 py-4 text-[13px] text-muted-foreground">
			<p>This song can't be played inside Perspectize.</p>
			{#if fallbackUrl}
				<a
					href={fallbackUrl}
					target="_blank"
					rel="noopener noreferrer"
					class="mt-1 inline-block text-primary hover:underline"
				>
					{fallbackLabel}
				</a>
			{/if}
		</div>
	{/if}
</div>
