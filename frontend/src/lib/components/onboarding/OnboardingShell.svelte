<script lang="ts">
	/**
	 * Signed-in shell: coach eligibility, quiet graduate, and OnboardingCoach mount.
	 */
	import { useMe } from '#lib/queries/users/useMe.svelte.js';
	import { isCoachEligible, shouldQuietGraduate } from '#lib/onboarding/eligibility.js';
	import {
		getQuietGraduateAttempted,
		markQuietGraduateAttempted,
		getCoachForceOpen,
		getCoachReplayNonce,
	} from '#lib/onboarding/coachGate.svelte.js';
	import { CURRENT_INTRO_VERSION } from '#lib/onboarding/config.js';
	import { useMarkOnboardingSeen } from '#lib/queries/users/useMarkOnboardingSeen.js';
	import { useOwnedContentCount } from '#lib/queries/content/useOwnedContentCount.js';
	import { useMyPerspectives } from '#lib/queries/perspectives/useMyPerspectives.js';
	import OnboardingCoach from '#lib/components/onboarding/OnboardingCoach.svelte';

	const meState = useMe();
	const markSeen = useMarkOnboardingSeen();

	const meLoaded = $derived(meState.isSuccess && !!meState.me?.onboarding);
	const onboarding = $derived(meState.me?.onboarding ?? null);
	const eligible = $derived(isCoachEligible({ meLoaded, onboarding }));
	const userId = $derived(meState.me ? parseInt(meState.me.id, 10) : 0);
	const forceOpen = $derived(getCoachForceOpen());

	const showCoach = $derived(forceOpen || eligible);

	// Counts for quiet graduate — only when auto-eligible and not Help force-open.
	const needQuietCheck = $derived(eligible && !forceOpen && userId > 0);

	const ownedContent = useOwnedContentCount(() =>
		needQuietCheck && meState.me ? { id: userId, username: meState.me.username } : null,
	);

	// Shares the by-user perspectives query with the library and Plan (one request, one key).
	const perspectivesQuery = useMyPerspectives(() => (needQuietCheck ? userId : null));

	const ownedContentCount = $derived(ownedContent.data ?? 0);
	const perspectiveCount = $derived(perspectivesQuery.data?.perspectives?.items?.length ?? 0);
	const countsReady = $derived(!needQuietCheck || (ownedContent.isSuccess && perspectivesQuery.isSuccess));

	const quietMatch = $derived(
		needQuietCheck &&
			countsReady &&
			shouldQuietGraduate({
				eligible,
				ownedContentCount,
				perspectiveCount,
				completedAt: onboarding?.completedAt ?? null,
			}),
	);

	// Quiet graduate: activated library → mark seen once without coach UI.
	// Skipped when Help force-opens the coach (step 4).
	// The attempt flag gates only the write: `quietMatch` stays true, so the coach stays hidden
	// while the write is in flight or if it fails.
	$effect(() => {
		if (!quietMatch || getQuietGraduateAttempted()) return;
		markQuietGraduateAttempted();
		markSeen.mutate(CURRENT_INTRO_VERSION);
	});

	const showCoachUi = $derived(showCoach && !quietMatch && countsReady);
</script>

{#if showCoachUi && userId > 0}
	<!-- Keyed so a replay discards a coach that was already dismissed (its local state) and starts at step 1. -->
	{#key getCoachReplayNonce()}
		<OnboardingCoach {userId} />
	{/key}
{/if}
