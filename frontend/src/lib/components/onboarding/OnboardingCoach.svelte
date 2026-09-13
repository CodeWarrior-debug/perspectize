<script lang="ts">
	/**
	 * Skippable two-step checklist coach over the live app (Add Video → Perspective).
	 * Calm fixed panel (desktop) / bottom drawer (mobile). App remains usable underneath.
	 */
	import { MediaQuery } from 'svelte/reactivity';
	import { createQuery } from '@tanstack/svelte-query';
	import XIcon from '@lucide/svelte/icons/x';
	import {
		Button,
		Drawer,
		DrawerContent,
		DrawerHeader,
		DrawerTitle,
		DrawerDescription,
	} from '$lib/components/shadcn';
	import OnboardingVideo from '$lib/components/onboarding/OnboardingVideo.svelte';
	import AddVideoDialog from '$lib/components/AddVideoDialog.svelte';
	import PerspectivePopover from '$lib/components/PerspectivePopover.svelte';
	import { ONBOARDING_VIDEOS, CURRENT_INTRO_VERSION } from '$lib/onboarding/config';
	import {
		advanceCoachStep,
		skipCoachStep,
		coachStepTitle,
		coachStepBody,
		type CoachStep,
	} from '$lib/onboarding/steps';
	import { useMarkOnboardingSeen } from '$lib/queries/users/useMarkOnboardingSeen';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_CONTENT, type ContentItem, type ContentResponse } from '$lib/queries/content';
	import {
		LIST_PERSPECTIVES_BY_USER,
		type ListPerspectivesByUserResponse,
		type PerspectiveItem,
	} from '$lib/queries/perspectives';
	import { queryKeys } from '$lib/queries/keys';
	import { setCoachForceOpen } from '$lib/onboarding/coachGate.svelte';

	let {
		userId,
		open = $bindable(true),
	}: {
		/** Numeric DB user id from `me.id`. */
		userId: number;
		open?: boolean;
	} = $props();

	const isMobile = new MediaQuery('max-width: 639px');
	const markSeen = useMarkOnboardingSeen();

	let step = $state<CoachStep>(1);
	let addVideoOpen = $state(false);
	let perspectiveOpen = $state(false);
	let dismissed = $state(false);

	const userIdStr = $derived(String(userId));

	// Lightweight library + perspectives for step 2 target + empty handling.
	const contentQuery = createQuery(() => ({
		queryKey: [...queryKeys.content.lists(), 'onboarding-coach', userId],
		queryFn: () =>
			graphqlRequest<ContentResponse>(LIST_CONTENT, {
				first: 50,
				sortBy: 'UPDATED_AT',
				sortOrder: 'DESC',
				includeTotalCount: true,
			}),
		enabled: open && userId > 0,
		staleTime: 30_000,
	}));

	const perspectivesQuery = createQuery(() => ({
		queryKey: queryKeys.perspectives.listByUser(userId),
		queryFn: () =>
			graphqlRequest<ListPerspectivesByUserResponse>(LIST_PERSPECTIVES_BY_USER, {
				userID: userId,
			}),
		enabled: open && userId > 0,
		staleTime: 30_000,
	}));

	const ownedContent = $derived.by(() => {
		const items = contentQuery.data?.content?.items ?? [];
		return items.filter((c) => c.addedByUserID === userIdStr);
	});

	const perspectivesByContentId = $derived.by(() => {
		const map = new Map<string, PerspectiveItem>();
		for (const p of perspectivesQuery.data?.perspectives?.items ?? []) {
			if (p.contentID) map.set(p.contentID, p);
		}
		return map;
	});

	/** Prefer owned content without a perspective; fall back to any owned item. */
	const perspectiveTarget = $derived.by((): ContentItem | null => {
		const without = ownedContent.find((c) => !perspectivesByContentId.has(c.id));
		return without ?? ownedContent[0] ?? null;
	});

	const libraryEmpty = $derived(ownedContent.length === 0);

	function finishIntro() {
		if (dismissed) return;
		dismissed = true;
		open = false;
		setCoachForceOpen(false);
		markSeen.mutate(CURRENT_INTRO_VERSION);
	}

	function handleSkipAll() {
		finishIntro();
	}

	function handleDismiss() {
		finishIntro();
	}

	function handleSkipStep() {
		const next = skipCoachStep(step);
		if (next === 'complete') {
			finishIntro();
		} else {
			step = next;
		}
	}

	function handleActionSuccess() {
		const next = advanceCoachStep(step);
		if (next === 'complete') {
			finishIntro();
		} else {
			step = next;
			// Refresh library after add
			void contentQuery.refetch?.();
		}
	}

	function openAddVideo() {
		addVideoOpen = true;
	}

	function openPerspective() {
		if (!perspectiveTarget) return;
		perspectiveOpen = true;
	}

	function goToStep1() {
		step = 1;
	}

	// Esc → mark seen (control > ceremony)
	$effect(() => {
		if (!open || dismissed) return;
		function onKey(e: KeyboardEvent) {
			if (e.key === 'Escape' && !addVideoOpen && !perspectiveOpen) {
				e.preventDefault();
				handleDismiss();
			}
		}
		window.addEventListener('keydown', onKey);
		return () => window.removeEventListener('keydown', onKey);
	});
</script>

{#snippet coachBody()}
	<div class="space-y-4">
		<div class="flex items-start justify-between gap-3">
			<div class="space-y-1">
				<p class="text-xs font-medium uppercase tracking-wide text-muted-foreground">
					Getting started · Step {step} of 2
				</p>
				<h2 class="text-lg font-semibold text-foreground">{coachStepTitle(step)}</h2>
				<p class="text-sm text-muted-foreground text-pretty">{coachStepBody(step)}</p>
			</div>
			<button
				type="button"
				class="rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
				aria-label="Dismiss getting started"
				onclick={handleDismiss}
			>
				<XIcon class="h-4 w-4" />
			</button>
		</div>

		{#if step === 1}
			{#if ONBOARDING_VIDEOS.howAddVideo}
				<OnboardingVideo src={ONBOARDING_VIDEOS.howAddVideo} label="Don’t have a video? Watch how" />
			{/if}
			<div class="flex flex-wrap gap-2">
				<Button type="button" onclick={openAddVideo}>Add video</Button>
				<Button type="button" variant="ghost" onclick={handleSkipStep}>Skip step</Button>
			</div>
		{:else}
			{#if libraryEmpty}
				<p class="text-sm text-muted-foreground">
					Your library is empty. Add a video first, or skip this step.
				</p>
				{#if ONBOARDING_VIDEOS.howPerspective}
					<OnboardingVideo
						src={ONBOARDING_VIDEOS.howPerspective}
						label="Watch how perspectives work"
					/>
				{/if}
				<div class="flex flex-wrap gap-2">
					<Button type="button" variant="outline" onclick={goToStep1}>Back to add video</Button>
					<Button type="button" variant="ghost" onclick={handleSkipStep}>Skip step</Button>
				</div>
			{:else}
				{#if ONBOARDING_VIDEOS.howPerspective}
					<OnboardingVideo
						src={ONBOARDING_VIDEOS.howPerspective}
						label="Watch how perspectives work"
					/>
				{/if}
				{#if perspectiveTarget}
					<p class="text-sm text-muted-foreground line-clamp-2">
						On: <span class="font-medium text-foreground">{perspectiveTarget.name}</span>
					</p>
				{/if}
				<div class="flex flex-wrap gap-2">
					<Button type="button" onclick={openPerspective} disabled={!perspectiveTarget}>
						Leave a perspective
					</Button>
					<Button type="button" variant="ghost" onclick={handleSkipStep}>Skip step</Button>
				</div>
			{/if}
		{/if}

		<div class="flex items-center justify-between border-t pt-3">
			<button
				type="button"
				class="text-xs text-muted-foreground underline-offset-2 hover:underline"
				onclick={handleSkipAll}
			>
				Skip all
			</button>
			<button
				type="button"
				class="text-xs text-muted-foreground underline-offset-2 hover:underline"
				onclick={handleDismiss}
			>
				Don't show again
			</button>
		</div>
	</div>
{/snippet}

{#if open && !dismissed}
	{#if !isMobile.current}
		<!-- Non-blocking desktop panel — no full-screen lock -->
		<div
			class="pointer-events-auto fixed bottom-4 right-4 z-40 w-[min(100vw-2rem,22rem)] rounded-xl border bg-background/95 p-4 shadow-lg backdrop-blur supports-[backdrop-filter]:bg-background/80"
			role="complementary"
			aria-labelledby="onboarding-coach-title"
		>
			<span id="onboarding-coach-title" class="sr-only">Getting started</span>
			{@render coachBody()}
		</div>
	{:else}
		<Drawer
			bind:open
			onOpenChange={(isOpen) => {
				if (!isOpen) handleDismiss();
			}}
		>
			<DrawerContent class="max-h-[88vh] p-4">
				<DrawerHeader class="sr-only">
					<DrawerTitle>Getting started</DrawerTitle>
					<DrawerDescription>Checklist coach</DrawerDescription>
				</DrawerHeader>
				{@render coachBody()}
			</DrawerContent>
		</Drawer>
	{/if}
{/if}

<AddVideoDialog bind:open={addVideoOpen} onSuccess={handleActionSuccess} />

{#if perspectiveOpen && perspectiveTarget}
	<PerspectivePopover
		contentId={parseInt(perspectiveTarget.id, 10)}
		contentName={perspectiveTarget.name}
		existingPerspective={perspectivesByContentId.get(perspectiveTarget.id) ?? null}
		{userId}
		bind:open={perspectiveOpen}
		onClose={() => {
			perspectiveOpen = false;
		}}
		onSuccess={handleActionSuccess}
	/>
{/if}
