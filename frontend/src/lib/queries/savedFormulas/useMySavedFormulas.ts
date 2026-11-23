import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { useAuthState } from '#lib/auth/useAuthState.js';
import {
	MY_SAVED_FORMULAS,
	SAVED_FORMULA_PAGE_SIZE,
	SAVED_FORMULA_STALE_TIME_MS,
	type MySavedFormulasResponse,
	type SavedFormulaListArgs,
} from './index';
import { queryKeys } from '../keys';

/**
 * One page of the viewer's own saved formulas. Disabled while signed out, so no
 * request goes out for an anonymous viewer. The key carries the viewer id and
 * every variable sent. Must be called during component init.
 */
export function useMySavedFormulas(args: () => SavedFormulaListArgs = () => ({})) {
	const auth = useAuthState();
	return createQuery(() => {
		const viewerId = auth.userId;
		const variables = { first: SAVED_FORMULA_PAGE_SIZE, ...args() };
		return {
			queryKey: queryKeys.savedFormulas.mine(viewerId, variables),
			queryFn: () => graphqlRequest<MySavedFormulasResponse>(MY_SAVED_FORMULAS, variables),
			staleTime: SAVED_FORMULA_STALE_TIME_MS,
			enabled: viewerId !== null,
		};
	});
}
