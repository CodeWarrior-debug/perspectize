import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { LIST_MY_CLAIMS, type ClaimRow, type ListMyClaimsResponse } from './claims';
import { queryKeys } from '../keys';

/**
 * The signed-in viewer's own claims, newest first. Claims are private, so the
 * server returns only the viewer's; the key carries no user id, so callers must
 * still filter to `me.id` before showing rows.
 *
 * `enabled` gates the fetch (e.g. only once the user is signed in).
 */
export function useMyClaims(enabled: () => boolean) {
	return createQuery(() => ({
		queryKey: queryKeys.content.claimList(),
		queryFn: async (): Promise<ClaimRow[]> => {
			const res = await graphqlRequest<ListMyClaimsResponse>(LIST_MY_CLAIMS);
			return res.content.items;
		},
		enabled: enabled(),
		// User-scoped list: reuse for 30s across navigations, then refetch.
		staleTime: 30_000,
	}));
}
