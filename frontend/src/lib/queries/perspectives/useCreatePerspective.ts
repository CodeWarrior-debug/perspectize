import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { CREATE_PERSPECTIVE, type CreatePerspectiveResponse, type PerspectiveItem } from './index';
import {
	invalidateAllPerspectiveLists,
	optimisticCreate,
	optimisticId,
	rollbackLists,
	settleCreate,
	type ListSnapshot,
} from './perspectiveCache';
import { reportPerspectiveError } from './perspectiveErrors';

export interface FeelingInput {
	emoji: string;
	label?: string;
	intensity: number;
	note?: string;
}

export interface CreatePerspectiveInput {
	userID: number;
	contentID?: number;
	quality?: number;
	agreement?: number;
	importance?: number;
	confidence?: number;
	like?: string;
	review?: string;
	customFields?: Record<string, number>;
	feelings?: FeelingInput[];
	privacy?: 'PUBLIC' | 'PRIVATE';
}

interface CreateContext {
	previous: ListSnapshot;
	tempId: string;
}

/**
 * Internal to the perspective save module (usePerspectiveSave). Components call that
 * module, not this hook. The cache rules live in perspectiveCache.ts.
 */
export function useCreatePerspective() {
	const queryClient = useQueryClient();

	const mutation = createMutation(() => ({
		mutationFn: async (input: CreatePerspectiveInput) => {
			return graphqlRequest<CreatePerspectiveResponse>(CREATE_PERSPECTIVE, { input });
		},
		onMutate: async (input: CreatePerspectiveInput): Promise<CreateContext> => {
			const tempId = optimisticId();
			const previous = await optimisticCreate(queryClient, input, tempId);
			return { previous, tempId };
		},
		onError: (err: Error, input: CreatePerspectiveInput, context?: CreateContext) => {
			rollbackLists(queryClient, context?.previous ?? []);
			reportPerspectiveError(err, 'create', {
				retry: () => mutation.mutate(input),
			});
		},
		onSuccess: (data: CreatePerspectiveResponse, input: CreatePerspectiveInput, context?: CreateContext) => {
			toast.success('Perspective added');
			const created = data?.createPerspective;
			if (!created) {
				// Unexpected response shape: fall back to a full, shape-agnostic refetch.
				invalidateAllPerspectiveLists(queryClient);
				return;
			}
			settleCreate(queryClient, input, created as PerspectiveItem, context?.tempId);
		},
	}));
	return mutation;
}
