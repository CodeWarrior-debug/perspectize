<script lang="ts">
	import { createQuery, keepPreviousData } from '@tanstack/svelte-query';
	import { graphqlClient } from '$lib/queries/client';
	import { WIKIDATA_SEARCH, type WikidataSearchResult, type WikidataSearchResponse } from '$lib/queries/categories';
	import { queryKeys } from '$lib/queries/keys';

	let {
		contentId,
		currentCategory = null,
		onSelect,
		onClose,
		debouncedTerm = $bindable(''),
	}: {
		contentId: number;
		currentCategory: { label: string; wikidataQid: string } | null;
		onSelect: (result: WikidataSearchResult) => void;
		onClose: () => void;
		/** Debounced search term; exposed as bindable for testing the debounce. */
		debouncedTerm?: string;
	} = $props();

	let searchTerm = $state('');

	// Debounce: read `searchTerm` synchronously so Svelte tracks it as a
	// dependency — reading it only inside the setTimeout callback meant the
	// effect ran once on mount and never re-ran on keystrokes, so no search
	// request ever fired.
	$effect(() => {
		const term = searchTerm;
		const timer = setTimeout(() => {
			debouncedTerm = term;
		}, 300);
		return () => clearTimeout(timer);
	});

	const searchQuery = createQuery(() => ({
		queryKey: queryKeys.categories.search(debouncedTerm),
		queryFn: () =>
			graphqlClient.request<WikidataSearchResponse>(WIKIDATA_SEARCH, {
				query: debouncedTerm,
				language: 'en',
				limit: 10,
			}),
		enabled: debouncedTerm.length >= 2,
		placeholderData: keepPreviousData,
		staleTime: 5 * 60 * 1000,
	}));
</script>

<div class="category-typeahead w-64 p-2">
	<!-- Search input -->
	<input
		type="text"
		bind:value={searchTerm}
		placeholder="Search Wikidata..."
		class="w-full rounded border border-input px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-ring"
		autofocus
	/>

	<!-- Results list -->
	{#if searchQuery.isLoading && debouncedTerm.length >= 2}
		<div class="p-2 text-sm text-muted-foreground">Searching...</div>
	{:else if searchQuery.data?.wikidataSearch?.length}
		<ul class="mt-1 max-h-48 overflow-y-auto">
			{#each searchQuery.data.wikidataSearch as result}
				<li>
					<button
						type="button"
						class="w-full cursor-pointer rounded px-2 py-1.5 text-left text-sm hover:bg-muted"
						onclick={() => onSelect(result)}
					>
						<div class="font-medium">{result.label}</div>
						{#if result.description}
							<div class="truncate text-xs text-muted-foreground">{result.description}</div>
						{/if}
					</button>
				</li>
			{/each}
		</ul>
	{:else if debouncedTerm.length >= 2 && !searchQuery.isLoading}
		<div class="p-2 text-sm text-muted-foreground">No results found</div>
	{:else if debouncedTerm.length > 0 && debouncedTerm.length < 2}
		<div class="p-2 text-sm text-muted-foreground">Type at least 2 characters</div>
	{/if}

	<!-- Current category display -->
	{#if currentCategory}
		<div class="mt-2 border-t pt-2 text-xs text-muted-foreground">
			Current: {currentCategory.label} ({currentCategory.wikidataQid})
		</div>
	{/if}
</div>
