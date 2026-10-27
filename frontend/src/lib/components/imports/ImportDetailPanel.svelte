<script lang="ts">
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import type { ImportItem } from '$lib/queries/imports';
	import { useImportItemDetails } from '$lib/queries/imports/useImportItemDetails';
	import { formatCount, formatCountExact, formatDurationSeconds, EMPTY_VALUE } from '$lib/utils/formatting';
	import { contentTypeLabel } from '$lib/utils/grid-config';
	import { activityContentHref } from '$lib/utils/contentLinks';
	import {
		ageDays,
		commentRate,
		formatLikes,
		formatRate,
		importStatusLabel,
		isLowSampleRating,
		KIND_LABELS,
		likeRate,
		viewsPerDay,
	} from '$lib/utils/import-sheet';

	/**
	 * ImportDetailPanel: everything about one candidate row, so the decision can
	 * be made without opening the source site. The row's numbers come from the
	 * sheet; the long text (description, chapters, tags) loads when it opens.
	 */
	let {
		item,
		sourceTitle,
		now,
	}: {
		/** The focused row, or null when nothing is focused. */
		item: ImportItem | null;
		sourceTitle: string;
		now: Date;
	} = $props();

	const details = useImportItemDetails(() => item?.id ?? '');
	const d = $derived(details.data?.importItemDetails ?? null);
	let expanded = $state(false);

	// Collapse the description again whenever another row is opened.
	$effect(() => {
		void item?.id;
		expanded = false;
	});

	function formatAge(days: number | null): string {
		if (days === null) return '';
		if (days < 31) return `${Math.round(days)} days ago`;
		if (days < 365) return `${Math.round(days / 30.4)} months ago`;
		return `${(days / 365.25).toFixed(1).replace(/\.0$/, '')} years ago`;
	}

	function formatPublished(iso: string | null): string {
		if (!iso) return EMPTY_VALUE;
		return new Date(iso).toLocaleDateString('en-US', {
			year: 'numeric',
			month: 'long',
			day: 'numeric',
			timeZone: 'UTC',
		});
	}

	const stats = $derived.by(() => {
		if (!item) return [];
		const isVideo = item.destinationType === 'YOUTUBE_VIDEO';
		const out: { label: string; value: string; title?: string; muted?: boolean }[] = [
			{
				label: 'Length',
				value: item.durationSeconds === null ? EMPTY_VALUE : formatDurationSeconds(item.durationSeconds),
			},
		];
		if (isVideo) {
			const perDay = viewsPerDay(item, now);
			out.push(
				{ label: 'Views', value: formatCount(item.viewCount), title: formatCountExact(item.viewCount) },
				{ label: 'Likes', value: formatLikes(item), title: formatCountExact(item.likeCount) },
				{ label: 'Comments', value: formatCount(item.commentCount), title: formatCountExact(item.commentCount) },
				{ label: 'Views/day', value: perDay === null ? EMPTY_VALUE : formatCount(Math.round(perDay)) },
				{
					label: 'Captions',
					value: item.hasCaptions === null ? EMPTY_VALUE : item.hasCaptions ? 'Yes' : 'No',
				},
			);
		}
		if (item.rating !== null || !isVideo) {
			out.push({
				label: item.ratingSource ? `${item.ratingSource} rating` : 'Rating',
				value: item.rating === null ? EMPTY_VALUE : `${item.rating.toFixed(1)} / 10`,
				title: item.ratingCount === null ? undefined : `${formatCountExact(item.ratingCount)} ratings`,
				muted: isLowSampleRating(item),
			});
		}
		return out;
	});

	const longDescription = $derived((d?.description.length ?? 0) > 600);
</script>

<aside
	class="border-border bg-card text-card-foreground flex min-h-0 flex-col overflow-y-auto rounded-lg border"
	aria-label="Row details"
	data-testid="import-detail-panel"
>
	{#if !item}
		<p class="text-muted-foreground p-6 text-sm">
			Click a row to read its description, chapters and tags before you import it.
		</p>
	{:else}
		<section class="border-border flex flex-col gap-2 border-b p-4">
			{#if item.thumbnailUrl}
				<img
					src={item.thumbnailUrl}
					alt=""
					class={item.destinationType === 'MOVIE' ? 'w-24 rounded' : 'aspect-video w-full rounded object-cover'}
				/>
			{/if}
			<h2 class="text-base leading-snug font-semibold text-balance">{item.title}</h2>
			<p class="text-muted-foreground text-xs">
				{sourceTitle} · {KIND_LABELS[item.kind]} · becomes {contentTypeLabel(item.destinationType.toLowerCase())}
			</p>
			<p class="text-muted-foreground text-xs">
				{formatPublished(item.publishedAt)}{#if ageDays(item, now) !== null}
					({formatAge(ageDays(item, now))}){/if}
			</p>
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

		<section class="border-border grid grid-cols-3 gap-x-3 gap-y-2 border-b p-4" aria-label="Numbers">
			{#each stats as s (s.label)}
				<div title={s.title}>
					<div class="font-mono text-sm tabular-nums" class:text-muted-foreground={s.muted}>{s.value}</div>
					<div class="text-muted-foreground text-xs">{s.label}</div>
				</div>
			{/each}
			{#if item.destinationType === 'YOUTUBE_VIDEO'}
				<p class="text-muted-foreground col-span-3 text-xs">
					Like rate {formatRate(likeRate(item), 2)} · comment rate {formatRate(commentRate(item), 2)} · stats as of
					{formatPublished(item.statsFetchedAt)}
				</p>
			{:else if isLowSampleRating(item)}
				<p class="text-muted-foreground col-span-3 text-xs">Few ratings so far; treat the score with care.</p>
			{/if}
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
