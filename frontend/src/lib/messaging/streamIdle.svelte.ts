import type { QueryClient } from '@tanstack/svelte-query';
import { createIdleDetector, type IdleDetectorOptions } from '$lib/utils/idleDetector';
import { queryKeys } from '$lib/queries/keys';

/**
 * Shared flag: true while the user is idle and the realtime streams should be
 * closed (so the backend websocket drops and the database can sleep). Stream
 * owners read `streamIdle.paused` synchronously in an `$effect` and skip/stop
 * their stream while it is true.
 */
export const streamIdle = $state({ paused: false });

/**
 * Drives `streamIdle`. On resume it refreshes the inbox/thread queries so
 * messages missed while paused show up. Returns a stop function.
 */
export function watchStreamIdle(
	queryClient: QueryClient,
	opts: Pick<IdleDetectorOptions, 'timeoutMs' | 'throttleMs'> = {},
): () => void {
	const detector = createIdleDetector({
		...opts,
		onIdle: () => {
			console.info('[realtime] idle: pausing inbox/thread streams');
			streamIdle.paused = true;
		},
		onActive: () => {
			console.info('[realtime] activity: resuming streams and refreshing inbox');
			streamIdle.paused = false;
			queryClient.invalidateQueries({ queryKey: queryKeys.messaging.threads.all() });
		},
	});
	detector.start();
	return () => {
		detector.stop();
		streamIdle.paused = false;
	};
}
