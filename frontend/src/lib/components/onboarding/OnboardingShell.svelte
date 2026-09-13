<script lang="ts">
	/**
	 * Signed-in shell: coach eligibility, quiet graduate, and OnboardingCoach mount.
	 */
	import { createQuery } from '@tanstack/svelte-query';
	import { useMe } from '$lib/queries/users/useMe.svelte';
	import { isCoachEligible } from '$lib/onboarding/eligibility';
	import {
		resolveShowCoach,
		resolveQuietGraduate,
		markQuietGraduateAttempted,
		getCoachForceOpen,
	} from '$lib/onboarding/coachGate.svelte';
	import { CURRENT_INTRO_VERSION } from '$lib/onboarding/config';
	import { useMarkOnboardingSeen } from '$lib/queries/users/useMarkOnboardingSeen';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_CONTENT, type ContentResponse } from '$lib/queries/content';
	import {
		LIST_PERSPECTIVES_BY_USER,
		type ListPerspectivesByUserResponse,
	} from '$lib/queries/perspectives';
	import { queryKeys } from '$lib/queries/keys';
	import OnboardingCoach from '$lib/components/onboarding/OnboardingCoach.svelte';

	const meState = useMe();
	const markSeen = useMarkOnboardingSeen();

	const meLoaded = $derived(meState.isSuccess && !!meState.me?.onboarding);
	const onboarding = $derived(meState.me?.onboarding ?? null);
	const eligible = $derived(isCoachEligible({ meLoaded, onboarding }));
	const userId = $derived(meState.me ? parseInt(meState.me.id, 10) : 0);
	const userIdStr = $derived(meState.me?.id ?? '');
	const forceOpen = $derived(getCoachForceOpen());

	const showCoach = $derived(
		resolveShowCoach({
			signedIn: true,
			meLoaded,
			onboarding,
		}),
	);

	// Counts for quiet graduate — only when auto-eligible and not Help force-open.
	const needQuietCheck = $derived(eligible && !forceOpen && userId > 0);

	const contentQuery = createQuery(() => ({
		queryKey: [...queryKeys.content.lists(), 'quiet-graduate', userId],
		queryFn: () =>
			graphqlRequest<ContentResponse>(LIST_CONTENT, {
				first: 20,
				sortBy: 'UPDATED_AT',
				sortOrder: 'DESC',
				includeTotalCount: false,
			}),
		enabled: needQuietCheck,
		staleTime: 60_000,
	}));

	const perspectivesQuery = createQuery(() => ({
		queryKey: queryKeys.perspectives.listByUser(userId),
		queryFn: () =>
			graphqlRequest<ListPerspectivesByUserResponse>(LIST_PERSPECTIVES_BY_USER, {
				userID: userId,
			}),
		enabled: needQuietCheck,
		staleTime: 60_000,
	}));

	const ownedContentCount = $derived(
		(contentQuery.data?.content?.items ?? []).filter((c) => c.addedByUserID === userIdStr)
			.length,
	);
	const perspectiveCount = $derived(perspectivesQuery.data?.perspectives?.items?.length ?? 0);
	const countsReady = $derived(
		!needQuietCheck || (contentQuery.isSuccess && perspectivesQuery.isSuccess),
	);

	const quietMatch = $derived(
		needQuietCheck &&
			countsReady &&
			resolveQuietGraduate({
				eligible,
				ownedContentCount,
				perspectiveCount,
				completedAt: onboarding?.completedAt ?? null,
			}),
	);

	// Quiet graduate: activated library → mark seen once without coach UI.
	// Skipped when Help force-opens the coach (step 4).
	$effect(() => {
		if (!quietMatch) return;
		markQuietGraduateAttempted();
		markSeen.mutate(CURRENT_INTRO_VERSION);
	});

	const showCoachUi = $derived(showCoach && !quietMatch && countsReady);
</script>

{#if showCoachUi && userId > 0}
	<OnboardingCoach {userId} />
{/if}
