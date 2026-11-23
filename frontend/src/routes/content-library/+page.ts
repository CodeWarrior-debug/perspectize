import type { PageLoad } from './$types';
import { browser } from '$app/env';
import { DEMO_MODE } from '#lib/auth/index.js';
import { queryClient } from '#lib/queries/client.js';
import { libraryListRequest } from '#lib/queries/content/index.js';
import { prefetchLibraryList } from '#lib/queries/content/prefetchLibraryList.js';
import { parseGridParams } from '#lib/utils/gridUrlState.js';

// Start the Library list when the route loads, in parallel with Clerk. The root layout renders
// nothing until ClerkLoaded, so ContentLibrary's own query could not start until Clerk finished.
// Not awaited: the page mounts onto whatever is cached. Demo mode has no Clerk gate, so it is skipped.
// The cursor is null because the table's cursor stack starts at [null] on every mount.
export const load: PageLoad = ({ url }) => {
	if (!browser || DEMO_MODE) return;
	void prefetchLibraryList(queryClient, libraryListRequest(parseGridParams(url.searchParams), null));
};
