import { useQueryClient } from '@tanstack/svelte-query';
import { subscribeGraphql } from '$lib/messaging/ws-client.svelte';
import { IMPORT_PROGRESS, type ImportProgress, type ImportProgressResponse } from './index';
import { queryKeys } from '../keys';

/**
 * Live progress of an import over the graphql-ws connection. The server
 * pushes at most twice a second while rows import (and at once on start and
 * finish). When a run finishes, the sheet is refetched once so every row
 * shows its outcome, along with the Activity lists (new content).
 */
export function useImportProgress(jobId: () => string) {
	const client = useQueryClient();
	let progress = $state<ImportProgress | null>(null);

	$effect(() => {
		const id = jobId();
		if (!id) return;
		progress = null;
		let wasRunning = false;
		const dispose = subscribeGraphql<ImportProgressResponse>(
			{ query: IMPORT_PROGRESS, variables: { jobId: id } },
			{
				next: ({ importProgress }) => {
					progress = importProgress;
					if (wasRunning && !importProgress.running) {
						void client.invalidateQueries({ queryKey: queryKeys.imports.detail(id) });
						void client.invalidateQueries({ queryKey: queryKeys.content.lists() });
					}
					wasRunning = importProgress.running;
				},
				error: (err) => console.error('[importProgress] stream error:', err),
			},
		);
		return dispose;
	});

	return {
		get current(): ImportProgress | null {
			return progress;
		},
	};
}
