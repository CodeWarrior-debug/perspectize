<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import type { ImportItem } from '$lib/queries/imports';
	import { useImportItemDetails } from '$lib/queries/imports/useImportItemDetails';
	import { formatDurationSeconds, EMPTY_VALUE } from '$lib/utils/formatting';
	import { contentTypeLabel } from '$lib/utils/grid-config';
	import { activityContentHref } from '$lib/utils/contentLinks';
	import { factKeys, factText, factTooltip, formatFact, importStatusLabel, prettifyKey } from '$lib/utils/import-sheet';

	/**
	 * ImportDetailPanel: everything about one candidate row, so the decision can
	 * be made without opening the source site. The row's facts come from the
	 * sheet, one entry per key; the long text (description, chapters, tags)
	 * loads when it opens.
	 */
	let {
		item,
		sourceTitle,
	}: {
		/** The focused row, or null when nothing is focused. */
		item: ImportItem | null;
		sourceTitle: string;
	} = $props();

	const details = useImportItemDetails(() => item?.id ?? '');
	const d = $derived(details.data?.importItemDetails ?? null);
	let expanded = $state(false);

	// Collapse the description again whenever another row is opened.
	$effect(() => {
		void item?.id;
		expanded = false;
	});

	function formatPublished(iso: string | null): string {
		if (!iso) return EMPTY_VALUE;
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC',
		});
	}

	// Every fact the row has, titled from its key, as in the sheet's columns.
	const facts = $derived(
		item
			? factKeys([item]).map((key) => ({
					key,
					label: prettifyKey(key),
					value: formatFact(key, item.facts[key]),
					title: factTooltip(key, item.facts[key]) || undefined,
				}))
			: [],
	);
	const thumbnail = $derived(item ? factText(item, 'thumbnailUrl') : null);

	const longDescription = $derived((d?.description.length ?? 0) > 600);
</script>

<aside
	class="border-border bg-card text-card-foreground flex h-full min-h-0 flex-col overflow-y-auto rounded-lg border"
	aria-label="Row details"
	data-testid="import-detail-panel"
>
	{#if !item}
		<p class="text-muted-foreground p-6 text-sm">
			Click a row to read its description, chapters and tags before you import it.
		</p>
	{:else}
		<section class="border-border flex flex-col gap-2 border-b p-4">
			{#if thumbnail}
				<img
					src={thumbnail}
					alt=""
					class={item.destinationType === 'MOVIE' ? 'w-24 rounded' : 'aspect-video w-full rounded object-cover'}
				/>
			{/if}
			<h2 class="text-base leading-snug font-semibold text-balance">{item.title}</h2>
			<p class="text-muted-foreground text-xs">
				{sourceTitle} · becomes {contentTypeLabel(item.destinationType.toLowerCase())}
			</p>
			{#if factText(item, 'summary')}
				<p class="text-sm">{factText(item, 'summary')}</p>
			{/if}
			<div class="flex flex-wrap items-center gap-3 text-sm">
				<span data-testid="import-detail-status">{importStatusLabel(item)}</span>
				<a class="text-primary inline-flex items-center gap-1 underline" href={item.url} target="_blank" rel="noopener">
					Open source <ExternalLinkIcon class="size-3.5" />
				</a>
				{#if item.contentId}
					<a class="text-primary underline" href={activityContentHref(item.contentId)}>View in Activity</a>
				{/if}
			</div>
			{#if item.importError && item.importStatus === 'FAILED'}
				<p class="text-destructive text-sm">{item.importError}</p>
			{/if}
		</section>

		<section class="border-border grid grid-cols-2 gap-x-3 gap-y-2 border-b p-4" aria-label="Facts">
			{#each facts as f (f.key)}
				<div title={f.title}>
					<div class="text-sm break-words tabular-nums">{f.value}</div>
					<div class="text-muted-foreground text-xs">{f.label}</div>
				</div>
			{:else}
				<p class="text-muted-foreground col-span-2 text-sm">No facts listed for this row.</p>
			{/each}
			<p class="text-muted-foreground col-span-2 text-xs">Facts as of {formatPublished(item.statsFetchedAt)}</p>
		</section>

		<section class="flex flex-col gap-2 p-4">
			<h3 class="text-muted-foreground text-xs font-semibold tracking-wide uppercase">Description</h3>
			{#if details.isPending}
				<p class="text-muted-foreground text-sm">Loading…</p>
			{:else if details.isError}
				<p class="text-destructive text-sm">Couldn't load the description. Try opening the row again.</p>
			{:else if d}
				{#if d.description}
					<p
						class="text-sm leading-relaxed break-words whitespace-pre-wrap"
						class:max-h-56={!expanded}
						class:overflow-hidden={!expanded}
						data-testid="import-detail-description"
					>
						{d.description}
					</p>
					{#if longDescription}
						<button
							type="button"
							class="text-primary self-start text-sm underline"
							onclick={() => (expanded = !expanded)}
						>
							{expanded ? 'Show less' : 'Show all'}
						</button>
					{/if}
				{:else}
					<p class="text-muted-foreground text-sm">No description.</p>
				{/if}
				{#if d.links.length}
					<p class="text-muted-foreground text-xs">Links to {d.links.join(', ')}</p>
				{/if}

				{#if d.people.length}
					<h3 class="text-muted-foreground mt-2 text-xs font-semibold tracking-wide uppercase">People</h3>
					<p class="text-sm">{d.people.map((p) => (p.name ? `${p.name} (${p.role})` : p.role)).join(', ')}</p>
				{/if}
				{#if d.genres.length}
					<h3 class="text-muted-foreground mt-2 text-xs font-semibold tracking-wide uppercase">Genres</h3>
					<p class="text-sm">{d.genres.join(', ')}</p>
				{/if}
				{#if d.chapters.length}
					<h3 class="text-muted-foreground mt-2 text-xs font-semibold tracking-wide uppercase">
						Chapters · {d.chapters.length}
					</h3>
					<ol class="flex max-h-48 flex-col gap-0.5 overflow-y-auto text-sm">
						{#each d.chapters as ch (ch.startSeconds)}
							<li class="grid grid-cols-[4rem_1fr] gap-2">
								<span class="text-muted-foreground font-mono tabular-nums"
									>{formatDurationSeconds(ch.startSeconds)}</span
								>
								<span>{ch.title}</span>
							</li>
						{/each}
					</ol>
				{/if}
				{#if d.tags.length}
					<h3 class="text-muted-foreground mt-2 text-xs font-semibold tracking-wide uppercase">Tags</h3>
					<ul class="flex flex-wrap gap-1">
						{#each d.tags as tag (tag)}
							<li class="border-border text-muted-foreground rounded-full border px-2 py-0.5 text-xs">{tag}</li>
						{/each}
					</ul>
				{/if}
			{/if}
		</section>
	{/if}
</aside>
