import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { DELETE_CLAIM, claimHasOthersError, type DeleteClaimResponse, type DeleteClaimVariables } from './claims';
import { queryKeys } from '../keys';

/**
 * Deletes one of the viewer's claims, or with `keepAnonymous` hands it to the
 * anonymous user. A refused delete (CLAIM_HAS_OTHERS) is not toasted: the caller
 * shows the keep-anonymous choice instead.
 */
export function useDeleteClaim() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: async ({ id, keepAnonymous }: DeleteClaimVariables) => {
			return graphqlRequest<DeleteClaimResponse>(DELETE_CLAIM, { id, keepAnonymous });
		},
		onSuccess: (_data: DeleteClaimResponse, { id, keepAnonymous }: DeleteClaimVariables) => {
			toast.success(keepAnonymous ? 'Claim kept as anonymous' : 'Claim deleted');
			queryClient.invalidateQueries({ queryKey: queryKeys.content.lists() });
			queryClient.invalidateQueries({ queryKey: queryKeys.content.row(id) });
		},
		onError: (err: unknown) => {
			if (claimHasOthersError(err)) return;
			toast.error('Failed to delete claim. Please try again.');
		},
	}));
}
