<script lang="ts">
	import { NO_AUTOFILL } from '#lib/utils/noAutofill.js';
	import type { LengthDisplay, WebPageListMeta } from '#lib/queries/content/index.js';
	import ExternalLinkIcon from '@lucide/svelte/icons/external-link';
	import XIcon from '@lucide/svelte/icons/x';
	import LoaderCircleIcon from '@lucide/svelte/icons/loader-circle';
	import RefreshCwIcon from '@lucide/svelte/icons/refresh-cw';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ScaleIcon from '@lucide/svelte/icons/scale';
	import { MODAL_ACTION_CLASS } from '#lib/components/modal-action.js';
	import { Dialog, DialogContent, DialogTitle, DialogClose } from '#lib/components/shadcn/index.js';
	import {
		formatCount,
		formatDate,
		formatDateTime,
		formatDuration,
		formatRemainingTime,
		formatTags,
		movieResponse,
		extractVideoIdFromUrl,
		getSourceDataCooldown,
	} from '#lib/utils/formatting.js';
	import { useUpdateSourceData } from '#lib/queries/content/useUpdateSourceData.js';
	import { useContentAggregates } from '#lib/queries/content/useContentAggregates.js';
	import { ratingToDisplay } from '#lib/utils/ratings.js';
	import MovieTiles from '#lib/components/MovieTiles.svelte';
	import MovieBody from '#lib/components/MovieBody.svelte';
	import BookTiles from '#lib/components/BookTiles.svelte';
	import BookBody from '#lib/components/BookBody.svelte';
	import WebPageTiles from '#lib/components/WebPageTiles.svelte';
	import WebPageBody from '#lib/components/WebPageBody.svelte';
	import { webPageSite } from '#lib/utils/webPage.js';
	import { useContentDetails } from '#lib/queries/content/useContentDetails.js';
	import { bookAuthors, bookResponse, openLibraryCoverUrl } from '#lib/utils/bookFormatting.js';
	import PassageText from '#lib/components/PassageText.svelte';
	import PassagePositionBar from '#lib/components/PassagePositionBar.svelte';
	import PassageLinks from '#lib/components/PassageLinks.svelte';
	import AudioTrackPanel from '#lib/components/AudioTrackPanel.svelte';
	import { useSetPassageDisplayTitle } from '#lib/queries/bible/useSetPassageDisplayTitle.js';
	import AddToPlanButton from '#lib/components/plan/AddToPlanButton.svelte';

	interface ModalContent {
		id: string;
		name: string;
		url: string | null;
		channelTitle: string | null;
		contentType?: string;
		primaryCategory?: { label: string; wikipediaUrl?: string | null } | null;
		viewCount: number | null;
		likeCount: number | null;
		length: number | null;
		lengthUnits: string | null;
		lengthDisplay?: LengthDisplay | null;
		publishedAt: string | null;
		createdAt?: string;
		updatedAt: string;
		description: string | null;
		tags: string[] | null;
		displayTitle?: string | null;
		verseStartID?: number | null;
		verseEndID?: number | null;
		// MOVIE rows only: the shaped TMDB payload selected by LIST_CONTENT.
		movie?: unknown;
		// BOOK rows only: the shaped Open Library payload selected by LIST_CONTENT / GET_CONTENT_DETAILS.
		book?: unknown;
		// WEB_PAGE rows: the shaped list payload (site, published, roles, og image).
		webPage?: WebPageListMeta | null;
		response?: unknown;
	}

	let {
		content,
		open = false,
		onClose,
		onAddToPlan,
		onAddPerspective,
	}: {
		content: ModalContent | null;
		open?: boolean;
		onClose: () => void;
		/** Shows "Add to plan" (signed-in users only) when provided. The caller owns the todo dialog. */
		onAddToPlan?: (content: ModalContent) => void;
		/** Shows "Add perspective" when provided; opens the same editor as the grid's ◎ control. */
		onAddPerspective?: (content: ModalContent) => void;
	} = $props();

	const isMovie = $derived(content?.contentType === 'MOVIE');
	const isBook = $derived(content?.contentType === 'BOOK');
	const isWebPage = $derived(content?.contentType === 'WEB_PAGE');
	// A list row carries the shaped webpage payload but not `response` (the metadata behind the Fetched
	// tile and the description). Load the details for that one page while the modal is open. A row that
	// already has `response`, or a closed modal, makes no request. The hook's key is the one a deep link
	// uses, so the two share a cache entry.
	const needsWebPageDetails = $derived(open && isWebPage && content != null && content.response == null);
	const webPageDetails = useContentDetails(() => (needsWebPageDetails && content ? content.id : null));
	const webPageState = $derived<'loading' | 'failed' | 'loaded'>(
		!needsWebPageDetails
			? 'loaded'
			: webPageDetails.isError
				? 'failed'
				: webPageDetails.isPending
					? 'loading'
					: 'loaded',
	);
	/** The row with its loaded details `response` merged in. A row that already has one is returned as is. */
	function withWebPageDetails(row: ModalContent): ModalContent {
		return { ...row, response: row.response ?? webPageDetails.data?.contentByID?.response ?? null };
	}
	const isPassage = $derived(content?.contentType === 'BIBLE_PASSAGE');
	const isAudioTrack = $derived(content?.contentType === 'AUDIO_TRACK');
	const hasVerseRange = $derived(isPassage && content?.verseStartID != null && content?.verseEndID != null);
	const setPassageTitle = useSetPassageDisplayTitle();
	let titleDraft = $state('');

	function handleSaveTitle(e: SubmitEvent) {
		e.preventDefault();
		const title = titleDraft.trim();
		if (!content || !title) return;
		setPassageTitle.mutate({ contentID: content.id, title });
	}

	const videoId = $derived(content ? extractVideoIdFromUrl(content.url) : null);
	const thumbSrc = $derived(videoId ? `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg` : null);
	const movie = $derived(content ? movieResponse(content) : null);
	const posterSrc = $derived(movie?.posterPath ? `https://image.tmdb.org/t/p/w342${movie.posterPath}` : null);
	const bookData = $derived(bookResponse(content));
	const coverSrc = $derived(isBook ? openLibraryCoverUrl(bookData?.coverId, 'L') : null);
	const authorNames = $derived(
		bookAuthors(content)
			.map((a) => a.name)
			.join(', '),
	);
	const hasTags = $derived(!!content?.tags && content.tags.length > 0);
	const hasDescription = $derived(!!content?.description && content.description.trim().length > 0);

	// Source data (title/description/stats) is cache-served by the backend for
	// up to 6h after the last update — refreshing again inside that window
	// would just re-show identical numbers. Gate the button client-side so
	// that's explained upfront instead of a "success" toast that changes
	// nothing. See getSourceDataCooldown's doc comment for why this is a UX
	// estimate, not the actual enforcement.
	const cooldown = $derived(content ? getSourceDataCooldown(content.updatedAt) : { active: false, remainingMs: 0 });

	const updateSourceData = useUpdateSourceData();

	// Lazy-loaded on demand — see useContentAggregates's doc comment. Keyed off
	// the currently-open content's id, so it only fetches while the modal is
	// actually open for a given item (re-runs if the id changes while open).
	const aggregatesQuery = useContentAggregates(() => (open ? (content?.id ?? null) : null));
	// The "Imported from" row waits for this viewer-scoped query: absent while loading, on error, or when null.
	const importedFrom = $derived(aggregatesQuery.data?.contentByID?.importedFrom ?? null);
	const perspectiveCountDisplay = $derived(
		aggregatesQuery.isLoading ? '…' : (aggregatesQuery.data?.contentByID?.perspectiveCount ?? 0).toString(),
	);
	const averageRatingDisplay = $derived.by(() => {
		if (aggregatesQuery.isLoading) return '…';
		const avg = aggregatesQuery.data?.contentByID?.averageRating;
		return avg === null || avg === undefined ? '—' : ratingToDisplay(avg);
	});
	// Tooltip on the Avg. Rating tile — how many quality ratings it's averaged
	// over, since that can be fewer than the perspective count (Quality is an
	// optional field on a perspective).
	const qualityRatingCountTooltip = $derived.by(() => {
		if (aggregatesQuery.isLoading) return 'Loading…';
		const count = aggregatesQuery.data?.contentByID?.qualityRatingCount ?? 0;
		return count === 1 ? '1 quality rating' : `${count} quality ratings`;
	});

	function handleOpenChange(next: boolean) {
		if (!next) onClose();
	}

	function handleUpdateSourceData() {
		if (!content || cooldown.active) return;
		updateSourceData.mutate(content.id);
	}
</script>

{#if content}
	<Dialog {open} onOpenChange={handleOpenChange}>
		<DialogContent showCloseButton={false} class="max-w-[560px] gap-0 overflow-hidden rounded-xl p-0">
			<div class="flex items-start justify-between gap-3 bg-primary px-[22px] py-[18px]">
				<DialogTitle class="text-xs font-semibold tracking-wide text-primary-foreground/70 uppercase">
					{content.contentType === 'CLAIM'
						? 'Claim'
						: isPassage
							? 'Bible Passage'
							: isAudioTrack
								? 'Audio Track'
								: isMovie
									? 'Movie'
									: isBook
										? 'Book'
										: isWebPage
											? 'Webpage'
											: 'YouTube Video'}
				</DialogTitle>
				<DialogClose class="text-primary-foreground/80 hover:text-primary-foreground">
					<XIcon class="size-[18px]" />
					<span class="sr-only">Close</span>
				</DialogClose>
			</div>

			<div class="max-h-[calc(88vh-56px)] overflow-y-auto p-[22px]">
				{#if isPassage}
					<div class="min-w-0">
						<div
							data-testid="passage-title"
							class="font-slot-cell font-[family-name:var(--font-family-serif)] text-[17px] leading-tight font-bold text-foreground"
						>
							{content.displayTitle || content.name}
						</div>
						{#if content.displayTitle}
							<div class="mt-1 text-[13px] text-muted-foreground">{content.name}</div>
						{/if}
					</div>

					{#if hasVerseRange}
						<div class="mt-3.5 border-t border-border pt-3.5">
							<PassageText startVerseId={content.verseStartID!} endVerseId={content.verseEndID!} />
							<div class="mt-3.5">
								<PassagePositionBar startVerseId={content.verseStartID!} endVerseId={content.verseEndID!} />
							</div>
							<div class="mt-3.5">
								<PassageLinks startVerseId={content.verseStartID!} endVerseId={content.verseEndID!} />
							</div>
						</div>
					{/if}

					{#if !content.displayTitle}
						<form class="mt-3.5 flex items-center gap-2" onsubmit={handleSaveTitle}>
							<input
								{...NO_AUTOFILL}
								type="text"
								bind:value={titleDraft}
								maxlength="120"
								placeholder="Add a title (optional, set once)"
								aria-label="Passage title"
								class="h-9 min-w-0 flex-1 rounded-md border border-border bg-background px-2.5 text-[13px] text-foreground"
							/>
							<button
								type="submit"
								disabled={setPassageTitle.isPending || !titleDraft.trim()}
								class={MODAL_ACTION_CLASS}
							>
								Save title
							</button>
						</form>
					{/if}
				{:else}
					<div class="flex items-start gap-3.5">
						<div
							class={isMovie || isBook
								? 'aspect-[2/3] w-[92px] flex-none overflow-hidden rounded-md bg-muted'
								: 'h-[68px] w-[120px] flex-none overflow-hidden rounded-md bg-muted'}
						>
							{#if isMovie}
								{#if posterSrc}
									<img
										src={posterSrc}
										alt={`${content.name} poster`}
										class="h-full w-full object-cover"
										onerror={(e) => e.currentTarget.remove()}
									/>
								{/if}
							{:else if isBook}
								{#if coverSrc}
									<img
										src={coverSrc}
										alt={`${content.name} cover`}
										class="h-full w-full object-contain"
										onerror={(e) => e.currentTarget.remove()}
									/>
								{/if}
							{:else if isWebPage}
								{#if content.webPage?.imageUrl}
									<img
										src={content.webPage.imageUrl}
										alt=""
										referrerpolicy="no-referrer"
										class="h-full w-full object-cover"
										onerror={(e) => e.currentTarget.remove()}
									/>
								{/if}
							{:else if thumbSrc}
								<img
									src={thumbSrc}
									alt=""
									class="h-full w-full object-cover"
									onerror={(e) => e.currentTarget.remove()}
								/>
							{/if}
						</div>
						<div class="min-w-0">
							<div
								class="font-slot-cell font-[family-name:var(--font-family-serif)] text-[17px] leading-tight font-bold text-foreground"
							>
								{content.name}
							</div>
							{#if isMovie}
								{#if movie?.tagline}
									<div class="mt-1 text-[13px] text-muted-foreground italic">{movie.tagline}</div>
								{/if}
							{:else}
								{#if isBook}
									{#if authorNames}<div class="mt-1 text-[13px] text-muted-foreground">{authorNames}</div>{/if}
								{:else}
									{#if isWebPage}<div class="mt-1 text-[13px] text-muted-foreground">
											{webPageSite(content) ?? ''}
										</div>{:else}<div class="mt-1 text-[13px] text-muted-foreground">{content.channelTitle}</div>{/if}
								{/if}
							{/if}
						</div>
					</div>
				{/if}

				{#if isAudioTrack}
					<AudioTrackPanel contentId={content.id} name={content.name} url={content.url} {open} />
				{/if}

				<!-- A passage's stored url is its version-less dedupe key; PassageLinks shows versioned links instead. -->
				{#if content.url && !isPassage}
					<a
						href={content.url}
						target="_blank"
						rel="noopener noreferrer"
						class="mt-3.5 flex items-center gap-1.5 text-[13px] break-all text-primary no-underline hover:underline"
					>
						<ExternalLinkIcon class="size-3.5 flex-none" />
						<span>{content.url}</span>
					</a>
				{/if}

				{#if importedFrom}
					<div class="mt-3.5 text-[13px] text-muted-foreground">
						<span>Imported from</span>
						<a href={`/import/${importedFrom.id}`} class="font-medium text-primary underline-offset-2 hover:underline">
							{importedFrom.name}
						</a>
					</div>
				{/if}

				<div class="mt-4.5 grid grid-cols-2 gap-2.5">
					<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
						<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Perspectives</div>
						<div
							class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-lg font-bold text-foreground"
						>
							{perspectiveCountDisplay}
						</div>
					</div>
					<div
						class="hover-tooltip rounded-lg border border-border bg-muted px-3 py-2.5"
						data-tooltip={qualityRatingCountTooltip}
					>
						<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Avg. Rating</div>
						<div
							class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-lg font-bold text-foreground"
						>
							{averageRatingDisplay}
						</div>
					</div>
					{#if isMovie}
						<MovieTiles
							row={content}
							length={content.length}
							lengthUnits={content.lengthUnits}
							precision={content.lengthDisplay?.precision}
						/>
					{:else if isBook}
						<BookTiles row={content} />
					{:else if isWebPage}
						<WebPageTiles row={withWebPageDetails(content)} loading={webPageState === 'loading'} />
					{:else if !isPassage}
						<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
							<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Views</div>
							<div
								class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground"
							>
								{formatCount(content.viewCount)}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
							<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Likes</div>
							<div
								class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground"
							>
								{formatCount(content.likeCount)}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
							<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Duration</div>
							<div
								class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground"
							>
								{formatDuration(content.length, content.lengthUnits, content.lengthDisplay?.precision)}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
							<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Date</div>
							<div
								class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground"
							>
								{content.publishedAt ? formatDate(content.publishedAt) : '—'}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
							<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Category</div>
							<div
								class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground"
							>
								{#if content.primaryCategory?.wikipediaUrl}
									<a
										href={content.primaryCategory.wikipediaUrl}
										target="_blank"
										rel="noopener noreferrer"
										class="underline"
									>
										{content.primaryCategory.label}
									</a>
								{:else}
									{content.primaryCategory?.label ?? '—'}
								{/if}
							</div>
						</div>
						<div class="rounded-lg border border-border bg-muted px-3 py-2.5">
							<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Date Added</div>
							<div
								class="mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-[15px] font-bold text-foreground"
							>
								{content.createdAt ? formatDate(content.createdAt) : '—'}
							</div>
						</div>
					{/if}
				</div>

				<div class="mt-3.5 border-t border-border pt-3.5">
					<div>
						<div class="text-[11px] tracking-wide text-muted-foreground uppercase">Last updated in Perspectize</div>
						<div
							class="hover-tooltip mt-0.5 font-slot-cell font-[family-name:var(--font-family-serif)] text-sm text-foreground"
							data-tooltip={formatDateTime(content.updatedAt)}
						>
							{formatDate(content.updatedAt)}
						</div>
					</div>
					<!-- Actions get their own full-width row so they read as one even set
					     instead of a ragged right-aligned wrap beside the date. Each one
					     grows from the same basis, so a row of them is close to equal width
					     and they wrap whole onto a new row on a phone. -->
					<div class="mt-3 flex flex-wrap gap-2" data-testid="details-actions">
						<a href={`/compare?contentId=${content.id}`} class="{MODAL_ACTION_CLASS} grow basis-36">
							<ScaleIcon />
							Compare
						</a>
						{#if onAddPerspective}
							<button
								type="button"
								onclick={() => onAddPerspective(content)}
								class="{MODAL_ACTION_CLASS} grow basis-36"
							>
								<PlusIcon />
								Add perspective
							</button>
						{/if}
						{#if onAddToPlan}
							<AddToPlanButton variant="text" class="grow basis-36" onclick={() => onAddToPlan(content)} />
						{/if}
						{#if !isPassage && !isMovie && !isWebPage}
							<button
								type="button"
								disabled={updateSourceData.isPending || cooldown.active}
								onclick={handleUpdateSourceData}
								class="{MODAL_ACTION_CLASS} grow basis-36"
							>
								<!-- Same slot for both icons so the button keeps its width. -->
								{#if updateSourceData.isPending}
									<LoaderCircleIcon class="animate-spin" />
								{:else}
									<RefreshCwIcon />
								{/if}
								Update source data
							</button>
						{/if}
					</div>
					{#if !isPassage && !isMovie && !isWebPage && cooldown.active}
						<div class="mt-1.5 text-[11px] text-muted-foreground">
							This was updated recently. Check back in {formatRemainingTime(cooldown.remainingMs)} to refresh again.
						</div>
					{/if}
				</div>

				{#if !isPassage && !isMovie && !isBook && !isWebPage && hasDescription}
					<div class="mt-3.5 border-t border-border pt-3.5">
						<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Description</div>
						<div class="font-slot-longform font-serif text-[13px] whitespace-pre-wrap text-foreground">
							{content.description}
						</div>
					</div>
				{/if}

				{#if !isPassage && !isMovie && !isBook && hasTags}
					<div class="mt-3.5">
						<div class="mb-1.5 text-[11px] tracking-wide text-muted-foreground uppercase">Tags</div>
						<div class="font-slot-cell font-[family-name:var(--font-family-serif)] text-[13px] text-foreground">
							{formatTags(content.tags)}
						</div>
					</div>
				{/if}

				{#if isBook}
					<BookBody row={content} />
				{/if}

				{#if isWebPage}
					<WebPageBody row={withWebPageDetails(content)} state={webPageState} />
				{/if}

				{#if isMovie}
					<MovieBody row={content} />
					<p class="mt-3.5 border-t border-border pt-3.5 text-[11px] text-muted-foreground">
						This product uses the TMDB API but is not endorsed or certified by TMDB.
					</p>
				{/if}
			</div>
		</DialogContent>
	</Dialog>
{/if}
