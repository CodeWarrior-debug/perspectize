import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { REMOVE_PRIMARY_CATEGORY, type RemovePrimaryCategoryResponse } from '../categories';
import { queryKeys } from '../keys';

export function useRemovePrimaryCategory() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (contentId: number) => {
			return graphqlRequest<RemovePrimaryCategoryResponse>(REMOVE_PRIMARY_CATEGORY, { contentId });
		},
		onSuccess: () => {
			toast.success('Category removed');
			// Invalidate content list queries for table refresh
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		},
		onError: (err: Error) => {
			console.error('[RemovePrimaryCategory] mutation failed:', err);
			toast.error('Failed to remove category. Please try again.');
		},
	}));
}
