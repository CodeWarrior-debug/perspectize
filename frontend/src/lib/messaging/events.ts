import type { Message } from '$lib/queries/messaging';

export type ThreadEventTypename =
	| 'MessagePosted'
	| 'ReadReceiptChanged'
	| 'TypingChanged'
	| 'ParticipantChanged'
	| 'PresenceChanged'
	| 'StreamReset'
	| 'MessageEdited'
	| 'MessageDeleted';

export interface MessagePostedEvent {
	__typename: 'MessagePosted';
	message: Message;
}
export interface ReadReceiptChangedEvent {
	__typename: 'ReadReceiptChanged';
	threadId: string;
	userId: string;
	lastReadSeq: number;
}
export interface TypingChangedEvent {
	__typename: 'TypingChanged';
	threadId: string;
	userId: string;
	typing: boolean;
}
export interface ParticipantChangedEvent {
	__typename: 'ParticipantChanged';
	threadId: string;
	userId: string;
	change: 'ADDED' | 'REMOVED';
}
export interface PresenceChangedEvent {
	__typename: 'PresenceChanged';
	threadId: string;
	userId: string;
	state: 'ONLINE' | 'OFFLINE';
}
export interface StreamResetEvent {
	__typename: 'StreamReset';
	threadId: string;
}
export interface MessageEditedEvent {
	__typename: 'MessageEdited';
	message: Message; // full message with updated body and editedAt
}
export interface MessageDeletedEvent {
	__typename: 'MessageDeleted';
	threadId: string;
	messageId: string;
	seq: number;
}

export type ThreadEvent =
	| MessagePostedEvent
	| ReadReceiptChangedEvent
	| TypingChangedEvent
	| ParticipantChangedEvent
	| PresenceChangedEvent
	| StreamResetEvent
	| MessageEditedEvent
	| MessageDeletedEvent;
