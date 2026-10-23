<script lang="ts">
	import MediaPlayer from '$lib/components/MediaPlayer.svelte';
	import LyricsLinks from '$lib/components/LyricsLinks.svelte';
	import {
		useMusicTrack,
		useRefreshLyrics,
		useMarkRelatedMediaUnavailable,
		usePromoteRelatedMedia,
	} from '$lib/queries/content/useMusicTrack';
	import { extractVideoIdFromUrl } from '$lib/utils/formatting';
	import { playbackQueue, lyricsNeedRecheck } from '$lib/utils/mediaPlayer';
	import type { RelatedMedia } from '$lib/queries/content';

	let { contentId, name, url, open }: { contentId: string; name: string; url: string | null; open: boolean } = $props();

	const track = useMusicTrack(() => (open ? contentId : null));
	const refreshLyrics = useRefreshLyrics();
	const markUnavailable = useMarkRelatedMediaUnavailable();
	const promote = usePromoteRelatedMedia();

	const data = $derived(track.data ?? null);
	const artist = $derived(data?.response?.artist ?? null);
	const related = $derived(data?.relatedMedia ?? []);
	const queue = $derived(playbackQueue(extractVideoIdFromUrl(url), related));

	// Ask the backend to re-check lyrics at most once per opened track; it decides
	// whether LRCLIB is actually called.
	const refreshed = new Set<string>();
	$effect(() => {
		const current = data;
		if (!open || !current || refreshed.has(current.id)) return;
		if (lyricsNeedRecheck(current.lyrics)) {
			refreshed.add(current.id);
			refreshLyrics.mutate(current.id);
		}
	});

	function handleUnplayable(videoId: string) {
		if (related.some((r) => r.videoId === videoId)) markUnavailable.mutate({ contentId, videoId });
	}

	const KIND_LABEL: Record<string, string> = {
		audio: 'Audio',
		official_video: 'Official video',
		lyric_video: 'Lyric video',
		live: 'Live',
		other: 'Other upload',
	};

	function kindLabel(r: RelatedMedia): string {
		return KIND_LABEL[r.kind] ?? 'Other upload';
	}
</script>

<div class="mt-3.5 space-y-4 border-t border-border pt-3.5" data-testid="music-track-panel">
	<MediaPlayer {queue} title={name} fallbackUrl={url} onUnplayable={handleUnplayable} />

	<LyricsLinks
		title={name}
		{artist}
		lyrics={data?.lyrics ?? null}
		youtubeMusicUrl={url}
		checking={refreshLyrics.isPending}
	/>

	{#if related.length}
		<div class="space-y-2 text-[13px]" data-testid="related-media">
			<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Other uploads of this song</div>
			<ul class="space-y-1.5">
				{#each related as r (r.videoId)}
					<li class="flex items-center justify-between gap-3" class:opacity-50={r.unavailable}>
						<div class="min-w-0">
							<span class="mr-1.5 rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{kindLabel(r)}</span
							>
							<a
								href={`https://www.youtube.com/watch?v=${r.videoId}`}
								target="_blank"
								rel="noopener noreferrer"
								class="text-foreground hover:underline">{r.title || 'YouTube upload'}</a
							>
							{#if r.unavailable}
								<span class="ml-1 text-[12px] text-muted-foreground">(can't be played here)</span>
							{/if}
						</div>
						{#if r.contentId}
							<span class="flex-none text-[12px] text-muted-foreground">In Perspectize</span>
						{:else}
							<button
								type="button"
								disabled={promote.isPending}
								onclick={() => promote.mutate({ contentId, videoId: r.videoId })}
								class="flex-none rounded-md border border-primary px-2.5 py-1 text-[12px] font-semibold text-primary hover:bg-primary/5 disabled:cursor-not-allowed disabled:opacity-60"
							>
								Add as its own item
							</button>
						{/if}
					</li>
				{/each}
			</ul>
		</div>
	{/if}
</div>
