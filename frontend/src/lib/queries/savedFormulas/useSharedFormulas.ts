import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { useAuthState } from '#lib/auth/useAuthState.js';
import {
	SAVED_FORMULA_PAGE_SIZE,
	SHARED_FORMULA_STALE_TIME_MS,
	SHARED_FORMULAS,
	type SavedFormulaListArgs,
	type SharedFormulasResponse,
} from './index';
import { queryKeys } from '../keys';

/**
 * One page of the shared formulas (public rows, plus the viewer's own). Anonymous
 * callers see the public rows, so the query is always enabled. The key carries
 * the viewer id, so a signed-in viewer never reads an anonymous response from the
 * cache, and the reverse holds too. Must be called during component init.
 */
export function useSharedFormulas(args: () => SavedFormulaListArgs = () => ({})) {
	const auth = useAuthState();
	return createQuery(() => {
		const viewerId = auth.userId;
		const variables = { first: SAVED_FORMULA_PAGE_SIZE, ...args() };
		return {
			queryKey: queryKeys.savedFormulas.shared(viewerId, variables),
			queryFn: () => graphqlRequest<SharedFormulasResponse>(SHARED_FORMULAS, variables),
			staleTime: SHARED_FORMULA_STALE_TIME_MS,
		};
	});
}
