import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import {
	IMPORT_JOB,
	IMPORT_JOB_POLL_MS,
	IMPORT_JOB_STALE_TIME_MS,
	type ImportJob,
	type ImportJobResponse,
} from './index';
import { queryKeys } from '../keys';
import { wsStatus } from '$lib/messaging/ws-client.svelte';

/**
 * True while background work can still change the sheet without telling us:
 * a source is listing (rows are arriving), or rows are queued and the live
 * progress connection is down (otherwise importProgress reports the end).
 */
export function importJobIsBusy(job: ImportJob | null | undefined, liveProgress = false): boolean {
	if (!job) return false;
	if (job.sources.some((s) => s.status === 'LISTING')) return true;
	return !liveProgress && job.items.some((i) => i.importStatus === 'QUEUED');
}

/**
 * One import's sheet: the job, its sources and every row, in one request.
 * Polls every IMPORT_JOB_POLL_MS while the job is busy, then stops.
 */
export function useImportJob(id: () => string, enabled: () => boolean = () => true) {
	return createQuery(() => ({
		queryKey: queryKeys.imports.detail(id()),
		queryFn: () => graphqlRequest<ImportJobResponse>(IMPORT_JOB, { id: id() }),
		staleTime: IMPORT_JOB_STALE_TIME_MS,
		enabled: enabled() && id() !== '',
		refetchInterval: (query: { state: { data?: ImportJobResponse } }) =>
			importJobIsBusy(query.state.data?.importJob, wsStatus.value === 'connected') ? IMPORT_JOB_POLL_MS : false,
	}));
}
