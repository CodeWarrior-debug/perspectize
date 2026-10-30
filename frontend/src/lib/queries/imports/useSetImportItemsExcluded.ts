import { createMutation, useQueryClient, type QueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { SET_IMPORT_ITEMS_EXCLUDED, type ImportJobResponse, type SetImportItemsExcludedResponse } from './index';
import { queryKeys } from '../keys';

export interface SetExcludedVars {
	jobId: string;
	itemIds: string[];
	excluded: boolean;
}

/**
 * Patches the sheet in place the way the server will: only rows that are not
 * queued or imported change. Returns the previous sheet for rollback. A
 * thousand-row sheet isn't refetched for a mark.
 */
export function patchExcluded(client: QueryClient, vars: SetExcludedVars): ImportJobResponse | undefined {
	const key = queryKeys.imports.detail(vars.jobId);
	const previous = client.getQueryData<ImportJobResponse>(key);
	if (!previous?.importJob) return previous;
	const ids = new Set(vars.itemIds);
	client.setQueryData<ImportJobResponse>(key, {
		importJob: {
			...previous.importJob,
			items: previous.importJob.items.map((it) =>
				ids.has(it.id) && (it.importStatus === null || it.importStatus === 'FAILED')
					? { ...it, excluded: vars.excluded }
					: it,
			),
		},
	});
	return previous;
}

/** Marks rows "don't import" (or clears the mark), for everyone, until the import is closed. */
export function useSetImportItemsExcluded() {
	const client = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: SetExcludedVars) =>
			graphqlRequest<SetImportItemsExcludedResponse>(SET_IMPORT_ITEMS_EXCLUDED, {
				input: { jobId: Number(vars.jobId), itemIds: vars.itemIds.map(Number), excluded: vars.excluded },
			}),
		onMutate: async (vars: SetExcludedVars) => {
			await client.cancelQueries({ queryKey: queryKeys.imports.detail(vars.jobId) });
			return { previous: patchExcluded(client, vars) };
		},
		onError: (_e: unknown, vars: SetExcludedVars, ctx: { previous?: ImportJobResponse } | undefined) => {
			if (ctx?.previous) client.setQueryData(queryKeys.imports.detail(vars.jobId), ctx.previous);
		},
	}));
}
