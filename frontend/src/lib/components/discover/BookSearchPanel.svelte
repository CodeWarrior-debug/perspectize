<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { Button, Input } from '$lib/components/shadcn';
	import BookCard from './BookCard.svelte';
	import BookTrendingFeed from './BookTrendingFeed.svelte';
	import {
		BOOK_SEARCH_DEBOUNCE_MS,
		BOOK_SEARCH_MAX_LENGTH,
		BOOK_SEARCH_MIN_LENGTH,
		BOOK_SEARCH_STALE_TIME,
		openLibraryKeys,
		searchBooks,
		type BookSearchPage,
	} from '$lib/services/openLibraryApi';
	import type { TrendingWindow } from '$lib/services/tmdbApi';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';

	// Books search on the Discover page. Search runs through the backend (bookSearch), debounced so a
	// keystroke burst costs one call. While the box has fewer than 2 characters, trending books show
	// instead. A pasted book link is not special here: book links are added from Add Content.
	let {
		value = $bindable(''),
		inputRef = $bindable(null),
		libraryUrls,
		pendingUrl = null,
		onAdd,
	}: {
		value?: string;
		/** Exposes the input element so the page can focus it (Cmd/Ctrl+K). */
		inputRef?: HTMLInputElement | null;
		/** Canonical work URLs already in the library. */
		libraryUrls: Set<string>;
		/** URL of the book being added right now, or null. */
		pendingUrl?: string | null;
		/** Called with a result's canonical url when its Add button is clicked. */
		onAdd: (url: string) => void;
	} = $props();

	const trimmed = $derived(value.trim());
	// Trending shows only while idle: fewer than 2 characters.
	const showTrending = $derived(trimmed.length < BOOK_SEARCH_MIN_LENGTH);
	// The window toggle lives here so it survives a search and coming back to idle.
	let trendingWindow = $state<TrendingWindow>('WEEK');

	// The term that is actually searched. Short input clears it at once; longer input waits for a
	// quiet period, so only the last pause reaches Open Library (through the backend).
	let debounced = $state('');
	$effect(() => {
		const term = value.trim();
		if (term.length < BOOK_SEARCH_MIN_LENGTH) {
			debounced = '';
			return;
		}
		const timer = setTimeout(() => {
			debounced = term;
		}, BOOK_SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});

	const searchEnabled = $derived(debounced.length >= BOOK_SEARCH_MIN_LENGTH);
	const isDebouncing = $derived(trimmed.length >= BOOK_SEARCH_MIN_LENGTH && debounced !== trimmed);

	const queryClient = useQueryClient();

	const search = createQuery(() => {
		const term = debounced;
		return {
			queryKey: openLibraryKeys.search(term, 1),
			queryFn: () => searchBooks(term, 1),
			enabled: searchEnabled,
			staleTime: BOOK_SEARCH_STALE_TIME,
		};
	});

	// Pages after the first, loaded by "Load More". Tagged with the term they belong to, so a term
	// change drops them without an effect.
	interface MoreState {
		query: string;
		pages: BookSearchPage[];
		loading: boolean;
		error: string | null;
	}
	const NO_MORE: MoreState = { query: '', pages: [], loading: false, error: null };
	let more = $state<MoreState>(NO_MORE);
	const moreForTerm = $derived(more.query === debounced ? more : NO_MORE);

	const pages = $derived(search.data && searchEnabled ? [search.data, ...moreForTerm.pages] : []);
	const items = $derived(pages.flatMap((page) => page.items));
	const lastPage = $derived(pages.at(-1));
	const hasMore = $derived(lastPage !== undefined && lastPage.page < lastPage.totalPages);

	const LOAD_MORE_ERROR = 'Could not load more books. Try again in a moment.';

	async function handleLoadMore() {
		if (!lastPage || !hasMore || moreForTerm.loading) return;
		const term = debounced;
		const nextPage = lastPage.page + 1;
		more = { query: term, pages: moreForTerm.pages, loading: true, error: null };
		try {
			const next = await queryClient.fetchQuery({
				queryKey: openLibraryKeys.search(term, nextPage),
				queryFn: () => searchBooks(term, nextPage),
				staleTime: BOOK_SEARCH_STALE_TIME,
			});
			// Ignore a response for a term the user has since replaced.
			if (more.query === term) {
				more = { query: term, pages: [...more.pages, next], loading: false, error: null };
			}
		} catch {
			if (more.query === term) {
				more = { ...more, loading: false, error: LOAD_MORE_ERROR };
			}
		}
	}

	interface ErrorInfo {
		message: string;
	}

	// Network failures get a connection message; anything else (Open Library outage, backend error)
	// gets the generic one. Both can be retried.
	function classifyError(error: unknown): ErrorInfo {
		if (error instanceof TypeError) {
			return { message: 'Unable to reach Perspectize. Check your connection.' };
		}
		return { message: 'Book search is unavailable right now.' };
	}

	function handleClear() {
		value = '';
		inputRef?.focus();
	}

	// Autofocus on mount, like the movie panel.
	$effect(() => {
		inputRef?.focus();
	});
</script>

<div class="flex flex-col gap-6">
	<form class="flex flex-col gap-1.5" role="search" onsubmit={(event) => event.preventDefault()}>
		<div class="relative flex-1 min-w-0">
			<SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
			<Input
				bind:ref={inputRef}
				type="text"
				placeholder="Search books by title or author"
				aria-label="Search books by title or author"
				maxlength={BOOK_SEARCH_MAX_LENGTH}
				bind:value
				class="pl-9 {value ? 'pr-9' : ''}"
			/>
			{#if value}
				<button
					type="button"
					onclick={handleClear}
					aria-label="Clear search"
					class="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
				>
					<XIcon class="size-4" />
				</button>
			{/if}
		</div>
	</form>

	{#if showTrending}
		<p class="text-sm text-muted-foreground text-center">
			{trimmed.length > 0
				? 'Type at least 2 characters to search.'
				: 'Search Open Library for a book to add it to Perspectize.'}
		</p>
		<BookTrendingFeed bind:timeWindow={trendingWindow} {libraryUrls} {pendingUrl} {onAdd} />
	{:else if isDebouncing || (searchEnabled && search.isPending)}
		<div class="flex flex-col gap-4" aria-busy="true" aria-label="Searching books">
			{#each Array(4) as _, i (i)}
				<div class="flex flex-col sm:flex-row gap-4 p-3 border border-border rounded-lg bg-card animate-pulse">
					<div class="w-32 sm:w-28 aspect-[2/3] bg-muted rounded shrink-0"></div>
					<div class="flex-1 space-y-2 py-1">
						<div class="h-4 bg-muted rounded w-3/4"></div>
						<div class="h-3 bg-muted rounded w-1/3"></div>
						<div class="h-3 bg-muted rounded w-full"></div>
					</div>
				</div>
			{/each}
		</div>
	{:else if search.isError}
		{@const errorInfo = classifyError(search.error)}
		<div class="flex flex-col items-center gap-3 py-12 text-center">
			<p class="text-sm text-destructive">{errorInfo.message}</p>
			<Button variant="outline" size="sm" onclick={() => search.refetch()}>Retry</Button>
		</div>
	{:else if items.length === 0}
		<div class="text-center py-12">
			<p class="text-sm text-muted-foreground">No books found for '{debounced}'</p>
			<p class="text-xs text-muted-foreground mt-1">Try a different title or author, or check your spelling</p>
		</div>
	{:else}
		<div class="flex flex-col gap-4">
			{#each items as result, i (`${i}-${result.workKey}`)}
				<BookCard {result} isInLibrary={libraryUrls.has(result.url)} isPending={pendingUrl === result.url} {onAdd} />
			{/each}

			{#if moreForTerm.loading}
				{#each Array(2) as _, i (i)}
					<div class="flex flex-col sm:flex-row gap-4 p-3 border border-border rounded-lg bg-card animate-pulse">
						<div class="w-32 sm:w-28 aspect-[2/3] bg-muted rounded shrink-0"></div>
						<div class="flex-1 space-y-2 py-1">
							<div class="h-4 bg-muted rounded w-3/4"></div>
							<div class="h-3 bg-muted rounded w-full"></div>
						</div>
					</div>
				{/each}
			{/if}
		</div>

		{#if moreForTerm.error}
			<p class="text-sm text-destructive">{moreForTerm.error}</p>
		{/if}

		{#if hasMore}
			<div class="flex justify-center py-4">
				<Button variant="outline" onclick={handleLoadMore} disabled={moreForTerm.loading}>
					{moreForTerm.loading ? 'Loading...' : 'Load More'}
				</Button>
			</div>
		{/if}
	{/if}

	<p class="text-xs text-muted-foreground text-center">Book data from Open Library (archive.org)</p>
</div>
