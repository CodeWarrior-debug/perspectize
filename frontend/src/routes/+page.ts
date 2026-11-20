import type { PageLoad } from './$types';
import { browser } from '$app/env';
import { DEMO_MODE } from '#lib/auth/index.js';
import { queryClient } from '#lib/queries/client.js';
import { activityListRequest } from '#lib/queries/content/index.js';
import { prefetchActivityList } from '#lib/queries/content/prefetchActivityList.js';
import { parseGridParams } from '#lib/utils/gridUrlState.js';

// `/` is where the PWA starts. The page itself forwards signed-in visitors to /content-library;
// starting the list here too keeps the head start (fetching in parallel with Clerk) for anyone
// who lands on `/`.
export const load: PageLoad = ({ url }) => {
	if (!browser || DEMO_MODE) return;
	void prefetchActivityList(queryClient, activityListRequest(parseGridParams(url.searchParams), null));
};
