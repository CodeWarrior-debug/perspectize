import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { DELETE_PERSPECTIVE, type DeletePerspectiveResponse } from './index';
import {
	invalidateAllPerspectiveLists,
	optimisticDelete,
	rollbackLists,
	settleDelete,
	type ListSnapshot,
} from './perspectiveCache';
import { reportPerspectiveError } from './perspectiveErrors';

export interface DeletePerspectiveInput {
	id: string;
	/** Used to evict the content's cached aggregate (count / average) after the delete. */
	contentID: string | null;
}

interface DeleteContext {
	previous: ListSnapshot;
}

/**
 * Internal to the perspective save module (usePerspectiveSave). Components call that
 * module, not this hook. The cache rules live in perspectiveCache.ts.
 */
export function useDeletePerspective() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (input: DeletePerspectiveInput) => {
			const data = await graphqlRequest<DeletePerspectiveResponse>(DELETE_PERSPECTIVE, { id: input.id });
			if (!data?.deletePerspective) throw new Error('Delete was not confirmed by the server');
			return data;
		},
		onMutate: async (input: DeletePerspectiveInput): Promise<DeleteContext> => {
			return { previous: await optimisticDelete(queryClient, input.id) };
		},
		onError: (err: Error, _input: DeletePerspectiveInput, context?: DeleteContext) => {
			rollbackLists(queryClient, context?.previous ?? []);
			reportPerspectiveError(err, 'delete', { refetch: () => invalidateAllPerspectiveLists(queryClient) });
		},
		onSuccess: (_data: DeletePerspectiveResponse, input: DeletePerspectiveInput) => {
			toast.success('Perspective deleted');
			settleDelete(queryClient, input.id, input.contentID);
		},
	}));
}
