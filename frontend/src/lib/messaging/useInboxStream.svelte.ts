import type { QueryClient } from '@tanstack/svelte-query';
import { subscribeGraphql } from '#lib/messaging/ws-client.svelte.js';
import { INBOX_EVENTS_SUBSCRIPTION, type InboxEvent } from '#lib/queries/messaging/index.js';
import { applyInboxEvent } from '#lib/messaging/messagingCache.js';
import { queryKeys } from '#lib/queries/keys.js';

export function createInboxStream(queryClient: QueryClient) {
	let dispose: (() => void) | null = null;

	function start() {
		if (dispose) return;
		dispose = subscribeGraphql<{ inboxEvents: InboxEvent }>(
			{ query: INBOX_EVENTS_SUBSCRIPTION },
			{
				next: ({ inboxEvents }) => {
					// A thread missing from a loaded list is refetched, not guessed.
					if (applyInboxEvent(queryClient, inboxEvents)) {
						queryClient.invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() });
					}
				},
				error: (err) => console.error('[inboxEvents] stream error:', err),
			},
		);
	}

	function stop() {
		dispose?.();
		dispose = null;
	}

	return { start, stop };
}
