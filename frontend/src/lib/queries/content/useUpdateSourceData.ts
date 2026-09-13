import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import {
	UPDATE_CONTENT_SOURCE_DATA,
	type UpdateContentSourceDataResponse,
	type ContentResponse,
} from './index';
import { queryKeys } from '../keys';

export function useUpdateSourceData() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (contentId: string) => {
			return graphqlRequest<UpdateContentSourceDataResponse>(UPDATE_CONTENT_SOURCE_DATA, {
				contentId: Number(contentId),
			});
		},
		onSuccess: (data: UpdateContentSourceDataResponse) => {
			const updated = data?.updateContentSourceData;
			if (!updated) return;

			toast.success(`Updated: ${updated.name}`);

			// Patch just this one item in cached list queries — mirrors useAddVideo's
			// direct cache write, scoped to the single refreshed row.
			queryClient.setQueriesData<ContentResponse>({ queryKey: queryKeys.content.lists() }, (oldData) => {
				if (!oldData) return oldData;
				return {
					content: {
						...oldData.content,
						items: oldData.content.items.map((item) => (item.id === updated.id ? updated : item)),
					},
				};
			});

			// Mark stale for eventual consistency
			queryClient.invalidateQueries({
				queryKey: queryKeys.content.lists(),
				refetchType: 'none',
			});
		},
		onError: (err: Error) => {
			console.error('[UpdateSourceData] mutation failed:', err);
			const message = err.message.toLowerCase();
			if (message.includes('content not found')) {
				toast.error('This video could not be found');
			} else if (message.includes('load failed') || message.includes('failed to fetch')) {
				toast.error('Cannot reach the server. Check your connection and try again.');
			} else if (message.includes('access denied') || message.includes('authentication required')) {
				toast.error('Please sign in to update source data');
			} else {
				toast.error('Failed to update source data. Please try again.');
			}
		},
	}));
}
