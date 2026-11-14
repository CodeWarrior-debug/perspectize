import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { IMPORT_ITEM_DETAILS, IMPORT_ITEM_DETAILS_STALE_TIME_MS, type ImportItemDetailsResponse } from './index';
import { queryKeys } from '../keys';

/** One row's description, chapters and tags, fetched when the row is opened. `itemId` '' disables it. */
export function useImportItemDetails(itemId: () => string) {
	return createQuery(() => ({
		queryKey: queryKeys.imports.itemDetails(itemId()),
		queryFn: () => graphqlRequest<ImportItemDetailsResponse>(IMPORT_ITEM_DETAILS, { id: itemId() }),
		staleTime: IMPORT_ITEM_DETAILS_STALE_TIME_MS,
		enabled: itemId() !== '',
	}));
}
