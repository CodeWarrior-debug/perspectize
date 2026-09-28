<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { PASSAGE_TEXT_QUERY, type PassageTextResponse } from '$lib/queries/bible';
	import { queryKeys } from '$lib/queries/keys';
	import OriginalLanguage from '$lib/components/interlinear/OriginalLanguage.svelte';

	let { startVerseId, endVerseId }: { startVerseId: number; endVerseId: number } = $props();

	// Two-tier cap (AN Q13): render in full up to COLLAPSE_THRESHOLD verses,
	// collapse behind a toggle up to HARD_CAP, and show no text beyond that
	// (PassageLinks, rendered alongside, carries the outbound link).
	const COLLAPSE_THRESHOLD = 30;
	const HARD_CAP = 150;
	const COLLAPSED_PREVIEW_COUNT = 10;

	let expanded = $state(false);
	// "Show original language": off on every open. The interlinear query lives in the lazily
	// mounted OriginalLanguage child, so nothing extra is fetched until this is turned on.
	let showOriginal = $state(false);

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
</script>

{#snippet plain()}
	<div>
		{#each visibleVerses as v (v.verseId)}
			<!-- The explicit trailing space keeps a verse number from running into the previous verse's last word. -->
			<span
				>{#if v.text}<sup class="mr-0.5 ml-0.5 text-[10px] text-muted-foreground">{v.verse}</sup
					>{v.text}{' '}{/if}</span
			>
		{/each}
	</div>
{/snippet}

<div class="passage-text font-[family-name:var(--font-family-serif)] text-[15px] leading-relaxed text-foreground">
	{#if overCap}
		<p class="text-muted-foreground">{verseCount} verses — too long to display here.</p>
	{:else if query.isLoading}
		<p class="text-muted-foreground">Loading passage…</p>
	{:else if query.isError}
		<p class="text-destructive">Couldn't load this passage.</p>
	{:else if query.data}
		{@const { translation, copyright } = query.data.passageText}
		{#if showOriginal}
			<OriginalLanguage {startVerseId} {endVerseId} verses={visibleVerses} {plain} />
		{:else}
			{@render plain()}
		{/if}
		<button
			type="button"
			aria-pressed={showOriginal}
			class="mt-2 mr-3 text-[13px] font-semibold text-primary hover:underline aria-pressed:underline"
			onclick={() => (showOriginal = !showOriginal)}
		>
			Show original language
		</button>
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
