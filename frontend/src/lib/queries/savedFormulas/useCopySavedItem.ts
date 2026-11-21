import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { useAuthState } from '#lib/auth/useAuthState.js';
import { COPY_SAVED_ITEM, type CopySavedItemResponse } from './index';
import { evictMineFor } from './savedItemCache';

/** `mutate(id)`. Copies a public item into a new private row the viewer owns. Evicts the viewer's own lists only. */
export function useCopySavedItem() {
	const queryClient = useQueryClient();
	const auth = useAuthState();

	return createMutation(() => ({
		mutationFn: async (id: string) => {
			const data = await graphqlRequest<CopySavedItemResponse>(COPY_SAVED_ITEM, { id });
			return data.copySavedItem;
		},
		onSuccess: () => {
			evictMineFor(queryClient, auth.userId);
		},
	}));
}
