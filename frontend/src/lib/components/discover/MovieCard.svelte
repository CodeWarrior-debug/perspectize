<script lang="ts">
	import { Button } from '$lib/components/shadcn';
	import LibraryStatus from './LibraryStatus.svelte';
	import type { LibraryItem } from './libraryItem';
	import { releaseYear, tmdbPosterUrl, type MovieSearchResult } from '$lib/services/tmdbApi';
	import FilmIcon from '@lucide/svelte/icons/film';
	import GlassesIcon from '@lucide/svelte/icons/glasses';
	import StarIcon from '@lucide/svelte/icons/star';

	let {
		result,
		libraryItem = null,
		isPending = false,
		onAdd,
	}: {
		result: MovieSearchResult;
		/** The result's library row when result.url is already in the user's library, else null. */
		libraryItem?: LibraryItem | null;
		isPending?: boolean;
		onAdd: (url: string) => void;
	} = $props();

	const posterSrc = $derived(tmdbPosterUrl(result.posterPath, 'w185'));
	const year = $derived(releaseYear(result.releaseDate));
	const score = $derived(result.voteAverage === null ? null : result.voteAverage.toFixed(1));
</script>

<article
	class="flex flex-col sm:flex-row gap-4 p-3 border border-border rounded-lg bg-card text-card-foreground shadow-sm"
	aria-label={result.title}
>
	<div class="w-32 sm:w-28 aspect-[2/3] shrink-0 self-start rounded overflow-hidden bg-muted">
		{#if posterSrc}
			<img
				src={posterSrc}
				alt={`Poster for ${result.title}`}
				width="185"
				height="278"
				loading="lazy"
				decoding="async"
				class="size-full object-cover"
			/>
		{:else}
			<div class="size-full flex items-center justify-center text-muted-foreground">
				<FilmIcon class="size-8" aria-hidden="true" />
			</div>
		{/if}
	</div>

	<div class="flex-1 min-w-0 flex flex-col gap-1">
		<h3 class="font-medium">
			<a
				href={result.url}
				target="_blank"
				rel="noopener noreferrer"
				class="hover:underline underline-offset-4 focus-visible:outline-none focus-visible:underline"
			>
				{result.title}
			</a>
		</h3>
		<p class="text-sm text-muted-foreground">
			{year ?? 'Year unknown'}
			{#if score !== null}
				<span class="inline-flex items-center gap-1 ml-2 text-foreground">
					<StarIcon class="size-3.5 fill-current" aria-hidden="true" />
					{score}
					<span class="sr-only">out of 10</span>
				</span>
			{/if}
		</p>
		{#if result.overview}
			<p class="text-sm text-muted-foreground mt-1 line-clamp-3">{result.overview}</p>
		{/if}
	</div>

	<div class="shrink-0 self-start w-full sm:w-56">
		{#if libraryItem}
			<LibraryStatus contentId={libraryItem.id} contentName={libraryItem.name} />
		{:else}
			<Button
				variant="default"
				size="sm"
				class="w-full sm:w-auto"
				disabled={isPending}
				onclick={() => onAdd(result.url)}
			>
				<GlassesIcon class="size-4" />
				{isPending ? 'Adding…' : 'Add to Perspectize'}
			</Button>
		{/if}
	</div>
</article>
