<script lang="ts">
	import BibleVersionPicker from '$lib/components/BibleVersionPicker.svelte';
	import { verseIdsToRange } from '$lib/utils/bible';
	import { gatewayLink } from '$lib/utils/bibleLinks';
	import { commentaryLinks } from '$lib/utils/bibleCommentary';
	import { bibleVersion, type BibleVersionStore } from '$lib/utils/bibleVersion.svelte';

	let {
		startVerseId,
		endVerseId,
		store = bibleVersion,
	}: { startVerseId: number; endVerseId: number; store?: BibleVersionStore } = $props();

	const range = $derived(verseIdsToRange(startVerseId, endVerseId));
	const gateway = $derived(range ? gatewayLink(range, store.code) : null);
	const commentaries = $derived(range ? commentaryLinks(range) : []);
</script>

{#if gateway}
	<div class="space-y-2 text-[13px]">
		<div class="flex flex-wrap items-center gap-x-4 gap-y-2">
			<BibleVersionPicker {store} />
			<a href={gateway.url} target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">
				Read on Bible Gateway ({store.code})
			</a>
		</div>
		{#if gateway.note}
			<p class="text-[12px] text-muted-foreground">{gateway.note}</p>
		{/if}
		{#if commentaries.length}
			<details>
				<summary class="cursor-pointer text-muted-foreground hover:text-foreground">Commentaries</summary>
				<ul class="mt-1.5 space-y-1 pl-4">
					{#each commentaries as c (c.url)}
						<li>
							<a href={c.url} target="_blank" rel="noopener noreferrer" class="text-primary hover:underline">
								{c.label}
							</a>
						</li>
					{/each}
				</ul>
			</details>
		{/if}
	</div>
{/if}
