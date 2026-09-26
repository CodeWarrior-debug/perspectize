<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { goto } from '$app/navigation';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_USERS, type UsersResponse } from '$lib/queries/users';
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
	import ComparePickerRow from '$lib/components/ComparePickerRow.svelte';
	import CompareOverallRow from '$lib/components/CompareOverallRow.svelte';
	import CompareRatingTable from '$lib/components/CompareRatingTable.svelte';
	import CompareTakeColumn from '$lib/components/CompareTakeColumn.svelte';
	import GlassesIcon from '@lucide/svelte/icons/glasses';
	import { formatDuration, extractVideoIdFromUrl } from '$lib/utils/formatting';

	interface CompareContentBanner {
		id: string;
		name: string;
		url: string | null;
		length: number | null;
		lengthUnits: string | null;
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

	const usersQuery = createQuery(() => ({
		queryKey: queryKeys.users.list(),
		queryFn: () => graphqlRequest<UsersResponse>(LIST_USERS),
		staleTime: 5 * 60 * 1000,
	}));

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
	const users = $derived(usersQuery.data?.users ?? []);
	const content = $derived(contentQuery.data?.contentByID ?? null);

	function displayName(userID: string): string {
		if (meCtx.me && userID === meCtx.me.id) return 'You';
		return users.find((u) => u.id === userID)?.username ?? `User ${userID}`;
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
			: { left: null, right: null, agree: false },
	);
	const summary = $derived(summarize(ratingRows));
	const overallAgreementPercent = $derived(agreementPercent(ratingRows));

	const loading = $derived(usersQuery.isLoading || perspectivesQuery.isLoading);
	const hasComparison = $derived(perspectives.length >= 2 && !!leftPerspective && !!rightPerspective);
	const hasNoPerspectives = $derived(!loading && perspectives.length === 0);

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

	{#if content}
		<div class="flex items-center justify-between rounded-lg border border-border px-3.5 py-2.5">
			<div class="flex items-center gap-2.5">
				{#if contentVideoId}
					<img
						src={`https://i.ytimg.com/vi/${contentVideoId}/default.jpg`}
						alt=""
						class="h-8 w-10 flex-none rounded object-cover"
					/>
				{/if}
				<span class="text-[13px] font-medium text-foreground">{content.name}</span>
			</div>
			{#if content.length != null && content.lengthUnits != null}
				<span class="text-[12px] text-muted-foreground">{formatDuration(content.length, content.lengthUnits)}</span>
			{/if}
		</div>
	{/if}

	{#if loading}
		<div class="py-12 text-center text-muted-foreground">Loading comparison…</div>
	{:else if usersQuery.isError || perspectivesQuery.isError}
		<div class="py-12 text-center text-muted-foreground">Failed to load this comparison. Please try again.</div>
	{:else if hasNoPerspectives}
		<div class="rounded-lg border border-border bg-accent p-6 text-center text-[13.5px] text-muted-foreground">
			No one has shared a perspective on this content yet.
		</div>
	{:else if !hasComparison}
		<div class="rounded-lg border border-border bg-accent p-6 text-center text-[13.5px] text-muted-foreground">
			No other perspectives on this content yet to compare against.
		</div>
	{:else}
		<ComparePickerRow
			{options}
			leftId={leftId!}
			rightId={rightId!}
			viewerId={meCtx.me?.id ?? null}
			onLeftChange={handleLeftChange}
			onRightChange={handleRightChange}
			onSwap={handleSwap}
		/>

		<div class="flex items-center gap-4 text-[12.5px]">
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
		</div>

		<CompareOverallRow {overall} agreementPercent={overallAgreementPercent} />

		<div class="grid gap-4" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
			<CompareTakeColumn
				name={displayName(leftId!)}
				avatarColor={leftId === meCtx.me?.id ? 'var(--color-primary)' : 'var(--color-logo-purple)'}
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
				avatarColor={rightId === meCtx.me?.id ? 'var(--color-primary)' : 'var(--color-logo-purple)'}
				review={rightPerspective!.review}
				uniqueFeelings={feelingsComparison.rightOnly}
			/>
		</div>
	{/if}
</div>
