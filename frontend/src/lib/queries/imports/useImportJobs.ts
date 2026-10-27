import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { IMPORT_JOBS, IMPORT_JOBS_STALE_TIME_MS, type ImportJobsResponse } from './index';
import { queryKeys } from '../keys';

/** Every import with its sources. Signed-in only (`@auth`): pass `enabled` to wait for sign-in. */
export function useImportJobs(enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: queryKeys.imports.list(),
		queryFn: () => graphqlRequest<ImportJobsResponse>(IMPORT_JOBS),
		staleTime: IMPORT_JOBS_STALE_TIME_MS,
		enabled: enabled(),
	}));
}
