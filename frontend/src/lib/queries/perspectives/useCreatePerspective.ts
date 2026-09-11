import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import {
	CREATE_PERSPECTIVE,
	type CreatePerspectiveResponse,
	type ListPerspectivesByUserResponse,
	type PerspectiveItem,
} from './index';
import { queryKeys } from '../keys';

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
	privacy?: 'PUBLIC' | 'PRIVATE';
}

type ListSnapshot = [readonly unknown[], ListPerspectivesByUserResponse | undefined][];

interface CreateContext {
	previous: ListSnapshot;
	tempId: string;
}

/** Placeholder row shown immediately, before the server responds. */
function optimisticPerspective(input: CreatePerspectiveInput, id: string): PerspectiveItem {
	const now = new Date().toISOString();
	return {
		id,
		userID: String(input.userID),
		contentID: input.contentID != null ? String(input.contentID) : null,
		quality: input.quality ?? null,
		agreement: input.agreement ?? null,
		importance: input.importance ?? null,
		confidence: input.confidence ?? null,
		like: input.like ?? null,
		review: input.review ?? null,
		privacy: input.privacy ?? 'PUBLIC',
		description: null,
		primaryPerspectiveID: null,
		relatedPerspectiveIDs: null,
		customFields: input.customFields ?? null,
		createdAt: now,
		updatedAt: now,
	};
}

function patchLists(
	items: (list: PerspectiveItem[]) => PerspectiveItem[],
): (old: ListPerspectivesByUserResponse | undefined) => ListPerspectivesByUserResponse | undefined {
	return (old) => (old ? { perspectives: { ...old.perspectives, items: items(old.perspectives.items) } } : old);
}

export function useCreatePerspective() {
	const queryClient = useQueryClient();
	const listFilter = { queryKey: queryKeys.perspectives.lists() };

	return createMutation(() => ({
		mutationFn: async (input: CreatePerspectiveInput) => {
			return graphqlRequest<CreatePerspectiveResponse>(CREATE_PERSPECTIVE, { input });
		},
		// Insert an optimistic row so the +/glasses affordance flips instantly.
		onMutate: async (input: CreatePerspectiveInput): Promise<CreateContext> => {
			await queryClient.cancelQueries(listFilter);
			const previous = queryClient.getQueriesData<ListPerspectivesByUserResponse>(listFilter) as ListSnapshot;
			const tempId = `optimistic-${Date.now()}`;
			queryClient.setQueriesData<ListPerspectivesByUserResponse>(
				listFilter,
				patchLists((list) => [optimisticPerspective(input, tempId), ...list]),
			);
			return { previous, tempId };
		},
		onError: (err: Error, _input: CreatePerspectiveInput, context?: CreateContext) => {
			// Roll the optimistic insert back.
			context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));

			const message = err.message.toLowerCase();
			if (message.includes('no user selected') || message.includes('user not found')) {
				toast.error('No user selected');
			} else if (message.includes('invalid rating')) {
				toast.error('Invalid rating value');
			} else if (message.includes('at least one field')) {
				toast.error('Please fill in at least one field');
			} else {
				toast.error('Failed to add perspective. Please try again.');
			}
		},
		onSuccess: (data: CreatePerspectiveResponse, _input: CreatePerspectiveInput, context?: CreateContext) => {
			toast.success('Perspective added');

			const created = data?.createPerspective;
			if (!created) {
				// Unexpected response shape — fall back to a full refetch.
				queryClient.invalidateQueries(listFilter);
				return;
			}

			// Swap the optimistic row for the server row (real id + timestamps).
			queryClient.setQueriesData<ListPerspectivesByUserResponse>(
				listFilter,
				patchLists((list) => {
					const hasTemp = context?.tempId != null && list.some((p) => p.id === context.tempId);
					return hasTemp ? list.map((p) => (p.id === context!.tempId ? created : p)) : [created, ...list];
				}),
			);
			// Mark stale for eventual consistency without an immediate refetch.
			queryClient.invalidateQueries({ ...listFilter, refetchType: 'none' });
		},
	}));
}
