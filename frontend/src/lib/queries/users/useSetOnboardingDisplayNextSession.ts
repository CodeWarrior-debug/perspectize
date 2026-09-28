import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { SET_ONBOARDING_DISPLAY_NEXT_SESSION, type SetOnboardingDisplayNextSessionResponse } from './index';
import { patchMeOnboarding } from './useMarkOnboardingSeen';

/**
 * Turns the onboarding walkthrough back on (or off) for the signed-in user's
 * next session. Backs the "Show onboarding next session" toggle in
 * SettingsDialog — until this hook existed, SET_ONBOARDING_DISPLAY_NEXT_SESSION
 * was defined and never called from anywhere in the app, so a user who
 * dismissed onboarding had no way back in (see the UI gap audit, gap #15).
 */
export function useSetOnboardingDisplayNextSession() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (displayNextSession: boolean) => {
			return graphqlRequest<SetOnboardingDisplayNextSessionResponse>(SET_ONBOARDING_DISPLAY_NEXT_SESSION, {
				displayNextSession,
			});
		},
		onSuccess: (data) => {
			const next = data?.setOnboardingDisplayNextSession;
			if (next) {
				patchMeOnboarding(queryClient, next);
			}
		},
	}));
}
