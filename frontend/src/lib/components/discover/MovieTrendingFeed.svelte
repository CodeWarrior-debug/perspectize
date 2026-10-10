<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { Button } from '$lib/components/shadcn';
	import MovieCard from './MovieCard.svelte';
	import {
		fetchTrendingMovies,
		MOVIE_TRENDING_STALE_TIME,
		tmdbKeys,
		type MovieSearchPage,
		type TrendingWindow,
	} from '$lib/services/tmdbApi';

	// Trending movies, shown on the Movies source while the search box has fewer
	// than 2 characters. The panel mounts it only while idle, so no trending call
	// is made during a search. The window lives in the panel (bound) so the toggle
	// survives a search and coming back to idle.
	let {
		timeWindow = $bindable('WEEK'),
		libraryUrls,
		pendingUrl = null,
		onAdd,
	}: {
		timeWindow?: TrendingWindow;
		/** Canonical movie URLs already in the library. */
		libraryUrls: Set<string>;
		/** URL of the movie being added right now, or null. */
		pendingUrl?: string | null;
		/** Called with a result's canonical url when its Add button is clicked. */
		onAdd: (url: string) => void;
	} = $props();

	const queryClient = useQueryClient();

	const trending = createQuery(() => {
		const win = timeWindow;
		return {
			queryKey: tmdbKeys.trending(win, 1),
			queryFn: () => fetchTrendingMovies(win, 1),
			staleTime: MOVIE_TRENDING_STALE_TIME,
		};
	});

	// Pages after the first, loaded by "Load More". Tagged with the window they
	// belong to, and reset when the window changes, so no page from another
	// window ever shows. `epoch` stops a late response from an old window landing.
	interface MoreState {
		window: TrendingWindow;
		pages: MovieSearchPage[];
		loading: boolean;
		error: string | null;
	}
	const NO_MORE: MoreState = { window: 'WEEK', pages: [], loading: false, error: null };
	let more = $state<MoreState>(NO_MORE);
	let epoch = 0;
	const moreForWindow = $derived(more.window === timeWindow ? more : NO_MORE);

	const pages = $derived(trending.data ? [trending.data, ...moreForWindow.pages] : []);
	const items = $derived(pages.flatMap((page) => page.items));
	const lastPage = $derived(pages.at(-1));
	const hasMore = $derived(lastPage !== undefined && lastPage.page < lastPage.totalPages);

	const LOAD_MORE_ERROR = 'Could not load more trending movies. Try again in a moment.';

	async function handleLoadMore() {
		if (!lastPage || !hasMore || moreForWindow.loading) return;
		const win = timeWindow;
		const nextPage = lastPage.page + 1;
		const requestEpoch = epoch;
		more = { window: win, pages: moreForWindow.pages, loading: true, error: null };
		try {
			const next = await queryClient.fetchQuery({
				queryKey: tmdbKeys.trending(win, nextPage),
				queryFn: () => fetchTrendingMovies(win, nextPage),
				staleTime: MOVIE_TRENDING_STALE_TIME,
			});
			if (requestEpoch === epoch) {
				more = { window: win, pages: [...moreForWindow.pages, next], loading: false, error: null };
			}
		} catch {
			if (requestEpoch === epoch) {
				more = { window: win, pages: moreForWindow.pages, loading: false, error: LOAD_MORE_ERROR };
			}
		}
	}

	const WINDOWS: { value: TrendingWindow; label: string }[] = [
		{ value: 'DAY', label: 'Today' },
		{ value: 'WEEK', label: 'This week' },
	];

	function selectWindow(next: TrendingWindow) {
		if (next === timeWindow) return;
		epoch += 1;
		timeWindow = next;
		more = NO_MORE;
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
		return { message: 'Trending movies are unavailable right now.' };
	}
</script>

<section class="flex flex-col gap-4" aria-label="Trending movies">
	<div class="flex flex-wrap items-center justify-between gap-2">
		<h2 class="text-sm font-medium text-muted-foreground">Trending movies</h2>
		<div role="group" aria-label="Trending window" class="flex gap-1">
			{#each WINDOWS as option (option.value)}
				<Button
					variant={timeWindow === option.value ? 'default' : 'ghost'}
					size="sm"
					aria-pressed={timeWindow === option.value}
					onclick={() => selectWindow(option.value)}
				>
					{option.label}
				</Button>
			{/each}
		</div>
	</div>

	{#if trending.isError}
		{@const errorInfo = classifyError(trending.error)}
		<div class="flex flex-col items-center gap-3 py-8 text-center">
			<p class="text-sm text-destructive">{errorInfo.message}</p>
			<Button variant="outline" size="sm" onclick={() => trending.refetch()}>Retry</Button>
		</div>
	{:else if trending.isPending}
		<div class="flex flex-col gap-4" aria-busy="true" aria-label="Loading trending movies">
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
		<p class="text-sm text-muted-foreground text-center py-8">No trending movies right now.</p>
	{:else}
		<div class="flex flex-col gap-4">
			{#each items as result, i (`${i}-${result.tmdbId}`)}
				<MovieCard {result} isInLibrary={libraryUrls.has(result.url)} isPending={pendingUrl === result.url} {onAdd} />
			{/each}

			{#if moreForWindow.loading}
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

		{#if moreForWindow.error}
			<p class="text-sm text-destructive">{moreForWindow.error}</p>
		{/if}

		{#if hasMore}
			<div class="flex justify-center py-4">
				<Button variant="outline" onclick={handleLoadMore} disabled={moreForWindow.loading}>
					{moreForWindow.loading ? 'Loading...' : 'Load More'}
				</Button>
			</div>
		{/if}
	{/if}
</section>
