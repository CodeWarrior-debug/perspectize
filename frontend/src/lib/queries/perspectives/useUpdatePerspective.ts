import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { UPDATE_PERSPECTIVE, type UpdatePerspectiveResponse } from './index';
import {
	invalidateAllPerspectiveLists,
	optimisticUpdate,
	rollbackLists,
	settleUpdate,
	type ListSnapshot,
} from './perspectiveCache';
import { reportPerspectiveError } from './perspectiveErrors';
import type { FeelingInput } from './useCreatePerspective';

export interface UpdatePerspectiveInput {
	id: number;
	/** undefined = leave unchanged (the key is omitted from the request); null = clear. */
	quality?: number | null;
	agreement?: number | null;
	importance?: number | null;
	confidence?: number | null;
	like?: string | null;
	review?: string | null;
	customFields?: Record<string, number> | null;
	feelings?: FeelingInput[] | null;
	privacy?: 'PUBLIC' | 'PRIVATE';
}

interface UpdateContext {
	previous: ListSnapshot;
}

/**
 * Internal to the perspective save module (usePerspectiveSave). Components call that
 * module, not this hook. The cache rules live in perspectiveCache.ts.
 */
export function useUpdatePerspective() {
	const queryClient = useQueryClient();

	const mutation = createMutation(() => ({
		mutationFn: async (input: UpdatePerspectiveInput) => {
			return graphqlRequest<UpdatePerspectiveResponse>(UPDATE_PERSPECTIVE, { input });
		},
		onMutate: async (input: UpdatePerspectiveInput): Promise<UpdateContext> => {
			return { previous: await optimisticUpdate(queryClient, input) };
		},
		onError: (err: Error, input: UpdatePerspectiveInput, context?: UpdateContext) => {
			rollbackLists(queryClient, context?.previous ?? []);
			reportPerspectiveError(err, 'update', { retry: () => mutation.mutate(input) });
		},
		onSuccess: (data: UpdatePerspectiveResponse) => {
			toast.success('Perspective updated');
			const updated = data?.updatePerspective;
			if (!updated) {
				// Unexpected response shape: fall back to a full, shape-agnostic refetch.
				invalidateAllPerspectiveLists(queryClient);
				return;
			}
			settleUpdate(queryClient, updated);
		},
	}));
	return mutation;
}
