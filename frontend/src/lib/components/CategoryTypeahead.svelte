<script lang="ts">
	import { fade, scale } from 'svelte/transition';
	import { createQuery, keepPreviousData } from '@tanstack/svelte-query';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import BookOpenIcon from '@lucide/svelte/icons/book-open';
	import XIcon from '@lucide/svelte/icons/x';
	import { graphqlClient } from '$lib/queries/client';
	import { WIKIDATA_SEARCH, type WikidataSearchResult, type WikidataSearchResponse } from '$lib/queries/categories';
	import { queryKeys } from '$lib/queries/keys';

	export interface CurrentCategory {
		label: string;
		wikidataQid: string;
		description?: string | null;
		entityType?: string | null;
		wikipediaUrl?: string | null;
	}

	let {
		contentId,
		currentCategory = null,
		onSelect,
		onRemove,
		onClose,
	}: {
		contentId: number;
		currentCategory: CurrentCategory | null;
		onSelect: (result: WikidataSearchResult) => void;
		onRemove: () => void;
		onClose: () => void;
	} = $props();

	function wikidataUrl(qid: string): string {
		return `https://www.wikidata.org/wiki/${qid}`;
	}

	let searchTerm = $state('');
	let debouncedTerm = $state('');

	$effect(() => {
		// Read searchTerm synchronously so $effect tracks it as a dependency.
		// Reading it only inside the setTimeout callback (a deferred macrotask)
		// means Svelte never sees the read while the effect is actively running,
		// so it wouldn't re-run on further keystrokes — the debounce would fire
		// exactly once, at mount, freezing debouncedTerm at whatever searchTerm
		// happened to be ~300ms after the popup opened.
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

<div
	class="category-typeahead bg-popover text-popover-foreground z-50 w-72 rounded-md border p-4 shadow-md outline-hidden"
	in:scale={{ start: 0.95, duration: 100 }}
	out:fade={{ duration: 75 }}
>
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

	<!-- Current category — reference explainer -->
	{#if currentCategory}
		<div class="mt-3 border-t border-border pt-3">
			<div class="flex items-start justify-between gap-2">
				<div class="text-[11px] font-medium tracking-[0.06em] text-muted-foreground uppercase">Current category</div>
				<button
					type="button"
					onclick={onRemove}
					class="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-destructive"
					aria-label="Remove category"
					title="Remove category"
				>
					<XIcon class="size-3.5" />
				</button>
			</div>
			<div class="mt-1 font-medium text-sm">{currentCategory.label}</div>
			{#if currentCategory.description}
				<p class="mt-0.5 text-xs text-muted-foreground">{currentCategory.description}</p>
			{/if}
			<div class="mt-1.5 flex flex-col gap-1">
				<a
					href={wikidataUrl(currentCategory.wikidataQid)}
					target="_blank"
					rel="noopener noreferrer"
					class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
				>
					{currentCategory.wikidataQid} on Wikidata
					<ExternalLinkIcon class="size-3" />
				</a>
				{#if currentCategory.wikipediaUrl}
					<a
						href={currentCategory.wikipediaUrl}
						target="_blank"
						rel="noopener noreferrer"
						class="inline-flex items-center gap-1 text-xs text-primary hover:underline"
					>
						<BookOpenIcon class="size-3" />
						Read on Wikipedia
					</a>
				{/if}
			</div>
		</div>
	{/if}
</div>
