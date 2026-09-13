import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { SET_PRIMARY_CATEGORY, type SetPrimaryCategoryResponse } from './index';
import { queryKeys } from '../keys';

export interface SetPrimaryCategoryInput {
	contentId: number;
	qid: string;
	label: string;
	description?: string;
	entityType?: string;
}

export function useSetPrimaryCategory() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (input: SetPrimaryCategoryInput) => {
			return graphqlRequest<SetPrimaryCategoryResponse>(SET_PRIMARY_CATEGORY, {
				input: {
					contentId: input.contentId,
					qid: input.qid,
					label: input.label,
					description: input.description ?? '',
					entityType: input.entityType ?? '',
				},
			});
		},
		onSuccess: (data: SetPrimaryCategoryResponse) => {
			const category = data?.setPrimaryCategory?.primaryCategory;
			toast.success(`Category set: ${category?.label ?? 'unknown'}`);
			// Invalidate content list queries for table refresh
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		},
		onError: (err: Error) => {
			console.error('[SetPrimaryCategory] mutation failed:', err);
			toast.error('Failed to set category. Please try again.');
		},
	}));
}
