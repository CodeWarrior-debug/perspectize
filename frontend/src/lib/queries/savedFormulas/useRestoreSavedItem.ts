import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { useAuthState } from '#lib/auth/useAuthState.js';
import { RESTORE_SAVED_ITEM, type RestoreSavedItemResponse } from './index';
import { evictMineFor, evictShared } from './savedItemCache';

/**
 * `mutate(id)`. Undoes a soft delete. The restored row's privacy comes back in the
 * result, so a public item also evicts the shared lists.
 */
export function useRestoreSavedItem() {
	const queryClient = useQueryClient();
	const auth = useAuthState();

	return createMutation(() => ({
		mutationFn: async (id: string) => {
			const data = await graphqlRequest<RestoreSavedItemResponse>(RESTORE_SAVED_ITEM, { id });
			return data.restoreSavedItem;
		},
		onSuccess: (item) => {
			evictMineFor(queryClient, auth.userId);
			if (item.privacy === 'PUBLIC') evictShared(queryClient);
		},
	}));
}
