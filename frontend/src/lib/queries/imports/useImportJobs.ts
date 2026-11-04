import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { IMPORT_JOB_POLL_MS, IMPORT_JOBS, IMPORT_JOBS_STALE_TIME_MS, type ImportJobsResponse } from './index';
import { queryKeys } from '../keys';

/** True while any import in the list has a source still listing (its row count and status will change). */
export function importJobsAreListing(data: ImportJobsResponse | undefined): boolean {
	return !!data?.importJobs.some((j) => j.sources.some((s) => s.status === 'LISTING'));
}

/**
 * Every import with its sources. Signed-in only (`@auth`): pass `enabled` to
 * wait for sign-in. `includeClosed` adds closed imports (admins only; the
 * server ignores it for anyone else). Polls every IMPORT_JOB_POLL_MS while a
 * source is listing (say, just after an admin approves a request), then stops.
 */
export function useImportJobs(enabled: () => boolean = () => true, includeClosed: () => boolean = () => false) {
	return createQuery(() => ({
		queryKey: queryKeys.imports.list(includeClosed()),
		queryFn: () => graphqlRequest<ImportJobsResponse>(IMPORT_JOBS, { includeClosed: includeClosed() }),
		staleTime: IMPORT_JOBS_STALE_TIME_MS,
		enabled: enabled(),
		refetchInterval: (query: { state: { data?: ImportJobsResponse } }) =>
			importJobsAreListing(query.state.data) ? IMPORT_JOB_POLL_MS : false,
	}));
}
