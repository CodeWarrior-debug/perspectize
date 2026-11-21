import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { useAuthState } from '#lib/auth/useAuthState.js';
import { LINK_SAVED_ITEM, type LinkSavedItemResponse } from './index';
import { evictMineFor } from './savedItemCache';

/** `mutate(id)`. Links to a public item (no payload of its own). Evicts the viewer's own lists only. */
export function useLinkSavedItem() {
	const queryClient = useQueryClient();
	const auth = useAuthState();

	return createMutation(() => ({
		mutationFn: async (id: string) => {
			const data = await graphqlRequest<LinkSavedItemResponse>(LINK_SAVED_ITEM, { id });
			return data.linkSavedItem;
		},
		onSuccess: () => {
			evictMineFor(queryClient, auth.userId);
		},
	}));
}
