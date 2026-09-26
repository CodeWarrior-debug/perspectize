<script lang="ts">
	/**
	 * Empty-state picker for /compare with no ?contentId — lets a visitor
	 * search for content and jump straight into a comparison, instead of the
	 * page being a dead end that only explains "open it from Activity"
	 * (compare-page-enhancements #1).
	 *
	 * Only surfaces content with 2+ perspectives (comparison needs two takes)
	 * — see LIST_COMPARABLE_CONTENT's comment for why perspectiveCount isn't
	 * just added to the main Activity list query.
	 */
	import { createQuery } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_COMPARABLE_CONTENT, type ListComparableContentResponse } from '$lib/queries/content';
	import { queryKeys } from '$lib/queries/keys';
	import SearchBar from '$lib/components/discover/SearchBar.svelte';
	import { Button } from '$lib/components/shadcn';
	import { extractVideoIdFromUrl } from '$lib/utils/formatting';

	let searchValue = $state('');
	let debouncedQuery = $state('');

	const query = createQuery(() => ({
		queryKey: queryKeys.content.comparePicker(debouncedQuery),
		queryFn: () =>
			graphqlRequest<ListComparableContentResponse>(LIST_COMPARABLE_CONTENT, {
				first: 40,
				filter: debouncedQuery ? { search: debouncedQuery } : undefined,
			}),
		staleTime: 30 * 1000,
	}));

	// 2+ perspectives is the minimum for a comparison to mean anything — see
	// module comment above.
	const comparableItems = $derived(
		(query.data?.content.items ?? []).filter((item) => (item.perspectiveCount ?? 0) >= 2),
	);

	function openComparison(contentId: string) {
		goto(`/compare?contentId=${contentId}`);
	}
</script>

<div class="mx-auto flex w-full max-w-[520px] flex-col gap-4 px-5 py-16">
	<div class="flex flex-col items-center gap-2 text-center">
		<h1 class="text-xl font-semibold text-foreground">Choose something to compare</h1>
		<p class="max-w-md text-muted-foreground">
			Compare puts two perspectives on the same content side by side. Search for content that already has more than one
			perspective.
		</p>
	</div>

	<SearchBar bind:value={searchValue} bind:debouncedQuery />

	<div class="flex flex-col gap-2">
		{#if query.isPending}
			<div class="py-8 text-center text-[13px] text-muted-foreground">Loading content…</div>
		{:else if query.isError}
			<div class="py-8 text-center text-[13px] text-muted-foreground">Couldn't load content. Please try again.</div>
		{:else if comparableItems.length === 0}
			<div class="flex flex-col items-center gap-3 py-8 text-center" data-testid="picker-empty">
				<p class="text-[13px] text-muted-foreground">
					{debouncedQuery
						? 'No content matching your search has more than one perspective yet.'
						: 'No content has more than one perspective yet.'}
				</p>
				<Button href="/" variant="outline">Go to Activity</Button>
			</div>
		{:else}
			{#each comparableItems as item (item.id)}
				{@const videoId = extractVideoIdFromUrl(item.url)}
				<button
					type="button"
					data-testid="picker-result"
					onclick={() => openComparison(item.id)}
					class="flex items-center gap-2.5 rounded-lg border border-border px-3.5 py-2.5 text-left hover:bg-primary/[0.06]"
				>
					{#if videoId}
						<img
							src={`https://i.ytimg.com/vi/${videoId}/default.jpg`}
							alt=""
							class="h-8 w-10 flex-none rounded object-cover"
						/>
					{/if}
					<div class="flex min-w-0 flex-1 flex-col">
						<span class="truncate text-[13px] font-medium text-foreground">{item.name}</span>
						{#if item.channelTitle}
							<span class="truncate text-[12px] text-muted-foreground">{item.channelTitle}</span>
						{/if}
					</div>
					<span class="flex-none text-[12px] text-muted-foreground">{item.perspectiveCount} perspectives</span>
				</button>
			{/each}
		{/if}
	</div>
</div>
