import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { useAuthState } from '#lib/auth/useAuthState.js';
import { UPDATE_SAVED_FORMULA, type UpdateSavedFormulaInput, type UpdateSavedFormulaResponse } from './index';
import { evictMineFor } from './savedItemCache';

/** `mutate(input)`. Evicts the viewer's own lists only (an update cannot change privacy). */
export function useUpdateSavedFormula() {
	const queryClient = useQueryClient();
	const auth = useAuthState();

	return createMutation(() => ({
		mutationFn: async (input: UpdateSavedFormulaInput) => {
			const data = await graphqlRequest<UpdateSavedFormulaResponse>(UPDATE_SAVED_FORMULA, { input });
			return data.updateSavedFormula;
		},
		onSuccess: () => {
			evictMineFor(queryClient, auth.userId);
		},
	}));
}
