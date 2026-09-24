<!-- frontend/src/lib/components/interlinear/OriginalLanguage.svelte -->
<script lang="ts">
	import type { Snippet } from 'svelte';
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { PASSAGE_INTERLINEAR_QUERY, type PassageInterlinearResponse, type VerseText } from '$lib/queries/bible';
	import { queryKeys } from '$lib/queries/keys';
	import InterlinearPassage from './InterlinearPassage.svelte';
	import InterlinearCredit from './InterlinearCredit.svelte';

	let {
		startVerseId,
		endVerseId,
		verses,
		plain,
	}: { startVerseId: number; endVerseId: number; verses: VerseText[]; plain: Snippet } = $props();

	// Mounted only after the reader asks for original language, so nothing is fetched otherwise.
	const query = createQuery(() => ({
		queryKey: queryKeys.bible.passageInterlinear(startVerseId, endVerseId),
		queryFn: () => graphqlRequest<PassageInterlinearResponse>(PASSAGE_INTERLINEAR_QUERY, { startVerseId, endVerseId }),
		staleTime: Infinity, // alignment data never changes
	}));

	const interlinear = $derived(query.data?.passageInterlinear.verses ?? []);
</script>

{#if query.isLoading}
	{@render plain()}
	<p class="mt-2 text-[12px] text-muted-foreground">Loading original language&hellip;</p>
{:else if query.isError}
	{@render plain()}
	<p class="mt-2 text-[12px] text-destructive">
		Couldn't load original language.
		<button type="button" class="font-semibold text-primary hover:underline" onclick={() => query.refetch()}
			>Retry</button
		>
	</p>
{:else if query.data && interlinear.length === 0}
	{@render plain()}
	<p class="mt-2 text-[12px] text-muted-foreground">Original-language data isn't available for this passage.</p>
{:else if query.data}
	<InterlinearPassage {verses} {interlinear} />
	<InterlinearCredit />
{/if}
