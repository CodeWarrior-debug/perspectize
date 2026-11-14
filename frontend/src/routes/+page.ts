import type { PageLoad } from './$types';
import { browser } from '$app/environment';
import { DEMO_MODE } from '$lib/auth';
import { queryClient } from '$lib/queries/client';
import { activityListRequest } from '$lib/queries/content';
import { prefetchActivityList } from '$lib/queries/content/prefetchActivityList';
import { parseGridParams } from '$lib/utils/gridUrlState';

// `/` is where signed-in visitors used to find the Library (then called Activity), and where the
// PWA starts. The page itself forwards them to /content-library; starting the list here too keeps
// the #636 head start (fetching in parallel with Clerk) for anyone who lands on `/`.
export const load: PageLoad = ({ url }) => {
	if (!browser || DEMO_MODE) return;
	void prefetchActivityList(queryClient, activityListRequest(parseGridParams(url.searchParams), null));
};
