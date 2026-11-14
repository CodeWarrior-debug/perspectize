<script lang="ts">
	import { EMPTY_VALUE } from '$lib/utils/formatting';
	import {
		bookResponse,
		editionsValueGetter,
		READING_LOG_CAVEAT,
		formatAsOf,
		formatBookRating,
		formatReaders,
		pagesValueGetter,
		publishedValueGetter,
		ratingValueGetter,
		readingLogOf,
		hasReadingLog,
		type BookRow,
	} from '$lib/utils/bookFormatting';

	// Open Library stat tiles, rendered as children of the modal's tile grid. Unknown is a dash,
	// never 0: a rating nobody has given, or a missing year or page count. The shared Perspectives
	// and Avg. Rating tiles stay in the modal.
	let { row }: { row: BookRow } = $props();

	const params = $derived({ data: row });
	const ratingCount = $derived(bookResponse(row)?.ratingsCount);
	const readingLog = $derived(readingLogOf(bookResponse(row)));
	const asOf = $derived(formatAsOf(bookResponse(row)?.readingLogFetchedAt));
	const tiles = $derived([
		{ label: 'Rating', value: formatBookRating(ratingValueGetter(params)) },
		{ label: 'Rating count', value: ratingCount ? ratingCount.toLocaleString('en-US') : EMPTY_VALUE },
		{ label: 'Pages', value: pagesValueGetter(params)?.toString() ?? EMPTY_VALUE },
		{ label: 'Published', value: publishedValueGetter(params) ?? EMPTY_VALUE },
		{ label: 'Editions', value: editionsValueGetter(params)?.toString() ?? EMPTY_VALUE },
		{ label: 'Want to read', value: formatReaders(readingLog.wantToRead) },
		{ label: 'Reading now', value: formatReaders(readingLog.currentlyReading) },
		{ label: 'Have read', value: formatReaders(readingLog.alreadyRead) },
	]);
</script>

{#each tiles as tile (tile.label)}
	<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
		<div class="text-[11px] tracking-wide text-muted-foreground uppercase">{tile.label}</div>
		<div class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground">
			{tile.value}
		</div>
	</div>
{/each}
{#if hasReadingLog(readingLog)}
	<p class="col-span-full text-xs text-muted-foreground">
		Reading-log counts: {READING_LOG_CAVEAT}{asOf ? `, as of ${asOf}` : ''}. Update source data to refresh.
	</p>
{/if}
