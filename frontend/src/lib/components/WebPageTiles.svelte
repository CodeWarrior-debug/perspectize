<script lang="ts">
	import { EMPTY_VALUE, formatDate, formatDateTime, formatPublishDate } from '$lib/utils/formatting';
	import { webPageAuthor, webPageFetchedAt, webPageRolesLabel, webPageRolesOf, webPageSite } from '$lib/utils/webPage';

	// Webpage stat tiles, rendered as children of the modal's tile grid. Unknown is a dash, never a
	// guess. The Author tile appears only when the page declares an author.
	let {
		row,
	}: {
		row: {
			url: string | null;
			webPage?: Parameters<typeof webPageSite>[0]['webPage'];
			response?: unknown;
			primaryCategory?: { label: string } | null;
			createdAt?: string;
			publishedAt?: string | null;
		};
	} = $props();

	const author = $derived(webPageAuthor(row));
	const fetchedAt = $derived(webPageFetchedAt(row));
	const tiles = $derived([
		{ label: 'Type', value: webPageRolesLabel(webPageRolesOf(row)) },
		{ label: 'Site', value: webPageSite(row) ?? EMPTY_VALUE },
		{ label: 'Published', value: formatPublishDate(row.webPage?.publishedAt ?? null) },
		{ label: 'Fetched', value: fetchedAt ? formatDateTime(fetchedAt) : EMPTY_VALUE },
		{ label: 'Category', value: row.primaryCategory?.label ?? EMPTY_VALUE },
		{ label: 'Date Added', value: row.createdAt ? formatDate(row.createdAt) : EMPTY_VALUE },
	]);
</script>

{#each tiles as tile (tile.label)}
	<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
		<div class="text-[11px] tracking-wide text-muted-foreground uppercase">{tile.label}</div>
		<div
			class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground"
		>
			{tile.value}
		</div>
	</div>
{/each}
{#if author}
	<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
		<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Author</div>
		<div
			class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground"
		>
			{author}
		</div>
	</div>
{/if}
