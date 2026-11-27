<script lang="ts">
	import type { LengthDisplay, WebPageListMeta } from '#lib/queries/content/index.js';
	import {
		webPageAuthor,
		webPagePublished,
		webPageRoleLabel,
		webPageRolesOf,
		webPageSite,
	} from '#lib/utils/webPage.js';
	import PlayIcon from '@lucide/svelte/icons/play';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import GlassesIcon from '@lucide/svelte/icons/glasses';
	import MessageSquareTextIcon from '@lucide/svelte/icons/message-square-text';
	import {
		extractVideoIdFromUrl,
		formatDuration,
		formatCount,
		releasedValueGetter,
		ratedValueGetter,
		tmdbScoreValueGetter,
		formatTmdbScore,
		movieResponse,
	} from '#lib/utils/formatting.js';
	import { passageIconLabels } from '#lib/utils/bible.js';
	import {
		authorCellText,
		bookResponse,
		formatBookRating,
		openLibraryCoverUrl,
		pagesValueGetter,
		publishedValueGetter,
		ratingValueGetter,
	} from '#lib/utils/bookFormatting.js';
	import BiblePassageIcon from '#lib/components/BiblePassageIcon.svelte';
	import CardFacts, { type CardFact } from '#lib/components/CardFacts.svelte';
	import AddToPlanButton from '#lib/components/plan/AddToPlanButton.svelte';
	import TypeGlyph from '#lib/components/contentTypes/TypeGlyph.svelte';
	import { descriptorFor } from '#lib/contentTypes/registry.js';

	interface CardRow {
		id: string | number;
		name: string;
		url: string | null;
		channelTitle: string | null;
		length: number | null;
		lengthUnits: string | null;
		lengthDisplay?: LengthDisplay | null;
		// Beyond name/channel/duration, the mobile card shows category, views and
		// likes — the three most-used of the grid's other columns; the remaining
		// columns (publish date, tags, description) are grid/details-modal
		// only on mobile.
		primaryCategory?: { label: string } | null;
		viewCount?: number | null;
		likeCount?: number | null;
		contentType?: string;
		// MOVIE rows carry TMDB data in their JSON `response` (or `movie`); see formatting.ts.
		movie?: unknown;
		// BOOK rows carry Open Library data in `book` (or `response`); see bookFormatting.ts.
		book?: unknown;
		response?: unknown;
		// WEB_PAGE rows carry their shaped metadata in `webPage` (site, published date, roles, og image).
		webPage?: WebPageListMeta | null;
		displayTitle?: string | null;
		verseStartID?: number | null;
		verseEndID?: number | null;
	}

	let {
		rowData,
		onOpenDetails,
		onAddPerspective = () => {},
		perspectiveContentIds = new Set<string>(),
		onAddToPlan,
	}: {
		rowData: CardRow[];
		onOpenDetails: (contentId: string) => void;
		/** Shows an "Add to plan" action per card (signed-in users only) when provided. */
		onAddToPlan?: (contentId: string) => void;
		/** Opens the perspective create/edit sheet for a row. Mirrors the grid's Perspectize column. */
		onAddPerspective?: (contentId: string) => void;
		/** Content ids the current user already has a perspective on — drives the glasses vs "+" affordance. */
		perspectiveContentIds?: Set<string>;
	} = $props();

	function handleAddPerspective(row: CardRow, e: MouseEvent) {
		e.stopPropagation();
		onAddPerspective(String(row.id));
	}

	const isPassage = (row: CardRow) => row.contentType === 'BIBLE_PASSAGE';
	const isClaim = (row: CardRow) => row.contentType === 'CLAIM';
	const isWebsite = (row: CardRow) => row.contentType === 'WEBSITE';
	const isMovie = (row: CardRow) => row.contentType === 'MOVIE';
	const isBook = (row: CardRow) => row.contentType === 'BOOK';
	const isWebPage = (row: CardRow) => row.contentType === 'WEB_PAGE';

	const plain = (texts: string[]): CardFact[] => texts.map((text) => ({ text }));

	/** The row's category as a pill fact, or nothing. */
	function categoryFact(row: CardRow): CardFact[] {
		return row.primaryCategory ? [{ text: row.primaryCategory.label, pill: 'category' }] : [];
	}

	/** Site and published year for a webpage card (unknown parts are skipped). */
	function webPageFacts(row: CardRow): string[] {
		const published = webPagePublished(row);
		return [webPageSite(row), published ? published.slice(0, 4) : null].filter((f): f is string => !!f);
	}

	/** A webpage's site and year, then one pill per role. */
	function webPageCardFacts(row: CardRow): CardFact[] {
		return [
			...plain(webPageFacts(row)),
			...webPageRolesOf(row).map((role) => ({ text: webPageRoleLabel(role), pill: 'role' as const })),
		];
	}

	/** Duration, category, views and likes for a video (or any row without a type-specific line). */
	function videoFacts(row: CardRow): CardFact[] {
		return [
			...(row.length ? plain([formatDuration(row.length, row.lengthUnits, row.lengthDisplay?.precision)]) : []),
			...categoryFact(row),
			...(row.viewCount != null ? plain([`${formatCount(row.viewCount)} views`]) : []),
			...(row.likeCount != null ? plain([`${formatCount(row.likeCount)} likes`]) : []),
		];
	}

	/** Year, rating, runtime and TMDB score for a movie card (unknown parts are skipped). */
	function movieFacts(row: CardRow): string[] {
		const released = releasedValueGetter({ data: row });
		const score = tmdbScoreValueGetter({ data: row });
		return [
			released ? released.slice(0, 4) : null,
			ratedValueGetter({ data: row }),
			row.length ? formatDuration(row.length, row.lengthUnits, row.lengthDisplay?.precision) : null,
			score != null ? `TMDB ${formatTmdbScore(score)}` : null,
		].filter((f): f is string => !!f);
	}

	/** Book facts that Open Library has: year, median pages, community rating. Unknown parts are skipped. */
	function bookFacts(row: CardRow): string[] {
		const year = publishedValueGetter({ data: row });
		const pages = pagesValueGetter({ data: row });
		const rating = ratingValueGetter({ data: row });
		return [
			year,
			pages !== null ? `${pages} pages` : null,
			rating !== null ? `★ ${formatBookRating(rating)}` : null,
		].filter((f): f is string => !!f);
	}

	/**
	 * YouTube thumbnail, or a movie's TMDB poster or a book's Open Library cover. Posters and covers
	 * vary in aspect, so they are fitted, not cropped.
	 */
	function thumbSrc(row: CardRow): { src: string; fitted: boolean } | null {
		// A page's own image (og:image), fitted and never played: a webpage is not a video.
		if (isWebPage(row)) return row.webPage?.imageUrl ? { src: row.webPage.imageUrl, fitted: true } : null;
		const videoId = extractVideoIdFromUrl(row.url);
		if (videoId) return { src: `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`, fitted: false };
		const posterPath = movieResponse(row)?.posterPath;
		if (posterPath) return { src: `https://image.tmdb.org/t/p/w154${posterPath}`, fitted: true };
		const cover = openLibraryCoverUrl(bookResponse(row)?.coverId, 'M');
		return cover ? { src: cover, fitted: true } : null;
	}

	/** Grey tile only behind a video thumbnail or an empty slot; posters, covers, the passage and the claim icon sit on the card colour. */
	function thumbBg(row: CardRow): string {
		if (isPassage(row) || isClaim(row) || isWebsite(row) || thumbSrc(row)?.fitted) return '';
		return 'bg-muted';
	}

	function handleThumbClick(row: CardRow, e: MouseEvent) {
		e.stopPropagation();
		if (row.url) window.open(row.url, '_blank', 'noopener,noreferrer');
	}
</script>

<!-- pb-20 leaves the last card clear of the floating chat button (56px + its 20px inset). -->
<div data-testid="activity-card-list" class="flex flex-col gap-2.5 px-2 pt-2 pb-20">
	{#each rowData as row (row.id)}
		<div class="flex items-center gap-3 rounded-lg border border-border bg-card p-2.5 hover:bg-primary/[0.06]">
			<button
				type="button"
				data-testid={`card-thumb-${row.id}`}
				title="Open original content in new tab"
				class="relative h-16 w-24 flex-none overflow-hidden rounded-md {thumbBg(row)}"
				onclick={(e) => handleThumbClick(row, e)}
			>
				{#if isPassage(row)}
					<BiblePassageIcon {...passageIconLabels(row)} />
				{:else if isClaim(row)}
					<!-- A claim has no image to show (and no url), so its type icon fills the slot. -->
					<div class="flex h-full w-full items-center justify-center text-primary">
						<MessageSquareTextIcon data-icon="claim" class="size-8" />
					</div>
				{:else if isWebsite(row)}
					<!-- A website has no image of its own, so its type icon fills the slot. -->
					<div class="flex h-full w-full items-center justify-center text-primary">
						<TypeGlyph icon={descriptorFor(row.contentType).icon} class="size-8" />
					</div>
				{:else}
					{@const thumb = thumbSrc(row)}
					{#if thumb}
						<img
							src={thumb.src}
							alt=""
							class="h-full w-full {thumb.fitted ? 'object-contain' : 'object-cover'}"
							onerror={(e) => e.currentTarget.remove()}
						/>
					{/if}
					{#if thumb && !thumb.fitted}
						<span
							data-testid="card-play-badge"
							class="absolute right-1 bottom-1 flex items-center justify-center rounded bg-black/65 p-1"
						>
							<PlayIcon class="size-2.5 fill-white text-white" />
						</span>
					{/if}
				{/if}
			</button>

			<button
				type="button"
				title="View content data + details"
				class="min-w-0 flex-1 text-left"
				onclick={() => onOpenDetails(String(row.id))}
			>
				<div
					class="line-clamp-2 font-slot-cell font-[family-name:var(--font-family-serif)] text-sm leading-tight font-semibold text-foreground"
				>
					{(isPassage(row) && row.displayTitle) || row.name}
				</div>
				{#if isPassage(row)}
					{#if row.displayTitle}
						<div data-testid={`card-subtitle-${row.id}`} class="mt-1 line-clamp-1 text-xs text-muted-foreground">
							{row.name}
						</div>
					{/if}
				{:else if isBook(row)}
					{#if authorCellText(row)}
						<div data-testid={`card-book-author-${row.id}`} class="mt-1 line-clamp-1 text-xs text-muted-foreground">
							{authorCellText(row)}
						</div>
					{/if}
					{#if bookFacts(row).length}
						<CardFacts testid={`card-book-facts-${row.id}`} facts={plain(bookFacts(row))} class="mt-1.5" />
					{/if}
				{:else if isWebPage(row)}
					{#if webPageAuthor(row)}
						<div data-testid={`card-webpage-author-${row.id}`} class="mt-1 line-clamp-1 text-xs text-muted-foreground">
							{webPageAuthor(row)}
						</div>
					{/if}
					<CardFacts testid={`card-webpage-facts-${row.id}`} facts={webPageCardFacts(row)} class="mt-1.5" />
				{:else if isMovie(row)}
					<CardFacts
						testid={`card-movie-facts-${row.id}`}
						facts={[...plain(movieFacts(row)), ...categoryFact(row)]}
						class="mt-1.5"
					/>
				{:else}
					{@const facts = videoFacts(row)}
					{#if row.channelTitle}
						<div data-testid={`card-channel-${row.id}`} class="mt-1 line-clamp-1 text-xs text-muted-foreground">
							{row.channelTitle}
						</div>
					{/if}
					{#if facts.length}
						<CardFacts testid={`card-facts-${row.id}`} {facts} class="mt-1.5" />
					{/if}
				{/if}
			</button>

			<!-- One column, not a row: on a phone two side-by-side buttons took ~84px of a ~150px text column. -->
			<div data-testid={`card-actions-${row.id}`} class="flex flex-none flex-col items-center">
				{#if perspectiveContentIds.has(String(row.id))}
					<button
						type="button"
						data-testid={`card-perspective-${row.id}`}
						title="Edit your perspective"
						aria-label="Edit your perspective"
						class="flex size-9 flex-none items-center justify-center rounded-md text-primary hover:bg-primary/10"
						onclick={(e) => handleAddPerspective(row, e)}
					>
						<GlassesIcon class="size-4" />
					</button>
				{:else}
					<button
						type="button"
						data-testid={`card-perspective-${row.id}`}
						title="Add a perspective"
						aria-label="Add a perspective"
						class="flex size-9 flex-none items-center justify-center rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary"
						onclick={(e) => handleAddPerspective(row, e)}
					>
						<PlusIcon class="size-4" />
					</button>
				{/if}
				{#if onAddToPlan}
					<AddToPlanButton variant="icon" onclick={() => onAddToPlan(String(row.id))} />
				{/if}
			</div>
		</div>
	{/each}
</div>
