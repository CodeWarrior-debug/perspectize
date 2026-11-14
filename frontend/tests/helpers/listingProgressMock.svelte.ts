import type { ImportListingProgress, ImportSource } from '$lib/queries/imports';

/**
 * Reactive stand-ins for what ImportListingProgress reads, so a test can change
 * them after render and flush, the way the page does. `.svelte.ts` so `$state`
 * works. Test-only.
 */
export const liveMock = $state<{
	isAdmin: boolean;
	progress: ImportListingProgress | null;
	status: 'connecting' | 'connected' | 'closed';
}>({ isAdmin: true, progress: null, status: 'connected' });

/** The props the harness passes in; changing them updates the same mounted instance. */
export const listingProps = $state<{ jobId: string; sources: ImportSource[] }>({ jobId: '7', sources: [] });
