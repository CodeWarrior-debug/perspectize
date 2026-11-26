import type { QueryClient } from '@tanstack/svelte-query';
import type { InboxEvent, ListMessageThreadsResponse, Message, MessageThread } from '#lib/queries/messaging/index.js';
import type { ThreadEvent } from '#lib/messaging/events.js';
import { queryKeys } from '#lib/queries/keys.js';
import {
	applyMessagePosted,
	applyMessageEdited,
	applyMessageDeleted,
	applyThreadEventToThread,
	type ThreadMessagesCache,
} from '#lib/messaging/threadCache.js';
import { reconcileSentMessage } from '#lib/messaging/optimistic.js';
import { applyInboxEvent as applyInboxEventToList, patchThreadInList } from '#lib/messaging/inboxCache.js';

/**
 * The one place messaging caches (messages, thread detail, inbox list) change.
 * Mutation hooks and both streams call these functions, so a counter or a
 * tombstone is updated the same way whichever path delivered it.
 *
 * Keys come from queryKeys. Each function is a no-op for a cache that is not
 * loaded, so an event for a closed thread never creates an entry.
 */

/** A mutation's effect on the messages and thread summary. */
export type MessageResult =
	| { kind: 'sent'; message: Message; clientNonce: string }
	| { kind: 'edited'; message: Message }
	| { kind: 'deleted'; message: Message }
	| { kind: 'editStarted'; message: Message }
	| { kind: 'deleteStarted'; threadId: string; messageId: string }
	| { kind: 'sendFailed'; threadId: string; clientNonce: string };

function messagesKey(threadId: string) {
	return queryKeys.messaging.messages.list(threadId);
}

function threadKey(threadId: string) {
	return queryKeys.messaging.threads.detail(threadId);
}

function updateMessages(threadId: string, fn: (c: ThreadMessagesCache) => ThreadMessagesCache, qc: QueryClient) {
	qc.setQueryData<ThreadMessagesCache>(messagesKey(threadId), (c) => (c ? fn(c) : c));
}

function updateThread(threadId: string, fn: (t: MessageThread) => MessageThread, qc: QueryClient) {
	qc.setQueryData<MessageThread>(threadKey(threadId), (t) => (t ? fn(t) : t));
}

/**
 * Applies a thread stream event. Typing and presence are ephemeral and stay in
 * the stream; stream resets are the stream's to handle.
 */
export function applyThreadEvent(qc: QueryClient, threadId: string, myUserId: string, event: ThreadEvent): void {
	switch (event.__typename) {
		case 'MessagePosted': {
			const cache = qc.getQueryData<ThreadMessagesCache>(messagesKey(threadId));
			// Known by id when the list is loaded, so a repeated delivery is not
			// counted again; otherwise the seq rule decides.
			const known = cache ? cache.items.some((m) => m.id === event.message.id) : undefined;
			updateMessages(threadId, (c) => applyMessagePosted(c, event.message), qc);
			updateThread(threadId, (t) => applyThreadEventToThread(t, event, myUserId, known), qc);
			return;
		}
		case 'MessageEdited':
			updateMessages(threadId, (c) => applyMessageEdited(c, event.message), qc);
			return;
		case 'MessageDeleted':
			updateMessages(threadId, (c) => applyMessageDeleted(c, { messageId: event.messageId, seq: event.seq }), qc);
			return;
		case 'ReadReceiptChanged':
		case 'ParticipantChanged':
			updateThread(threadId, (t) => applyThreadEventToThread(t, event, myUserId), qc);
			return;
		case 'TypingChanged':
		case 'PresenceChanged':
		case 'StreamReset':
			return;
	}
}

/** Applies a mutation's effect. The sender of a sent message is the actor. */
export function applyMessageResult(qc: QueryClient, result: MessageResult): void {
	switch (result.kind) {
		case 'sent': {
			const { message, clientNonce } = result;
			updateMessages(message.threadId, (c) => reconcileSentMessage(c, clientNonce, message), qc);
			// Already known: my own send never changes my unread count.
			updateThread(
				message.threadId,
				(t) => applyThreadEventToThread(t, { __typename: 'MessagePosted', message }, message.sender.id, true),
				qc,
			);
			return;
		}
		case 'edited':
		case 'editStarted':
			updateMessages(result.message.threadId, (c) => applyMessageEdited(c, result.message), qc);
			return;
		case 'deleted':
			updateMessages(
				result.message.threadId,
				(c) => applyMessageDeleted(c, { messageId: result.message.id }, result.message.deletedAt ?? undefined),
				qc,
			);
			return;
		case 'deleteStarted':
			updateMessages(result.threadId, (c) => applyMessageDeleted(c, { messageId: result.messageId }), qc);
			return;
		case 'sendFailed':
			updateMessages(
				result.threadId,
				(c) => ({ ...c, items: c.items.filter((m) => m.id !== `optimistic:${result.clientNonce}`) }),
				qc,
			);
			return;
	}
}

/** Writes a server thread snapshot (markThreadRead, muteThread, ...) to the detail and list. */
export function applyThreadResult(qc: QueryClient, thread: MessageThread): void {
	qc.setQueryData<MessageThread>(threadKey(thread.id), thread);
	patchThreadInList(qc, thread);
}

/**
 * Applies a server inbox summary (authoritative unread count) to the list and,
 * when loaded, the thread detail. Returns true when the list is loaded and does
 * not contain the thread, so the caller can refetch the list.
 */
export function applyInboxEvent(qc: QueryClient, event: InboxEvent): boolean {
	let missing = false;
	qc.setQueryData<ListMessageThreadsResponse>(queryKeys.messaging.threads.list(), (old) => {
		if (!old) return old;
		missing = !old.messageThreads.some((t) => t.id === event.threadId);
		const next = applyInboxEventToList(old.messageThreads, event);
		return next === old.messageThreads ? old : { messageThreads: next };
	});
	updateThread(
		event.threadId,
		(t) =>
			t.latestSeq === event.latestSeq && t.lastMessageAt === event.lastMessageAt && t.unreadCount === event.unreadCount
				? t
				: { ...t, latestSeq: event.latestSeq, lastMessageAt: event.lastMessageAt, unreadCount: event.unreadCount },
		qc,
	);
	return missing;
}
