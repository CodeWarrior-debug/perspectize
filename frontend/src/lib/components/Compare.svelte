<script lang="ts">
	import type { LengthDisplay } from '$lib/queries/content';
	import { createQuery } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { graphqlRequest } from '$lib/queries/client';
	import {
		LIST_PERSPECTIVES_BY_CONTENT,
		MAX_PERSPECTIVES_PER_LIST,
		type ListPerspectivesByContentResponse,
	} from '$lib/queries/perspectives';
	import { GET_CONTENT } from '$lib/queries/content';
	import { queryKeys } from '$lib/queries/keys';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import {
		compareRatings,
		filledInDifferently,
		compareFeelings,
		compareOverall,
		summarize,
		sortRatingRows,
		agreementPercent,
	} from '$lib/utils/comparePerspectives';
	import { identityColor } from '$lib/utils/compareIdentity';
	import ComparePickerRow from '$lib/components/ComparePickerRow.svelte';
	import CompareOverallRow from '$lib/components/CompareOverallRow.svelte';
	import CompareRatingTable from '$lib/components/CompareRatingTable.svelte';
	import CompareTakeColumn from '$lib/components/CompareTakeColumn.svelte';
	import { Button } from '$lib/components/shadcn';
	import GlassesIcon from '@lucide/svelte/icons/glasses';
	import { formatDuration, extractVideoIdFromUrl } from '$lib/utils/formatting';
	import { passageIconLabels } from '$lib/utils/bible';
	import BiblePassageIcon from '$lib/components/BiblePassageIcon.svelte';

	interface CompareContentBanner {
		id: string;
		name: string;
		url: string | null;
		contentType?: string;
		verseStartID?: number | null;
		verseEndID?: number | null;
		displayTitle?: string | null;
		length: number | null;
		lengthUnits: string | null;
		lengthDisplay?: LengthDisplay | null;
	}
	interface GetContentResponse {
		contentByID: CompareContentBanner | null;
	}

	let {
		contentId,
		initialLeftId,
		initialRightId,
	}: {
		contentId: string;
		initialLeftId: string | null;
		initialRightId: string | null;
	} = $props();

	const meCtx = useMe();

	const perspectivesQuery = createQuery(() => ({
		queryKey: queryKeys.perspectives.listByContent(Number(contentId)),
		queryFn: () =>
			graphqlRequest<ListPerspectivesByContentResponse>(LIST_PERSPECTIVES_BY_CONTENT, {
				contentID: Number(contentId),
				first: MAX_PERSPECTIVES_PER_LIST,
			}),
	}));

	// GET_CONTENT (contentByID) is the existing single-content query in
	// $lib/queries/content — it does NOT return channelTitle/description/tags,
	// only the fields below, so the banner is limited to what it actually has.
	const contentQuery = createQuery(() => ({
		queryKey: queryKeys.content.banner(contentId),
		queryFn: () => graphqlRequest<GetContentResponse>(GET_CONTENT, { id: contentId }),
	}));

	const perspectives = $derived(perspectivesQuery.data?.perspectives.items ?? []);
	// Usernames arrive on the perspective rows themselves (Perspective.user).
	const usernames = $derived(
		new Map(perspectives.filter((p) => p.user).map((p) => [p.userID, p.user!.username] as const)),
	);
	const content = $derived(contentQuery.data?.contentByID ?? null);

	function displayName(userID: string): string {
		if (meCtx.me && userID === meCtx.me.id) return 'You';
		return usernames.get(userID) ?? `User ${userID}`;
	}

	// Picker candidates: every user with a fetched perspective row (privacy
	// gating already happened server-side — see LIST_PERSPECTIVES_BY_CONTENT).
	const options = $derived(perspectives.map((p) => ({ id: p.userID, name: displayName(p.userID) })));

	function defaultLeftId(): string | null {
		if (meCtx.me && perspectives.some((p) => p.userID === meCtx.me!.id)) return meCtx.me.id;
		return perspectives[0]?.userID ?? null;
	}

	function defaultRightId(excludeId: string | null): string | null {
		const candidates = perspectives.filter((p) => p.userID !== excludeId);
		if (candidates.length === 0) return null;
		return candidates.reduce((latest, p) => (p.updatedAt > latest.updatedAt ? p : latest)).userID;
	}

	// A URL id is only honored if it names a user present in the fetched
	// (privacy-scoped) perspectives set — otherwise (stale/bookmarked link to
	// a since-deleted/private perspective) fall back to the computed default
	// rather than silently treating the invalid id as a valid selection.
	function validId(id: string | null): string | null {
		if (id === null) return null;
		return options.some((o) => o.id === id) ? id : null;
	}

	const leftId = $derived(validId(initialLeftId) ?? defaultLeftId());
	const rightId = $derived(validId(initialRightId) ?? defaultRightId(leftId));

	function updateUrl(next: { left?: string; right?: string }) {
		const params = new URLSearchParams();
		params.set('contentId', contentId);
		params.set('left', next.left ?? leftId ?? '');
		params.set('right', next.right ?? rightId ?? '');
		goto(`/compare?${params.toString()}`, { replaceState: true, keepFocus: true, noScroll: true });
	}

	function handleLeftChange(id: string) {
		updateUrl({ left: id });
	}
	function handleRightChange(id: string) {
		updateUrl({ right: id });
	}
	function handleSwap() {
		if (!leftId || !rightId) return;
		updateUrl({ left: rightId, right: leftId });
	}

	const leftPerspective = $derived(perspectives.find((p) => p.userID === leftId) ?? null);
	const rightPerspective = $derived(perspectives.find((p) => p.userID === rightId) ?? null);

	let sortDesc = $state(false);

	const ratingRows = $derived.by(() => {
		if (!leftPerspective || !rightPerspective) return [];
		return sortRatingRows(compareRatings(leftPerspective, rightPerspective), sortDesc);
	});
	const filledInDifferentlyRows = $derived.by(() =>
		leftPerspective && rightPerspective ? filledInDifferently(leftPerspective, rightPerspective) : [],
	);
	const feelingsComparison = $derived.by(() =>
		leftPerspective && rightPerspective
			? compareFeelings(leftPerspective, rightPerspective)
			: { shared: [], leftOnly: [], rightOnly: [] },
	);
	const overall = $derived.by(() =>
		leftPerspective && rightPerspective
			? compareOverall(leftPerspective, rightPerspective)
			: { left: null, right: null, status: 'none' as const },
	);
	const summary = $derived(summarize(ratingRows, filledInDifferentlyRows));
	const overallAgreementPercent = $derived(agreementPercent(ratingRows));
	const hasOverlap = $derived(ratingRows.length > 0);

	// Zero overlap means every rated dimension landed in "filled in
	// differently" — showing "0 similar · 0 diverge · 0 conflict" reads as
	// either perfect agreement or a broken page, so swap in a plain
	// empty-state message instead (compare-no-overlap-summary #1).
	const noOverlapMessage = $derived.by(() => {
		if (!leftId || !rightId) return '';
		const leftLabel = displayName(leftId);
		const rightLabel = displayName(rightId);
		if (summary.leftOnly === 0 && summary.rightOnly === 0) return `Neither of you rated any shared dimensions.`;
		if (summary.rightOnly === 0) return `${rightLabel} didn't rate this.`;
		if (summary.leftOnly === 0) return `${leftLabel} didn't rate this.`;
		return `${leftLabel} and ${rightLabel} rated different dimensions — nothing to compare directly.`;
	});

	const loading = $derived(perspectivesQuery.isLoading);
	const hasComparison = $derived(perspectives.length >= 2 && !!leftPerspective && !!rightPerspective);
	const hasNoPerspectives = $derived(!loading && perspectives.length === 0);

	// The page otherwise silently defaults to comparing OTHER people's takes
	// even when the signed-in viewer has never weighed in themselves —
	// nudge them to add one instead of leaving it unsaid (compare-page
	// enhancements #8). Not shown when signed out; there's nowhere for them
	// to add a perspective from.
	const viewerHasPerspective = $derived(meCtx.me ? perspectives.some((p) => p.userID === meCtx.me!.id) : true);

	const isPassage = $derived(content?.contentType === 'BIBLE_PASSAGE');
	const contentVideoId = $derived(extractVideoIdFromUrl(content?.url ?? null));
</script>

<div class="mx-auto flex max-w-[880px] flex-col gap-4 px-5 py-5">
	<a href="/" class="text-[13px] text-muted-foreground hover:text-foreground">&larr; Back to Activity</a>

	<div class="flex items-center gap-2">
		<GlassesIcon class="size-[18px]" style="color: var(--color-primary);" />
		<h1 class="text-xl font-semibold text-foreground">Compare perspectives</h1>
	</div>
	<p class="-mt-2 text-[12.5px]" style="color: var(--color-muted-foreground);">
		Where ratings align, conflict, or were filled in differently.
	</p>

	{#snippet contentBannerInner()}
		<div class="flex items-center gap-2.5">
			{#if isPassage}
				<div class="h-8 w-10 flex-none overflow-hidden rounded bg-muted">
					<BiblePassageIcon {...passageIconLabels(content ?? {})} />
				</div>
			{:else if contentVideoId}
				<img
					src={`https://i.ytimg.com/vi/${contentVideoId}/default.jpg`}
					alt=""
					class="h-8 w-10 flex-none rounded object-cover"
				/>
			{/if}
			<span class="text-[13px] font-medium text-foreground">{content!.name}</span>
		</div>
		{#if content!.length != null && content!.lengthUnits != null}
			<span class="text-[12px] text-muted-foreground"
				>{formatDuration(content!.length, content!.lengthUnits, content!.lengthDisplay?.precision)}</span
			>
		{/if}
	{/snippet}

	{#if content}
		{#if content.url}
			<a
				href={content.url}
				target="_blank"
				rel="noopener noreferrer"
				class="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5 hover:bg-primary/[0.06]"
			>
				{@render contentBannerInner()}
			</a>
		{:else}
			<div class="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
				{@render contentBannerInner()}
			</div>
		{/if}
	{:else if contentQuery.isError}
		<div class="flex items-center justify-between gap-3 rounded-lg border border-border px-3.5 py-2.5">
			<span class="text-[12.5px] text-muted-foreground">Couldn't load this content's details.</span>
			<Button size="sm" variant="outline" onclick={() => contentQuery.refetch()}>Retry</Button>
		</div>
	{/if}

	{#if loading}
		<div class="py-12 text-center text-muted-foreground">Loading comparison…</div>
	{:else if perspectivesQuery.isError}
		<div class="flex flex-col items-center gap-3 py-12 text-center text-muted-foreground">
			<p>Failed to load this comparison.</p>
			<Button
				size="sm"
				variant="outline"
				onclick={() => {
					perspectivesQuery.refetch();
				}}
			>
				Retry
			</Button>
		</div>
	{:else if hasNoPerspectives}
		<div class="rounded-lg border border-border bg-accent p-6 text-center text-[13.5px] text-muted-foreground">
			No one has shared a perspective on this content yet.
		</div>
	{:else if !hasComparison}
		<div class="rounded-lg border border-border bg-accent p-6 text-center text-[13.5px] text-muted-foreground">
			No other perspectives on this content yet to compare against.
		</div>
	{:else}
		{#if meCtx.me && !viewerHasPerspective}
			<div
				class="flex items-center justify-between gap-3 rounded-lg border border-border bg-accent px-3.5 py-2.5"
				data-testid="add-perspective-cta"
			>
				<p class="text-[12.5px] text-muted-foreground">
					You haven't shared a perspective on this yet — these are all other people's takes.
				</p>
				<Button href="/" size="sm" variant="outline">Add yours</Button>
			</div>
		{/if}

		<ComparePickerRow
			{options}
			leftId={leftId!}
			rightId={rightId!}
			viewerId={meCtx.me?.id ?? null}
			onLeftChange={handleLeftChange}
			onRightChange={handleRightChange}
			onSwap={handleSwap}
		/>

		{#if hasOverlap}
			<div class="flex flex-wrap items-center gap-4 text-[12.5px]">
				<span class="flex items-center gap-1.5">
					<span class="size-1.5 rounded-full" style="background-color: var(--color-rating-positive);"></span>
					{summary.similar} similar
				</span>
				<span class="flex items-center gap-1.5">
					<span class="size-1.5 rounded-full" style="background-color: var(--color-rating-neutral);"></span>
					{summary.diverges} diverge
				</span>
				<span class="flex items-center gap-1.5">
					<span class="size-1.5 rounded-full" style="background-color: var(--color-rating-negative);"></span>
					{summary.conflict} conflict
				</span>
				{#if summary.leftOnly > 0}
					<span class="text-muted-foreground">{summary.leftOnly} only {displayName(leftId!)} rated</span>
				{/if}
				{#if summary.rightOnly > 0}
					<span class="text-muted-foreground">{summary.rightOnly} only {displayName(rightId!)} rated</span>
				{/if}
			</div>
		{:else}
			<p class="text-[12.5px] text-muted-foreground">{noOverlapMessage}</p>
		{/if}

		<CompareOverallRow
			{overall}
			leftName={displayName(leftId!)}
			rightName={displayName(rightId!)}
			agreementPercent={overallAgreementPercent}
		/>

		<div class="grid gap-4" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
			<CompareTakeColumn
				name={displayName(leftId!)}
				avatarColor={identityColor(leftId!, meCtx.me?.id ?? null)}
				review={leftPerspective!.review}
				uniqueFeelings={feelingsComparison.leftOnly}
			/>
			<CompareRatingTable
				rows={ratingRows}
				filledInDifferently={filledInDifferentlyRows}
				feelings={feelingsComparison}
				{sortDesc}
				onToggleSort={() => (sortDesc = !sortDesc)}
				leftName={displayName(leftId!)}
				rightName={displayName(rightId!)}
			/>
			<CompareTakeColumn
				name={displayName(rightId!)}
				avatarColor={identityColor(rightId!, meCtx.me?.id ?? null)}
				review={rightPerspective!.review}
				uniqueFeelings={feelingsComparison.rightOnly}
			/>
		</div>
	{/if}
</div>
