import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { IMPORT_ITEMS, type ImportItemsResponse } from './index';
import { queryKeys } from '../keys';

export interface ImportItemsVars {
	jobId: string;
	itemIds: string[];
}

/**
 * Imports the picked rows of one import in the background. On success it
 * evicts that import's sheet (rows flip to QUEUED, and polling picks up each
 * outcome) and the Activity content lists (new content). Nothing else.
 */
export function importItemsOnSuccess(client: ReturnType<typeof useQueryClient>, vars: ImportItemsVars) {
	return Promise.all([
		client.invalidateQueries({ queryKey: queryKeys.imports.detail(vars.jobId) }),
		client.invalidateQueries({ queryKey: queryKeys.content.lists() }),
	]);
}

export function useImportItems() {
	const client = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: ImportItemsVars) =>
			graphqlRequest<ImportItemsResponse>(IMPORT_ITEMS, {
				input: { jobId: Number(vars.jobId), itemIds: vars.itemIds.map(Number) },
			}),
		onSuccess: (_data: ImportItemsResponse, vars: ImportItemsVars) => importItemsOnSuccess(client, vars),
	}));
}
