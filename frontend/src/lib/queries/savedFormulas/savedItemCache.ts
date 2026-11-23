import type { QueryClient } from '@tanstack/svelte-query';
import { queryKeys } from '../keys';

/**
 * Evicts one viewer's own lists (every page, every saved-item type) and their
 * own view of the shared list. Every mutation changes at least these: the
 * shared list is public rows plus the viewer's own, so a viewer's own row shows
 * in both. Other viewers' shared lists are left alone.
 */
export function evictMineFor(queryClient: QueryClient, viewerId: string | null) {
	queryClient.invalidateQueries({ queryKey: queryKeys.savedFormulas.mineFor(viewerId) });
	queryClient.invalidateQueries({ queryKey: queryKeys.savedFormulas.sharedFor(viewerId) });
}

/**
 * Evicts every shared list for every viewer, anonymous included. A public row
 * appears in everyone's shared list, so a privacy change must reach all of them.
 */
export function evictShared(queryClient: QueryClient) {
	queryClient.invalidateQueries({ queryKey: queryKeys.savedFormulas.sharedAll() });
}
