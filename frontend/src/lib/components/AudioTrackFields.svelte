<script lang="ts">
	import { Input, Label } from '$lib/components/shadcn';
	import MusicGenrePicker from '$lib/components/MusicGenrePicker.svelte';
	import { PROVIDER_LABEL, type ParsedMusicLink } from '$lib/utils/audioLinks';
	import type { MusicGenre, SameSongCandidate } from '$lib/queries/content';

	let {
		link,
		title = $bindable(''),
		artist = $bindable(''),
		genreId = $bindable<string | null>(null),
		genres,
		candidates,
		disabled = false,
		onSameSong,
		onDifferentSong,
	}: {
		link: ParsedMusicLink;
		title?: string;
		artist?: string;
		genreId?: string | null;
		genres: readonly MusicGenre[];
		candidates: readonly SameSongCandidate[];
		disabled?: boolean;
		onSameSong: (contentId: string) => void;
		onDifferentSong: () => void;
	} = $props();

	// Only YouTube Music is looked up (InnerTube); the others are link-only in v1 (ADR 0002).
	const linkOnly = $derived(link.provider !== 'youtube');
</script>

<div class="space-y-3" data-testid="audio-track-fields">
	{#if linkOnly}
		<p class="text-[12px] text-muted-foreground">
			{PROVIDER_LABEL[link.provider]} links are not looked up. Add the song title and artist.
		</p>
		<div class="space-y-1">
			<Label for="audio-title">Song title</Label>
			<Input id="audio-title" bind:value={title} {disabled} autocomplete="off" />
		</div>
		<div class="space-y-1">
			<Label for="audio-artist">Artist</Label>
			<Input id="audio-artist" bind:value={artist} {disabled} autocomplete="off" />
		</div>
	{/if}

	<div class="space-y-1">
		<span class="text-sm font-medium">Genre (optional)</span>
		<MusicGenrePicker {genres} value={genreId} onSelect={(id) => (genreId = id)} {disabled} />
	</div>

	{#if candidates.length}
		<div role="group" aria-label="Same song?" class="space-y-2 rounded-md border border-border p-2.5 text-[13px]">
			<p class="font-medium">Is this the same song as one already here?</p>
			<ul class="space-y-1.5">
				{#each candidates as c (c.id)}
					<li class="flex items-center justify-between gap-2">
						<span class="min-w-0 truncate">{c.name}{c.audioTrack?.artist ? ` — ${c.audioTrack.artist}` : ''}</span>
						<button
							type="button"
							class="flex-none rounded-md border border-primary px-2 py-0.5 text-[12px] font-semibold text-primary"
							{disabled}
							onclick={() => onSameSong(c.id)}>Same song</button
						>
					</li>
				{/each}
			</ul>
			<button type="button" class="text-[12px] text-primary hover:underline" {disabled} onclick={onDifferentSong}
				>No, it's a different song</button
			>
		</div>
	{/if}
</div>
