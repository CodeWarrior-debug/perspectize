import type { PageLoad } from './$types';
import { browser } from '$app/environment';
import { DEMO_MODE } from '$lib/auth';
import { queryClient } from '$lib/queries/client';
import { activityListRequest } from '$lib/queries/content';
import { prefetchActivityList } from '$lib/queries/content/prefetchActivityList';
import { parseGridParams } from '$lib/utils/gridUrlState';

// Start the Library list when the route loads, in parallel with Clerk. The root layout renders
// nothing until ClerkLoaded, so ActivityTable's own query could not start until Clerk finished (#636).
// Not awaited: the page mounts onto whatever is cached. Demo mode has no Clerk gate, so it is skipped.
// The cursor is null because the table's cursor stack starts at [null] on every mount.
export const load: PageLoad = ({ url }) => {
	if (!browser || DEMO_MODE) return;
	void prefetchActivityList(queryClient, activityListRequest(parseGridParams(url.searchParams), null));
};
