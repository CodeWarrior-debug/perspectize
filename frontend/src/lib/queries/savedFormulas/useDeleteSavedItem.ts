import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { useAuthState } from '#lib/auth/useAuthState.js';
import { DELETE_SAVED_ITEM, type DeleteSavedItemResponse, type SavedItemPrivacy } from './index';
import { evictMineFor, evictShared } from './savedItemCache';

/**
 * `mutate({ id, privacy })`. Soft delete. The privacy is the item's current
 * privacy, because the server answers only `true`, and a public item's removal
 * changes every viewer's shared list. A `false` answer is reported as an error.
 */
export function useDeleteSavedItem() {
	const queryClient = useQueryClient();
	const auth = useAuthState();

	return createMutation(() => ({
		mutationFn: async ({ id, privacy }: { id: string; privacy: SavedItemPrivacy }) => {
			const data = await graphqlRequest<DeleteSavedItemResponse>(DELETE_SAVED_ITEM, { id });
			if (!data?.deleteSavedItem) throw new Error('Delete was not confirmed by the server');
			return { id, privacy };
		},
		onSuccess: ({ privacy }) => {
			evictMineFor(queryClient, auth.userId);
			if (privacy === 'PUBLIC') evictShared(queryClient);
		},
	}));
}
