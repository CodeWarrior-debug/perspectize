import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { useAuthState } from '#lib/auth/useAuthState.js';
import { SET_SAVED_ITEM_PRIVACY, type SavedItemPrivacy, type SetSavedItemPrivacyResponse } from './index';
import { evictMineFor, evictShared } from './savedItemCache';

/**
 * `mutate({ id, privacy })`. Any privacy change can move a row into or out of
 * every viewer's shared list, so it evicts the viewer's own lists and all shared lists.
 */
export function useSetSavedItemPrivacy() {
	const queryClient = useQueryClient();
	const auth = useAuthState();

	return createMutation(() => ({
		mutationFn: async ({ id, privacy }: { id: string; privacy: SavedItemPrivacy }) => {
			const data = await graphqlRequest<SetSavedItemPrivacyResponse>(SET_SAVED_ITEM_PRIVACY, { id, privacy });
			return data.setSavedItemPrivacy;
		},
		onSuccess: () => {
			evictMineFor(queryClient, auth.userId);
			evictShared(queryClient);
		},
	}));
}
