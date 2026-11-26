import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { UPDATE_CONTENT_SOURCE_DATA, type UpdateContentSourceDataResponse, type ContentResponse } from './index';
import { queryKeys } from '../keys';
import { isLibraryListKey } from './contentCreatedEviction';

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

			// Patch just this one item in cached library lists. The mutation selects a
			// subset of LIST_CONTENT's fields, so merge rather than replace: list-only
			// fields (primaryCategory, displayTitle, addedByUserID, ...) stay on the row.
			// Claims and the pickers cache other shapes under the same prefix, so the
			// predicate skips them; they are only marked stale below.
			queryClient.setQueriesData<ContentResponse>(
				{ queryKey: queryKeys.content.lists(), predicate: (query) => isLibraryListKey(query.queryKey) },
				(oldData) => {
					if (!oldData?.content) return oldData;
					return {
						content: {
							...oldData.content,
							items: oldData.content.items.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)),
						},
					};
				},
			);

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
				toast.error('This item could not be found');
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
