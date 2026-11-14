import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { UPDATE_CLAIM, type UpdateClaimInput, type UpdateClaimResponse } from './claims';
import { queryKeys } from '../keys';

export interface UpdateClaimVariables {
	id: string;
	input: UpdateClaimInput;
}

export function useUpdateClaim() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async ({ id, input }: UpdateClaimVariables) => {
			return graphqlRequest<UpdateClaimResponse>(UPDATE_CLAIM, { id, input });
		},
		onSuccess: (_data: UpdateClaimResponse, { id }: UpdateClaimVariables) => {
			toast.success('Claim updated');
			// Content lists (incl. the Declare page's claim list) and this row's full detail.
			// Aggregates and perspective caches are unaffected by claim text or dates.
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
			queryClient.invalidateQueries({ queryKey: queryKeys.content.row(id) });
		},
		onError: (err: Error) => {
			const message = err.message.toLowerCase();
			if (message.includes('content not found')) {
				toast.error('Claim not found');
			} else if (message.includes('invalid input')) {
				toast.error('Invalid claim input. Please check your entry.');
			} else {
				toast.error('Failed to update claim. Please try again.');
			}
		},
	}));
}
