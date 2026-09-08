import { describe, it, expect } from 'vitest';
import {
	LIST_MESSAGE_THREADS,
	GET_MESSAGE_THREAD,
	LIST_THREAD_MESSAGES,
	CREATE_MESSAGE_THREAD,
	SEND_MESSAGE,
	MARK_THREAD_READ,
	SET_TYPING,
	ADD_THREAD_PARTICIPANTS,
	LEAVE_THREAD,
	EDIT_MESSAGE,
	DELETE_MESSAGE,
	MUTE_THREAD,
	THREAD_EVENTS_SUBSCRIPTION,
	INBOX_EVENTS_SUBSCRIPTION,
	type MessageThread,
	type Message,
	type MessageConnection,
	type InboxEvent,
} from '$lib/queries/messaging';

describe('messaging GraphQL documents', () => {
	it('thread list query names its operation and selects unreadCount', () => {
		expect(LIST_MESSAGE_THREADS).toContain('query ListMessageThreads');
		expect(LIST_MESSAGE_THREADS).toContain('messageThreads');
		expect(LIST_MESSAGE_THREADS).toContain('unreadCount');
		expect(LIST_MESSAGE_THREADS).toContain('participants');
	});

	it('thread messages query pages backward with an IntID before cursor', () => {
		expect(LIST_THREAD_MESSAGES).toContain('$before: IntID');
		expect(LIST_THREAD_MESSAGES).toContain('threadMessages(threadId: $threadId');
		expect(LIST_THREAD_MESSAGES).toContain('endCursor');
	});

	it('send mutation takes SendMessageInput and returns seq + body', () => {
		expect(SEND_MESSAGE).toContain('$input: SendMessageInput!');
		expect(SEND_MESSAGE).toContain('seq');
		expect(SEND_MESSAGE).toContain('body');
	});

	it('mark-read mutation takes an IntID seq', () => {
		expect(MARK_THREAD_READ).toContain('$seq: IntID!');
	});

	it('other mutation documents name their operations', () => {
		expect(CREATE_MESSAGE_THREAD).toContain('mutation CreateMessageThread');
		expect(SET_TYPING).toContain('mutation SetTyping');
		expect(ADD_THREAD_PARTICIPANTS).toContain('mutation AddThreadParticipants');
		expect(LEAVE_THREAD).toContain('mutation LeaveThread');
		expect(GET_MESSAGE_THREAD).toContain('query GetMessageThread');
	});

	it('threadEvents subscription requests __typename on every union member', () => {
		expect(THREAD_EVENTS_SUBSCRIPTION).toContain('subscription ThreadEvents');
		expect(THREAD_EVENTS_SUBSCRIPTION).toContain('__typename');
		for (const member of [
			'MessagePosted',
			'ReadReceiptChanged',
			'TypingChanged',
			'ParticipantChanged',
			'PresenceChanged',
			'StreamReset',
		]) {
			expect(THREAD_EVENTS_SUBSCRIPTION).toContain(`... on ${member}`);
		}
	});

	it('inboxEvents subscription selects the summary fields', () => {
		expect(INBOX_EVENTS_SUBSCRIPTION).toContain('subscription InboxEvents');
		expect(INBOX_EVENTS_SUBSCRIPTION).toContain('unreadCount');
		expect(INBOX_EVENTS_SUBSCRIPTION).toContain('latestSeq');
	});

	it('exported types are structurally usable', () => {
		const t: MessageThread = {
			id: '1', title: null, participants: [], lastMessageAt: 'x',
			latestSeq: 0, myLastReadSeq: 0, unreadCount: 0, muted: false, createdAt: 'x',
		};
		const m: Message = {
			id: '1', threadId: '1', sender: { id: '2', username: 'a' },
			seq: 1, body: 'hi', editedAt: null, deletedAt: null, createdAt: 'x',
		};
		const c: MessageConnection = {
			items: [m],
			pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: '1', endCursor: '1' },
		};
		const e: InboxEvent = { threadId: '1', lastMessageAt: 'x', latestSeq: 1, unreadCount: 0 };
		expect([t, m, c, e]).toHaveLength(4);
	});

	it('editMessage mutation requests the MESSAGE_FIELDS fragment including editedAt', () => {
		expect(EDIT_MESSAGE).toContain('mutation EditMessage');
		expect(EDIT_MESSAGE).toContain('$messageId: ID!');
		expect(EDIT_MESSAGE).toContain('editedAt');
	});

	it('deleteMessage mutation returns the tombstoned message fields', () => {
		expect(DELETE_MESSAGE).toContain('mutation DeleteMessage');
		expect(DELETE_MESSAGE).toContain('$messageId: ID!');
		expect(DELETE_MESSAGE).toContain('deletedAt');
	});

	it('muteThread mutation returns a full thread including muted field', () => {
		expect(MUTE_THREAD).toContain('mutation MuteThread');
		expect(MUTE_THREAD).toContain('muted');
	});

	it('threadEvents subscription includes MessageEdited and MessageDeleted fragments', () => {
		expect(THREAD_EVENTS_SUBSCRIPTION).toContain('... on MessageEdited');
		expect(THREAD_EVENTS_SUBSCRIPTION).toContain('... on MessageDeleted');
		expect(THREAD_EVENTS_SUBSCRIPTION).toMatch(/on MessageDeleted\s*{[^}]*seq/);
	});
});
