<script lang="ts">
	import { Button } from '$lib/components/shadcn';
	import type { BookSearchResult } from '$lib/services/openLibraryApi';
	import {
		READING_LOG_CAVEAT,
		readingLogBreakdown,
		readingLogOf,
		openLibraryCoverUrl,
	} from '$lib/utils/bookFormatting';
	import BookIcon from '@lucide/svelte/icons/book';
	import CheckIcon from '@lucide/svelte/icons/check';
	import BookPlusIcon from '@lucide/svelte/icons/book-plus';

	let {
		result,
		isInLibrary = false,
		isPending = false,
		onAdd,
	}: {
		result: BookSearchResult;
		/** True when result.url is already in the user's library (from the page's libraryUrls set). */
		isInLibrary?: boolean;
		isPending?: boolean;
		onAdd: (url: string) => void;
	} = $props();

	/** A positive count, or null. Open Library uses 0 and missing alike for "not known". */
	function known(value: number | null): number | null {
		return typeof value === 'number' && value > 0 ? value : null;
	}

	const cover = $derived(openLibraryCoverUrl(result.coverId, 'M'));
	const authors = $derived(result.authorName.filter((name) => name !== '').join(', '));
	const pages = $derived(known(result.pageCountMedian));
	const editions = $derived(known(result.editionCount));
	const rating = $derived(known(result.ratingsAverage));
	const ratingCount = $derived(known(result.ratingsCount));
	// Muted under 5 votes. A rating with no count is treated as under 5, like the Book column.
	const lowRating = $derived(rating !== null && (ratingCount === null || ratingCount < 5));
	const ratingText = $derived.by(() => {
		if (rating === null) return 'No ratings';
		const score = `★ ${rating.toFixed(1)}`;
		return ratingCount === null ? score : `${score} (${ratingCount.toLocaleString('en-US')})`;
	});
	const facts = $derived(
		[
			result.firstPublishYear ? String(result.firstPublishYear) : 'Year unknown',
			pages === null ? null : `${pages} pages`,
			editions === null ? null : `${editions} ${editions === 1 ? 'edition' : 'editions'}`,
		].filter((fact): fact is string => fact !== null),
	);
	// Reading-log counts: a missing count is left out of the line, a real 0 stays.
	const readingLog = $derived(readingLogOf(result));
	const readingLogText = $derived(readingLogBreakdown(readingLog));
	const subjects = $derived(result.subjects.slice(0, 4));
</script>

<article
	class="flex flex-col sm:flex-row gap-4 p-3 border border-border rounded-lg bg-card text-card-foreground shadow-sm"
	aria-label={result.title}
>
	<div class="w-32 sm:w-28 aspect-[2/3] shrink-0 self-start rounded overflow-hidden bg-muted">
		{#if cover}
			<img
				src={cover}
				alt={`Cover of ${result.title}`}
				width="185"
				height="278"
				loading="lazy"
				decoding="async"
				class="size-full object-contain"
			/>
		{:else}
			<div class="size-full flex items-center justify-center text-muted-foreground">
				<BookIcon class="size-8" aria-hidden="true" />
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
		{#if authors}
			<p class="text-sm text-muted-foreground">{authors}</p>
		{/if}
		<p class="text-sm text-muted-foreground">{facts.join(' · ')}</p>
		<p class="text-sm {lowRating || rating === null ? 'text-muted-foreground' : 'text-foreground'}">{ratingText}</p>
		{#if readingLogText}
			<p class="text-sm text-muted-foreground" title={READING_LOG_CAVEAT}>{readingLogText} on Open Library</p>
		{:else}
			<p class="text-sm text-muted-foreground">No Open Library reading-log data</p>
		{/if}
		{#if subjects.length > 0}
			<div class="flex flex-wrap gap-1 mt-1">
				{#each subjects as subject, i (i)}
					<span class="rounded bg-muted px-1.5 py-0.5 text-xs text-foreground">{subject}</span>
				{/each}
			</div>
		{/if}
	</div>

	<div class="shrink-0 self-start w-full sm:w-44">
		{#if isInLibrary}
			<Button variant="outline" size="sm" class="w-full sm:w-auto" disabled>
				<CheckIcon class="size-4" />
				In Library
			</Button>
		{:else}
			<Button
				variant="default"
				size="sm"
				class="w-full sm:w-auto"
				disabled={isPending}
				onclick={() => onAdd(result.url)}
			>
				<BookPlusIcon class="size-4" />
				{isPending ? 'Adding…' : 'Add to Perspectize'}
			</Button>
		{/if}
	</div>
</article>
