<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { Button, Input } from '$lib/components/shadcn';
	import MovieCard from './MovieCard.svelte';
	import {
		MOVIE_SEARCH_DEBOUNCE_MS,
		MOVIE_SEARCH_MAX_LENGTH,
		MOVIE_SEARCH_MIN_LENGTH,
		MOVIE_SEARCH_STALE_TIME,
		searchMovies,
		tmdbKeys,
		type MovieSearchPage,
	} from '$lib/services/tmdbApi';
	import { validateMovieInput } from '$lib/utils/movie';
	import GlassesIcon from '@lucide/svelte/icons/glasses';
	import SearchIcon from '@lucide/svelte/icons/search';
	import XIcon from '@lucide/svelte/icons/x';

	// Movies source of the Discover page. Search runs through the backend
	// (movieSearch), debounced so a keystroke burst costs one call. A pasted
	// TMDB/IMDb link skips search and is added directly.
	let {
		value = $bindable(''),
		inputRef = $bindable(null),
		libraryUrls,
		pendingUrl = null,
		onAdd,
		onAddUrl,
	}: {
		value?: string;
		/** Exposes the input element so the page can focus it (Cmd/Ctrl+K). */
		inputRef?: HTMLInputElement | null;
		/** Canonical movie URLs already in the library. */
		libraryUrls: Set<string>;
		/** URL of the movie being added right now, or null. */
		pendingUrl?: string | null;
		/** Called with a result's canonical url when its Add button is clicked. */
		onAdd: (url: string) => void;
		/** Called with a pasted TMDB/IMDb link when the submit button is clicked. */
		onAddUrl: (url: string) => void;
	} = $props();

	const trimmed = $derived(value.trim());
	const isLink = $derived(validateMovieInput(trimmed));

	// The term that is actually searched. Short input clears it at once; longer
	// input waits for a quiet period, so only the last pause reaches TMDB.
	let debounced = $state('');
	$effect(() => {
		const term = value.trim();
		if (term.length < MOVIE_SEARCH_MIN_LENGTH) {
			debounced = '';
			return;
		}
		const timer = setTimeout(() => {
			debounced = term;
		}, MOVIE_SEARCH_DEBOUNCE_MS);
		return () => clearTimeout(timer);
	});

	// A pasted link is never searched for.
	const searchEnabled = $derived(debounced.length >= MOVIE_SEARCH_MIN_LENGTH && !validateMovieInput(debounced));
	const isDebouncing = $derived(trimmed.length >= MOVIE_SEARCH_MIN_LENGTH && debounced !== trimmed);

	const queryClient = useQueryClient();

	const search = createQuery(() => {
		const term = debounced;
		return {
			queryKey: tmdbKeys.search(term, 1),
			queryFn: () => searchMovies(term, 1),
			enabled: searchEnabled,
			staleTime: MOVIE_SEARCH_STALE_TIME,
		};
	});

	// Pages after the first, loaded by "Load More". Tagged with the term they
	// belong to, so a term change drops them without an effect.
	interface MoreState {
		query: string;
		pages: MovieSearchPage[];
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

	const LOAD_MORE_ERROR = 'Could not load more movies. Try again in a moment.';

	async function handleLoadMore() {
		if (!lastPage || !hasMore || moreForTerm.loading) return;
		const term = debounced;
		const nextPage = lastPage.page + 1;
		more = { query: term, pages: moreForTerm.pages, loading: true, error: null };
		try {
			const next = await queryClient.fetchQuery({
				queryKey: tmdbKeys.search(term, nextPage),
				queryFn: () => searchMovies(term, nextPage),
				staleTime: MOVIE_SEARCH_STALE_TIME,
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

	// Network failures get a connection message; anything else (TMDB outage,
	// backend error) gets the generic one. Both can be retried.
	function classifyError(error: unknown): ErrorInfo {
		if (error instanceof TypeError) {
			return { message: 'Unable to reach Perspectize. Check your connection.' };
		}
		return { message: 'Movie search is unavailable right now.' };
	}

	function handleClear() {
		value = '';
		inputRef?.focus();
	}

	function handleSubmit(event: SubmitEvent) {
		event.preventDefault();
		if (isLink && pendingUrl === null) onAddUrl(trimmed);
	}

	// Autofocus on mount, like SearchBar.
	$effect(() => {
		inputRef?.focus();
	});
</script>

<div class="flex flex-col gap-6">
	<form class="flex flex-col gap-1.5" onsubmit={handleSubmit} role="search">
		<!-- Phones: the button stacks under the input so the input keeps the full width. -->
		<div class="flex w-full flex-col gap-2 sm:flex-row">
			<div class="relative flex-1 min-w-0">
				<SearchIcon class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground pointer-events-none" />
				<Input
					bind:ref={inputRef}
					type="text"
					placeholder="Search movies by title, or paste a TMDB or IMDb link"
					aria-label="Search movies by title, or paste a TMDB or IMDb link"
					maxlength={MOVIE_SEARCH_MAX_LENGTH}
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
			{#if isLink}
				<Button type="submit" variant="default" disabled={pendingUrl !== null} class="w-full sm:w-auto">
					<GlassesIcon class="size-4" />
					{pendingUrl === trimmed ? 'Adding…' : 'Add to Perspectize'}
				</Button>
			{/if}
		</div>
	</form>

	{#if isLink}
		<p class="text-sm text-muted-foreground text-center py-12">
			That looks like a movie link. Add it to Perspectize directly.
		</p>
	{:else if !searchEnabled && trimmed.length > 0 && trimmed.length < MOVIE_SEARCH_MIN_LENGTH}
		<p class="text-sm text-muted-foreground text-center py-12">Type at least 2 characters to search.</p>
	{:else if !searchEnabled}
		<p class="text-sm text-muted-foreground text-center py-12">Search TMDB for a movie to add it to Perspectize.</p>
	{:else if search.isError}
		{@const errorInfo = classifyError(search.error)}
		<div class="flex flex-col items-center gap-3 py-12 text-center">
			<p class="text-sm text-destructive">{errorInfo.message}</p>
			<Button variant="outline" size="sm" onclick={() => search.refetch()}>Retry</Button>
		</div>
	{:else if isDebouncing || search.isPending}
		<div class="flex flex-col gap-4" aria-busy="true" aria-label="Searching movies">
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
	{:else if items.length === 0}
		<div class="text-center py-12">
			<p class="text-sm text-muted-foreground">No movies found for '{debounced}'</p>
			<p class="text-xs text-muted-foreground mt-1">Try a different title or check your spelling</p>
		</div>
	{:else}
		<div class="flex flex-col gap-4">
			{#each items as result, i (`${i}-${result.tmdbId}`)}
				<MovieCard {result} isInLibrary={libraryUrls.has(result.url)} isPending={pendingUrl === result.url} {onAdd} />
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

	<p class="text-xs text-muted-foreground text-center">Movie data from TMDB</p>
</div>
