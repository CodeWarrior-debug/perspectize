import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { CREATE_CLAIM, type CreateClaimInput, type CreateClaimResponse } from './claims';
import { queryKeys } from '../keys';

export function useCreateClaim() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async (input: CreateClaimInput) => {
			return graphqlRequest<CreateClaimResponse>(CREATE_CLAIM, { input });
		},
		onSuccess: () => {
			toast.success('Claim created');
			// Invalidate content lists so the new claim row appears in the Activity table
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
		},
		onError: (err: Error) => {
			const message = err.message.toLowerCase();
			if (message.includes('parent content not found')) {
				toast.error('Parent content not found');
			} else if (message.includes('invalid input')) {
				toast.error('Invalid claim input. Please check your entry.');
			} else {
				toast.error('Failed to create claim. Please try again.');
			}
		},
	}));
}
