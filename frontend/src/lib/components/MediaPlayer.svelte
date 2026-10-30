<script lang="ts">
	import { onDestroy } from 'svelte';
	import { embedUrl, parseEmbedMessage, EMBED_ORIGIN, LISTEN_COMMAND, PAUSE_COMMAND } from '$lib/utils/mediaPlayer';
	import { playerCoordinator } from '$lib/utils/playerCoordinator';

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
		/** Called once per video the embed rejects with 101/150 (ticket 03). Never for 153 or other codes. */
		onUnplayable?: (videoId: string, code: number) => void;
	} = $props();

	const playerId = `player-${Math.random().toString(36).slice(2)}`;
	let index = $state(0);
	let iframe = $state<HTMLIFrameElement | null>(null);
	let playState = $state<'idle' | 'playing' | 'paused'>('idle');
	let configError = $state(false);
	const current = $derived(queue[index] ?? null);
	const origin = typeof window === 'undefined' ? '' : window.location.origin;

	// A new queue (another track opened) starts from the top.
	$effect(() => {
		void queue;
		index = 0;
		configError = false;
	});

	function pause() {
		iframe?.contentWindow?.postMessage(PAUSE_COMMAND, EMBED_ORIGIN);
		playState = 'paused';
	}

	// Removing the player (modal closed, track changed) releases its slot.
	const unregister = playerCoordinator.register(playerId, pause);
	onDestroy(unregister);

	function handleLoad() {
		iframe?.contentWindow?.postMessage(LISTEN_COMMAND, EMBED_ORIGIN);
	}

	$effect(() => {
		const id = current;
		const frame = iframe;
		if (!id || !frame) return;
		const onMessage = (e: MessageEvent) => {
			if (e.source !== frame.contentWindow) return;
			const event = parseEmbedMessage(e.origin, e.data);
			if (!event) return;
			switch (event.type) {
				case 'playing':
					playState = 'playing';
					playerCoordinator.playing(playerId);
					break;
				case 'paused':
				case 'ended': // never auto-advance (ticket 03)
					playState = 'paused';
					break;
				case 'config':
					configError = true;
					break;
				case 'unplayable':
					if (event.markUnavailable) onUnplayable?.(id, event.code);
					playState = 'idle';
					index += 1;
					break;
			}
		};
		window.addEventListener('message', onMessage);
		return () => window.removeEventListener('message', onMessage);
	});
</script>

<div data-testid="media-player" data-state={playState}>
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
		{#if configError}
			<p role="status" class="mt-1.5 text-[12px] text-muted-foreground">
				This song can't start here because of a player setup problem (error 153), not the song. Use the link below.
			</p>
			{#if fallbackUrl}
				<a href={fallbackUrl} target="_blank" rel="noopener noreferrer" class="text-[12px] text-primary hover:underline"
					>{fallbackLabel}</a
				>
			{/if}
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
