import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import {
	UPDATE_PERSPECTIVE,
	type UpdatePerspectiveResponse,
	type ListPerspectivesByUserResponse,
	type PerspectiveItem,
	type FeelingEntry,
} from './index';
import { queryKeys } from '../keys';
import type { FeelingInput } from './useCreatePerspective';

export interface UpdatePerspectiveInput {
	id: number;
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

type ListSnapshot = [readonly unknown[], ListPerspectivesByUserResponse | undefined][];

interface UpdateContext {
	previous: ListSnapshot;
}

function patchLists(
	items: (list: PerspectiveItem[]) => PerspectiveItem[],
): (old: ListPerspectivesByUserResponse | undefined) => ListPerspectivesByUserResponse | undefined {
	return (old) => (old ? { perspectives: { ...old.perspectives, items: items(old.perspectives.items) } } : old);
}

/** Apply the submitted fields onto the cached row (omitted fields keep their value). */
function applyEdit(p: PerspectiveItem, input: UpdatePerspectiveInput): PerspectiveItem {
	return {
		...p,
		quality: input.quality ?? p.quality,
		agreement: input.agreement ?? p.agreement,
		importance: input.importance ?? p.importance,
		confidence: input.confidence ?? p.confidence,
		like: input.like ?? p.like,
		review: input.review ?? p.review,
		customFields: input.customFields ?? p.customFields,
		feelings: (input.feelings as FeelingEntry[] | undefined) ?? p.feelings,
		privacy: input.privacy ?? p.privacy,
		updatedAt: new Date().toISOString(),
	};
}

export function useUpdatePerspective() {
	const queryClient = useQueryClient();
	const listFilter = { queryKey: queryKeys.perspectives.lists() };

	return createMutation(() => ({
		mutationFn: async (input: UpdatePerspectiveInput) => {
			return graphqlRequest<UpdatePerspectiveResponse>(UPDATE_PERSPECTIVE, { input });
		},
		onMutate: async (input: UpdatePerspectiveInput): Promise<UpdateContext> => {
			await queryClient.cancelQueries(listFilter);
			const previous = queryClient.getQueriesData<ListPerspectivesByUserResponse>(listFilter) as ListSnapshot;
			const targetId = String(input.id);
			queryClient.setQueriesData<ListPerspectivesByUserResponse>(
				listFilter,
				patchLists((list) => list.map((p) => (p.id === targetId ? applyEdit(p, input) : p))),
			);
			return { previous };
		},
		onError: (err: Error, _input: UpdatePerspectiveInput, context?: UpdateContext) => {
			context?.previous?.forEach(([key, data]) => queryClient.setQueryData(key, data));

			const message = err.message.toLowerCase();
			if (message.includes('no user selected') || message.includes('user not found')) {
				toast.error('No user selected');
			} else if (message.includes('invalid rating')) {
				toast.error('Invalid rating value');
			} else if (message.includes('at least one field')) {
				toast.error('Please fill in at least one field');
			} else {
				toast.error('Failed to update perspective. Please try again.');
			}
		},
		onSuccess: (data: UpdatePerspectiveResponse) => {
			toast.success('Perspective updated');

			const updated = data?.updatePerspective;
			if (!updated) {
				queryClient.invalidateQueries(listFilter);
				return;
			}

			queryClient.setQueriesData<ListPerspectivesByUserResponse>(
				listFilter,
				patchLists((list) => list.map((p) => (p.id === updated.id ? updated : p))),
			);
			queryClient.invalidateQueries({ ...listFilter, refetchType: 'none' });
		},
	}));
}
