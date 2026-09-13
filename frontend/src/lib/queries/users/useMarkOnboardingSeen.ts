import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import {
	MARK_ONBOARDING_SEEN,
	type MarkOnboardingSeenResponse,
	type MeResponse,
	type UserOnboarding,
} from './index';
import { CURRENT_INTRO_VERSION } from '$lib/onboarding/config';
import { setCoachForceOpen } from '$lib/onboarding/coachGate.svelte';

function patchMeOnboarding(
	queryClient: ReturnType<typeof useQueryClient>,
	onboarding: UserOnboarding,
) {
	queryClient.setQueriesData<MeResponse>({ queryKey: ['me'] }, (old) => {
		if (!old?.me) return old;
		return {
			...old,
			me: {
				...old.me,
				onboarding,
			},
		};
	});
}

/** Marks intro seen at CURRENT_INTRO_VERSION (or explicit version). Clears Help force-open. */
export function useMarkOnboardingSeen() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (version: number = CURRENT_INTRO_VERSION) => {
			return graphqlRequest<MarkOnboardingSeenResponse>(MARK_ONBOARDING_SEEN, { version });
		},
		onSuccess: (data) => {
			const next = data?.markOnboardingSeen;
			if (next) {
				patchMeOnboarding(queryClient, next);
			}
			setCoachForceOpen(false);
		},
	}));
}

export { patchMeOnboarding };
