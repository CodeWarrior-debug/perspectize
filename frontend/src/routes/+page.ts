import type { PageLoad } from './$types';
import { browser } from '$app/env';
import { DEMO_MODE } from '#lib/auth/index.js';
import { queryClient } from '#lib/queries/client.js';
import { libraryListRequest } from '#lib/queries/content/index.js';
import { prefetchLibraryList } from '#lib/queries/content/prefetchLibraryList.js';
import { parseGridParams } from '#lib/utils/gridUrlState.js';

// `/` is where an installed home-screen app starts (manifest `start_url`). The page itself forwards signed-in visitors to /content-library;
// starting the list here too keeps the head start (fetching in parallel with Clerk) for anyone
// who lands on `/`.
export const load: PageLoad = ({ url }) => {
	if (!browser || DEMO_MODE) return;
	void prefetchLibraryList(queryClient, libraryListRequest(parseGridParams(url.searchParams), null));
};
