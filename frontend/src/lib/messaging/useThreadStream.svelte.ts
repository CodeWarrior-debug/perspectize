import type { QueryClient } from '@tanstack/svelte-query';
import { subscribeGraphql } from '$lib/messaging/ws-client.svelte';
import { THREAD_EVENTS_SUBSCRIPTION, type MessageThread } from '$lib/queries/messaging';
import type { ThreadEvent } from '$lib/messaging/events';
import {
	applyMessagePosted,
	applyMessageEdited,
	applyMessageDeleted,
	applyThreadEventToThread,
	nextSinceSeq,
	typingUsersReducer,
	activeTypingUserIds,
	presenceReducer,
	type ThreadMessagesCache,
} from '$lib/messaging/threadCache';
import { queryKeys } from '$lib/queries/keys';

const PRUNE_MS = 3000;

export function createThreadStream(opts: {
	queryClient: QueryClient;
	getThreadId: () => string;
	myUserId: string;
	now?: () => number;
}) {
	const now = opts.now ?? (() => Date.now());
	let dispose: (() => void) | null = null;
	let pruneTimer: ReturnType<typeof setInterval> | null = null;

	let typingState = $state<Record<string, number>>({});
	let presenceState = $state<Record<string, 'ONLINE' | 'OFFLINE'>>({});
	// touched by the prune interval so the getter recomputes
	let pruneTick = $state(0);

	function messagesKey() {
		return queryKeys.messaging.messages.list(opts.getThreadId());
	}
	function threadKey() {
		return queryKeys.messaging.threads.detail(opts.getThreadId());
	}

	function handle(event: ThreadEvent) {
		switch (event.__typename) {
			case 'MessagePosted':
				opts.queryClient.setQueryData<ThreadMessagesCache>(messagesKey(), (c) =>
					c ? applyMessagePosted(c, event.message) : c,
				);
				opts.queryClient.setQueryData<MessageThread>(threadKey(), (t) =>
					t ? applyThreadEventToThread(t, event, opts.myUserId) : t,
				);
				break;
			case 'ReadReceiptChanged':
			case 'ParticipantChanged':
				opts.queryClient.setQueryData<MessageThread>(threadKey(), (t) =>
					t ? applyThreadEventToThread(t, event, opts.myUserId) : t,
				);
				break;
			case 'TypingChanged':
				typingState = typingUsersReducer(typingState, event, now());
				break;
			case 'PresenceChanged':
				presenceState = presenceReducer(presenceState, event);
				break;
			case 'MessageEdited':
				opts.queryClient.setQueryData<ThreadMessagesCache>(messagesKey(), (c) =>
					c ? applyMessageEdited(c, event.message) : c,
				);
				break;
			case 'MessageDeleted':
				opts.queryClient.setQueryData<ThreadMessagesCache>(messagesKey(), (c) =>
					c ? applyMessageDeleted(c, { messageId: event.messageId, seq: event.seq }) : c,
				);
				break;
			case 'StreamReset':
				opts.queryClient.invalidateQueries({ queryKey: messagesKey() });
				restart();
				break;
		}
	}

	function open() {
		const cache = opts.queryClient.getQueryData<ThreadMessagesCache>(messagesKey());
		const since = cache ? nextSinceSeq(cache) : null;
		const variables: Record<string, unknown> = { threadId: opts.getThreadId() };
		if (since != null) variables.sinceSeq = since;
		dispose = subscribeGraphql<{ threadEvents: ThreadEvent }>(
			{ query: THREAD_EVENTS_SUBSCRIPTION, variables },
			{
				next: ({ threadEvents }) => handle(threadEvents),
				error: (err) => console.error('[threadEvents] stream error:', err),
			},
		);
	}

	function restart() {
		dispose?.();
		dispose = null;
		open();
	}

	function start() {
		if (dispose) return;
		open();
		pruneTimer = setInterval(() => {
			typingState = typingUsersReducer(typingState, { __typename: 'StreamReset', threadId: '' }, now());
			pruneTick++;
		}, PRUNE_MS);
	}

	function stop() {
		dispose?.();
		dispose = null;
		if (pruneTimer) {
			clearInterval(pruneTimer);
			pruneTimer = null;
		}
	}

	return {
		get typingUserIds() {
			void pruneTick;
			return activeTypingUserIds(typingState, now()).filter((id) => id !== opts.myUserId);
		},
		get presence() {
			return presenceState;
		},
		start,
		stop,
	};
}
