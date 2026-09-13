import { gql } from 'graphql-request';

export interface MessagingUser {
	id: string;
	username: string;
}

export type ThreadRole = 'OWNER' | 'MEMBER';

export interface ThreadParticipant {
	user: MessagingUser;
	role: ThreadRole;
	lastReadSeq: number;
	joinedAt: string;
}

export interface MessageThread {
	id: string;
	title: string | null;
	participants: ThreadParticipant[];
	lastMessageAt: string;
	latestSeq: number;
	myLastReadSeq: number;
	unreadCount: number;
	muted: boolean;
	createdAt: string;
}

export interface Message {
	id: string;
	threadId: string;
	sender: MessagingUser;
	seq: number;
	body: string; // "" once deleted (tombstone)
	editedAt: string | null; // null until the sender edits
	deletedAt: string | null; // null unless soft-deleted → render "message deleted"
	createdAt: string;
}

export interface MessagePageInfo {
	hasNextPage: boolean;
	hasPreviousPage: boolean;
	startCursor: string | null;
	endCursor: string | null;
}

export interface MessageConnection {
	items: Message[];
	pageInfo: MessagePageInfo;
}

export interface InboxEvent {
	threadId: string;
	lastMessageAt: string;
	latestSeq: number;
	unreadCount: number;
}

export interface ListMessageThreadsResponse {
	messageThreads: MessageThread[];
}
export interface GetMessageThreadResponse {
	messageThread: MessageThread | null;
}
export interface ListThreadMessagesResponse {
	threadMessages: MessageConnection;
}
export interface CreateMessageThreadResponse {
	createMessageThread: MessageThread;
}
export interface SendMessageResponse {
	sendMessage: Message;
}
export interface MarkThreadReadResponse {
	markThreadRead: MessageThread;
}
export interface SetTypingResponse {
	setTyping: boolean;
}
export interface AddThreadParticipantsResponse {
	addThreadParticipants: MessageThread;
}
export interface LeaveThreadResponse {
	leaveThread: boolean;
}
export interface EditMessageResponse {
	editMessage: Message;
}
export interface DeleteMessageResponse {
	deleteMessage: Message;
} // tombstone: body "", deletedAt set
export interface MuteThreadResponse {
	muteThread: MessageThread;
}

const USER_FIELDS = `
	id
	username
`;

const THREAD_FIELDS = `
	id
	title
	lastMessageAt
	latestSeq
	myLastReadSeq
	unreadCount
	muted
	createdAt
	participants {
		user { ${USER_FIELDS} }
		role
		lastReadSeq
		joinedAt
	}
`;

const MESSAGE_FIELDS = `
	id
	threadId
	seq
	body
	editedAt
	deletedAt
	createdAt
	sender { ${USER_FIELDS} }
`;

export const LIST_MESSAGE_THREADS = gql`
	query ListMessageThreads($first: Int, $before: String) {
		messageThreads(first: $first, before: $before) {
			${THREAD_FIELDS}
		}
	}
`;

export const GET_MESSAGE_THREAD = gql`
	query GetMessageThread($id: ID!) {
		messageThread(id: $id) {
			${THREAD_FIELDS}
		}
	}
`;

export const LIST_THREAD_MESSAGES = gql`
	query ListThreadMessages($threadId: ID!, $first: Int, $before: IntID) {
		threadMessages(threadId: $threadId, first: $first, before: $before) {
			items {
				${MESSAGE_FIELDS}
			}
			pageInfo {
				hasNextPage
				hasPreviousPage
				startCursor
				endCursor
			}
		}
	}
`;

export const CREATE_MESSAGE_THREAD = gql`
	mutation CreateMessageThread($input: CreateMessageThreadInput!) {
		createMessageThread(input: $input) {
			${THREAD_FIELDS}
		}
	}
`;

export const SEND_MESSAGE = gql`
	mutation SendMessage($input: SendMessageInput!) {
		sendMessage(input: $input) {
			${MESSAGE_FIELDS}
		}
	}
`;

export const MARK_THREAD_READ = gql`
	mutation MarkThreadRead($threadId: ID!, $seq: IntID!) {
		markThreadRead(threadId: $threadId, seq: $seq) {
			${THREAD_FIELDS}
		}
	}
`;

export const SET_TYPING = gql`
	mutation SetTyping($threadId: ID!, $typing: Boolean!) {
		setTyping(threadId: $threadId, typing: $typing)
	}
`;

export const ADD_THREAD_PARTICIPANTS = gql`
	mutation AddThreadParticipants($threadId: ID!, $userIds: [ID!]!) {
		addThreadParticipants(threadId: $threadId, userIds: $userIds) {
			${THREAD_FIELDS}
		}
	}
`;

export const LEAVE_THREAD = gql`
	mutation LeaveThread($threadId: ID!) {
		leaveThread(threadId: $threadId)
	}
`;

export const EDIT_MESSAGE = gql`
	mutation EditMessage($messageId: ID!, $body: String!) {
		editMessage(messageId: $messageId, body: $body) {
			${MESSAGE_FIELDS}
		}
	}
`;

export const DELETE_MESSAGE = gql`
	mutation DeleteMessage($messageId: ID!) {
		deleteMessage(messageId: $messageId) {
			${MESSAGE_FIELDS}
		}
	}
`;

export const MUTE_THREAD = gql`
	mutation MuteThread($threadId: ID!, $muted: Boolean!) {
		muteThread(threadId: $threadId, muted: $muted) {
			${THREAD_FIELDS}
		}
	}
`;

export const THREAD_EVENTS_SUBSCRIPTION = gql`
	subscription ThreadEvents($threadId: ID!, $sinceSeq: IntID) {
		threadEvents(threadId: $threadId, sinceSeq: $sinceSeq) {
			__typename
			... on MessagePosted { message { ${MESSAGE_FIELDS} } }
			... on ReadReceiptChanged { threadId userId lastReadSeq }
			... on TypingChanged { threadId userId typing }
			... on ParticipantChanged { threadId userId change }
			... on PresenceChanged { threadId userId state }
			... on StreamReset { threadId }
			... on MessageEdited { message { ${MESSAGE_FIELDS} } }
			... on MessageDeleted { threadId messageId seq }
		}
	}
`;

export const INBOX_EVENTS_SUBSCRIPTION = gql`
	subscription InboxEvents {
		inboxEvents {
			threadId
			lastMessageAt
			latestSeq
			unreadCount
		}
	}
`;
