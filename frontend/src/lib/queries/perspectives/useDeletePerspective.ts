import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { DELETE_PERSPECTIVE, type DeletePerspectiveResponse, type ListPerspectivesByUserResponse } from './index';
import { queryKeys } from '../keys';

export interface DeletePerspectiveInput {
	id: string;
	/** Used to evict the content's cached aggregate (count / average) after the delete. */
	contentID: string | null;
}

type ListSnapshot = [readonly unknown[], ListPerspectivesByUserResponse | undefined][];

interface DeleteContext {
	previous: ListSnapshot;
}

export function useDeletePerspective() {
	const queryClient = useQueryClient();
	// Same PerspectiveItem-shaped branches useUpdatePerspective patches — removing a
	// row by id is shape-safe there. activityFeeds() caches a different shape and is
	// simply refetched on success.
	const rowListFilters: { queryKey: readonly unknown[] }[] = [
		{ queryKey: queryKeys.perspectives.byUserLists() },
		{ queryKey: queryKeys.perspectives.byContentLists() },
	];

	return createMutation(() => ({
		mutationFn: async (input: DeletePerspectiveInput) => {
			const data = await graphqlRequest<DeletePerspectiveResponse>(DELETE_PERSPECTIVE, { id: input.id });
			if (!data?.deletePerspective) throw new Error('Delete was not confirmed by the server');
			return data;
		},
		onMutate: async (input: DeletePerspectiveInput): Promise<DeleteContext> => {
			await Promise.all(rowListFilters.map((f) => queryClient.cancelQueries(f)));
			const previous = rowListFilters.flatMap(
				(f) => queryClient.getQueriesData<ListPerspectivesByUserResponse>(f) as ListSnapshot,
			);
			const drop = (old: ListPerspectivesByUserResponse | undefined) =>
				old
					? {
							perspectives: {
								...old.perspectives,
								items: old.perspectives.items.filter((p) => p.id !== input.id),
							},
						}
					: old;
			for (const f of rowListFilters) {
				queryClient.setQueriesData<ListPerspectivesByUserResponse>(f, drop);
			}
			return { previous };
		},
		onError: (err: Error, _input: DeletePerspectiveInput, context?: DeleteContext) => {
			context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));

			const message = err.message.toLowerCase();
			if (message.includes('access denied') || message.includes('authentication required')) {
				toast.error('You can only delete your own perspectives');
			} else if (message.includes('not found')) {
				toast.error('That perspective no longer exists');
				queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.lists() });
			} else {
				toast.error('Failed to delete perspective. Please try again.');
			}
		},
		onSuccess: (_data: DeletePerspectiveResponse, input: DeletePerspectiveInput) => {
			toast.success('Perspective deleted');
			for (const f of rowListFilters) {
				queryClient.invalidateQueries({ ...f, refetchType: 'none' });
			}
			queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.activityFeeds() });
			queryClient.invalidateQueries({ queryKey: queryKeys.perspectives.detail(input.id) });
			// perspectiveCount / averageRating on the content just changed.
			if (input.contentID) {
				queryClient.invalidateQueries({ queryKey: queryKeys.content.detail(input.contentID) });
			}
		},
	}));
}
