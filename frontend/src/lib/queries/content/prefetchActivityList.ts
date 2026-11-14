import type { QueryClient } from '@tanstack/svelte-query';
import { graphqlRequestAnonymous } from '$lib/queries/client';
import { LIST_CONTENT, type ContentResponse } from './index';
import { ACTIVITY_LIST_STALE_TIME_MS, type activityListRequest } from './activityList';

type ActivityListRequest = ReturnType<typeof activityListRequest>;

/**
 * Start the Activity list at route load, before Clerk is ready, under the SAME key ActivityTable
 * reads, so the table mounts onto cached data (#636).
 *
 * Anonymous on purpose: LIST_CONTENT's result depends on the viewer only through
 * filter.minPerspectiveCount (ComparePicker sets it; the URL never does). Without it the signed-out
 * and signed-in lists are identical. A request that carries that filter is skipped.
 *
 * Never rejects. prefetchQuery stores a failure as an error state with no data, so a later
 * ActivityTable mount refetches it (see tests). Only a mount that joins the prefetch while it is
 * still in flight shares its outcome.
 */
export function prefetchActivityList(client: QueryClient, request: ActivityListRequest): Promise<void> {
	if (isViewerScoped(request)) return Promise.resolve();
	return client.prefetchQuery({
		queryKey: request.queryKey,
		queryFn: () => graphqlRequestAnonymous<ContentResponse>(LIST_CONTENT, request.variables),
		staleTime: ACTIVITY_LIST_STALE_TIME_MS,
	});
}

/** True when the request's result depends on who is asking (so an anonymous prefetch would be wrong). */
export function isViewerScoped(request: ActivityListRequest): boolean {
	return request.variables.filter !== undefined && 'minPerspectiveCount' in request.variables.filter;
}
