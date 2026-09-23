<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { PASSAGE_TEXT_QUERY, type PassageTextResponse } from '$lib/queries/bible';
	import { queryKeys } from '$lib/queries/keys';
	import { formatReference, verseIdsToRange } from '$lib/utils/bible';

	let { startVerseId, endVerseId }: { startVerseId: number; endVerseId: number } = $props();

	// Two-tier cap (AN Q13): render in full up to COLLAPSE_THRESHOLD verses,
	// collapse behind a toggle up to HARD_CAP, and link out beyond that.
	const COLLAPSE_THRESHOLD = 30;
	const HARD_CAP = 150;
	const COLLAPSED_PREVIEW_COUNT = 10;

	let expanded = $state(false);

	const verseCount = $derived(endVerseId - startVerseId + 1);
	const overCap = $derived(verseCount > HARD_CAP);

	// Over the hard cap we never fetch — no inline text is shown anyway.
	const query = createQuery(() => ({
		queryKey: queryKeys.bible.passageText(startVerseId, endVerseId),
		queryFn: () => graphqlRequest<PassageTextResponse>(PASSAGE_TEXT_QUERY, { startVerseId, endVerseId }),
		enabled: !overCap,
		staleTime: Infinity, // verse text never changes
	}));

	const verses = $derived(query.data?.passageText.verses ?? []);
	const visibleVerses = $derived(
		verseCount <= COLLAPSE_THRESHOLD || expanded ? verses : verses.slice(0, COLLAPSED_PREVIEW_COUNT),
	);

	// Same shape as backend CanonicalPassageURL (version-less Bible Gateway search).
	const gatewayUrl = $derived.by(() => {
		const range = verseIdsToRange(startVerseId, endVerseId);
		if (!range) return null;
		return `https://www.biblegateway.com/passage/?${new URLSearchParams({ search: formatReference(range) })}`;
	});
</script>

<div class="passage-text font-[family-name:var(--font-family-serif)] text-[15px] leading-relaxed text-foreground">
	{#if overCap}
		<p class="text-muted-foreground">{verseCount} verses — too long to display here.</p>
		{#if gatewayUrl}
			<a href={gatewayUrl} target="_blank" rel="noopener noreferrer" class="text-[13px] text-primary hover:underline">
				Read on Bible Gateway
			</a>
		{/if}
	{:else if query.isLoading}
		<p class="text-muted-foreground">Loading passage…</p>
	{:else if query.isError}
		<p class="text-destructive">Couldn't load this passage.</p>
	{:else if query.data}
		{@const { translation, copyright } = query.data.passageText}
		<div>
			{#each visibleVerses as v (v.verseId)}
				<span
					>{#if v.text}<sup class="mr-0.5 text-[10px] text-muted-foreground">{v.verse}</sup>{v.text}
					{/if}</span
				>
			{/each}
		</div>
		{#if verseCount > COLLAPSE_THRESHOLD}
			<button
				type="button"
				class="mt-2 text-[13px] font-semibold text-primary hover:underline"
				onclick={() => (expanded = !expanded)}
			>
				{expanded ? 'Show less' : 'Show full passage'}
			</button>
		{/if}
		<p class="mt-2 text-[11px] text-muted-foreground">{translation} · {copyright}</p>
	{/if}
</div>
