<script lang="ts">
	import MediaPlayer from '$lib/components/MediaPlayer.svelte';
	import LyricsLinks from '$lib/components/LyricsLinks.svelte';
	import MusicGenrePicker from '$lib/components/MusicGenrePicker.svelte';
	import {
		useAudioTrack,
		useMusicGenres,
		useRefreshLyrics,
		useMarkRelatedMediaUnavailable,
		useMarkTrackLinkUnavailable,
		usePromoteRelatedMedia,
		useSetTrackGenre,
	} from '$lib/queries/content/useAudioTrack';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { playbackQueue, lyricsNeedRecheck } from '$lib/utils/mediaPlayer';
	import { PROVIDER_LABEL, type MusicProvider } from '$lib/utils/audioLinks';
	import { canChangeGenre } from '$lib/utils/genreTree';
	import type { RelatedMedia } from '$lib/queries/content';

	let { contentId, name, url, open }: { contentId: string; name: string; url: string | null; open: boolean } = $props();

	const track = useAudioTrack(() => (open ? contentId : null));
	const genresQuery = useMusicGenres(() => open);
	const refreshLyrics = useRefreshLyrics();
	const markRelated = useMarkRelatedMediaUnavailable();
	const markLink = useMarkTrackLinkUnavailable();
	const promote = usePromoteRelatedMedia();
	const setGenre = useSetTrackGenre();
	const meCtx = useMe();

	const data = $derived(track.data ?? null);
	const meta = $derived(data?.audioTrack ?? null);
	const artist = $derived(meta?.artist ?? null);
	const related = $derived(data?.relatedMedia ?? []);
	const links = $derived(data?.trackLinks ?? []);
	const listenLinks = $derived(links.filter((l) => l.kind === 'LISTEN'));
	const embedLinks = $derived(links.filter((l) => l.kind === 'EMBED' && !l.unavailableAt));
	// Embeddable YouTube links first, then the other uploads of the same song.
	const queue = $derived(playbackQueue(embedLinks[0]?.providerTrackId ?? null, related));
	const unofficial = $derived(meta?.videoType === 'MUSIC_VIDEO_TYPE_UGC');
	const youtubeMusicUrl = $derived(links.find((l) => l.provider === 'youtube')?.url ?? url);

	// Genre: the saved one, else a suggestion pre-filled (never saved without Save, ADR 0006).
	let picked = $state<string | null>(null);
	const suggested = $derived(meta?.suggestedGenreId ? String(meta.suggestedGenreId) : null);
	const shownGenre = $derived(picked ?? data?.genreId ?? suggested);
	const editable = $derived(!!data && canChangeGenre(data, meCtx.me?.id ?? null));
	const dirty = $derived(!!shownGenre && shownGenre !== data?.genreId);

	const refreshed = new Set<string>();
	$effect(() => {
		const current = data;
		if (!open || !current || refreshed.has(current.id)) return;
		if (lyricsNeedRecheck(current.lyrics)) {
			refreshed.add(current.id);
			refreshLyrics.mutate(current.id);
		}
	});

	// Only called for 101/150 (MediaPlayer). Per link, never re-checked in v1 (ticket 03).
	function handleUnplayable(videoId: string) {
		const link = embedLinks.find((l) => l.providerTrackId === videoId);
		if (link) markLink.mutate({ contentId, linkId: link.id });
		else if (related.some((r) => r.videoId === videoId)) markRelated.mutate({ contentId, videoId });
	}

	const KIND_LABEL: Record<string, string> = {
		audio: 'Audio',
		official_video: 'Official video',
		lyric_video: 'Lyric video',
		live: 'Live',
		other: 'Other upload',
	};
	const kindLabel = (r: RelatedMedia) => KIND_LABEL[r.kind] ?? 'Other upload';
	const providerLabel = (p: string) => PROVIDER_LABEL[p as MusicProvider] ?? p;
</script>

<div class="mt-3.5 space-y-4 border-t border-border pt-3.5" data-testid="audio-track-panel">
	<div class="flex flex-wrap items-center gap-2 text-[12px]">
		{#if meta?.explicit}
			<span aria-label="Explicit" title="Explicit" class="rounded-sm bg-muted px-1 font-bold text-foreground">E</span>
		{/if}
		{#if unofficial}
			<span class="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">Unofficial upload</span>
		{/if}
	</div>

	{#if open}
		<!-- Unmounting on close stops playback and frees the one-player slot (ticket 03). -->
		<MediaPlayer {queue} title={name} fallbackUrl={youtubeMusicUrl} onUnplayable={handleUnplayable} />
	{/if}

	{#if listenLinks.length}
		<div class="flex flex-wrap gap-2 text-[13px]" data-testid="listen-links">
			<span class="text-muted-foreground">Listen on</span>
			{#each listenLinks as l (l.id)}
				<a href={l.url} target="_blank" rel="noopener noreferrer" class="text-primary hover:underline"
					>{providerLabel(l.provider)}</a
				>
			{/each}
		</div>
	{/if}

	<div class="space-y-1.5 text-[13px]" data-testid="genre-section">
		<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Genre</div>
		{#if editable}
			<MusicGenrePicker
				genres={genresQuery.data ?? []}
				value={shownGenre}
				onSelect={(id) => (picked = id)}
				disabled={setGenre.isPending}
			/>
			{#if dirty}
				<button
					type="button"
					class="rounded-md border border-primary px-2.5 py-1 text-[12px] font-semibold text-primary disabled:opacity-60"
					disabled={setGenre.isPending}
					aria-label="Save genre"
					onclick={() => setGenre.mutate({ contentId, genreId: shownGenre! })}>Save</button
				>
				{#if !data?.genreId && !picked && suggested}
					<span class="text-[12px] text-muted-foreground">Suggested. Not saved yet.</span>
				{/if}
			{/if}
		{:else}
			<span data-testid="genre-readonly">{data?.genre?.name ?? 'Not set'}</span>
		{/if}
	</div>

	<LyricsLinks
		title={name}
		{artist}
		lyrics={data?.lyrics ?? null}
		{youtubeMusicUrl}
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
