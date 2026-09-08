import type { QueryClient } from '@tanstack/svelte-query';
import { subscribeGraphql } from '$lib/messaging/ws-client.svelte';
import {
	INBOX_EVENTS_SUBSCRIPTION,
	type InboxEvent,
	type ListMessageThreadsResponse,
} from '$lib/queries/messaging';
import { applyInboxEvent } from '$lib/messaging/inboxCache';
import { queryKeys } from '$lib/queries/keys';

export function createInboxStream(queryClient: QueryClient) {
	let dispose: (() => void) | null = null;

	function start() {
		if (dispose) return;
		dispose = subscribeGraphql<{ inboxEvents: InboxEvent }>(
			{ query: INBOX_EVENTS_SUBSCRIPTION },
			{
				next: ({ inboxEvents }) => {
					let unknownThread = false;
					queryClient.setQueryData<ListMessageThreadsResponse>(
						queryKeys.messaging.threads.list(),
						(old) => {
							if (!old) return old;
							const next = applyInboxEvent(old.messageThreads, inboxEvents);
							if (
								next === old.messageThreads &&
								!old.messageThreads.some((t) => t.id === inboxEvents.threadId)
							) {
								unknownThread = true;
							}
							return next === old.messageThreads ? old : { messageThreads: next };
						},
					);
					if (unknownThread) {
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
