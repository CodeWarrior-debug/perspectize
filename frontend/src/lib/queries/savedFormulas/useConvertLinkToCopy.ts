import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { useAuthState } from '#lib/auth/useAuthState.js';
import { CONVERT_LINK_TO_COPY, type ConvertLinkToCopyResponse } from './index';
import { evictMineFor } from './savedItemCache';

/** `mutate(id)`. Turns the viewer's link into a copy while its source is readable. Evicts the viewer's own lists only. */
export function useConvertLinkToCopy() {
	const queryClient = useQueryClient();
	const auth = useAuthState();

	return createMutation(() => ({
		mutationFn: async (id: string) => {
			const data = await graphqlRequest<ConvertLinkToCopyResponse>(CONVERT_LINK_TO_COPY, { id });
			return data.convertLinkToCopy;
		},
		onSuccess: () => {
			evictMineFor(queryClient, auth.userId);
		},
	}));
}
