import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { useAuthState } from '#lib/auth/useAuthState.js';
import { CREATE_SAVED_FORMULA, type CreateSavedFormulaInput, type CreateSavedFormulaResponse } from './index';
import { evictMineFor } from './savedItemCache';

/** `mutate(input)`. Evicts the viewer's own lists only. */
export function useCreateSavedFormula() {
	const queryClient = useQueryClient();
	const auth = useAuthState();

	return createMutation(() => ({
		mutationFn: async (input: CreateSavedFormulaInput) => {
			const data = await graphqlRequest<CreateSavedFormulaResponse>(CREATE_SAVED_FORMULA, { input });
			return data.createSavedFormula;
		},
		onSuccess: () => {
			evictMineFor(queryClient, auth.userId);
		},
	}));
}
