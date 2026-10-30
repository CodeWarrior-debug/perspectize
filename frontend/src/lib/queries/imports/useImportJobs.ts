import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { IMPORT_JOBS, IMPORT_JOBS_STALE_TIME_MS, type ImportJobsResponse } from './index';
import { queryKeys } from '../keys';

/**
 * Every import with its sources. Signed-in only (`@auth`): pass `enabled` to
 * wait for sign-in. `includeClosed` adds closed imports (admins only; the
 * server ignores it for anyone else).
 */
export function useImportJobs(enabled: () => boolean = () => true, includeClosed: () => boolean = () => false) {
	return createQuery(() => ({
		queryKey: queryKeys.imports.list(includeClosed()),
		queryFn: () => graphqlRequest<ImportJobsResponse>(IMPORT_JOBS, { includeClosed: includeClosed() }),
		staleTime: IMPORT_JOBS_STALE_TIME_MS,
		enabled: enabled(),
	}));
}
