import { useQueryClient } from '@tanstack/svelte-query';
import { subscribeGraphql, wsStatus } from '$lib/messaging/ws-client.svelte';
import { IMPORT_LISTING_PROGRESS, type ImportListingProgress, type ImportListingProgressResponse } from './index';
import { queryKeys } from '../keys';

/**
 * Live listing progress of an import's sources, over the graphql-ws connection.
 * Admin only: the caller passes `enabled` (false for everyone else), and the
 * subscription is then never opened, since the server would refuse it.
 *
 * `progress` is null unless a listing is running or one ended while this
 * subscription watched it, so an import that finished long ago shows nothing.
 * When a run ends, its sheet and the imports lists are refetched once each.
 * `status` is the socket state: callers fall back to polling when it is not
 * "connected".
 */
export function useImportListingProgress(jobId: () => string | null, enabled: () => boolean) {
	const client = useQueryClient();
	let snapshot = $state<ImportListingProgress | null>(null);
	let watchedRun = $state(false);

	$effect(() => {
		const id = jobId();
		const on = enabled();
		snapshot = null;
		watchedRun = false;
		if (!id || !on) return;
		let wasListing = false;
		const dispose = subscribeGraphql<ImportListingProgressResponse>(
			{ query: IMPORT_LISTING_PROGRESS, variables: { jobId: id } },
			{
				next: ({ importListingProgress: p }) => {
					snapshot = p;
					if (p.listing) watchedRun = true;
					if (wasListing && !p.listing) {
						void client.invalidateQueries({ queryKey: queryKeys.imports.detail(id) });
						void client.invalidateQueries({ queryKey: queryKeys.imports.lists() });
					}
					wasListing = p.listing;
				},
				error: (err) => console.error('[importListingProgress] stream error:', err),
			},
		);
		return dispose;
	});

	return {
		get progress(): ImportListingProgress | null {
			const p = snapshot;
			return p && (p.listing || watchedRun) ? p : null;
		},
		get status(): 'connecting' | 'connected' | 'closed' {
			return wsStatus.value;
		},
	};
}
