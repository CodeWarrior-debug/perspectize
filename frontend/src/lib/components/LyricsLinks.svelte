<script lang="ts">
	import { lyricsLinks, type LyricsAvailability } from '$lib/utils/lyricsLinks';

	let {
		title,
		artist,
		lyrics,
		youtubeMusicUrl,
		checking = false,
	}: {
		title: string;
		artist: string | null;
		lyrics: LyricsAvailability | null;
		youtubeMusicUrl: string | null;
		checking?: boolean;
	} = $props();

	const state = $derived(lyricsLinks({ title, artist, lyrics, youtubeMusicUrl }));
</script>

<div class="space-y-2 text-[13px]" data-testid="lyrics-links">
	<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Lyrics</div>
	{#if checking && !lyrics}
		<p class="text-muted-foreground">Checking for lyrics…</p>
	{/if}
	{#if state.notice}
		<p data-testid="lyrics-notice" class="text-muted-foreground">{state.notice}</p>
	{/if}
	<ul class="space-y-2">
		{#each state.links as link (link.href)}
			<li>
				<a
					href={link.href}
					target="_blank"
					rel="noopener noreferrer"
					data-kind={link.kind}
					class="text-primary hover:underline"
				>
					{link.label}
				</a>
				{#if link.helper}
					<p class="text-[12px] text-muted-foreground">{link.helper}</p>
				{/if}
			</li>
		{/each}
	</ul>
</div>
