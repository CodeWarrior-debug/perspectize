# Messaging Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the SvelteKit messaging client — real-time threads, message history, composer, typing indicators, read receipts, and presence — against the already-merged messaging GraphQL API on the `worktree-feature+messaging-architecture-research` branch.

**Architecture:** A lazily-created browser-only `graphql-ws` client holds one WebSocket to `/graphql`, authenticated with the Clerk token in `connectionParams`. Queries and mutations keep using `graphqlRequest` + TanStack Query (function-wrapper hooks). Subscription events (`threadEvents`, `inboxEvents`) are folded into the TanStack Query cache by pure reducer functions — there is no parallel store. UI lives under `/messages` and `/messages/[threadId]` with a two-pane desktop layout that collapses to one pane on mobile.

**Tech Stack:** SvelteKit 2 (Svelte 5 runes), TanStack Svelte Query v6, `graphql-request`, `graphql-ws` (new dependency), Tailwind v4, shadcn-svelte, `@lucide/svelte`, `svelte-clerk`, Vitest (jsdom `unit` project).

**Spec:** `docs/superpowers/specs/2026-09-06-messaging-architecture-design.md` (section "Frontend integration" and the "GraphQL API" schema block). The backend schema as actually shipped is `backend/messaging.graphql` on the base branch — prefer it over the spec where they differ.

## Global Constraints

- **Branch:** work happens on `feature/messaging-frontend`, already cut from `origin/worktree-feature+messaging-architecture-research`. The PR base is that messaging branch, **not** `main`.
- **Svelte 5 runes only.** `$state`, `$derived`, `$props`, `$effect`, `{@render children()}`, `onclick=`. No `export let`, no `$:`, no `on:click`, no `<slot />`. Never use `$effect` for derivation.
- **TanStack Query function-wrapper pattern.** `createQuery(() => ({ ... }))` / `createMutation(() => ({ ... }))`. Results are reactive objects — no `$` prefix. `queryKey` must mirror every variable `queryFn` sends.
- **Mutations/queries use `graphqlRequest` from `$lib/queries/client`** (the authenticated wrapper), never the bare `graphqlClient`.
- **Query keys come from the `queryKeys` factory** in `$lib/queries/keys.ts`. Add a `messaging` namespace there; do not inline key arrays.
- **Icons:** per-icon imports — `import SendIcon from '@lucide/svelte/icons/send';`. Path is `@lucide/svelte/icons/{kebab-case}`.
- **Colours/spacing:** existing Tailwind v4 tokens only (`bg-background`, `text-muted-foreground`, `border-border`, `bg-primary`, etc.). No new design tokens, no Figma.
- **Tests:** `tests/**/*.{test,spec}.{js,ts}` in the `unit` (jsdom) project. Run with `pnpm run test:run` from `frontend/`. Type-check with `pnpm run check` from `frontend/`.
- **`pnpm` commands run from `frontend/`** (`cd frontend && pnpm ...`), never the repo root. Never chain shell commands with `&&` in tool calls — one command per call. (`cd frontend && pnpm ...` is a single documented exception the repo's own docs use; still prefer `pnpm --dir frontend ...`.)
- **Commit messages:** conventional commits (`feat(messaging): ...`), one logical change per commit. End every commit body with:
  ```
  Co-Authored-By: Claude Sonnet 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01KTfDqwbjT21U75sfUEyuoB
  ```
- **`User` shape from the API is `{ id: ID!, username: String! }` only** — no avatar, no display name. Render avatars as username initials.
- **No `User.presence` field exists.** Presence is delivered only as `PresenceChanged` events inside `threadEvents` for the currently-open thread. Do not query presence anywhere.
- **Routing is already CSR-only.** `src/routes/+layout.ts` sets `prerender = false; ssr = false; csr = true;` app-wide, so the `/messages` subtree needs no route config file. Queries stay client-only via the QueryClient's `enabled: browser` default in `src/routes/+layout.svelte`.

---

## File Structure

**New — WebSocket transport & subscription plumbing**
- `src/lib/messaging/ws-client.ts` — lazy singleton `graphql-ws` client. Exports `getWsClient()`, `subscribeGraphql<T>(payload, handlers)`, `disposeWsClient()` (test cleanup), and a `wsConnectionState` reactive store (`'connecting' | 'connected' | 'closed'`).
- `src/lib/messaging/events.ts` — `ThreadEvent` / `InboxEvent` TypeScript types and the `ThreadEventTypename` union literal.
- `src/lib/messaging/threadCache.ts` — **pure functions** that fold one `ThreadEvent` into cache values: `applyThreadEventToMessages(page, event)`, `applyThreadEventToThread(thread, event, myUserId)`, `nextSinceSeq(pages)`, `typingUsersReducer(state, event, now)`, `presenceReducer(state, event)`. No TanStack imports — take plain data, return plain data.
- `src/lib/messaging/inboxCache.ts` — pure `applyInboxEvent(threads, event)` returning a new sorted thread array.
- `src/lib/messaging/optimistic.ts` — pure helpers for optimistic send: `makeClientNonce()`, `optimisticMessage(body, sender, nonce, tempSeq)`, `reconcileSentMessage(page, nonce, serverMessage)`.
- `src/lib/messaging/typing.ts` — pure `TypingController` factory (first-keystroke `true`, 5s-idle / on-send `false`); takes an `emit(typing: boolean)` callback and a `now()` + `setTimeout`-like injectable clock for tests.

**New — TanStack Query layer**
- `src/lib/queries/messaging.ts` — `gql` documents + response types for every messaging query/mutation/subscription.
- `src/lib/queries/hooks/useMessageThreads.svelte.ts`
- `src/lib/queries/hooks/useThreadMessages.svelte.ts` (infinite / backward paging)
- `src/lib/queries/hooks/useSendMessage.ts`
- `src/lib/queries/hooks/useMarkThreadRead.ts`
- `src/lib/queries/hooks/useCreateMessageThread.ts`
- `src/lib/queries/hooks/useSetTyping.ts`
- `src/lib/queries/hooks/useAddThreadParticipants.ts`
- `src/lib/queries/hooks/useLeaveThread.ts`

**New — subscription runes (wire cache ⇆ WS)**
- `src/lib/messaging/useThreadStream.svelte.ts` — for the open thread: subscribe `threadEvents(threadId, sinceSeq)`, fold events into cache, expose `typingUsers` and `presence` reactive maps, handle `StreamReset` + reconnect resync.
- `src/lib/messaging/useInboxStream.svelte.ts` — one app-wide `inboxEvents` subscription; folds into the thread-list cache; exposes `totalUnread`.

**New — components** (`src/lib/components/messaging/`)
- `ThreadList.svelte`, `ThreadListItem.svelte`, `ThreadView.svelte`, `MessageBubble.svelte`, `MessageComposer.svelte`, `TypingIndicator.svelte`, `ReadReceiptAvatars.svelte`, `PresenceDot.svelte`, `NewThreadDialog.svelte`, `Avatar.svelte` (initials circle).

**New — routes**
- `src/routes/messages/+layout.svelte` — two-pane shell (thread list + `{@render children()}`).
- `src/routes/messages/+page.svelte` — empty-detail placeholder.
- `src/routes/messages/[threadId]/+page.svelte` — renders `ThreadView` for `page.params.threadId`.

**Modified**
- `frontend/package.json` — add `graphql-ws` dependency.
- `src/lib/queries/keys.ts` — add `messaging` namespace.
- `src/lib/components/Header.svelte` — add "Messages" nav link + unread badge.
- `src/routes/+layout.svelte` — mount `useInboxStream` once, inside `<Show when="signed-in">`.

**New — tests** (`frontend/tests/unit/` unless noted)
- `messaging-threadCache.test.ts`, `messaging-inboxCache.test.ts`, `messaging-optimistic.test.ts`, `messaging-typing.test.ts`, `messaging-ws-client.test.ts`, `queries-messaging.test.ts`, `queries-keys-messaging.test.ts`
- `hooks-useSendMessage.test.ts`, `hooks-useMarkThreadRead.test.ts`, `hooks-useCreateMessageThread.test.ts`
- `tests/components/MessageBubble.test.ts`, `tests/components/MessageComposer.test.ts`, `tests/components/ThreadListItem.test.ts`, `tests/components/TypingIndicator.test.ts`, `tests/components/Avatar.test.ts`, `tests/components/Header.test.ts` (extend existing)

---
## Task 1: Add `graphql-ws` dependency

**Files:**
- Modify: `frontend/package.json` (dependencies)
- Modify: `frontend/pnpm-lock.yaml` (generated)

**Interfaces:**
- Produces: the `graphql-ws` module (`createClient`, `Client`, `ClientOptions`) importable from any frontend module.

- [ ] **Step 1: Add the dependency**

Run from `frontend/`:
```bash
pnpm add graphql-ws
```
Pin whatever the latest stable major resolves to (v5 or v6 — both expose `createClient` and both speak the `graphql-transport-ws` subprotocol that gqlgen's `transport.Websocket` accepts). It has no runtime deps beyond a `graphql` peer, which is already present. If the resolved version's `createClient` option names differ from Task 8's (`retryAttempts`, `on.connecting/connected/closed`), reconcile against that version's README before writing Task 8 — the option set has been stable across v5/v6 but confirm.

- [ ] **Step 2: Verify it resolved**

Run: `pnpm --dir frontend ls graphql-ws`
Expected: prints `graphql-ws 6.x.x`, no peer-dep errors.

- [ ] **Step 3: Type-check baseline still green**

Run: `cd frontend && pnpm run check`
Expected: PASS (same as before the change).

- [ ] **Step 4: Commit**

```bash
git add frontend/package.json frontend/pnpm-lock.yaml
git commit -m "feat(messaging): add graphql-ws dependency for subscriptions"
```

---

## Task 2: `messaging` query-key namespace

**Files:**
- Modify: `src/lib/queries/keys.ts`
- Test: `frontend/tests/unit/queries-keys-messaging.test.ts`

**Interfaces:**
- Produces:
  - `queryKeys.messaging.all() → ['app','messaging']`
  - `queryKeys.messaging.threads.lists() → ['app','messaging','threads','list']`
  - `queryKeys.messaging.threads.list() → ['app','messaging','threads','list']` (no args — the list is the signed-in user's inbox)
  - `queryKeys.messaging.threads.detail(id: string) → ['app','messaging','threads','detail', id]`
  - `queryKeys.messaging.messages.lists() → ['app','messaging','messages','list']`
  - `queryKeys.messaging.messages.list(threadId: string) → ['app','messaging','messages','list', { threadId }]`

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/queries-keys-messaging.test.ts
import { describe, it, expect } from 'vitest';
import { queryKeys } from '$lib/queries/keys';

describe('queryKeys.messaging', () => {
	it('all() is the messaging prefix', () => {
		expect(queryKeys.messaging.all()).toEqual(['app', 'messaging']);
	});

	it('threads.lists() and threads.list() are the inbox list key', () => {
		expect(queryKeys.messaging.threads.lists()).toEqual(['app', 'messaging', 'threads', 'list']);
		expect(queryKeys.messaging.threads.list()).toEqual(['app', 'messaging', 'threads', 'list']);
	});

	it('threads.detail(id) nests under the threads prefix', () => {
		expect(queryKeys.messaging.threads.detail('42')).toEqual([
			'app', 'messaging', 'threads', 'detail', '42',
		]);
	});

	it('messages.list(threadId) carries the threadId in an object', () => {
		expect(queryKeys.messaging.messages.lists()).toEqual(['app', 'messaging', 'messages', 'list']);
		expect(queryKeys.messaging.messages.list('42')).toEqual([
			'app', 'messaging', 'messages', 'list', { threadId: '42' },
		]);
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- queries-keys-messaging`
Expected: FAIL — `Cannot read properties of undefined (reading 'all')`.

- [ ] **Step 3: Add the namespace**

In `src/lib/queries/keys.ts`, inside the `queryKeys` object (after `perspectives`):
```ts
	messaging: {
		all: () => [...queryKeys.all, 'messaging'] as const,
		threads: {
			all: () => [...queryKeys.messaging.all(), 'threads'] as const,
			lists: () => [...queryKeys.messaging.threads.all(), 'list'] as const,
			list: () => [...queryKeys.messaging.threads.lists()] as const,
			details: () => [...queryKeys.messaging.threads.all(), 'detail'] as const,
			detail: (id: string) => [...queryKeys.messaging.threads.details(), id] as const,
		},
		messages: {
			all: () => [...queryKeys.messaging.all(), 'messages'] as const,
			lists: () => [...queryKeys.messaging.messages.all(), 'list'] as const,
			list: (threadId: string) =>
				[...queryKeys.messaging.messages.lists(), { threadId }] as const,
		},
	},
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- queries-keys-messaging`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/keys.ts frontend/tests/unit/queries-keys-messaging.test.ts
git commit -m "feat(messaging): add messaging query-key namespace"
```

---

## Task 3: GraphQL documents & types (`src/lib/queries/messaging.ts`)

**Files:**
- Create: `src/lib/queries/messaging.ts`
- Test: `frontend/tests/unit/queries-messaging.test.ts`

**Interfaces:**
- Produces (types):
  - `MessagingUser = { id: string; username: string }`
  - `ThreadRole = 'OWNER' | 'MEMBER'`
  - `ThreadParticipant = { user: MessagingUser; role: ThreadRole; lastReadSeq: number; joinedAt: string }`
  - `MessageThread = { id: string; title: string | null; participants: ThreadParticipant[]; lastMessageAt: string; latestSeq: number; myLastReadSeq: number; unreadCount: number; createdAt: string }`
  - `Message = { id: string; threadId: string; sender: MessagingUser; seq: number; body: string; createdAt: string }`
  - `MessagePageInfo = { hasNextPage: boolean; hasPreviousPage: boolean; startCursor: string | null; endCursor: string | null }`
  - `MessageConnection = { items: Message[]; pageInfo: MessagePageInfo }`
  - `InboxEvent = { threadId: string; lastMessageAt: string; latestSeq: number; unreadCount: number }`
- Produces (documents, all `string` from `gql`):
  - `LIST_MESSAGE_THREADS` — `query($first: Int, $before: String)` → `{ messageThreads: MessageThread[] }`
  - `GET_MESSAGE_THREAD` — `query($id: ID!)` → `{ messageThread: MessageThread | null }`
  - `LIST_THREAD_MESSAGES` — `query($threadId: ID!, $first: Int, $before: IntID)` → `{ threadMessages: MessageConnection }`
  - `CREATE_MESSAGE_THREAD` — `mutation($input: CreateMessageThreadInput!)` → `{ createMessageThread: MessageThread }`
  - `SEND_MESSAGE` — `mutation($input: SendMessageInput!)` → `{ sendMessage: Message }`
  - `MARK_THREAD_READ` — `mutation($threadId: ID!, $seq: IntID!)` → `{ markThreadRead: MessageThread }`
  - `SET_TYPING` — `mutation($threadId: ID!, $typing: Boolean!)` → `{ setTyping: boolean }`
  - `ADD_THREAD_PARTICIPANTS` — `mutation($threadId: ID!, $userIds: [ID!]!)` → `{ addThreadParticipants: MessageThread }`
  - `LEAVE_THREAD` — `mutation($threadId: ID!)` → `{ leaveThread: boolean }`
  - `THREAD_EVENTS_SUBSCRIPTION` — `subscription($threadId: ID!, $sinceSeq: IntID)` → `{ threadEvents: ThreadEvent }`
  - `INBOX_EVENTS_SUBSCRIPTION` — `subscription` → `{ inboxEvents: InboxEvent }`
- The two subscription documents must request `__typename` on every union member (see code) — the cache reducers dispatch on it.
- The reusable fragment fields: `MESSAGE_FIELDS` and `THREAD_FIELDS` string constants, composed into the documents.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/queries-messaging.test.ts
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
			latestSeq: 0, myLastReadSeq: 0, unreadCount: 0, createdAt: 'x',
		};
		const m: Message = {
			id: '1', threadId: '1', sender: { id: '2', username: 'a' },
			seq: 1, body: 'hi', createdAt: 'x',
		};
		const c: MessageConnection = {
			items: [m],
			pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: '1', endCursor: '1' },
		};
		const e: InboxEvent = { threadId: '1', lastMessageAt: 'x', latestSeq: 1, unreadCount: 0 };
		expect([t, m, c, e]).toHaveLength(4);
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- queries-messaging`
Expected: FAIL — module `$lib/queries/messaging` not found.

- [ ] **Step 3: Create `src/lib/queries/messaging.ts`**

```ts
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
	createdAt: string;
}

export interface Message {
	id: string;
	threadId: string;
	sender: MessagingUser;
	seq: number;
	body: string;
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

export const THREAD_EVENTS_SUBSCRIPTION = gql`
	subscription ThreadEvents($threadId: ID!, $sinceSeq: IntID) {
		threadEvents(threadId: $threadId, sinceSeq: $sinceSeq) {
			__typename
			... on MessagePosted {
				message {
					${MESSAGE_FIELDS}
				}
			}
			... on ReadReceiptChanged {
				threadId
				userId
				lastReadSeq
			}
			... on TypingChanged {
				threadId
				userId
				typing
			}
			... on ParticipantChanged {
				threadId
				userId
				change
			}
			... on PresenceChanged {
				threadId
				userId
				state
			}
			... on StreamReset {
				threadId
			}
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
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- queries-messaging`
Expected: PASS (8 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/messaging.ts frontend/tests/unit/queries-messaging.test.ts
git commit -m "feat(messaging): add GraphQL documents and response types"
```

---
## Task 4: Event types + thread-cache reducers (`events.ts`, `threadCache.ts`)

**Files:**
- Create: `src/lib/messaging/events.ts`
- Create: `src/lib/messaging/threadCache.ts`
- Test: `frontend/tests/unit/messaging-threadCache.test.ts`

**Interfaces:**
- Consumes: `Message`, `MessageThread`, `ThreadParticipant`, `MessagePageInfo` from `$lib/queries/messaging`.
- Produces (`events.ts`):
  - `ThreadEventTypename = 'MessagePosted' | 'ReadReceiptChanged' | 'TypingChanged' | 'ParticipantChanged' | 'PresenceChanged' | 'StreamReset'`
  - `MessagePostedEvent = { __typename: 'MessagePosted'; message: Message }`
  - `ReadReceiptChangedEvent = { __typename: 'ReadReceiptChanged'; threadId: string; userId: string; lastReadSeq: number }`
  - `TypingChangedEvent = { __typename: 'TypingChanged'; threadId: string; userId: string; typing: boolean }`
  - `ParticipantChangedEvent = { __typename: 'ParticipantChanged'; threadId: string; userId: string; change: 'ADDED' | 'REMOVED' }`
  - `PresenceChangedEvent = { __typename: 'PresenceChanged'; threadId: string; userId: string; state: 'ONLINE' | 'OFFLINE' }`
  - `StreamResetEvent = { __typename: 'StreamReset'; threadId: string }`
  - `ThreadEvent` = union of all six.
- Produces (`threadCache.ts`):
  - `type ThreadMessagesCache = { items: Message[]; oldestLoadedSeq: number | null; hasMoreOlder: boolean }`
  - `emptyThreadMessagesCache(): ThreadMessagesCache`
  - `applyMessagePosted(cache: ThreadMessagesCache, message: Message): ThreadMessagesCache` — inserts keeping `items` ascending by `seq`; replaces an existing item with the same `seq`; dedupes by `id`; ignores `seq <= 0`. Returns the same reference when nothing changed.
  - `prependOlderPage(cache: ThreadMessagesCache, apiItems: Message[], pageInfo: MessagePageInfo): ThreadMessagesCache` — `apiItems` arrive newest-first (seq DESC); reverse to ascending, drop any whose `seq` is already present, prepend, set `oldestLoadedSeq` to the min seq present, `hasMoreOlder = pageInfo.hasPreviousPage`.
  - `seedFromApiPage(apiItems: Message[], pageInfo: MessagePageInfo): ThreadMessagesCache` — build the initial cache from the first `threadMessages` response (also newest-first).
  - `nextSinceSeq(cache: ThreadMessagesCache): number | null` — max `seq` in `items`, or `null` when empty.
  - `applyThreadEventToThread(thread: MessageThread, event: ThreadEvent, myUserId: string): MessageThread` — see rules in Step 3. Returns the same reference when nothing changed.
  - `typingUsersReducer(state: Record<string, number>, event: ThreadEvent, nowMs: number): Record<string, number>` — `state` maps `userId → expiry epoch ms`. `TypingChanged{typing:true}` → `now + 6000`; `{typing:false}` → delete; every call also prunes entries with `expiry <= now`. Non-typing events only prune. Returns a new object only when the contents change.
  - `activeTypingUserIds(state: Record<string, number>, nowMs: number): string[]` — keys whose expiry `> now`, sorted.
  - `presenceReducer(state: Record<string, 'ONLINE' | 'OFFLINE'>, event: ThreadEvent): Record<string, 'ONLINE' | 'OFFLINE'>` — `PresenceChanged` sets `state[userId]`; other events return the same reference.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/messaging-threadCache.test.ts
import { describe, it, expect } from 'vitest';
import type { Message, MessageThread, MessagePageInfo } from '$lib/queries/messaging';
import type { ThreadEvent } from '$lib/messaging/events';
import {
	emptyThreadMessagesCache,
	applyMessagePosted,
	prependOlderPage,
	seedFromApiPage,
	nextSinceSeq,
	applyThreadEventToThread,
	typingUsersReducer,
	activeTypingUserIds,
	presenceReducer,
} from '$lib/messaging/threadCache';

const msg = (seq: number, over: Partial<Message> = {}): Message => ({
	id: `m${seq}`,
	threadId: 't1',
	sender: { id: 'u2', username: 'bob' },
	seq,
	body: `body ${seq}`,
	createdAt: '2026-09-07T12:00:00Z',
	...over,
});

const pageInfo = (over: Partial<MessagePageInfo> = {}): MessagePageInfo => ({
	hasNextPage: false,
	hasPreviousPage: false,
	startCursor: null,
	endCursor: null,
	...over,
});

const thread = (over: Partial<MessageThread> = {}): MessageThread => ({
	id: 't1',
	title: null,
	participants: [
		{ user: { id: 'u1', username: 'me' }, role: 'OWNER', lastReadSeq: 5, joinedAt: 'x' },
		{ user: { id: 'u2', username: 'bob' }, role: 'MEMBER', lastReadSeq: 3, joinedAt: 'x' },
	],
	lastMessageAt: '2026-09-07T12:00:00Z',
	latestSeq: 5,
	myLastReadSeq: 5,
	unreadCount: 0,
	createdAt: 'x',
	...over,
});

describe('threadCache — message list', () => {
	it('seedFromApiPage reverses newest-first API items to ascending', () => {
		const c = seedFromApiPage([msg(9), msg(8), msg(7)], pageInfo({ hasPreviousPage: true }));
		expect(c.items.map((m) => m.seq)).toEqual([7, 8, 9]);
		expect(c.oldestLoadedSeq).toBe(7);
		expect(c.hasMoreOlder).toBe(true);
	});

	it('applyMessagePosted inserts in ascending seq order', () => {
		let c = seedFromApiPage([msg(8), msg(7)], pageInfo());
		c = applyMessagePosted(c, msg(9));
		expect(c.items.map((m) => m.seq)).toEqual([7, 8, 9]);
	});

	it('applyMessagePosted replaces an item with the same seq (optimistic → real)', () => {
		let c = seedFromApiPage([msg(7, { id: 'temp', body: 'optimistic' })], pageInfo());
		c = applyMessagePosted(c, msg(7, { id: 'm7', body: 'real' }));
		expect(c.items).toHaveLength(1);
		expect(c.items[0]).toMatchObject({ id: 'm7', body: 'real' });
	});

	it('applyMessagePosted dedupes by id and returns the same ref when unchanged', () => {
		const c0 = seedFromApiPage([msg(7)], pageInfo());
		const c1 = applyMessagePosted(c0, msg(7));
		expect(c1).toBe(c0);
	});

	it('applyMessagePosted ignores non-positive seq', () => {
		const c0 = seedFromApiPage([msg(7)], pageInfo());
		expect(applyMessagePosted(c0, msg(0))).toBe(c0);
	});

	it('prependOlderPage prepends reversed older items and updates flags', () => {
		let c = seedFromApiPage([msg(9), msg(8)], pageInfo({ hasPreviousPage: true }));
		c = prependOlderPage(c, [msg(7), msg(6)], pageInfo({ hasPreviousPage: false }));
		expect(c.items.map((m) => m.seq)).toEqual([6, 7, 8, 9]);
		expect(c.oldestLoadedSeq).toBe(6);
		expect(c.hasMoreOlder).toBe(false);
	});

	it('nextSinceSeq returns the max seq, or null when empty', () => {
		expect(nextSinceSeq(emptyThreadMessagesCache())).toBeNull();
		expect(nextSinceSeq(seedFromApiPage([msg(9), msg(4)], pageInfo()))).toBe(9);
	});
});

describe('threadCache — thread summary reducer', () => {
	it('MessagePosted bumps latestSeq/lastMessageAt and raises my unreadCount when I am not the sender', () => {
		const t = applyThreadEventToThread(
			thread(),
			{ __typename: 'MessagePosted', message: msg(6, { createdAt: '2026-09-07T13:00:00Z' }) },
			'u1',
		);
		expect(t.latestSeq).toBe(6);
		expect(t.lastMessageAt).toBe('2026-09-07T13:00:00Z');
		expect(t.unreadCount).toBe(1);
	});

	it('MessagePosted from me does not raise my unreadCount', () => {
		const t = applyThreadEventToThread(
			thread(),
			{ __typename: 'MessagePosted', message: msg(6, { sender: { id: 'u1', username: 'me' } }) },
			'u1',
		);
		expect(t.unreadCount).toBe(0);
		expect(t.latestSeq).toBe(6);
	});

	it('ReadReceiptChanged moves a participant pointer forward only', () => {
		const t = applyThreadEventToThread(
			thread(),
			{ __typename: 'ReadReceiptChanged', threadId: 't1', userId: 'u2', lastReadSeq: 4 },
			'u1',
		);
		expect(t.participants.find((p) => p.user.id === 'u2')!.lastReadSeq).toBe(4);
		const t2 = applyThreadEventToThread(
			t,
			{ __typename: 'ReadReceiptChanged', threadId: 't1', userId: 'u2', lastReadSeq: 2 },
			'u1',
		);
		expect(t2.participants.find((p) => p.user.id === 'u2')!.lastReadSeq).toBe(4);
	});

	it('ReadReceiptChanged for me clears my unreadCount', () => {
		const t = applyThreadEventToThread(
			thread({ latestSeq: 8, myLastReadSeq: 5, unreadCount: 3 }),
			{ __typename: 'ReadReceiptChanged', threadId: 't1', userId: 'u1', lastReadSeq: 8 },
			'u1',
		);
		expect(t.myLastReadSeq).toBe(8);
		expect(t.unreadCount).toBe(0);
	});

	it('ParticipantChanged REMOVED drops the participant', () => {
		const t = applyThreadEventToThread(
			thread(),
			{ __typename: 'ParticipantChanged', threadId: 't1', userId: 'u2', change: 'REMOVED' },
			'u1',
		);
		expect(t.participants.map((p) => p.user.id)).toEqual(['u1']);
	});

	it('unrelated events return the same reference', () => {
		const t = thread();
		expect(
			applyThreadEventToThread(t, { __typename: 'StreamReset', threadId: 't1' }, 'u1'),
		).toBe(t);
	});
});

describe('threadCache — typing + presence reducers', () => {
	it('typing true sets an expiry ~6s out; false removes it', () => {
		let s = typingUsersReducer({}, { __typename: 'TypingChanged', threadId: 't1', userId: 'u2', typing: true }, 1000);
		expect(s.u2).toBe(7000);
		s = typingUsersReducer(s, { __typename: 'TypingChanged', threadId: 't1', userId: 'u2', typing: false }, 2000);
		expect(s.u2).toBeUndefined();
	});

	it('typing reducer prunes expired entries on every call', () => {
		const s = typingUsersReducer(
			{ u2: 500 },
			{ __typename: 'TypingChanged', threadId: 't1', userId: 'u3', typing: true },
			1000,
		);
		expect(s.u2).toBeUndefined();
		expect(s.u3).toBe(7000);
	});

	it('activeTypingUserIds returns unexpired keys sorted', () => {
		expect(activeTypingUserIds({ ub: 9000, ua: 9000, uc: 100 }, 1000)).toEqual(['ua', 'ub']);
	});

	it('presenceReducer records ONLINE/OFFLINE by userId', () => {
		let s = presenceReducer({}, { __typename: 'PresenceChanged', threadId: 't1', userId: 'u2', state: 'ONLINE' });
		expect(s.u2).toBe('ONLINE');
		s = presenceReducer(s, { __typename: 'PresenceChanged', threadId: 't1', userId: 'u2', state: 'OFFLINE' });
		expect(s.u2).toBe('OFFLINE');
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- messaging-threadCache`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/messaging/events.ts`**

```ts
import type { Message } from '$lib/queries/messaging';

export type ThreadEventTypename =
	| 'MessagePosted'
	| 'ReadReceiptChanged'
	| 'TypingChanged'
	| 'ParticipantChanged'
	| 'PresenceChanged'
	| 'StreamReset';

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

export type ThreadEvent =
	| MessagePostedEvent
	| ReadReceiptChangedEvent
	| TypingChangedEvent
	| ParticipantChangedEvent
	| PresenceChangedEvent
	| StreamResetEvent;
```

- [ ] **Step 4: Create `src/lib/messaging/threadCache.ts`**

```ts
import type { Message, MessageThread, MessagePageInfo } from '$lib/queries/messaging';
import type { ThreadEvent } from '$lib/messaging/events';

const TYPING_TTL_MS = 6000;

export interface ThreadMessagesCache {
	items: Message[];
	oldestLoadedSeq: number | null;
	hasMoreOlder: boolean;
}

export function emptyThreadMessagesCache(): ThreadMessagesCache {
	return { items: [], oldestLoadedSeq: null, hasMoreOlder: false };
}

function sortAsc(items: Message[]): Message[] {
	return [...items].sort((a, b) => a.seq - b.seq);
}

export function seedFromApiPage(
	apiItems: Message[],
	pageInfo: MessagePageInfo,
): ThreadMessagesCache {
	const items = sortAsc(apiItems);
	return {
		items,
		oldestLoadedSeq: items.length ? items[0].seq : null,
		hasMoreOlder: pageInfo.hasPreviousPage,
	};
}

export function applyMessagePosted(
	cache: ThreadMessagesCache,
	message: Message,
): ThreadMessagesCache {
	if (message.seq <= 0) return cache;
	const bySeq = cache.items.findIndex((m) => m.seq === message.seq);
	if (bySeq !== -1) {
		const existing = cache.items[bySeq];
		if (existing.id === message.id && existing.body === message.body) return cache;
		const items = [...cache.items];
		items[bySeq] = message;
		return { ...cache, items };
	}
	if (cache.items.some((m) => m.id === message.id)) return cache;
	const items = sortAsc([...cache.items, message]);
	return { ...cache, items };
}

export function prependOlderPage(
	cache: ThreadMessagesCache,
	apiItems: Message[],
	pageInfo: MessagePageInfo,
): ThreadMessagesCache {
	const known = new Set(cache.items.map((m) => m.seq));
	const older = sortAsc(apiItems.filter((m) => !known.has(m.seq)));
	const items = [...older, ...cache.items];
	return {
		items,
		oldestLoadedSeq: items.length ? items[0].seq : cache.oldestLoadedSeq,
		hasMoreOlder: pageInfo.hasPreviousPage,
	};
}

export function nextSinceSeq(cache: ThreadMessagesCache): number | null {
	if (!cache.items.length) return null;
	return cache.items.reduce((max, m) => (m.seq > max ? m.seq : max), cache.items[0].seq);
}

export function applyThreadEventToThread(
	thread: MessageThread,
	event: ThreadEvent,
	myUserId: string,
): MessageThread {
	switch (event.__typename) {
		case 'MessagePosted': {
			const m = event.message;
			if (m.seq <= thread.latestSeq) return thread;
			const fromMe = m.sender.id === myUserId;
			const myLastReadSeq = fromMe ? m.seq : thread.myLastReadSeq;
			return {
				...thread,
				latestSeq: m.seq,
				lastMessageAt: m.createdAt,
				myLastReadSeq,
				unreadCount: Math.max(0, m.seq - myLastReadSeq),
			};
		}
		case 'ReadReceiptChanged': {
			const idx = thread.participants.findIndex((p) => p.user.id === event.userId);
			let participants = thread.participants;
			if (idx !== -1 && event.lastReadSeq > thread.participants[idx].lastReadSeq) {
				participants = [...thread.participants];
				participants[idx] = { ...participants[idx], lastReadSeq: event.lastReadSeq };
			}
			const isMe = event.userId === myUserId;
			const myLastReadSeq = isMe
				? Math.max(thread.myLastReadSeq, event.lastReadSeq)
				: thread.myLastReadSeq;
			if (participants === thread.participants && myLastReadSeq === thread.myLastReadSeq) {
				return thread;
			}
			return {
				...thread,
				participants,
				myLastReadSeq,
				unreadCount: Math.max(0, thread.latestSeq - myLastReadSeq),
			};
		}
		case 'ParticipantChanged': {
			if (event.change !== 'REMOVED') return thread;
			const participants = thread.participants.filter((p) => p.user.id !== event.userId);
			if (participants.length === thread.participants.length) return thread;
			return { ...thread, participants };
		}
		default:
			return thread;
	}
}

export function typingUsersReducer(
	state: Record<string, number>,
	event: ThreadEvent,
	nowMs: number,
): Record<string, number> {
	const next: Record<string, number> = {};
	for (const [uid, expiry] of Object.entries(state)) {
		if (expiry > nowMs) next[uid] = expiry;
	}
	if (event.__typename === 'TypingChanged') {
		if (event.typing) next[event.userId] = nowMs + TYPING_TTL_MS;
		else delete next[event.userId];
	}
	const sameKeys =
		Object.keys(next).length === Object.keys(state).length &&
		Object.keys(next).every((k) => state[k] === next[k]);
	return sameKeys ? state : next;
}

export function activeTypingUserIds(state: Record<string, number>, nowMs: number): string[] {
	return Object.entries(state)
		.filter(([, expiry]) => expiry > nowMs)
		.map(([uid]) => uid)
		.sort();
}

export function presenceReducer(
	state: Record<string, 'ONLINE' | 'OFFLINE'>,
	event: ThreadEvent,
): Record<string, 'ONLINE' | 'OFFLINE'> {
	if (event.__typename !== 'PresenceChanged') return state;
	if (state[event.userId] === event.state) return state;
	return { ...state, [event.userId]: event.state };
}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- messaging-threadCache`
Expected: PASS (18 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/messaging/events.ts src/lib/messaging/threadCache.ts frontend/tests/unit/messaging-threadCache.test.ts
git commit -m "feat(messaging): thread-event types and pure cache reducers"
```

---

## Task 5: Inbox-cache reducer (`inboxCache.ts`)

**Files:**
- Create: `src/lib/messaging/inboxCache.ts`
- Test: `frontend/tests/unit/messaging-inboxCache.test.ts`

**Interfaces:**
- Consumes: `MessageThread`, `InboxEvent` from `$lib/queries/messaging`.
- Produces:
  - `applyInboxEvent(threads: MessageThread[], event: InboxEvent): MessageThread[]` — find the thread by `event.threadId`; update its `lastMessageAt`, `latestSeq`, `unreadCount`; re-sort the array by `lastMessageAt` descending (ISO strings sort lexically). If the thread is not in the list, return `threads` unchanged (the list query will pick it up on next refetch). Returns the same reference when nothing changed.
  - `totalUnread(threads: MessageThread[]): number` — sum of `unreadCount`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/messaging-inboxCache.test.ts
import { describe, it, expect } from 'vitest';
import type { MessageThread, InboxEvent } from '$lib/queries/messaging';
import { applyInboxEvent, totalUnread } from '$lib/messaging/inboxCache';

const t = (id: string, lastMessageAt: string, unreadCount = 0): MessageThread => ({
	id,
	title: null,
	participants: [],
	lastMessageAt,
	latestSeq: 0,
	myLastReadSeq: 0,
	unreadCount,
	createdAt: 'x',
});

const evt = (over: Partial<InboxEvent> = {}): InboxEvent => ({
	threadId: 'b',
	lastMessageAt: '2026-09-07T15:00:00Z',
	latestSeq: 12,
	unreadCount: 4,
	...over,
});

describe('inboxCache', () => {
	it('updates the matching thread and re-sorts newest-first', () => {
		const list = [t('a', '2026-09-07T14:00:00Z'), t('b', '2026-09-07T10:00:00Z')];
		const next = applyInboxEvent(list, evt());
		expect(next.map((x) => x.id)).toEqual(['b', 'a']);
		expect(next[0]).toMatchObject({ latestSeq: 12, unreadCount: 4, lastMessageAt: '2026-09-07T15:00:00Z' });
	});

	it('returns the same reference when the thread is not present', () => {
		const list = [t('a', '2026-09-07T14:00:00Z')];
		expect(applyInboxEvent(list, evt({ threadId: 'zzz' }))).toBe(list);
	});

	it('returns the same reference when nothing actually changes', () => {
		const list = [t('b', '2026-09-07T15:00:00Z', 4)];
		expect(applyInboxEvent(list, evt())).toBe(list);
	});

	it('totalUnread sums unreadCount', () => {
		expect(totalUnread([t('a', 'x', 2), t('b', 'y', 3)])).toBe(5);
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- messaging-inboxCache`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/messaging/inboxCache.ts`**

```ts
import type { MessageThread, InboxEvent } from '$lib/queries/messaging';

export function applyInboxEvent(
	threads: MessageThread[],
	event: InboxEvent,
): MessageThread[] {
	const idx = threads.findIndex((t) => t.id === event.threadId);
	if (idx === -1) return threads;
	const current = threads[idx];
	if (
		current.lastMessageAt === event.lastMessageAt &&
		current.latestSeq === event.latestSeq &&
		current.unreadCount === event.unreadCount
	) {
		return threads;
	}
	const updated: MessageThread = {
		...current,
		lastMessageAt: event.lastMessageAt,
		latestSeq: event.latestSeq,
		unreadCount: event.unreadCount,
	};
	const next = [...threads];
	next[idx] = updated;
	next.sort((a, b) => (a.lastMessageAt < b.lastMessageAt ? 1 : a.lastMessageAt > b.lastMessageAt ? -1 : 0));
	return next;
}

export function totalUnread(threads: MessageThread[]): number {
	return threads.reduce((sum, t) => sum + t.unreadCount, 0);
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- messaging-inboxCache`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/messaging/inboxCache.ts frontend/tests/unit/messaging-inboxCache.test.ts
git commit -m "feat(messaging): pure inbox-cache reducer"
```

---

## Task 6: Optimistic-send helpers (`optimistic.ts`)

**Files:**
- Create: `src/lib/messaging/optimistic.ts`
- Test: `frontend/tests/unit/messaging-optimistic.test.ts`

**Interfaces:**
- Consumes: `Message`, `MessagingUser` from `$lib/queries/messaging`; `ThreadMessagesCache`, `applyMessagePosted` from `$lib/messaging/threadCache`.
- Produces:
  - `makeClientNonce(): string` — `crypto.randomUUID()` when available, else a `Date.now()`+random fallback.
  - `optimisticMessage(args: { body: string; sender: MessagingUser; threadId: string; clientNonce: string; afterSeq: number }): Message` — returns a `Message` with `id` = `optimistic:${clientNonce}`, `seq` = `afterSeq + 0.5` (a fractional seq sorts after the last real message and never collides), `createdAt` = `new Date().toISOString()`, plus a `pending: true`-ish marker folded into `id` only (no schema change). `body` is trimmed.
  - `addOptimistic(cache: ThreadMessagesCache, optimistic: Message): ThreadMessagesCache` — append and keep ascending (reuses `applyMessagePosted` path but tolerates fractional seq).
  - `reconcileSentMessage(cache: ThreadMessagesCache, clientNonce: string, serverMessage: Message): ThreadMessagesCache` — remove the `optimistic:${clientNonce}` item (if present) then `applyMessagePosted(serverMessage)`. Idempotent if the optimistic item is already gone (the subscription may have delivered the real message first).
  - `isOptimistic(message: Message): boolean` — `message.id.startsWith('optimistic:')`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/messaging-optimistic.test.ts
import { describe, it, expect } from 'vitest';
import type { Message } from '$lib/queries/messaging';
import { seedFromApiPage } from '$lib/messaging/threadCache';
import {
	makeClientNonce,
	optimisticMessage,
	addOptimistic,
	reconcileSentMessage,
	isOptimistic,
} from '$lib/messaging/optimistic';

const real = (seq: number, over: Partial<Message> = {}): Message => ({
	id: `m${seq}`,
	threadId: 't1',
	sender: { id: 'u1', username: 'me' },
	seq,
	body: `b${seq}`,
	createdAt: '2026-09-07T12:00:00Z',
	...over,
});

const pageInfo = { hasNextPage: false, hasPreviousPage: false, startCursor: null, endCursor: null };

describe('optimistic send', () => {
	it('makeClientNonce returns distinct non-empty strings', () => {
		const a = makeClientNonce();
		const b = makeClientNonce();
		expect(a).not.toBe(b);
		expect(a.length).toBeGreaterThan(8);
	});

	it('optimisticMessage sorts after the last real message and is flagged optimistic', () => {
		const m = optimisticMessage({
			body: '  hello  ',
			sender: { id: 'u1', username: 'me' },
			threadId: 't1',
			clientNonce: 'nonce-1',
			afterSeq: 7,
		});
		expect(m.body).toBe('hello');
		expect(m.seq).toBeGreaterThan(7);
		expect(m.seq).toBeLessThan(8);
		expect(isOptimistic(m)).toBe(true);
	});

	it('addOptimistic appends to the end of the ascending list', () => {
		let c = seedFromApiPage([real(7), real(6)], pageInfo);
		const opt = optimisticMessage({
			body: 'x', sender: { id: 'u1', username: 'me' }, threadId: 't1',
			clientNonce: 'n1', afterSeq: 7,
		});
		c = addOptimistic(c, opt);
		expect(c.items[c.items.length - 1].id).toBe('optimistic:n1');
	});

	it('reconcileSentMessage swaps the optimistic row for the server row', () => {
		let c = seedFromApiPage([real(7)], pageInfo);
		const opt = optimisticMessage({
			body: 'x', sender: { id: 'u1', username: 'me' }, threadId: 't1',
			clientNonce: 'n1', afterSeq: 7,
		});
		c = addOptimistic(c, opt);
		c = reconcileSentMessage(c, 'n1', real(8, { body: 'x' }));
		expect(c.items.map((m) => m.id)).toEqual(['m7', 'm8']);
		expect(c.items.some(isOptimistic)).toBe(false);
	});

	it('reconcileSentMessage is a no-op-safe when the optimistic row is already gone', () => {
		let c = seedFromApiPage([real(7), real(8, { body: 'x' })], pageInfo);
		c = reconcileSentMessage(c, 'n1', real(8, { body: 'x' }));
		expect(c.items.map((m) => m.seq)).toEqual([7, 8]);
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- messaging-optimistic`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/messaging/optimistic.ts`**

```ts
import type { Message, MessagingUser } from '$lib/queries/messaging';
import { applyMessagePosted, type ThreadMessagesCache } from '$lib/messaging/threadCache';

export function makeClientNonce(): string {
	const c = globalThis.crypto as Crypto | undefined;
	if (c && typeof c.randomUUID === 'function') return c.randomUUID();
	return `n-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function isOptimistic(message: Message): boolean {
	return message.id.startsWith('optimistic:');
}

export function optimisticMessage(args: {
	body: string;
	sender: MessagingUser;
	threadId: string;
	clientNonce: string;
	afterSeq: number;
}): Message {
	return {
		id: `optimistic:${args.clientNonce}`,
		threadId: args.threadId,
		sender: args.sender,
		seq: args.afterSeq + 0.5,
		body: args.body.trim(),
		createdAt: new Date().toISOString(),
	};
}

export function addOptimistic(
	cache: ThreadMessagesCache,
	optimistic: Message,
): ThreadMessagesCache {
	if (cache.items.some((m) => m.id === optimistic.id)) return cache;
	const items = [...cache.items, optimistic].sort((a, b) => a.seq - b.seq);
	return { ...cache, items };
}

export function reconcileSentMessage(
	cache: ThreadMessagesCache,
	clientNonce: string,
	serverMessage: Message,
): ThreadMessagesCache {
	const optId = `optimistic:${clientNonce}`;
	const withoutOptimistic = cache.items.some((m) => m.id === optId)
		? { ...cache, items: cache.items.filter((m) => m.id !== optId) }
		: cache;
	return applyMessagePosted(withoutOptimistic, serverMessage);
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- messaging-optimistic`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/messaging/optimistic.ts frontend/tests/unit/messaging-optimistic.test.ts
git commit -m "feat(messaging): optimistic-send cache helpers"
```

---

## Task 7: Typing controller (`typing.ts`)

**Files:**
- Create: `src/lib/messaging/typing.ts`
- Test: `frontend/tests/unit/messaging-typing.test.ts`

**Interfaces:**
- Produces:
  - `type TypingClock = { setTimeout: (fn: () => void, ms: number) => number; clearTimeout: (h: number) => void }`
  - `createTypingController(opts: { emit: (typing: boolean) => void; idleMs?: number; clock?: TypingClock }): { onKeystroke(): void; onSend(): void; stop(): void }`
  - Behaviour: the first `onKeystroke()` after being idle calls `emit(true)` immediately and arms an idle timer (`idleMs`, default 5000). Each subsequent `onKeystroke()` re-arms the timer without re-emitting. When the idle timer fires, `emit(false)`. `onSend()` and `stop()` both cancel the timer and, if currently "typing", call `emit(false)`. `emit` is never called with the same value twice in a row.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/messaging-typing.test.ts
import { describe, it, expect, vi } from 'vitest';
import { createTypingController, type TypingClock } from '$lib/messaging/typing';

function fakeClock() {
	let seq = 1;
	const timers = new Map<number, () => void>();
	const clock: TypingClock = {
		setTimeout: (fn) => {
			const h = seq++;
			timers.set(h, fn);
			return h;
		},
		clearTimeout: (h) => {
			timers.delete(h);
		},
	};
	return { clock, fire: (h: number) => timers.get(h)?.() , pending: () => timers.size };
}

describe('createTypingController', () => {
	it('emits true once on first keystroke, then false when idle fires', () => {
		const emit = vi.fn();
		const { clock } = fakeClock();
		const c = createTypingController({ emit, clock, idleMs: 5000 });

		c.onKeystroke();
		c.onKeystroke();
		expect(emit.mock.calls).toEqual([[true]]);
	});

	it('idle timer fires -> emit(false)', () => {
		const emit = vi.fn();
		const { clock, fire } = fakeClock();
		const c = createTypingController({ emit, clock });
		c.onKeystroke();
		// one timer armed
		fire(1);
		expect(emit.mock.calls).toEqual([[true], [false]]);
	});

	it('re-arms the timer on each keystroke without re-emitting true', () => {
		const emit = vi.fn();
		const { clock, pending } = fakeClock();
		const c = createTypingController({ emit, clock });
		c.onKeystroke(); // arms timer 1
		c.onKeystroke(); // clears 1, arms 2
		c.onKeystroke(); // clears 2, arms 3
		expect(pending()).toBe(1);
		expect(emit.mock.calls).toEqual([[true]]);
	});

	it('onSend stops typing and emits false', () => {
		const emit = vi.fn();
		const { clock } = fakeClock();
		const c = createTypingController({ emit, clock });
		c.onKeystroke();
		c.onSend();
		expect(emit.mock.calls).toEqual([[true], [false]]);
		// a later keystroke starts a fresh cycle
		c.onKeystroke();
		expect(emit.mock.calls).toEqual([[true], [false], [true]]);
	});

	it('stop() when not typing does not emit', () => {
		const emit = vi.fn();
		const { clock } = fakeClock();
		const c = createTypingController({ emit, clock });
		c.stop();
		expect(emit).not.toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- messaging-typing`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/messaging/typing.ts`**

```ts
export interface TypingClock {
	setTimeout: (fn: () => void, ms: number) => number;
	clearTimeout: (h: number) => void;
}

const defaultClock: TypingClock = {
	setTimeout: (fn, ms) => globalThis.setTimeout(fn, ms) as unknown as number,
	clearTimeout: (h) => globalThis.clearTimeout(h),
};

export function createTypingController(opts: {
	emit: (typing: boolean) => void;
	idleMs?: number;
	clock?: TypingClock;
}) {
	const idleMs = opts.idleMs ?? 5000;
	const clock = opts.clock ?? defaultClock;
	let typing = false;
	let handle: number | null = null;

	function disarm() {
		if (handle !== null) {
			clock.clearTimeout(handle);
			handle = null;
		}
	}

	function setTyping(next: boolean) {
		if (typing === next) return;
		typing = next;
		opts.emit(next);
	}

	function onKeystroke() {
		disarm();
		setTyping(true);
		handle = clock.setTimeout(() => {
			handle = null;
			setTyping(false);
		}, idleMs);
	}

	function stop() {
		disarm();
		setTyping(false);
	}

	return { onKeystroke, onSend: stop, stop };
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- messaging-typing`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/messaging/typing.ts frontend/tests/unit/messaging-typing.test.ts
git commit -m "feat(messaging): typing-indicator controller"
```

---
## Task 8: WebSocket client singleton (`ws-client.svelte.ts`)

**Files:**
- Create: `src/lib/messaging/ws-client.svelte.ts`
- Test: `frontend/tests/unit/messaging-ws-client.test.ts`

> Note: the file is `.svelte.ts` (not `.ts`) so it can hold module-level `$state` for the connection indicator. Every earlier File-Structure reference to `ws-client.ts` means this file.

**Interfaces:**
- Consumes: `getAuthToken` from `$lib/queries/client`; `browser` from `$app/environment`; `createClient` from `graphql-ws`.
- Produces:
  - `httpUrlToWs(httpUrl: string): string` — `http://` → `ws://`, `https://` → `wss://`, leaves an already-`ws(s)` URL alone.
  - `wsEndpoint(): string` — `httpUrlToWs(import.meta.env.VITE_GRAPHQL_URL ?? 'http://localhost:8080/graphql')`.
  - `getWsClient(): Client` — lazily calls `createClient` once and caches it. Options: `{ url: wsEndpoint(), lazy: true, retryAttempts: Infinity, connectionParams, on }`. `connectionParams` is `async () => ({ authToken: (await getAuthToken()) ?? '' })`. The `on` handlers set `wsStatus.value`: `connecting → 'connecting'`, `connected → 'connected'`, `closed → 'closed'`. Throws if called when `browser` is `false`.
  - `subscribeGraphql<T>(payload: { query: string; variables?: Record<string, unknown> }, handlers: { next: (data: T) => void; error?: (err: unknown) => void; complete?: () => void }): () => void` — calls `getWsClient().subscribe(payload, sink)` where `sink.next` unwraps `result.data as T` (skips when `result.data == null`), and returns the unsubscribe function. Never throws synchronously; a thrown `getWsClient()` (SSR) returns a no-op disposer.
  - `disposeWsClient(): void` — if a client exists, call `.dispose()` and clear the cache + set `wsStatus.value = 'closed'`. (Used by tests and a full sign-out.)
  - `wsStatus` — `$state({ value: 'closed' as 'connecting' | 'connected' | 'closed' })`, exported for the header indicator.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/messaging-ws-client.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockCreateClient, mockSubscribe, mockDispose, mockGetAuthToken } = vi.hoisted(() => ({
	mockCreateClient: vi.fn(),
	mockSubscribe: vi.fn(),
	mockDispose: vi.fn(),
	mockGetAuthToken: vi.fn(),
}));

vi.mock('graphql-ws', () => ({
	createClient: mockCreateClient,
}));

vi.mock('$lib/queries/client', () => ({
	getAuthToken: mockGetAuthToken,
}));

// browser flag is already mocked true in tests/setup.ts

let capturedOptions: any;

beforeEach(() => {
	vi.clearAllMocks();
	vi.resetModules();
	capturedOptions = undefined;
	mockCreateClient.mockImplementation((opts: any) => {
		capturedOptions = opts;
		return { subscribe: mockSubscribe, dispose: mockDispose, iterate: vi.fn(), terminate: vi.fn() };
	});
	mockGetAuthToken.mockResolvedValue('jwt-abc');
	mockSubscribe.mockImplementation((_payload: any, sink: any) => {
		(sink as any).__sink = true;
		return () => {};
	});
});

describe('httpUrlToWs', () => {
	it('maps http/https to ws/wss and leaves ws untouched', async () => {
		const { httpUrlToWs } = await import('$lib/messaging/ws-client.svelte');
		expect(httpUrlToWs('http://localhost:8080/graphql')).toBe('ws://localhost:8080/graphql');
		expect(httpUrlToWs('https://api.example.com/graphql')).toBe('wss://api.example.com/graphql');
		expect(httpUrlToWs('wss://api.example.com/graphql')).toBe('wss://api.example.com/graphql');
	});
});

describe('getWsClient', () => {
	it('creates the client once (singleton) with lazy + infinite retry', async () => {
		const mod = await import('$lib/messaging/ws-client.svelte');
		const a = mod.getWsClient();
		const b = mod.getWsClient();
		expect(a).toBe(b);
		expect(mockCreateClient).toHaveBeenCalledTimes(1);
		expect(capturedOptions.lazy).toBe(true);
		expect(capturedOptions.retryAttempts).toBe(Infinity);
	});

	it('connectionParams resolves the Clerk token under authToken', async () => {
		const mod = await import('$lib/messaging/ws-client.svelte');
		mod.getWsClient();
		const params = await capturedOptions.connectionParams();
		expect(params).toEqual({ authToken: 'jwt-abc' });
	});

	it('connectionParams sends an empty string when there is no token', async () => {
		mockGetAuthToken.mockResolvedValue(null);
		const mod = await import('$lib/messaging/ws-client.svelte');
		mod.getWsClient();
		expect(await capturedOptions.connectionParams()).toEqual({ authToken: '' });
	});

	it('on.connected / on.closed drive wsStatus', async () => {
		const mod = await import('$lib/messaging/ws-client.svelte');
		mod.getWsClient();
		capturedOptions.on.connecting();
		expect(mod.wsStatus.value).toBe('connecting');
		capturedOptions.on.connected();
		expect(mod.wsStatus.value).toBe('connected');
		capturedOptions.on.closed();
		expect(mod.wsStatus.value).toBe('closed');
	});
});

describe('subscribeGraphql', () => {
	it('passes the payload straight through and unwraps result.data', async () => {
		const mod = await import('$lib/messaging/ws-client.svelte');
		const next = vi.fn();
		mod.subscribeGraphql({ query: 'sub X', variables: { a: 1 } }, { next });

		expect(mockSubscribe).toHaveBeenCalledWith(
			{ query: 'sub X', variables: { a: 1 } },
			expect.objectContaining({ next: expect.any(Function) }),
		);
		const sink = mockSubscribe.mock.calls[0][1];
		sink.next({ data: { hello: 'world' } });
		sink.next({ data: null });
		expect(next).toHaveBeenCalledTimes(1);
		expect(next).toHaveBeenCalledWith({ hello: 'world' });
	});

	it('returns the disposer from client.subscribe', async () => {
		const disposer = vi.fn();
		mockSubscribe.mockReturnValue(disposer);
		const mod = await import('$lib/messaging/ws-client.svelte');
		const off = mod.subscribeGraphql({ query: 'sub' }, { next: vi.fn() });
		off();
		expect(disposer).toHaveBeenCalled();
	});
});

describe('disposeWsClient', () => {
	it('disposes and lets the next getWsClient build a fresh client', async () => {
		const mod = await import('$lib/messaging/ws-client.svelte');
		mod.getWsClient();
		mod.disposeWsClient();
		expect(mockDispose).toHaveBeenCalled();
		expect(mod.wsStatus.value).toBe('closed');
		mod.getWsClient();
		expect(mockCreateClient).toHaveBeenCalledTimes(2);
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- messaging-ws-client`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/messaging/ws-client.svelte.ts`**

```ts
import { browser } from '$app/environment';
import { createClient, type Client } from 'graphql-ws';
import { getAuthToken } from '$lib/queries/client';

export const wsStatus = $state({ value: 'closed' as 'connecting' | 'connected' | 'closed' });

export function httpUrlToWs(httpUrl: string): string {
	if (httpUrl.startsWith('https://')) return 'wss://' + httpUrl.slice('https://'.length);
	if (httpUrl.startsWith('http://')) return 'ws://' + httpUrl.slice('http://'.length);
	return httpUrl;
}

export function wsEndpoint(): string {
	const http = import.meta.env.VITE_GRAPHQL_URL || 'http://localhost:8080/graphql';
	return httpUrlToWs(http);
}

let client: Client | null = null;

export function getWsClient(): Client {
	if (!browser) throw new Error('graphql-ws client is browser-only');
	if (client) return client;
	client = createClient({
		url: wsEndpoint(),
		lazy: true,
		retryAttempts: Infinity,
		connectionParams: async () => ({ authToken: (await getAuthToken()) ?? '' }),
		on: {
			connecting: () => {
				wsStatus.value = 'connecting';
			},
			connected: () => {
				wsStatus.value = 'connected';
			},
			closed: () => {
				wsStatus.value = 'closed';
			},
		},
	});
	return client;
}

export function subscribeGraphql<T>(
	payload: { query: string; variables?: Record<string, unknown> },
	handlers: { next: (data: T) => void; error?: (err: unknown) => void; complete?: () => void },
): () => void {
	let c: Client;
	try {
		c = getWsClient();
	} catch {
		return () => {};
	}
	return c.subscribe(payload, {
		next: (result: { data?: unknown }) => {
			if (result.data != null) handlers.next(result.data as T);
		},
		error: (err) => handlers.error?.(err),
		complete: () => handlers.complete?.(),
	});
}

export function disposeWsClient(): void {
	if (client) {
		client.dispose();
		client = null;
	}
	wsStatus.value = 'closed';
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- messaging-ws-client`
Expected: PASS (9 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/messaging/ws-client.svelte.ts frontend/tests/unit/messaging-ws-client.test.ts
git commit -m "feat(messaging): browser-only graphql-ws client singleton"
```

---
## Task 9: Query hooks — thread list & message history

**Files:**
- Create: `src/lib/queries/hooks/useMessageThreads.ts`
- Create: `src/lib/queries/hooks/useThreadMessages.svelte.ts`
- Test: `frontend/tests/unit/hooks-useMessageThreads.test.ts`
- Test: `frontend/tests/unit/hooks-useThreadMessages.test.ts`

**Interfaces:**
- Consumes: `graphqlRequest` (`$lib/queries/client`); `LIST_MESSAGE_THREADS`, `LIST_THREAD_MESSAGES`, response types (`$lib/queries/messaging`); `queryKeys` (`$lib/queries/keys`); `seedFromApiPage`, `prependOlderPage`, `ThreadMessagesCache` (`$lib/messaging/threadCache`); `createQuery`, `useQueryClient` (`@tanstack/svelte-query`).
- Produces:
  - `useMessageThreads()` → the `createQuery` result object; `data` is `ListMessageThreadsResponse | undefined`. Query key: `queryKeys.messaging.threads.list()` exactly (no extra segments — `useInboxStream` writes to the same key). `queryFn` sends **no variables** (backend page default). `staleTime: 30_000`.
  - `useThreadMessages(getThreadId: () => string)` → `{ query, isFetchingOlder, fetchOlder }` where `query` is a `createQuery` result whose `data` is `ThreadMessagesCache | undefined`. Key: `queryKeys.messaging.messages.list(getThreadId())`. `queryFn` sends `{ threadId, first: 40 }` and maps the response through `seedFromApiPage`. `fetchOlder()` early-returns unless `data.hasMoreOlder && data.oldestLoadedSeq != null && !isFetchingOlder`; otherwise fetches `{ threadId, first: 40, before: data.oldestLoadedSeq }` and folds via `prependOlderPage` into the same key with `queryClient.setQueryData`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/hooks-useMessageThreads.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	capturedQueryOptions: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn((fn: () => any) => {
		mocks.capturedQueryOptions = fn();
		return { data: undefined, isLoading: true };
	}),
	useQueryClient: vi.fn(() => ({ setQueryData: vi.fn() })),
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a),
}));

import { useMessageThreads } from '$lib/queries/hooks/useMessageThreads';
import { LIST_MESSAGE_THREADS } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

describe('useMessageThreads', () => {
	beforeEach(() => vi.clearAllMocks());

	it('uses the exact threads.list() key and sends no variables', async () => {
		useMessageThreads();
		expect(mocks.capturedQueryOptions.queryKey).toEqual(queryKeys.messaging.threads.list());
		mocks.mockGraphql.mockResolvedValue({ messageThreads: [] });
		await mocks.capturedQueryOptions.queryFn();
		expect(mocks.mockGraphql).toHaveBeenCalledWith(LIST_MESSAGE_THREADS);
	});
});
```

```ts
// frontend/tests/unit/hooks-useThreadMessages.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueryData: vi.fn(),
	capturedQueryOptions: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn((fn: () => any) => {
		mocks.capturedQueryOptions = fn();
		return { data: mocks.capturedQueryOptions.__data, isLoading: false };
	}),
	useQueryClient: vi.fn(() => ({ setQueryData: mocks.mockSetQueryData })),
}));

vi.mock('$lib/queries/client', () => ({
	graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a),
}));

import { useThreadMessages } from '$lib/queries/hooks/useThreadMessages.svelte';
import { LIST_THREAD_MESSAGES } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

const apiPage = {
	threadMessages: {
		items: [
			{ id: 'm9', threadId: 't1', sender: { id: 'u2', username: 'b' }, seq: 9, body: 'i', createdAt: 'x' },
			{ id: 'm8', threadId: 't1', sender: { id: 'u2', username: 'b' }, seq: 8, body: 'h', createdAt: 'x' },
		],
		pageInfo: { hasNextPage: false, hasPreviousPage: true, startCursor: '9', endCursor: '8' },
	},
};

describe('useThreadMessages', () => {
	beforeEach(() => vi.clearAllMocks());

	it('queryFn seeds an ascending ThreadMessagesCache from the newest-first API page', async () => {
		useThreadMessages(() => 't1');
		expect(mocks.capturedQueryOptions.queryKey).toEqual(queryKeys.messaging.messages.list('t1'));
		mocks.mockGraphql.mockResolvedValue(apiPage);
		const cache = await mocks.capturedQueryOptions.queryFn();
		expect(mocks.mockGraphql).toHaveBeenCalledWith(LIST_THREAD_MESSAGES, { threadId: 't1', first: 40 });
		expect(cache.items.map((m: any) => m.seq)).toEqual([8, 9]);
		expect(cache.hasMoreOlder).toBe(true);
		expect(cache.oldestLoadedSeq).toBe(8);
	});

	it('fetchOlder folds an older page via prependOlderPage into the same key', async () => {
		const olderPage = {
			threadMessages: {
				items: [
					{ id: 'm7', threadId: 't1', sender: { id: 'u2', username: 'b' }, seq: 7, body: 'g', createdAt: 'x' },
				],
				pageInfo: { hasNextPage: false, hasPreviousPage: false, startCursor: '7', endCursor: '7' },
			},
		};
		mocks.capturedQueryOptions = undefined;
		const api = useThreadMessages(() => 't1');
		// simulate an existing cache
		(api.query as any).data = { items: [{ seq: 8 }, { seq: 9 }], oldestLoadedSeq: 8, hasMoreOlder: true };
		mocks.mockGraphql.mockResolvedValue(olderPage);
		await api.fetchOlder();
		expect(mocks.mockGraphql).toHaveBeenCalledWith(LIST_THREAD_MESSAGES, {
			threadId: 't1', first: 40, before: 8,
		});
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(
			queryKeys.messaging.messages.list('t1'),
			expect.any(Function),
		);
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater({ items: [{ seq: 8 }, { seq: 9 }], oldestLoadedSeq: 8, hasMoreOlder: true });
		expect(next.items.map((m: any) => m.seq)).toEqual([7, 8, 9]);
		expect(next.hasMoreOlder).toBe(false);
	});
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `cd frontend && pnpm run test:run -- hooks-useMessageThreads hooks-useThreadMessages`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/queries/hooks/useMessageThreads.ts`**

```ts
import { createQuery } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { LIST_MESSAGE_THREADS, type ListMessageThreadsResponse } from '../messaging';
import { queryKeys } from '../keys';

export function useMessageThreads() {
	return createQuery(() => ({
		queryKey: queryKeys.messaging.threads.list(),
		queryFn: () => graphqlRequest<ListMessageThreadsResponse>(LIST_MESSAGE_THREADS),
		staleTime: 30_000,
	}));
}
```

- [ ] **Step 4: Create `src/lib/queries/hooks/useThreadMessages.svelte.ts`**

```ts
import { createQuery, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { LIST_THREAD_MESSAGES, type ListThreadMessagesResponse } from '../messaging';
import { queryKeys } from '../keys';
import {
	seedFromApiPage,
	prependOlderPage,
	type ThreadMessagesCache,
} from '$lib/messaging/threadCache';

const PAGE_SIZE = 40;

export function useThreadMessages(getThreadId: () => string) {
	const queryClient = useQueryClient();
	let isFetchingOlder = $state(false);

	const query = createQuery(() => ({
		queryKey: queryKeys.messaging.messages.list(getThreadId()),
		queryFn: async () => {
			const res = await graphqlRequest<ListThreadMessagesResponse>(LIST_THREAD_MESSAGES, {
				threadId: getThreadId(),
				first: PAGE_SIZE,
			});
			return seedFromApiPage(res.threadMessages.items, res.threadMessages.pageInfo);
		},
		staleTime: 5_000,
	}));

	async function fetchOlder() {
		const current = query.data as ThreadMessagesCache | undefined;
		if (!current || !current.hasMoreOlder || current.oldestLoadedSeq == null || isFetchingOlder) {
			return;
		}
		isFetchingOlder = true;
		try {
			const res = await graphqlRequest<ListThreadMessagesResponse>(LIST_THREAD_MESSAGES, {
				threadId: getThreadId(),
				first: PAGE_SIZE,
				before: current.oldestLoadedSeq,
			});
			queryClient.setQueryData<ThreadMessagesCache>(
				queryKeys.messaging.messages.list(getThreadId()),
				(old) =>
					old ? prependOlderPage(old, res.threadMessages.items, res.threadMessages.pageInfo) : old,
			);
		} finally {
			isFetchingOlder = false;
		}
	}

	return {
		get query() {
			return query;
		},
		get isFetchingOlder() {
			return isFetchingOlder;
		},
		fetchOlder,
	};
}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- hooks-useMessageThreads hooks-useThreadMessages`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/queries/hooks/useMessageThreads.ts src/lib/queries/hooks/useThreadMessages.svelte.ts frontend/tests/unit/hooks-useMessageThreads.test.ts frontend/tests/unit/hooks-useThreadMessages.test.ts
git commit -m "feat(messaging): thread-list and message-history query hooks"
```

---

## Task 10: Mutation hooks — send, mark-read, create-thread

**Files:**
- Create: `src/lib/queries/hooks/useSendMessage.ts`
- Create: `src/lib/queries/hooks/useMarkThreadRead.ts`
- Create: `src/lib/queries/hooks/useCreateMessageThread.ts`
- Test: `frontend/tests/unit/hooks-useSendMessage.test.ts`
- Test: `frontend/tests/unit/hooks-useMarkThreadRead.test.ts`
- Test: `frontend/tests/unit/hooks-useCreateMessageThread.test.ts`

**Interfaces:**
- Consumes: `graphqlRequest`; `SEND_MESSAGE`, `MARK_THREAD_READ`, `CREATE_MESSAGE_THREAD`, response types, `MessagingUser` (`$lib/queries/messaging`); `queryKeys`; `makeClientNonce`, `optimisticMessage`, `addOptimistic`, `reconcileSentMessage` (`$lib/messaging/optimistic`); `ThreadMessagesCache` (`$lib/messaging/threadCache`); `createMutation`, `useQueryClient` (`@tanstack/svelte-query`); `toast` (`svelte-sonner`); `goto` (`$app/navigation`).
- Produces:
  - `useSendMessage()` → `createMutation` result. `mutate` takes `SendArgs = { threadId: string; body: string; sender: MessagingUser; afterSeq: number }`.
    - `mutationFn` builds `clientNonce = makeClientNonce()` and calls `graphqlRequest<SendMessageResponse>(SEND_MESSAGE, { input: { threadId, body: body.trim(), clientNonce } })`; it returns `{ response, clientNonce, args }`.
    - `onMutate(args)` sets `queryKeys.messaging.messages.list(args.threadId)` via `setQueryData` → `addOptimistic(cache, optimisticMessage({...}))` with a fresh nonce **stored on a module-scoped `pendingNonce` keyed** — simpler: generate the nonce in `onMutate`, stash it on the `args` object (mutate is called with a fresh object each time) as `args.__nonce`, and reuse it in `mutationFn`.
    - `onError(_e, args)` removes the optimistic row: `setQueryData(key, (c) => c ? { ...c, items: c.items.filter(m => m.id !== 'optimistic:' + args.__nonce) } : c)` and `toast.error('Message failed to send')`.
    - `onSuccess(result, args)` calls `setQueryData(key, (c) => c ? reconcileSentMessage(c, result.clientNonce, result.response.sendMessage) : c)`.
  - `useMarkThreadRead()` → `createMutation`; `mutate` takes `{ threadId: string; seq: number }`; `mutationFn` → `graphqlRequest<MarkThreadReadResponse>(MARK_THREAD_READ, { threadId, seq })`; `onSuccess` writes the returned thread into `queryKeys.messaging.threads.detail(threadId)` and invalidates `queryKeys.messaging.threads.lists()` with `refetchType: 'none'`. No toast (this fires on scroll/focus, must be silent). `onError` logs to `console.error` only.
  - `useCreateMessageThread()` → `createMutation`; `mutate` takes `{ participantUserIds: string[]; title?: string }`; `mutationFn` → `graphqlRequest<CreateMessageThreadResponse>(CREATE_MESSAGE_THREAD, { input: { participantUserIds, title: title ?? null } })`; `onSuccess(data)` invalidates `queryKeys.messaging.threads.lists()`, then `goto('/messages/' + data.createMessageThread.id)`; `onError` → `toast.error('Could not start conversation')`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/hooks-useSendMessage.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueryData: vi.fn(),
	mockToastError: vi.fn(),
	captured: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		mocks.captured = fn();
		return { mutate: vi.fn(), isPending: false };
	}),
	useQueryClient: vi.fn(() => ({ setQueryData: mocks.mockSetQueryData })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
vi.mock('svelte-sonner', () => ({ toast: { error: mocks.mockToastError, success: vi.fn() } }));

import { useSendMessage } from '$lib/queries/hooks/useSendMessage';
import { SEND_MESSAGE } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

const sender = { id: 'u1', username: 'me' };

describe('useSendMessage', () => {
	beforeEach(() => vi.clearAllMocks());

	it('onMutate adds an optimistic row keyed by the generated nonce', () => {
		useSendMessage();
		const args: any = { threadId: 't1', body: 'hi there', sender, afterSeq: 7 };
		mocks.captured.onMutate(args);
		expect(typeof args.__nonce).toBe('string');
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(
			queryKeys.messaging.messages.list('t1'),
			expect.any(Function),
		);
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater({ items: [{ id: 'm7', seq: 7 }], oldestLoadedSeq: 7, hasMoreOlder: false });
		expect(next.items[next.items.length - 1].id).toBe('optimistic:' + args.__nonce);
	});

	it('mutationFn sends the same nonce set on the args by onMutate', async () => {
		useSendMessage();
		const args: any = { threadId: 't1', body: '  hi  ', sender, afterSeq: 7 };
		mocks.captured.onMutate(args);
		mocks.mockGraphql.mockResolvedValue({ sendMessage: { id: 'm8', seq: 8, body: 'hi', threadId: 't1', sender, createdAt: 'x' } });
		const result = await mocks.captured.mutationFn(args);
		expect(mocks.mockGraphql).toHaveBeenCalledWith(SEND_MESSAGE, {
			input: { threadId: 't1', body: 'hi', clientNonce: args.__nonce },
		});
		expect(result.clientNonce).toBe(args.__nonce);
	});

	it('onError removes the optimistic row and toasts', () => {
		useSendMessage();
		const args: any = { threadId: 't1', body: 'x', sender, afterSeq: 7, __nonce: 'n1' };
		mocks.captured.onError(new Error('boom'), args);
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater({ items: [{ id: 'optimistic:n1', seq: 7.5 }, { id: 'm7', seq: 7 }] });
		expect(next.items.map((m: any) => m.id)).toEqual(['m7']);
		expect(mocks.mockToastError).toHaveBeenCalled();
	});

	it('onSuccess reconciles the optimistic row into the server row', () => {
		useSendMessage();
		const args: any = { threadId: 't1', __nonce: 'n1' };
		const server = { id: 'm8', seq: 8, body: 'hi', threadId: 't1', sender, createdAt: 'x' };
		mocks.captured.onSuccess({ response: { sendMessage: server }, clientNonce: 'n1', args }, args);
		const updater = mocks.mockSetQueryData.mock.calls[0][1];
		const next = updater({ items: [{ id: 'optimistic:n1', seq: 7.5 }], oldestLoadedSeq: 7, hasMoreOlder: false });
		expect(next.items.map((m: any) => m.id)).toEqual(['m8']);
	});
});
```

```ts
// frontend/tests/unit/hooks-useMarkThreadRead.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueryData: vi.fn(),
	mockInvalidate: vi.fn(),
	captured: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		mocks.captured = fn();
		return { mutate: vi.fn() };
	}),
	useQueryClient: vi.fn(() => ({
		setQueryData: mocks.mockSetQueryData,
		invalidateQueries: mocks.mockInvalidate,
	})),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import { useMarkThreadRead } from '$lib/queries/hooks/useMarkThreadRead';
import { MARK_THREAD_READ } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

describe('useMarkThreadRead', () => {
	beforeEach(() => vi.clearAllMocks());

	it('mutationFn calls markThreadRead with an IntID seq', async () => {
		useMarkThreadRead();
		mocks.mockGraphql.mockResolvedValue({ markThreadRead: { id: 't1' } });
		await mocks.captured.mutationFn({ threadId: 't1', seq: 12 });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(MARK_THREAD_READ, { threadId: 't1', seq: 12 });
	});

	it('onSuccess writes the thread detail and invalidates the list without refetching', () => {
		useMarkThreadRead();
		mocks.captured.onSuccess({ markThreadRead: { id: 't1', unreadCount: 0 } }, { threadId: 't1', seq: 12 });
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(
			queryKeys.messaging.threads.detail('t1'),
			{ id: 't1', unreadCount: 0 },
		);
		expect(mocks.mockInvalidate).toHaveBeenCalledWith({
			queryKey: queryKeys.messaging.threads.lists(),
			refetchType: 'none',
		});
	});
});
```

```ts
// frontend/tests/unit/hooks-useCreateMessageThread.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockInvalidate: vi.fn(),
	mockGoto: vi.fn(),
	mockToastError: vi.fn(),
	captured: undefined as any,
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		mocks.captured = fn();
		return { mutate: vi.fn() };
	}),
	useQueryClient: vi.fn(() => ({ invalidateQueries: mocks.mockInvalidate })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
vi.mock('$app/navigation', () => ({ goto: mocks.mockGoto }));
vi.mock('svelte-sonner', () => ({ toast: { error: mocks.mockToastError, success: vi.fn() } }));

import { useCreateMessageThread } from '$lib/queries/hooks/useCreateMessageThread';
import { CREATE_MESSAGE_THREAD } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

describe('useCreateMessageThread', () => {
	beforeEach(() => vi.clearAllMocks());

	it('mutationFn maps args to CreateMessageThreadInput with a null title default', async () => {
		useCreateMessageThread();
		mocks.mockGraphql.mockResolvedValue({ createMessageThread: { id: 't9' } });
		await mocks.captured.mutationFn({ participantUserIds: ['u2', 'u3'] });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(CREATE_MESSAGE_THREAD, {
			input: { participantUserIds: ['u2', 'u3'], title: null },
		});
	});

	it('onSuccess invalidates the thread list and navigates to the new thread', () => {
		useCreateMessageThread();
		mocks.captured.onSuccess({ createMessageThread: { id: 't9' } });
		expect(mocks.mockInvalidate).toHaveBeenCalledWith({ queryKey: queryKeys.messaging.threads.lists() });
		expect(mocks.mockGoto).toHaveBeenCalledWith('/messages/t9');
	});

	it('onError toasts a friendly message', () => {
		useCreateMessageThread();
		mocks.captured.onError(new Error('x'));
		expect(mocks.mockToastError).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `cd frontend && pnpm run test:run -- hooks-useSendMessage hooks-useMarkThreadRead hooks-useCreateMessageThread`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create `src/lib/queries/hooks/useSendMessage.ts`**

```ts
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { SEND_MESSAGE, type SendMessageResponse, type MessagingUser } from '../messaging';
import { queryKeys } from '../keys';
import {
	makeClientNonce,
	optimisticMessage,
	addOptimistic,
	reconcileSentMessage,
} from '$lib/messaging/optimistic';
import type { ThreadMessagesCache } from '$lib/messaging/threadCache';

export interface SendArgs {
	threadId: string;
	body: string;
	sender: MessagingUser;
	afterSeq: number;
	/** set by onMutate, consumed by mutationFn/onError/onSuccess */
	__nonce?: string;
}

export function useSendMessage() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		onMutate: (args: SendArgs) => {
			args.__nonce = makeClientNonce();
			const optimistic = optimisticMessage({
				body: args.body,
				sender: args.sender,
				threadId: args.threadId,
				clientNonce: args.__nonce,
				afterSeq: args.afterSeq,
			});
			queryClient.setQueryData<ThreadMessagesCache>(
				queryKeys.messaging.messages.list(args.threadId),
				(cache) => (cache ? addOptimistic(cache, optimistic) : cache),
			);
		},
		mutationFn: async (args: SendArgs) => {
			const clientNonce = args.__nonce ?? makeClientNonce();
			const response = await graphqlRequest<SendMessageResponse>(SEND_MESSAGE, {
				input: { threadId: args.threadId, body: args.body.trim(), clientNonce },
			});
			return { response, clientNonce, args };
		},
		onError: (_err: unknown, args: SendArgs) => {
			const optId = 'optimistic:' + args.__nonce;
			queryClient.setQueryData<ThreadMessagesCache>(
				queryKeys.messaging.messages.list(args.threadId),
				(cache) =>
					cache ? { ...cache, items: cache.items.filter((m) => m.id !== optId) } : cache,
			);
			toast.error('Message failed to send');
		},
		onSuccess: (result: { response: SendMessageResponse; clientNonce: string; args: SendArgs }) => {
			queryClient.setQueryData<ThreadMessagesCache>(
				queryKeys.messaging.messages.list(result.args.threadId),
				(cache) =>
					cache
						? reconcileSentMessage(cache, result.clientNonce, result.response.sendMessage)
						: cache,
			);
		},
	}));
}
```

- [ ] **Step 4: Create `src/lib/queries/hooks/useMarkThreadRead.ts`**

```ts
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { MARK_THREAD_READ, type MarkThreadReadResponse } from '../messaging';
import { queryKeys } from '../keys';

export function useMarkThreadRead() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: (vars: { threadId: string; seq: number }) =>
			graphqlRequest<MarkThreadReadResponse>(MARK_THREAD_READ, {
				threadId: vars.threadId,
				seq: vars.seq,
			}),
		onSuccess: (data: MarkThreadReadResponse, vars: { threadId: string; seq: number }) => {
			queryClient.setQueryData(
				queryKeys.messaging.threads.detail(vars.threadId),
				data.markThreadRead,
			);
			queryClient.invalidateQueries({
				queryKey: queryKeys.messaging.threads.lists(),
				refetchType: 'none',
			});
		},
		onError: (err: unknown) => {
			console.error('[markThreadRead] failed:', err);
		},
	}));
}
```

- [ ] **Step 5: Create `src/lib/queries/hooks/useCreateMessageThread.ts`**

```ts
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { CREATE_MESSAGE_THREAD, type CreateMessageThreadResponse } from '../messaging';
import { queryKeys } from '../keys';

export function useCreateMessageThread() {
	const queryClient = useQueryClient();

	return createMutation(() => ({
		mutationFn: (vars: { participantUserIds: string[]; title?: string }) =>
			graphqlRequest<CreateMessageThreadResponse>(CREATE_MESSAGE_THREAD, {
				input: { participantUserIds: vars.participantUserIds, title: vars.title ?? null },
			}),
		onSuccess: (data: CreateMessageThreadResponse) => {
			queryClient.invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() });
			goto('/messages/' + data.createMessageThread.id);
		},
		onError: (err: unknown) => {
			console.error('[createMessageThread] failed:', err);
			toast.error('Could not start conversation');
		},
	}));
}
```

- [ ] **Step 6: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- hooks-useSendMessage hooks-useMarkThreadRead hooks-useCreateMessageThread`
Expected: PASS (9 tests).

- [ ] **Step 7: Commit**

```bash
git add src/lib/queries/hooks/useSendMessage.ts src/lib/queries/hooks/useMarkThreadRead.ts src/lib/queries/hooks/useCreateMessageThread.ts frontend/tests/unit/hooks-useSendMessage.test.ts frontend/tests/unit/hooks-useMarkThreadRead.test.ts frontend/tests/unit/hooks-useCreateMessageThread.test.ts
git commit -m "feat(messaging): send / mark-read / create-thread mutation hooks"
```

---

## Task 11: Thin mutation hooks — typing, add-participants, leave

**Files:**
- Create: `src/lib/queries/hooks/useSetTyping.ts`
- Create: `src/lib/queries/hooks/useAddThreadParticipants.ts`
- Create: `src/lib/queries/hooks/useLeaveThread.ts`
- Test: `frontend/tests/unit/hooks-messagingMisc.test.ts`

**Interfaces:**
- Produces:
  - `useSetTyping()` → `createMutation`; `mutate` takes `{ threadId: string; typing: boolean }`; `mutationFn` → `graphqlRequest<SetTypingResponse>(SET_TYPING, vars)`. No `onSuccess`. `onError` swallows (typing is best-effort): `console.debug` only.
  - `useAddThreadParticipants()` → `createMutation`; `mutate` takes `{ threadId: string; userIds: string[] }`; `mutationFn` → `graphqlRequest<AddThreadParticipantsResponse>(ADD_THREAD_PARTICIPANTS, vars)`; `onSuccess(data, vars)` → `setQueryData(queryKeys.messaging.threads.detail(vars.threadId), data.addThreadParticipants)` + `invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() })` + `toast.success('Added to conversation')`; `onError` → `toast.error('Could not add people')`.
  - `useLeaveThread()` → `createMutation`; `mutate` takes `{ threadId: string }`; `mutationFn` → `graphqlRequest<LeaveThreadResponse>(LEAVE_THREAD, vars)`; `onSuccess` → `invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() })` + `goto('/messages')` + `toast.success('Left conversation')`; `onError` → `toast.error('Could not leave conversation')`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/hooks-messagingMisc.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockGraphql: vi.fn(),
	mockSetQueryData: vi.fn(),
	mockInvalidate: vi.fn(),
	mockGoto: vi.fn(),
	mockToastSuccess: vi.fn(),
	mockToastError: vi.fn(),
	captures: [] as any[],
}));

vi.mock('@tanstack/svelte-query', () => ({
	createMutation: vi.fn((fn: () => any) => {
		mocks.captures.push(fn());
		return { mutate: vi.fn() };
	}),
	useQueryClient: vi.fn(() => ({
		setQueryData: mocks.mockSetQueryData,
		invalidateQueries: mocks.mockInvalidate,
	})),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: (...a: unknown[]) => mocks.mockGraphql(...a) }));
vi.mock('$app/navigation', () => ({ goto: mocks.mockGoto }));
vi.mock('svelte-sonner', () => ({ toast: { success: mocks.mockToastSuccess, error: mocks.mockToastError } }));

import { useSetTyping } from '$lib/queries/hooks/useSetTyping';
import { useAddThreadParticipants } from '$lib/queries/hooks/useAddThreadParticipants';
import { useLeaveThread } from '$lib/queries/hooks/useLeaveThread';
import { SET_TYPING, ADD_THREAD_PARTICIPANTS, LEAVE_THREAD } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

describe('thin messaging mutation hooks', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.captures = [];
	});

	it('useSetTyping forwards threadId/typing and never toasts on error', async () => {
		useSetTyping();
		const opts = mocks.captures[0];
		mocks.mockGraphql.mockResolvedValue({ setTyping: true });
		await opts.mutationFn({ threadId: 't1', typing: true });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(SET_TYPING, { threadId: 't1', typing: true });
		opts.onError?.(new Error('x'));
		expect(mocks.mockToastError).not.toHaveBeenCalled();
	});

	it('useAddThreadParticipants updates detail cache + invalidates list + toasts', async () => {
		useAddThreadParticipants();
		const opts = mocks.captures[0];
		mocks.mockGraphql.mockResolvedValue({ addThreadParticipants: { id: 't1' } });
		await opts.mutationFn({ threadId: 't1', userIds: ['u5'] });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(ADD_THREAD_PARTICIPANTS, { threadId: 't1', userIds: ['u5'] });
		opts.onSuccess({ addThreadParticipants: { id: 't1' } }, { threadId: 't1', userIds: ['u5'] });
		expect(mocks.mockSetQueryData).toHaveBeenCalledWith(queryKeys.messaging.threads.detail('t1'), { id: 't1' });
		expect(mocks.mockInvalidate).toHaveBeenCalledWith({ queryKey: queryKeys.messaging.threads.lists() });
		expect(mocks.mockToastSuccess).toHaveBeenCalled();
	});

	it('useLeaveThread invalidates list, navigates to /messages, toasts', async () => {
		useLeaveThread();
		const opts = mocks.captures[0];
		mocks.mockGraphql.mockResolvedValue({ leaveThread: true });
		await opts.mutationFn({ threadId: 't1' });
		expect(mocks.mockGraphql).toHaveBeenCalledWith(LEAVE_THREAD, { threadId: 't1' });
		opts.onSuccess({ leaveThread: true }, { threadId: 't1' });
		expect(mocks.mockInvalidate).toHaveBeenCalledWith({ queryKey: queryKeys.messaging.threads.lists() });
		expect(mocks.mockGoto).toHaveBeenCalledWith('/messages');
		expect(mocks.mockToastSuccess).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- hooks-messagingMisc`
Expected: FAIL — modules not found.

- [ ] **Step 3: Create the three hooks**

`src/lib/queries/hooks/useSetTyping.ts`:
```ts
import { createMutation } from '@tanstack/svelte-query';
import { graphqlRequest } from '../client';
import { SET_TYPING, type SetTypingResponse } from '../messaging';

export function useSetTyping() {
	return createMutation(() => ({
		mutationFn: (vars: { threadId: string; typing: boolean }) =>
			graphqlRequest<SetTypingResponse>(SET_TYPING, vars),
		onError: (err: unknown) => {
			console.debug('[setTyping] ignored error:', err);
		},
	}));
}
```

`src/lib/queries/hooks/useAddThreadParticipants.ts`:
```ts
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { ADD_THREAD_PARTICIPANTS, type AddThreadParticipantsResponse } from '../messaging';
import { queryKeys } from '../keys';

export function useAddThreadParticipants() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: { threadId: string; userIds: string[] }) =>
			graphqlRequest<AddThreadParticipantsResponse>(ADD_THREAD_PARTICIPANTS, vars),
		onSuccess: (
			data: AddThreadParticipantsResponse,
			vars: { threadId: string; userIds: string[] },
		) => {
			queryClient.setQueryData(
				queryKeys.messaging.threads.detail(vars.threadId),
				data.addThreadParticipants,
			);
			queryClient.invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() });
			toast.success('Added to conversation');
		},
		onError: (err: unknown) => {
			console.error('[addThreadParticipants] failed:', err);
			toast.error('Could not add people');
		},
	}));
}
```

`src/lib/queries/hooks/useLeaveThread.ts`:
```ts
import { createMutation, useQueryClient } from '@tanstack/svelte-query';
import { goto } from '$app/navigation';
import { toast } from 'svelte-sonner';
import { graphqlRequest } from '../client';
import { LEAVE_THREAD, type LeaveThreadResponse } from '../messaging';
import { queryKeys } from '../keys';

export function useLeaveThread() {
	const queryClient = useQueryClient();
	return createMutation(() => ({
		mutationFn: (vars: { threadId: string }) =>
			graphqlRequest<LeaveThreadResponse>(LEAVE_THREAD, vars),
		onSuccess: () => {
			queryClient.invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() });
			goto('/messages');
			toast.success('Left conversation');
		},
		onError: (err: unknown) => {
			console.error('[leaveThread] failed:', err);
			toast.error('Could not leave conversation');
		},
	}));
}
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- hooks-messagingMisc`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/queries/hooks/useSetTyping.ts src/lib/queries/hooks/useAddThreadParticipants.ts src/lib/queries/hooks/useLeaveThread.ts frontend/tests/unit/hooks-messagingMisc.test.ts
git commit -m "feat(messaging): typing / add-participants / leave-thread hooks"
```

---
## Task 12: Inbox subscription rune (`useInboxStream.svelte.ts`)

**Files:**
- Create: `src/lib/messaging/useInboxStream.svelte.ts`
- Test: `frontend/tests/unit/messaging-useInboxStream.test.ts`

**Interfaces:**
- Consumes: `subscribeGraphql` (`$lib/messaging/ws-client.svelte`); `INBOX_EVENTS_SUBSCRIPTION`, `InboxEvent`, `ListMessageThreadsResponse` (`$lib/queries/messaging`); `applyInboxEvent` (`$lib/messaging/inboxCache`); `queryKeys`; a `QueryClient` (passed in, from the caller's `useQueryClient()`).
- Produces:
  - `createInboxStream(queryClient: QueryClient): { start(): void; stop(): void }`.
  - `start()` is idempotent (a second call while running is a no-op). It opens one `inboxEvents` subscription. On each event it updates `queryKeys.messaging.threads.list()`: `setQueryData(key, (old) => old ? { messageThreads: applyInboxEvent(old.messageThreads, ev) } : old)`. If the returned array is reference-identical to the old one **and** `ev.threadId` is not present in it, it calls `queryClient.invalidateQueries({ queryKey: queryKeys.messaging.threads.lists() })` (a thread created elsewhere).
  - `stop()` disposes the subscription and lets `start()` reopen later.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/messaging-useInboxStream.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	mockSubscribe: vi.fn(),
	capturedHandlers: undefined as any,
	dispose: vi.fn(),
}));

vi.mock('$lib/messaging/ws-client.svelte', () => ({
	subscribeGraphql: (payload: any, handlers: any) => {
		mocks.capturedHandlers = handlers;
		mocks.mockSubscribe(payload);
		return mocks.dispose;
	},
}));

import { createInboxStream } from '$lib/messaging/useInboxStream.svelte';
import { INBOX_EVENTS_SUBSCRIPTION } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

function fakeQueryClient(initialList: any) {
	let data = initialList;
	return {
		setQueryData: vi.fn((_key: unknown, updater: any) => {
			data = typeof updater === 'function' ? updater(data) : updater;
			return data;
		}),
		invalidateQueries: vi.fn(),
		getQueryData: () => data,
		__get: () => data,
	};
}

const thread = (id: string, at: string, unread = 0) => ({
	id, title: null, participants: [], lastMessageAt: at,
	latestSeq: 0, myLastReadSeq: 0, unreadCount: unread, createdAt: 'x',
});

describe('createInboxStream', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.capturedHandlers = undefined;
	});

	it('start() opens exactly one inboxEvents subscription and is idempotent', () => {
		const qc = fakeQueryClient({ messageThreads: [] });
		const s = createInboxStream(qc as any);
		s.start();
		s.start();
		expect(mocks.mockSubscribe).toHaveBeenCalledTimes(1);
		expect(mocks.mockSubscribe).toHaveBeenCalledWith({ query: INBOX_EVENTS_SUBSCRIPTION });
	});

	it('folds an inbox event into the thread list cache', () => {
		const qc = fakeQueryClient({
			messageThreads: [thread('a', '2026-09-07T10:00:00Z'), thread('b', '2026-09-07T09:00:00Z')],
		});
		const s = createInboxStream(qc as any);
		s.start();
		mocks.capturedHandlers.next({
			inboxEvents: { threadId: 'b', lastMessageAt: '2026-09-07T12:00:00Z', latestSeq: 4, unreadCount: 2 },
		});
		expect(qc.setQueryData).toHaveBeenCalledWith(queryKeys.messaging.threads.list(), expect.any(Function));
		expect(qc.__get().messageThreads.map((t: any) => t.id)).toEqual(['b', 'a']);
		expect(qc.__get().messageThreads[0].unreadCount).toBe(2);
	});

	it('invalidates the list when the event is for an unknown thread', () => {
		const qc = fakeQueryClient({ messageThreads: [thread('a', '2026-09-07T10:00:00Z')] });
		const s = createInboxStream(qc as any);
		s.start();
		mocks.capturedHandlers.next({
			inboxEvents: { threadId: 'new', lastMessageAt: 'x', latestSeq: 1, unreadCount: 1 },
		});
		expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.messaging.threads.lists() });
	});

	it('stop() disposes and allows a later restart', () => {
		const qc = fakeQueryClient({ messageThreads: [] });
		const s = createInboxStream(qc as any);
		s.start();
		s.stop();
		expect(mocks.dispose).toHaveBeenCalledTimes(1);
		s.start();
		expect(mocks.mockSubscribe).toHaveBeenCalledTimes(2);
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- messaging-useInboxStream`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/messaging/useInboxStream.svelte.ts`**

```ts
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
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- messaging-useInboxStream`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/messaging/useInboxStream.svelte.ts frontend/tests/unit/messaging-useInboxStream.test.ts
git commit -m "feat(messaging): inbox-events subscription rune"
```

---

## Task 13: Per-thread subscription rune (`useThreadStream.svelte.ts`)

**Files:**
- Create: `src/lib/messaging/useThreadStream.svelte.ts`
- Test: `frontend/tests/unit/messaging-useThreadStream.test.ts`

**Interfaces:**
- Consumes: `subscribeGraphql` (`$lib/messaging/ws-client.svelte`); `THREAD_EVENTS_SUBSCRIPTION`, `MessageThread` (`$lib/queries/messaging`); `ThreadEvent` (`$lib/messaging/events`); from `$lib/messaging/threadCache`: `applyMessagePosted`, `applyThreadEventToThread`, `nextSinceSeq`, `typingUsersReducer`, `activeTypingUserIds`, `presenceReducer`, `type ThreadMessagesCache`; `queryKeys`; a `QueryClient`.
- Produces:
  - `createThreadStream(opts: { queryClient: QueryClient; getThreadId: () => string; myUserId: string; now?: () => number }): { readonly typingUserIds: string[]; readonly presence: Record<string, 'ONLINE' | 'OFFLINE'>; start(): void; stop(): void }`.
  - `start()`: computes `sinceSeq` from the current messages cache via `nextSinceSeq` (`null` → omit the variable), opens `threadEvents(threadId, sinceSeq)`, and dispatches events:
    - `MessagePosted` → fold into `queryKeys.messaging.messages.list(threadId)` with `applyMessagePosted`, and into `queryKeys.messaging.threads.detail(threadId)` with `applyThreadEventToThread`.
    - `ReadReceiptChanged`, `ParticipantChanged` → fold into `threads.detail` with `applyThreadEventToThread`.
    - `TypingChanged` → `typingState = typingUsersReducer(typingState, event, now())`.
    - `PresenceChanged` → `presenceState = presenceReducer(presenceState, event)`.
    - `StreamReset` → `queryClient.invalidateQueries({ queryKey: queryKeys.messaging.messages.list(threadId) })`, then `restart()` (dispose + reopen with a fresh `sinceSeq`).
  - A prune interval (`now()` based, 3000 ms) keeps `typingUserIds` fresh when no new events arrive; cleared by `stop()`.
  - `stop()`: dispose the subscription and clear the interval. `start()` after `stop()` reopens cleanly. Calling `start()` while running is a no-op.
  - `typingUserIds` excludes `myUserId`.

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/unit/messaging-useThreadStream.test.ts
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

const mocks = vi.hoisted(() => ({
	subscribeGraphql: vi.fn(),
	handlers: undefined as any,
	dispose: vi.fn(),
}));

vi.mock('$lib/messaging/ws-client.svelte', () => ({
	subscribeGraphql: (payload: any, handlers: any) => {
		mocks.subscribeGraphql(payload);
		mocks.handlers = handlers;
		return mocks.dispose;
	},
}));

import { createThreadStream } from '$lib/messaging/useThreadStream.svelte';
import { THREAD_EVENTS_SUBSCRIPTION } from '$lib/queries/messaging';
import { queryKeys } from '$lib/queries/keys';

function fakeQC(caches: Record<string, any>) {
	return {
		getQueryData: (key: any) => caches[JSON.stringify(key)],
		setQueryData: vi.fn((key: any, updater: any) => {
			const k = JSON.stringify(key);
			caches[k] = typeof updater === 'function' ? updater(caches[k]) : updater;
			return caches[k];
		}),
		invalidateQueries: vi.fn(),
	};
}

const msg = (seq: number, senderId = 'u2') => ({
	id: `m${seq}`, threadId: 't1', seq, body: `b${seq}`, createdAt: 'x',
	sender: { id: senderId, username: senderId },
});

let now = 1000;
const clockFn = () => now;

beforeEach(() => {
	vi.clearAllMocks();
	vi.useFakeTimers();
	now = 1000;
	mocks.handlers = undefined;
});
afterEach(() => vi.useRealTimers());

describe('createThreadStream', () => {
	it('start() subscribes with sinceSeq from the messages cache', () => {
		const caches: Record<string, any> = {
			[JSON.stringify(queryKeys.messaging.messages.list('t1'))]: {
				items: [msg(4), msg(7)], oldestLoadedSeq: 4, hasMoreOlder: false,
			},
		};
		const s = createThreadStream({ queryClient: fakeQC(caches) as any, getThreadId: () => 't1', myUserId: 'u1', now: clockFn });
		s.start();
		s.start();
		expect(mocks.subscribeGraphql).toHaveBeenCalledTimes(1);
		expect(mocks.subscribeGraphql).toHaveBeenCalledWith({
			query: THREAD_EVENTS_SUBSCRIPTION,
			variables: { threadId: 't1', sinceSeq: 7 },
		});
		s.stop();
	});

	it('MessagePosted folds into the message list and the thread summary', () => {
		const mKey = JSON.stringify(queryKeys.messaging.messages.list('t1'));
		const tKey = JSON.stringify(queryKeys.messaging.threads.detail('t1'));
		const caches: Record<string, any> = {
			[mKey]: { items: [msg(7)], oldestLoadedSeq: 7, hasMoreOlder: false },
			[tKey]: {
				id: 't1', title: null, participants: [], lastMessageAt: 'x',
				latestSeq: 7, myLastReadSeq: 7, unreadCount: 0, createdAt: 'x',
			},
		};
		const qc = fakeQC(caches);
		const s = createThreadStream({ queryClient: qc as any, getThreadId: () => 't1', myUserId: 'u1', now: clockFn });
		s.start();
		mocks.handlers.next({ threadEvents: { __typename: 'MessagePosted', message: msg(8) } });
		expect(caches[mKey].items.map((m: any) => m.seq)).toEqual([7, 8]);
		expect(caches[tKey].latestSeq).toBe(8);
		expect(caches[tKey].unreadCount).toBe(1);
		s.stop();
	});

	it('TypingChanged drives typingUserIds and excludes myUserId; prune clears it after TTL', () => {
		const s = createThreadStream({ queryClient: fakeQC({}) as any, getThreadId: () => 't1', myUserId: 'u1', now: clockFn });
		s.start();
		mocks.handlers.next({ threadEvents: { __typename: 'TypingChanged', threadId: 't1', userId: 'u2', typing: true } });
		mocks.handlers.next({ threadEvents: { __typename: 'TypingChanged', threadId: 't1', userId: 'u1', typing: true } });
		expect(s.typingUserIds).toEqual(['u2']);
		now = 9000;
		vi.advanceTimersByTime(3000);
		expect(s.typingUserIds).toEqual([]);
		s.stop();
	});

	it('PresenceChanged is exposed on presence', () => {
		const s = createThreadStream({ queryClient: fakeQC({}) as any, getThreadId: () => 't1', myUserId: 'u1', now: clockFn });
		s.start();
		mocks.handlers.next({ threadEvents: { __typename: 'PresenceChanged', threadId: 't1', userId: 'u2', state: 'ONLINE' } });
		expect(s.presence.u2).toBe('ONLINE');
		s.stop();
	});

	it('StreamReset invalidates the message list and resubscribes', () => {
		const qc = fakeQC({
			[JSON.stringify(queryKeys.messaging.messages.list('t1'))]: { items: [msg(7)], oldestLoadedSeq: 7, hasMoreOlder: false },
		});
		const s = createThreadStream({ queryClient: qc as any, getThreadId: () => 't1', myUserId: 'u1', now: clockFn });
		s.start();
		mocks.handlers.next({ threadEvents: { __typename: 'StreamReset', threadId: 't1' } });
		expect(qc.invalidateQueries).toHaveBeenCalledWith({ queryKey: queryKeys.messaging.messages.list('t1') });
		expect(mocks.dispose).toHaveBeenCalledTimes(1);
		expect(mocks.subscribeGraphql).toHaveBeenCalledTimes(2);
		s.stop();
	});

	it('stop() disposes and clears the prune interval', () => {
		const s = createThreadStream({ queryClient: fakeQC({}) as any, getThreadId: () => 't1', myUserId: 'u1', now: clockFn });
		s.start();
		s.stop();
		expect(mocks.dispose).toHaveBeenCalledTimes(1);
		// no further timers pending
		expect(vi.getTimerCount()).toBe(0);
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- messaging-useThreadStream`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/messaging/useThreadStream.svelte.ts`**

```ts
import type { QueryClient } from '@tanstack/svelte-query';
import { subscribeGraphql } from '$lib/messaging/ws-client.svelte';
import { THREAD_EVENTS_SUBSCRIPTION, type MessageThread } from '$lib/queries/messaging';
import type { ThreadEvent } from '$lib/messaging/events';
import {
	applyMessagePosted,
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
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- messaging-useThreadStream`
Expected: PASS (6 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/messaging/useThreadStream.svelte.ts frontend/tests/unit/messaging-useThreadStream.test.ts
git commit -m "feat(messaging): per-thread events subscription rune"
```

---
## Task 14: Presentational primitives — format util, Avatar, PresenceDot, TypingIndicator

**Files:**
- Create: `src/lib/messaging/format.ts`
- Create: `src/lib/components/messaging/Avatar.svelte`
- Create: `src/lib/components/messaging/PresenceDot.svelte`
- Create: `src/lib/components/messaging/TypingIndicator.svelte`
- Test: `frontend/tests/unit/messaging-format.test.ts`
- Test: `frontend/tests/components/Avatar.test.ts`
- Test: `frontend/tests/components/TypingIndicator.test.ts`

**Interfaces:**
- Consumes: `MessageThread`, `MessagingUser` (`$lib/queries/messaging`).
- Produces (`format.ts`):
  - `initials(username: string): string` — first two alphanumeric chars uppercased; `'?'` for empty/blank.
  - `threadTitle(thread: Pick<MessageThread, 'title' | 'participants'>, myUserId: string): string` — `thread.title` if set; else the other participants' usernames joined by `', '`; else `'Just you'`.
  - `otherParticipants(thread: Pick<MessageThread, 'participants'>, myUserId: string): MessagingUser[]`.
  - `messageClockTime(iso: string): string` — `new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })`; returns `''` for an unparseable string.
  - `typingLabel(usernames: string[]): string` — `''` for none; `'Alice is typing…'` for one; `'Alice and Bob are typing…'` for two; `'Alice, Bob and 1 other are typing…'` for 3+.
- Produces (components):
  - `Avatar.svelte` — props `{ username: string; size?: 'sm' | 'md' }` (default `'md'`). Renders a `<span class="... rounded-full ...">` with `initials(username)`, `title={username}`, `data-testid="avatar"`. `sm` = `size-6 text-[10px]`, `md` = `size-8 text-xs`. Colours: `bg-muted text-muted-foreground`.
  - `PresenceDot.svelte` — props `{ state: 'ONLINE' | 'OFFLINE' | undefined }`. Renders a `size-2 rounded-full` span; `bg-green-500` when `ONLINE`, `bg-muted-foreground/40` otherwise; `aria-label={state === 'ONLINE' ? 'Online' : 'Offline'}`.
  - `TypingIndicator.svelte` — props `{ usernames: string[] }`. Renders nothing (`{#if usernames.length}`) when empty; otherwise a `<p class="text-xs text-muted-foreground italic" data-testid="typing">` containing `typingLabel(usernames)`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/unit/messaging-format.test.ts
import { describe, it, expect } from 'vitest';
import {
	initials,
	threadTitle,
	otherParticipants,
	messageClockTime,
	typingLabel,
} from '$lib/messaging/format';

const part = (id: string, username: string) => ({
	user: { id, username },
	role: 'MEMBER' as const,
	lastReadSeq: 0,
	joinedAt: 'x',
});

describe('messaging/format', () => {
	it('initials takes the first two alphanumerics, uppercased', () => {
		expect(initials('alice')).toBe('AL');
		expect(initials('bob_smith')).toBe('BO');
		expect(initials('7-eleven')).toBe('7E');
		expect(initials('   ')).toBe('?');
	});

	it('threadTitle prefers an explicit title, then other usernames, then "Just you"', () => {
		expect(threadTitle({ title: 'Standup', participants: [] }, 'u1')).toBe('Standup');
		expect(
			threadTitle(
				{ title: null, participants: [part('u1', 'me'), part('u2', 'alice'), part('u3', 'bob')] },
				'u1',
			),
		).toBe('alice, bob');
		expect(threadTitle({ title: null, participants: [part('u1', 'me')] }, 'u1')).toBe('Just you');
	});

	it('otherParticipants excludes me', () => {
		expect(
			otherParticipants({ participants: [part('u1', 'me'), part('u2', 'alice')] }, 'u1').map(
				(u) => u.username,
			),
		).toEqual(['alice']);
	});

	it('messageClockTime formats parseable ISO and blanks the rest', () => {
		expect(messageClockTime('not-a-date')).toBe('');
		expect(messageClockTime('2026-09-07T13:05:00Z')).toMatch(/\d/);
	});

	it('typingLabel handles 0/1/2/3+ names', () => {
		expect(typingLabel([])).toBe('');
		expect(typingLabel(['Alice'])).toBe('Alice is typing…');
		expect(typingLabel(['Alice', 'Bob'])).toBe('Alice and Bob are typing…');
		expect(typingLabel(['Alice', 'Bob', 'Cara'])).toBe('Alice, Bob and 1 other are typing…');
	});
});
```

```ts
// frontend/tests/components/Avatar.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import Avatar from '$lib/components/messaging/Avatar.svelte';

describe('Avatar', () => {
	it('renders username initials and a title', () => {
		render(Avatar, { props: { username: 'alice' } });
		const el = screen.getByTestId('avatar');
		expect(el).toHaveTextContent('AL');
		expect(el).toHaveAttribute('title', 'alice');
	});

	it('applies the small size class when size=sm', () => {
		render(Avatar, { props: { username: 'bob', size: 'sm' } });
		expect(screen.getByTestId('avatar').className).toContain('size-6');
	});
});
```

```ts
// frontend/tests/components/TypingIndicator.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import TypingIndicator from '$lib/components/messaging/TypingIndicator.svelte';

describe('TypingIndicator', () => {
	it('renders nothing when nobody is typing', () => {
		render(TypingIndicator, { props: { usernames: [] } });
		expect(screen.queryByTestId('typing')).toBeNull();
	});

	it('renders a label when someone is typing', () => {
		render(TypingIndicator, { props: { usernames: ['Alice'] } });
		expect(screen.getByTestId('typing')).toHaveTextContent('Alice is typing…');
	});
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `cd frontend && pnpm run test:run -- messaging-format Avatar TypingIndicator`
Expected: FAIL — modules/components not found.

- [ ] **Step 3: Create `src/lib/messaging/format.ts`**

```ts
import type { MessageThread, MessagingUser } from '$lib/queries/messaging';

export function initials(username: string): string {
	const chars = (username.match(/[a-z0-9]/gi) ?? []).slice(0, 2).join('');
	return chars ? chars.toUpperCase() : '?';
}

export function otherParticipants(
	thread: Pick<MessageThread, 'participants'>,
	myUserId: string,
): MessagingUser[] {
	return thread.participants.filter((p) => p.user.id !== myUserId).map((p) => p.user);
}

export function threadTitle(
	thread: Pick<MessageThread, 'title' | 'participants'>,
	myUserId: string,
): string {
	if (thread.title && thread.title.trim()) return thread.title;
	const others = otherParticipants(thread, myUserId);
	if (others.length) return others.map((u) => u.username).join(', ');
	return 'Just you';
}

export function messageClockTime(iso: string): string {
	const d = new Date(iso);
	if (Number.isNaN(d.getTime())) return '';
	return d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
}

export function typingLabel(usernames: string[]): string {
	if (usernames.length === 0) return '';
	if (usernames.length === 1) return `${usernames[0]} is typing…`;
	if (usernames.length === 2) return `${usernames[0]} and ${usernames[1]} are typing…`;
	const rest = usernames.length - 2;
	return `${usernames[0]}, ${usernames[1]} and ${rest} other${rest > 1 ? 's' : ''} are typing…`;
}
```

- [ ] **Step 4: Create the three components**

`src/lib/components/messaging/Avatar.svelte`:
```svelte
<script lang="ts">
	import { initials } from '$lib/messaging/format';

	let { username, size = 'md' }: { username: string; size?: 'sm' | 'md' } = $props();

	const sizeClass = $derived(size === 'sm' ? 'size-6 text-[10px]' : 'size-8 text-xs');
</script>

<span
	data-testid="avatar"
	title={username}
	class="inline-flex shrink-0 items-center justify-center rounded-full bg-muted font-medium text-muted-foreground {sizeClass}"
>
	{initials(username)}
</span>
```

`src/lib/components/messaging/PresenceDot.svelte`:
```svelte
<script lang="ts">
	let { state }: { state: 'ONLINE' | 'OFFLINE' | undefined } = $props();
</script>

<span
	class="inline-block size-2 rounded-full {state === 'ONLINE' ? 'bg-green-500' : 'bg-muted-foreground/40'}"
	aria-label={state === 'ONLINE' ? 'Online' : 'Offline'}
></span>
```

`src/lib/components/messaging/TypingIndicator.svelte`:
```svelte
<script lang="ts">
	import { typingLabel } from '$lib/messaging/format';

	let { usernames }: { usernames: string[] } = $props();
</script>

{#if usernames.length}
	<p data-testid="typing" class="text-xs italic text-muted-foreground">{typingLabel(usernames)}</p>
{/if}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- messaging-format Avatar TypingIndicator`
Expected: PASS (9 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/messaging/format.ts src/lib/components/messaging/Avatar.svelte src/lib/components/messaging/PresenceDot.svelte src/lib/components/messaging/TypingIndicator.svelte frontend/tests/unit/messaging-format.test.ts frontend/tests/components/Avatar.test.ts frontend/tests/components/TypingIndicator.test.ts
git commit -m "feat(messaging): format helpers and presentational primitives"
```

---

## Task 15: `MessageBubble.svelte` + `ReadReceiptAvatars.svelte`

**Files:**
- Create: `src/lib/components/messaging/MessageBubble.svelte`
- Create: `src/lib/components/messaging/ReadReceiptAvatars.svelte`
- Test: `frontend/tests/components/MessageBubble.test.ts`
- Test: `frontend/tests/components/ReadReceiptAvatars.test.ts`

**Interfaces:**
- Consumes: `Message`, `ThreadParticipant` (`$lib/queries/messaging`); `isOptimistic` (`$lib/messaging/optimistic`); `messageClockTime`, `initials` (`$lib/messaging/format`); `Avatar.svelte`.
- Produces:
  - `MessageBubble.svelte` — props `{ message: Message; mine: boolean; showSender: boolean }`.
    - Root `<div data-testid="message" class="flex ..." >` — `justify-end` when `mine`, else `justify-start`.
    - When `!mine && showSender`, render an `<Avatar size="sm" username={message.sender.username} />` to the left.
    - Bubble `<div>`: `bg-primary text-primary-foreground` when `mine`, else `bg-muted text-foreground`; `rounded-2xl px-3 py-2 max-w-[75%] whitespace-pre-wrap break-words text-sm`.
    - When `!mine && showSender`, a `<span class="block text-xs font-medium opacity-70">{message.sender.username}</span>` above the body.
    - Body text = `message.body`.
    - Footer `<span class="block text-[10px] opacity-60">{messageClockTime(message.createdAt)}{isOptimistic(message) ? ' · sending…' : ''}</span>`.
  - `ReadReceiptAvatars.svelte` — props `{ participants: ThreadParticipant[]; seq: number; myUserId: string }`.
    - Computes `readers = participants.filter((p) => p.user.id !== myUserId && p.lastReadSeq >= seq)`.
    - Renders nothing when `readers` is empty.
    - Otherwise a `<div data-testid="receipts" class="flex -space-x-1">` of `<Avatar size="sm" />` for up to 3 readers, then a `+N` `<span>` when more.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/components/MessageBubble.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import MessageBubble from '$lib/components/messaging/MessageBubble.svelte';

const base = {
	id: 'm1', threadId: 't1', seq: 5, body: 'hello world',
	createdAt: '2026-09-07T13:05:00Z', sender: { id: 'u2', username: 'alice' },
};

describe('MessageBubble', () => {
	it('shows the body and sender name for an incoming message with showSender', () => {
		render(MessageBubble, { props: { message: base, mine: false, showSender: true } });
		const el = screen.getByTestId('message');
		expect(el).toHaveTextContent('hello world');
		expect(el).toHaveTextContent('alice');
		expect(el.className).toContain('justify-start');
	});

	it('right-aligns my own message and hides the sender name', () => {
		render(MessageBubble, {
			props: { message: { ...base, sender: { id: 'u1', username: 'me' } }, mine: true, showSender: false },
		});
		const el = screen.getByTestId('message');
		expect(el.className).toContain('justify-end');
		expect(el).not.toHaveTextContent('me');
	});

	it('marks an optimistic message as sending…', () => {
		render(MessageBubble, {
			props: { message: { ...base, id: 'optimistic:n1' }, mine: true, showSender: false },
		});
		expect(screen.getByTestId('message')).toHaveTextContent('sending…');
	});
});
```

```ts
// frontend/tests/components/ReadReceiptAvatars.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ReadReceiptAvatars from '$lib/components/messaging/ReadReceiptAvatars.svelte';

const p = (id: string, username: string, lastReadSeq: number) => ({
	user: { id, username }, role: 'MEMBER' as const, lastReadSeq, joinedAt: 'x',
});

describe('ReadReceiptAvatars', () => {
	it('renders nothing when no other participant has read up to seq', () => {
		render(ReadReceiptAvatars, {
			props: { participants: [p('u1', 'me', 9), p('u2', 'a', 3)], seq: 5, myUserId: 'u1' },
		});
		expect(screen.queryByTestId('receipts')).toBeNull();
	});

	it('renders reader avatars when someone has read up to seq', () => {
		render(ReadReceiptAvatars, {
			props: { participants: [p('u1', 'me', 9), p('u2', 'alice', 7)], seq: 5, myUserId: 'u1' },
		});
		const wrap = screen.getByTestId('receipts');
		expect(wrap).toBeInTheDocument();
		expect(wrap).toHaveTextContent('AL');
	});
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `cd frontend && pnpm run test:run -- MessageBubble ReadReceiptAvatars`
Expected: FAIL — components not found.

- [ ] **Step 3: Create `src/lib/components/messaging/MessageBubble.svelte`**

```svelte
<script lang="ts">
	import type { Message } from '$lib/queries/messaging';
	import { isOptimistic } from '$lib/messaging/optimistic';
	import { messageClockTime } from '$lib/messaging/format';
	import Avatar from './Avatar.svelte';

	let { message, mine, showSender }: { message: Message; mine: boolean; showSender: boolean } =
		$props();
</script>

<div data-testid="message" class="flex gap-2 {mine ? 'justify-end' : 'justify-start'}">
	{#if !mine && showSender}
		<Avatar size="sm" username={message.sender.username} />
	{/if}
	<div
		class="max-w-[75%] rounded-2xl px-3 py-2 text-sm break-words whitespace-pre-wrap {mine
			? 'bg-primary text-primary-foreground'
			: 'bg-muted text-foreground'}"
	>
		{#if !mine && showSender}
			<span class="block text-xs font-medium opacity-70">{message.sender.username}</span>
		{/if}
		{message.body}
		<span class="block text-[10px] opacity-60">
			{messageClockTime(message.createdAt)}{isOptimistic(message) ? ' · sending…' : ''}
		</span>
	</div>
</div>
```

- [ ] **Step 4: Create `src/lib/components/messaging/ReadReceiptAvatars.svelte`**

```svelte
<script lang="ts">
	import type { ThreadParticipant } from '$lib/queries/messaging';
	import Avatar from './Avatar.svelte';

	let {
		participants,
		seq,
		myUserId,
	}: { participants: ThreadParticipant[]; seq: number; myUserId: string } = $props();

	const readers = $derived(
		participants.filter((p) => p.user.id !== myUserId && p.lastReadSeq >= seq),
	);
	const shown = $derived(readers.slice(0, 3));
	const extra = $derived(readers.length - shown.length);
</script>

{#if readers.length}
	<div data-testid="receipts" class="flex -space-x-1">
		{#each shown as r (r.user.id)}
			<Avatar size="sm" username={r.user.username} />
		{/each}
		{#if extra > 0}
			<span class="text-[10px] text-muted-foreground">+{extra}</span>
		{/if}
	</div>
{/if}
```

- [ ] **Step 5: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- MessageBubble ReadReceiptAvatars`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/messaging/MessageBubble.svelte src/lib/components/messaging/ReadReceiptAvatars.svelte frontend/tests/components/MessageBubble.test.ts frontend/tests/components/ReadReceiptAvatars.test.ts
git commit -m "feat(messaging): message bubble and read-receipt avatars"
```

---
## Task 16: `MessageComposer.svelte`

**Files:**
- Create: `src/lib/components/messaging/MessageComposer.svelte`
- Test: `frontend/tests/components/MessageComposer.test.ts`

**Interfaces:**
- Consumes: `createTypingController` (`$lib/messaging/typing`); `Button` (`$lib/components/shadcn`); `SendIcon` from `@lucide/svelte/icons/send`.
- Props: `{ disabled?: boolean; onSend: (body: string) => void; onTypingChange: (typing: boolean) => void }`.
- Behaviour:
  - A `<textarea data-testid="composer-input">` bound to local `$state` `draft`, `rows={1}`, placeholder `"Write a message…"`, `disabled` forwarded.
  - `oninput` → `controller.onKeystroke()`.
  - `onkeydown` → on `Enter` without `shiftKey`: `event.preventDefault()` then `submit()`.
  - A `<Button data-testid="composer-send" onclick={submit} disabled={disabled || !draft.trim()}>` with `<SendIcon class="size-4" />`.
  - `submit()` — if `draft.trim()` is empty, return; call `onSend(draft.trim())`; set `draft = ''`; call `controller.onSend()`.
  - The controller is created once (module-level `const controller = createTypingController({ emit: onTypingChange })`), and `controller.stop()` runs in an `$effect` cleanup (`$effect(() => () => controller.stop())`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/components/MessageComposer.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import MessageComposer from '$lib/components/messaging/MessageComposer.svelte';

function setup() {
	const onSend = vi.fn();
	const onTypingChange = vi.fn();
	render(MessageComposer, { props: { onSend, onTypingChange } });
	const input = screen.getByTestId('composer-input') as HTMLTextAreaElement;
	return { onSend, onTypingChange, input };
}

describe('MessageComposer', () => {
	it('signals typing on input', async () => {
		const { onTypingChange, input } = setup();
		await fireEvent.input(input, { target: { value: 'h' } });
		expect(onTypingChange).toHaveBeenCalledWith(true);
	});

	it('sends on Enter with the trimmed value and clears the field', async () => {
		const { onSend, input } = setup();
		await fireEvent.input(input, { target: { value: '  hello  ' } });
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(onSend).toHaveBeenCalledWith('hello');
		expect(input.value).toBe('');
	});

	it('does not send on empty / whitespace', async () => {
		const { onSend, input } = setup();
		await fireEvent.input(input, { target: { value: '   ' } });
		await fireEvent.keyDown(input, { key: 'Enter' });
		expect(onSend).not.toHaveBeenCalled();
	});

	it('Shift+Enter does not send', async () => {
		const { onSend, input } = setup();
		await fireEvent.input(input, { target: { value: 'line' } });
		await fireEvent.keyDown(input, { key: 'Enter', shiftKey: true });
		expect(onSend).not.toHaveBeenCalled();
	});

	it('the send button sends too', async () => {
		const { onSend, input } = setup();
		await fireEvent.input(input, { target: { value: 'hi' } });
		await fireEvent.click(screen.getByTestId('composer-send'));
		expect(onSend).toHaveBeenCalledWith('hi');
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- MessageComposer`
Expected: FAIL — component not found.

- [ ] **Step 3: Create `src/lib/components/messaging/MessageComposer.svelte`**

```svelte
<script lang="ts">
	import { createTypingController } from '$lib/messaging/typing';
	import { Button } from '$lib/components/shadcn';
	import SendIcon from '@lucide/svelte/icons/send';

	let {
		disabled = false,
		onSend,
		onTypingChange,
	}: {
		disabled?: boolean;
		onSend: (body: string) => void;
		onTypingChange: (typing: boolean) => void;
	} = $props();

	let draft = $state('');
	const controller = createTypingController({ emit: onTypingChange });

	$effect(() => () => controller.stop());

	function submit() {
		const body = draft.trim();
		if (!body) return;
		onSend(body);
		draft = '';
		controller.onSend();
	}

	function onKeydown(event: KeyboardEvent) {
		if (event.key === 'Enter' && !event.shiftKey) {
			event.preventDefault();
			submit();
		}
	}
</script>

<div class="flex items-end gap-2 border-t border-border p-3">
	<textarea
		data-testid="composer-input"
		bind:value={draft}
		{disabled}
		rows={1}
		placeholder="Write a message…"
		oninput={() => controller.onKeystroke()}
		onkeydown={onKeydown}
		class="min-h-9 flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
	></textarea>
	<Button data-testid="composer-send" onclick={submit} disabled={disabled || !draft.trim()}>
		<SendIcon class="size-4" />
	</Button>
</div>
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- MessageComposer`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/messaging/MessageComposer.svelte frontend/tests/components/MessageComposer.test.ts
git commit -m "feat(messaging): message composer with typing signal"
```

---

## Task 17: `ThreadListItem.svelte` + `ThreadList.svelte`

**Files:**
- Create: `src/lib/components/messaging/ThreadListItem.svelte`
- Create: `src/lib/components/messaging/ThreadList.svelte`
- Test: `frontend/tests/components/ThreadListItem.test.ts`
- Test: `frontend/tests/components/ThreadList.test.ts`

**Interfaces:**
- Consumes: `MessageThread` (`$lib/queries/messaging`); `threadTitle` (`$lib/messaging/format`); `formatDateCompact` (`$lib/utils/formatting`); `Avatar.svelte`; `Button` (`$lib/components/shadcn`); `PlusIcon` from `@lucide/svelte/icons/plus`.
- Produces:
  - `ThreadListItem.svelte` — props `{ thread: MessageThread; myUserId: string; active: boolean }`.
    - `<a data-testid="thread-item" href={'/messages/' + thread.id} aria-current={active ? 'page' : undefined}>` styled as a row; `bg-muted` when `active`.
    - Left: `<Avatar username={threadTitle(thread, myUserId)} />` (initials of the title string).
    - Middle: title (`font-medium truncate`) + `formatDateCompact(thread.lastMessageAt)` (`text-xs text-muted-foreground`).
    - Right: when `thread.unreadCount > 0`, a `<span data-testid="unread" class="... rounded-full bg-primary text-primary-foreground text-xs ...">{thread.unreadCount}</span>`.
  - `ThreadList.svelte` — props `{ threads: MessageThread[]; myUserId: string; activeThreadId: string | null; loading: boolean; onNewThread: () => void }`.
    - Header row: `"Messages"` + a `<Button data-testid="new-thread" onclick={onNewThread}><PlusIcon class="size-4" /></Button>`.
    - `loading && !threads.length` → a `"Loading…"` line.
    - `!loading && !threads.length` → `<p data-testid="threads-empty">No conversations yet</p>`.
    - else a list of `ThreadListItem` keyed by `thread.id`, passing `active={thread.id === activeThreadId}`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/components/ThreadListItem.test.ts
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/svelte';
import ThreadListItem from '$lib/components/messaging/ThreadListItem.svelte';

const thread = (over = {}) => ({
	id: 't1', title: null,
	participants: [
		{ user: { id: 'u1', username: 'me' }, role: 'OWNER' as const, lastReadSeq: 0, joinedAt: 'x' },
		{ user: { id: 'u2', username: 'alice' }, role: 'MEMBER' as const, lastReadSeq: 0, joinedAt: 'x' },
	],
	lastMessageAt: '2026-09-07T12:00:00Z',
	latestSeq: 3, myLastReadSeq: 3, unreadCount: 0, createdAt: 'x',
	...over,
});

describe('ThreadListItem', () => {
	it('links to the thread and shows the derived title', () => {
		render(ThreadListItem, { props: { thread: thread(), myUserId: 'u1', active: false } });
		const el = screen.getByTestId('thread-item');
		expect(el).toHaveAttribute('href', '/messages/t1');
		expect(el).toHaveTextContent('alice');
	});

	it('shows an unread badge only when unreadCount > 0', () => {
		const { rerender } = render(ThreadListItem, {
			props: { thread: thread({ unreadCount: 0 }), myUserId: 'u1', active: false },
		});
		expect(screen.queryByTestId('unread')).toBeNull();
		rerender({ thread: thread({ unreadCount: 4 }), myUserId: 'u1', active: false });
		expect(screen.getByTestId('unread')).toHaveTextContent('4');
	});

	it('marks the active row with aria-current', () => {
		render(ThreadListItem, { props: { thread: thread(), myUserId: 'u1', active: true } });
		expect(screen.getByTestId('thread-item')).toHaveAttribute('aria-current', 'page');
	});
});
```

```ts
// frontend/tests/components/ThreadList.test.ts
import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';
import ThreadList from '$lib/components/messaging/ThreadList.svelte';

const thread = (id: string) => ({
	id, title: `T ${id}`, participants: [],
	lastMessageAt: '2026-09-07T12:00:00Z',
	latestSeq: 1, myLastReadSeq: 1, unreadCount: 0, createdAt: 'x',
});

describe('ThreadList', () => {
	it('shows an empty state when not loading and no threads', () => {
		render(ThreadList, {
			props: { threads: [], myUserId: 'u1', activeThreadId: null, loading: false, onNewThread: vi.fn() },
		});
		expect(screen.getByTestId('threads-empty')).toBeInTheDocument();
	});

	it('renders a row per thread and fires onNewThread', async () => {
		const onNewThread = vi.fn();
		render(ThreadList, {
			props: {
				threads: [thread('a'), thread('b')],
				myUserId: 'u1', activeThreadId: 'b', loading: false, onNewThread,
			},
		});
		expect(screen.getAllByTestId('thread-item')).toHaveLength(2);
		await fireEvent.click(screen.getByTestId('new-thread'));
		expect(onNewThread).toHaveBeenCalled();
	});
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `cd frontend && pnpm run test:run -- ThreadListItem ThreadList`
Expected: FAIL — components not found.

- [ ] **Step 3: Create `src/lib/components/messaging/ThreadListItem.svelte`**

```svelte
<script lang="ts">
	import type { MessageThread } from '$lib/queries/messaging';
	import { threadTitle } from '$lib/messaging/format';
	import { formatDateCompact } from '$lib/utils/formatting';
	import Avatar from './Avatar.svelte';

	let {
		thread,
		myUserId,
		active,
	}: { thread: MessageThread; myUserId: string; active: boolean } = $props();

	const title = $derived(threadTitle(thread, myUserId));
</script>

<a
	data-testid="thread-item"
	href={'/messages/' + thread.id}
	aria-current={active ? 'page' : undefined}
	class="flex items-center gap-3 rounded-md px-3 py-2 hover:bg-muted/60 {active ? 'bg-muted' : ''}"
>
	<Avatar username={title} />
	<span class="min-w-0 flex-1">
		<span class="block truncate font-medium">{title}</span>
		<span class="block text-xs text-muted-foreground">{formatDateCompact(thread.lastMessageAt)}</span>
	</span>
	{#if thread.unreadCount > 0}
		<span
			data-testid="unread"
			class="inline-flex min-w-5 items-center justify-center rounded-full bg-primary px-1.5 text-xs text-primary-foreground"
		>
			{thread.unreadCount}
		</span>
	{/if}
</a>
```

- [ ] **Step 4: Create `src/lib/components/messaging/ThreadList.svelte`**

```svelte
<script lang="ts">
	import type { MessageThread } from '$lib/queries/messaging';
	import { Button } from '$lib/components/shadcn';
	import PlusIcon from '@lucide/svelte/icons/plus';
	import ThreadListItem from './ThreadListItem.svelte';

	let {
		threads,
		myUserId,
		activeThreadId,
		loading,
		onNewThread,
	}: {
		threads: MessageThread[];
		myUserId: string;
		activeThreadId: string | null;
		loading: boolean;
		onNewThread: () => void;
	} = $props();
</script>

<div class="flex h-full flex-col">
	<div class="flex items-center justify-between border-b border-border p-3">
		<h2 class="text-sm font-semibold">Messages</h2>
		<Button data-testid="new-thread" variant="outline" size="sm" onclick={onNewThread}>
			<PlusIcon class="size-4" />
		</Button>
	</div>

	<div class="min-h-0 flex-1 overflow-y-auto p-2">
		{#if loading && !threads.length}
			<p class="p-3 text-sm text-muted-foreground">Loading…</p>
		{:else if !threads.length}
			<p data-testid="threads-empty" class="p-3 text-sm text-muted-foreground">
				No conversations yet
			</p>
		{:else}
			{#each threads as thread (thread.id)}
				<ThreadListItem {thread} {myUserId} active={thread.id === activeThreadId} />
			{/each}
		{/if}
	</div>
</div>
```

- [ ] **Step 5: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- ThreadListItem ThreadList`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git add src/lib/components/messaging/ThreadListItem.svelte src/lib/components/messaging/ThreadList.svelte frontend/tests/components/ThreadListItem.test.ts frontend/tests/components/ThreadList.test.ts
git commit -m "feat(messaging): thread list and list item"
```

---

## Task 18: `NewThreadDialog.svelte`

**Files:**
- Create: `src/lib/components/messaging/NewThreadDialog.svelte`
- Test: `frontend/tests/components/NewThreadDialog.test.ts`

**Interfaces:**
- Consumes: `createQuery` (`@tanstack/svelte-query`); `graphqlRequest` (`$lib/queries/client`); `LIST_USERS`, `type UsersResponse` (`$lib/queries/users`); `queryKeys`; `useCreateMessageThread` (`$lib/queries/hooks/useCreateMessageThread`); `Dialog*` + `Button` + `Input` (`$lib/components/shadcn`); `Avatar.svelte`.
- Props: `{ open: boolean; onOpenChange: (open: boolean) => void; myUserId: string }`.
- Behaviour:
  - Uses `<Dialog bind:open>` wiring `onOpenChange`.
  - Loads users with `createQuery(() => ({ queryKey: queryKeys.users.list(), queryFn: () => graphqlRequest<UsersResponse>(LIST_USERS), staleTime: 5*60_000 }))`.
  - A text `<Input bind:value={filter} data-testid="user-filter" placeholder="Filter people…">`.
  - The candidate list = users where `u.id !== myUserId` and `u.username` includes `filter` (case-insensitive). Each row is a `<button data-testid="user-option">` toggling membership in a local `Set` `selected` (`$state`). Selected rows show a check / `bg-muted`.
  - A `<Button data-testid="start-thread" disabled={!selected.size || createThread.isPending} onclick={start}>` — `start()` calls `createThread.mutate({ participantUserIds: [...selected] })`. On the hook's own success it navigates and the parent closes the dialog via `onOpenChange(false)` in the button handler right after `mutate`.
  - When `open` goes from `true`→`false`, reset `filter` and `selected` (in an `$effect` keyed on `open`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/components/NewThreadDialog.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
	mockMutate: vi.fn(),
	users: [
		{ id: 'u1', username: 'me' },
		{ id: 'u2', username: 'alice' },
		{ id: 'u3', username: 'bob' },
	],
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn(() => ({ data: { users: mocks.users }, isLoading: false })),
	createMutation: vi.fn(() => ({ mutate: mocks.mockMutate, isPending: false })),
	useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));
vi.mock('$app/navigation', () => ({ goto: vi.fn() }));
vi.mock('svelte-sonner', () => ({ toast: { error: vi.fn(), success: vi.fn() } }));

import NewThreadDialog from '$lib/components/messaging/NewThreadDialog.svelte';

describe('NewThreadDialog', () => {
	beforeEach(() => vi.clearAllMocks());

	it('lists everyone except me and filters by username', async () => {
		render(NewThreadDialog, { props: { open: true, onOpenChange: vi.fn(), myUserId: 'u1' } });
		expect(screen.getAllByTestId('user-option')).toHaveLength(2);
		await fireEvent.input(screen.getByTestId('user-filter'), { target: { value: 'ali' } });
		expect(screen.getAllByTestId('user-option')).toHaveLength(1);
		expect(screen.getByTestId('user-option')).toHaveTextContent('alice');
	});

	it('selecting people enables Start and calls mutate with their ids', async () => {
		const onOpenChange = vi.fn();
		render(NewThreadDialog, { props: { open: true, onOpenChange, myUserId: 'u1' } });
		const [alice, bob] = screen.getAllByTestId('user-option');
		await fireEvent.click(alice);
		await fireEvent.click(bob);
		await fireEvent.click(screen.getByTestId('start-thread'));
		expect(mocks.mockMutate).toHaveBeenCalledWith({ participantUserIds: ['u2', 'u3'] });
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- NewThreadDialog`
Expected: FAIL — component not found.

- [ ] **Step 3: Create `src/lib/components/messaging/NewThreadDialog.svelte`**

```svelte
<script lang="ts">
	import { createQuery } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import { LIST_USERS, type UsersResponse } from '$lib/queries/users';
	import { queryKeys } from '$lib/queries/keys';
	import { useCreateMessageThread } from '$lib/queries/hooks/useCreateMessageThread';
	import {
		Dialog,
		DialogContent,
		DialogHeader,
		DialogTitle,
		DialogFooter,
		Button,
		Input,
	} from '$lib/components/shadcn';

	let {
		open,
		onOpenChange,
		myUserId,
	}: { open: boolean; onOpenChange: (open: boolean) => void; myUserId: string } = $props();

	let filter = $state('');
	let selected = $state(new Set<string>());

	const usersQuery = createQuery(() => ({
		queryKey: queryKeys.users.list(),
		queryFn: () => graphqlRequest<UsersResponse>(LIST_USERS),
		staleTime: 5 * 60_000,
	}));

	const createThread = useCreateMessageThread();

	const candidates = $derived(
		(usersQuery.data?.users ?? [])
			.filter((u) => u.id !== myUserId)
			.filter((u) => u.username.toLowerCase().includes(filter.trim().toLowerCase())),
	);

	$effect(() => {
		if (!open) {
			filter = '';
			selected = new Set();
		}
	});

	function toggle(id: string) {
		const next = new Set(selected);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		selected = next;
	}

	function start() {
		if (!selected.size) return;
		createThread.mutate({ participantUserIds: [...selected] });
		onOpenChange(false);
	}
</script>

<Dialog bind:open onOpenChange={(v) => onOpenChange(v)}>
	<DialogContent>
		<DialogHeader>
			<DialogTitle>New conversation</DialogTitle>
		</DialogHeader>

		<Input data-testid="user-filter" bind:value={filter} placeholder="Filter people…" />

		<div class="max-h-64 overflow-y-auto">
			{#each candidates as u (u.id)}
				<button
					type="button"
					data-testid="user-option"
					onclick={() => toggle(u.id)}
					class="flex w-full items-center gap-2 rounded-md px-2 py-2 text-left text-sm hover:bg-muted/60 {selected.has(
						u.id,
					)
						? 'bg-muted'
						: ''}"
				>
					<span>{u.username}</span>
				</button>
			{/each}
		</div>

		<DialogFooter>
			<Button
				data-testid="start-thread"
				disabled={!selected.size || createThread.isPending}
				onclick={start}
			>
				Start
			</Button>
		</DialogFooter>
	</DialogContent>
</Dialog>
```

- [ ] **Step 4: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- NewThreadDialog`
Expected: PASS (2 tests).
(If shadcn `Dialog` fails to mount in jsdom, wrap the test render the same way `tests/components/AddVideoDialog.test.ts` does — check that file for the established `bits-ui` dialog test pattern and mirror it.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/components/messaging/NewThreadDialog.svelte frontend/tests/components/NewThreadDialog.test.ts
git commit -m "feat(messaging): new-conversation dialog with user picker"
```

---
## Task 19: `ThreadView.svelte` — the conversation pane

**Files:**
- Create: `src/lib/components/messaging/threadView.helpers.ts`
- Create: `src/lib/components/messaging/ThreadView.svelte`
- Test: `frontend/tests/unit/messaging-threadViewHelpers.test.ts`
- Test: `frontend/tests/components/ThreadView.test.ts`

**Interfaces:**
- Consumes: `createQuery`, `useQueryClient` (`@tanstack/svelte-query`); `graphqlRequest`; `GET_MESSAGE_THREAD`, `type GetMessageThreadResponse`, `type Message`, `type MessageThread` (`$lib/queries/messaging`); `queryKeys`; `useMe` (`$lib/queries/hooks/useMe.svelte`); `useThreadMessages` (`$lib/queries/hooks/useThreadMessages.svelte`); `useSendMessage`, `useSetTyping`, `useMarkThreadRead`; `createThreadStream` (`$lib/messaging/useThreadStream.svelte`); `otherParticipants` (`$lib/messaging/format`); components `MessageBubble`, `MessageComposer`, `TypingIndicator`, `ReadReceiptAvatars`, `PresenceDot`, `Avatar`.
- Produces (`threadView.helpers.ts`, pure):
  - `showSenderForIndex(items: Message[], index: number): boolean` — `true` when `index === 0` or the previous message has a different `sender.id`.
  - `lastKnownSeq(items: Message[]): number` — max integer `seq` among non-optimistic items (`Math.floor`), or `0`.
  - `typingUsernames(thread: MessageThread | null, typingUserIds: string[]): string[]` — map ids → usernames via `thread.participants`, dropping unknowns.
  - `shouldMarkRead(thread: MessageThread | null): boolean` — `!!thread && thread.unreadCount > 0`.
- Produces (`ThreadView.svelte`) — props `{ threadId: string }`:
  - Header: `otherParticipants` names + a `PresenceDot` per other participant (state from `stream.presence[userId]`).
  - Body: a scroll container (`data-testid="thread-scroll"`); on `scroll` when `scrollTop < 80` calls `messages.fetchOlder()`. Renders `MessageBubble` for each `messages.query.data.items` with `mine={m.sender.id === myUserId}` and `showSender={showSenderForIndex(items, i)}`. After the last message, `ReadReceiptAvatars` for `lastKnownSeq(items)`.
  - `TypingIndicator` with `typingUsernames(thread, stream.typingUserIds)`.
  - `MessageComposer` with `onSend={(body) => send.mutate({ threadId, body, sender: meUser, afterSeq: lastKnownSeq(items) })}` and `onTypingChange={(typing) => setTyping.mutate({ threadId, typing })}`.
  - `$effect` on `threadId`: `stream.stop(); stream = createThreadStream({ queryClient, getThreadId: () => threadId, myUserId }); stream.start();` and cleanup `stream.stop()`. (Because `createThreadStream` captures `getThreadId` as a thunk, one instance can survive `threadId` changes — but restarting keeps `sinceSeq` correct.)
  - `$effect`: when `shouldMarkRead(thread)` and `messages.query.data`, call `markRead.mutate({ threadId, seq: lastKnownSeq(items) })` (guard: only when `lastKnownSeq > thread.myLastReadSeq`).
  - `$effect`: after `items` length grows, set `scrollEl.scrollTop = scrollEl.scrollHeight` unless the user had scrolled up more than 200px.

- [ ] **Step 1: Write the failing helper test**

```ts
// frontend/tests/unit/messaging-threadViewHelpers.test.ts
import { describe, it, expect } from 'vitest';
import type { Message, MessageThread } from '$lib/queries/messaging';
import {
	showSenderForIndex,
	lastKnownSeq,
	typingUsernames,
	shouldMarkRead,
} from '$lib/components/messaging/threadView.helpers';

const m = (seq: number, senderId: string, id = `m${seq}`): Message => ({
	id, threadId: 't1', seq, body: 'x', createdAt: 'x',
	sender: { id: senderId, username: senderId },
});

const thread = (over: Partial<MessageThread> = {}): MessageThread => ({
	id: 't1', title: null,
	participants: [
		{ user: { id: 'u2', username: 'alice' }, role: 'MEMBER', lastReadSeq: 0, joinedAt: 'x' },
	],
	lastMessageAt: 'x', latestSeq: 5, myLastReadSeq: 5, unreadCount: 0, createdAt: 'x',
	...over,
});

describe('threadView.helpers', () => {
	it('showSenderForIndex is true at 0 and on a sender change', () => {
		const items = [m(1, 'u2'), m(2, 'u2'), m(3, 'u1')];
		expect(showSenderForIndex(items, 0)).toBe(true);
		expect(showSenderForIndex(items, 1)).toBe(false);
		expect(showSenderForIndex(items, 2)).toBe(true);
	});

	it('lastKnownSeq ignores optimistic/fractional rows', () => {
		const items = [m(7, 'u1'), { ...m(0, 'u1', 'optimistic:n1'), seq: 7.5 }];
		expect(lastKnownSeq(items)).toBe(7);
		expect(lastKnownSeq([])).toBe(0);
	});

	it('typingUsernames maps known ids and drops unknowns', () => {
		expect(typingUsernames(thread(), ['u2', 'u9'])).toEqual(['alice']);
		expect(typingUsernames(null, ['u2'])).toEqual([]);
	});

	it('shouldMarkRead reflects unreadCount', () => {
		expect(shouldMarkRead(thread({ unreadCount: 0 }))).toBe(false);
		expect(shouldMarkRead(thread({ unreadCount: 2 }))).toBe(true);
		expect(shouldMarkRead(null)).toBe(false);
	});
});
```

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- messaging-threadViewHelpers`
Expected: FAIL — module not found.

- [ ] **Step 3: Create `src/lib/components/messaging/threadView.helpers.ts`**

```ts
import type { Message, MessageThread } from '$lib/queries/messaging';

export function showSenderForIndex(items: Message[], index: number): boolean {
	if (index <= 0) return true;
	return items[index - 1].sender.id !== items[index].sender.id;
}

export function lastKnownSeq(items: Message[]): number {
	let max = 0;
	for (const m of items) {
		if (m.id.startsWith('optimistic:')) continue;
		const s = Math.floor(m.seq);
		if (s > max) max = s;
	}
	return max;
}

export function typingUsernames(
	thread: MessageThread | null,
	typingUserIds: string[],
): string[] {
	if (!thread) return [];
	return typingUserIds
		.map((id) => thread.participants.find((p) => p.user.id === id)?.user.username)
		.filter((name): name is string => Boolean(name));
}

export function shouldMarkRead(thread: MessageThread | null): boolean {
	return !!thread && thread.unreadCount > 0;
}
```

- [ ] **Step 4: Write the failing component test**

```ts
// frontend/tests/components/ThreadView.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({
	sendMutate: vi.fn(),
	setTypingMutate: vi.fn(),
	markReadMutate: vi.fn(),
	start: vi.fn(),
	stop: vi.fn(),
	messagesData: {
		items: [
			{ id: 'm1', threadId: 't1', seq: 1, body: 'hi', createdAt: 'x', sender: { id: 'u2', username: 'alice' } },
			{ id: 'm2', threadId: 't1', seq: 2, body: 'yo', createdAt: 'x', sender: { id: 'u1', username: 'me' } },
		],
		oldestLoadedSeq: 1,
		hasMoreOlder: false,
	},
	threadData: {
		messageThread: {
			id: 't1', title: null,
			participants: [
				{ user: { id: 'u1', username: 'me' }, role: 'OWNER', lastReadSeq: 2, joinedAt: 'x' },
				{ user: { id: 'u2', username: 'alice' }, role: 'MEMBER', lastReadSeq: 2, joinedAt: 'x' },
			],
			lastMessageAt: 'x', latestSeq: 2, myLastReadSeq: 2, unreadCount: 0, createdAt: 'x',
		},
	},
}));

vi.mock('@tanstack/svelte-query', () => ({
	createQuery: vi.fn(() => ({ data: mocks.threadData, isLoading: false })),
	createMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
	useQueryClient: vi.fn(() => ({ setQueryData: vi.fn(), getQueryData: vi.fn(), invalidateQueries: vi.fn() })),
}));
vi.mock('$lib/queries/client', () => ({ graphqlRequest: vi.fn() }));
vi.mock('$lib/queries/hooks/useMe.svelte', () => ({
	useMe: () => ({ me: { id: 'u1', username: 'me' }, isSettled: true }),
}));
vi.mock('$lib/queries/hooks/useThreadMessages.svelte', () => ({
	useThreadMessages: () => ({
		get query() { return { data: mocks.messagesData, isLoading: false }; },
		get isFetchingOlder() { return false; },
		fetchOlder: vi.fn(),
	}),
}));
vi.mock('$lib/queries/hooks/useSendMessage', () => ({ useSendMessage: () => ({ mutate: mocks.sendMutate }) }));
vi.mock('$lib/queries/hooks/useSetTyping', () => ({ useSetTyping: () => ({ mutate: mocks.setTypingMutate }) }));
vi.mock('$lib/queries/hooks/useMarkThreadRead', () => ({ useMarkThreadRead: () => ({ mutate: mocks.markReadMutate }) }));
vi.mock('$lib/messaging/useThreadStream.svelte', () => ({
	createThreadStream: () => ({
		get typingUserIds() { return []; },
		get presence() { return {}; },
		start: mocks.start,
		stop: mocks.stop,
	}),
}));

import ThreadView from '$lib/components/messaging/ThreadView.svelte';

describe('ThreadView', () => {
	beforeEach(() => vi.clearAllMocks());

	it('renders a bubble per message and starts the stream', () => {
		render(ThreadView, { props: { threadId: 't1' } });
		expect(screen.getAllByTestId('message')).toHaveLength(2);
		expect(mocks.start).toHaveBeenCalled();
	});

	it('composer send routes to the send hook with the thread id and last seq', async () => {
		render(ThreadView, { props: { threadId: 't1' } });
		await fireEvent.input(screen.getByTestId('composer-input'), { target: { value: 'hello' } });
		await fireEvent.click(screen.getByTestId('composer-send'));
		expect(mocks.sendMutate).toHaveBeenCalledWith(
			expect.objectContaining({ threadId: 't1', body: 'hello', afterSeq: 2 }),
		);
	});
});
```

- [ ] **Step 5: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- ThreadView`
Expected: FAIL — component not found.

- [ ] **Step 6: Create `src/lib/components/messaging/ThreadView.svelte`**

```svelte
<script lang="ts">
	import { createQuery, useQueryClient } from '@tanstack/svelte-query';
	import { graphqlRequest } from '$lib/queries/client';
	import {
		GET_MESSAGE_THREAD,
		type GetMessageThreadResponse,
		type MessagingUser,
	} from '$lib/queries/messaging';
	import { queryKeys } from '$lib/queries/keys';
	import { useMe } from '$lib/queries/hooks/useMe.svelte';
	import { useThreadMessages } from '$lib/queries/hooks/useThreadMessages.svelte';
	import { useSendMessage } from '$lib/queries/hooks/useSendMessage';
	import { useSetTyping } from '$lib/queries/hooks/useSetTyping';
	import { useMarkThreadRead } from '$lib/queries/hooks/useMarkThreadRead';
	import { createThreadStream } from '$lib/messaging/useThreadStream.svelte';
	import { otherParticipants } from '$lib/messaging/format';
	import {
		showSenderForIndex,
		lastKnownSeq,
		typingUsernames,
		shouldMarkRead,
	} from './threadView.helpers';
	import MessageBubble from './MessageBubble.svelte';
	import MessageComposer from './MessageComposer.svelte';
	import TypingIndicator from './TypingIndicator.svelte';
	import ReadReceiptAvatars from './ReadReceiptAvatars.svelte';
	import PresenceDot from './PresenceDot.svelte';

	let { threadId }: { threadId: string } = $props();

	const queryClient = useQueryClient();
	const meState = useMe();
	const myUserId = $derived(meState.me?.id ?? '');
	const meUser = $derived<MessagingUser>({
		id: meState.me?.id ?? '',
		username: meState.me?.username ?? '',
	});

	const threadQuery = createQuery(() => ({
		queryKey: queryKeys.messaging.threads.detail(threadId),
		queryFn: async () => {
			const res = await graphqlRequest<GetMessageThreadResponse>(GET_MESSAGE_THREAD, {
				id: threadId,
			});
			return res.messageThread;
		},
		staleTime: 30_000,
	}));

	const messages = useThreadMessages(() => threadId);
	const send = useSendMessage();
	const setTyping = useSetTyping();
	const markRead = useMarkThreadRead();

	const items = $derived(messages.query.data?.items ?? []);
	const thread = $derived(threadQuery.data ?? null);
	const others = $derived(thread ? otherParticipants(thread, myUserId) : []);

	let stream: ReturnType<typeof createThreadStream> | null = null;
	let scrollEl: HTMLDivElement | null = $state(null);

	$effect(() => {
		// re-run when threadId changes
		const id = threadId;
		if (!myUserId) return;
		stream?.stop();
		stream = createThreadStream({ queryClient, getThreadId: () => id, myUserId });
		stream.start();
		return () => stream?.stop();
	});

	$effect(() => {
		const seq = lastKnownSeq(items);
		if (thread && shouldMarkRead(thread) && seq > thread.myLastReadSeq) {
			markRead.mutate({ threadId, seq });
		}
	});

	$effect(() => {
		// autoscroll on growth unless the user scrolled up
		void items.length;
		if (!scrollEl) return;
		const nearBottom =
			scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight < 200;
		if (nearBottom) scrollEl.scrollTop = scrollEl.scrollHeight;
	});

	function onScroll() {
		if (scrollEl && scrollEl.scrollTop < 80) messages.fetchOlder();
	}

	function handleSend(body: string) {
		send.mutate({ threadId, body, sender: meUser, afterSeq: lastKnownSeq(items) });
	}
</script>

<div class="flex h-full flex-col">
	<div class="flex items-center gap-2 border-b border-border p-3">
		<span class="font-semibold">
			{others.map((u) => u.username).join(', ') || 'Just you'}
		</span>
		{#each others as u (u.id)}
			<PresenceDot state={stream?.presence[u.id]} />
		{/each}
	</div>

	<div
		bind:this={scrollEl}
		data-testid="thread-scroll"
		onscroll={onScroll}
		class="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto p-3"
	>
		{#if messages.isFetchingOlder}
			<p class="text-center text-xs text-muted-foreground">Loading earlier messages…</p>
		{/if}
		{#each items as message, i (message.id)}
			<MessageBubble
				{message}
				mine={message.sender.id === myUserId}
				showSender={showSenderForIndex(items, i)}
			/>
		{/each}
		{#if thread && items.length}
			<div class="flex justify-end">
				<ReadReceiptAvatars
					participants={thread.participants}
					seq={lastKnownSeq(items)}
					{myUserId}
				/>
			</div>
		{/if}
	</div>

	<TypingIndicator usernames={typingUsernames(thread, stream?.typingUserIds ?? [])} />

	<MessageComposer
		onSend={handleSend}
		onTypingChange={(typing) => setTyping.mutate({ threadId, typing })}
	/>
</div>
```

- [ ] **Step 7: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- messaging-threadViewHelpers ThreadView`
Expected: PASS (6 tests).

- [ ] **Step 8: Commit**

```bash
git add src/lib/components/messaging/threadView.helpers.ts src/lib/components/messaging/ThreadView.svelte frontend/tests/unit/messaging-threadViewHelpers.test.ts frontend/tests/components/ThreadView.test.ts
git commit -m "feat(messaging): conversation pane wiring history, stream, composer"
```

---

## Task 20: Routes — `/messages` shell, index, and `[threadId]`

**Files:**
- Create: `src/routes/messages/+layout.svelte`
- Create: `src/routes/messages/+page.svelte`
- Create: `src/routes/messages/[threadId]/+page.svelte`
- Test: `frontend/tests/components/MessagesLayout.test.ts`

**Interfaces:**
- Consumes: `page` (`$app/state`); `useMe` (`$lib/queries/hooks/useMe.svelte`); `useMessageThreads` (`$lib/queries/hooks/useMessageThreads`); `ThreadList`, `NewThreadDialog`, `ThreadView` (`$lib/components/messaging/`).
- Produces:
  - `+layout.svelte` — two-column flex (`h-[calc(100vh-4rem)]`): left column `w-full md:w-80 border-r` holds `ThreadList` (hidden on mobile when a thread is open: `class:hidden={mobileThreadOpen}` where `mobileThreadOpen = $derived(!!page.params.threadId)` with `md:block`). Right column `flex-1` renders `{@render children()}`. Holds `NewThreadDialog` state (`let dialogOpen = $state(false)`), passes `onNewThread={() => (dialogOpen = true)}` to `ThreadList`. `myUserId` from `useMe`. `activeThreadId = $derived(page.params.threadId ?? null)`. Threads from `useMessageThreads()`.
  - `+page.svelte` — a centered muted `"Select a conversation"` placeholder (`data-testid="messages-empty"`).
  - `[threadId]/+page.svelte` — `<ThreadView threadId={page.params.threadId} />` (key the component on the id so it fully remounts per thread: `{#key page.params.threadId}<ThreadView .../>{/key}`).

- [ ] **Step 1: Write the failing test**

```ts
// frontend/tests/components/MessagesLayout.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/svelte';

const state = vi.hoisted(() => ({ params: {} as Record<string, string> }));

vi.mock('$app/state', () => ({ page: state }));
vi.mock('$lib/queries/hooks/useMe.svelte', () => ({
	useMe: () => ({ me: { id: 'u1', username: 'me' }, isSettled: true }),
}));
vi.mock('$lib/queries/hooks/useMessageThreads', () => ({
	useMessageThreads: () => ({ data: { messageThreads: [] }, isLoading: false }),
}));
vi.mock('$lib/components/messaging/NewThreadDialog.svelte', () => ({
	default: vi.fn(() => ({ $$: {}, $set: vi.fn(), $on: vi.fn(), $destroy: vi.fn() })),
}));

import MessagesLayout from '$routes/messages/+layout.svelte';

// NOTE: `$routes` is not a real alias — import via a relative path in the actual test:
//   import MessagesLayout from '../../src/routes/messages/+layout.svelte';

describe('messages layout', () => {
	beforeEach(() => {
		vi.clearAllMocks();
		state.params = {};
	});

	it('renders the thread list column with a New button', () => {
		render(MessagesLayout, { props: { children: () => null } });
		expect(screen.getByTestId('new-thread')).toBeInTheDocument();
		expect(screen.getByTestId('threads-empty')).toBeInTheDocument();
	});
});
```

> Use the relative import shown in the NOTE — there is no `$routes` alias in this project.

- [ ] **Step 2: Run it, expect failure**

Run: `cd frontend && pnpm run test:run -- MessagesLayout`
Expected: FAIL — route component not found.

- [ ] **Step 3: Create `src/routes/messages/+layout.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import { useMe } from '$lib/queries/hooks/useMe.svelte';
	import { useMessageThreads } from '$lib/queries/hooks/useMessageThreads';
	import ThreadList from '$lib/components/messaging/ThreadList.svelte';
	import NewThreadDialog from '$lib/components/messaging/NewThreadDialog.svelte';

	let { children } = $props();

	const meState = useMe();
	const myUserId = $derived(meState.me?.id ?? '');
	const threadsQuery = useMessageThreads();

	let dialogOpen = $state(false);

	const activeThreadId = $derived(page.params.threadId ?? null);
	const mobileThreadOpen = $derived(!!page.params.threadId);
</script>

<div class="flex h-[calc(100vh-4rem)]">
	<div
		class="w-full border-r border-border md:block md:w-80 {mobileThreadOpen ? 'hidden' : ''}"
	>
		<ThreadList
			threads={threadsQuery.data?.messageThreads ?? []}
			{myUserId}
			{activeThreadId}
			loading={threadsQuery.isLoading}
			onNewThread={() => (dialogOpen = true)}
		/>
	</div>
	<div class="min-w-0 flex-1">
		{@render children()}
	</div>
</div>

<NewThreadDialog open={dialogOpen} onOpenChange={(v) => (dialogOpen = v)} {myUserId} />
```

- [ ] **Step 4: Create `src/routes/messages/+page.svelte`**

```svelte
<div
	data-testid="messages-empty"
	class="flex h-full items-center justify-center text-sm text-muted-foreground"
>
	Select a conversation
</div>
```

- [ ] **Step 5: Create `src/routes/messages/[threadId]/+page.svelte`**

```svelte
<script lang="ts">
	import { page } from '$app/state';
	import ThreadView from '$lib/components/messaging/ThreadView.svelte';
</script>

{#key page.params.threadId}
	<ThreadView threadId={page.params.threadId} />
{/key}
```

- [ ] **Step 6: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- MessagesLayout`
Expected: PASS (1 test).

- [ ] **Step 7: Commit**

```bash
git add src/routes/messages frontend/tests/components/MessagesLayout.test.ts
git commit -m "feat(messaging): /messages routes and two-pane shell"
```

---

## Task 21: Header link + inbox stream mount

**Files:**
- Modify: `src/lib/components/Header.svelte`
- Modify: `src/routes/+layout.svelte`
- Create: `src/lib/components/messaging/InboxStreamMount.svelte`
- Test: `frontend/tests/components/Header.test.ts` (extend)
- Test: `frontend/tests/components/InboxStreamMount.test.ts`

**Interfaces:**
- Consumes: `useMessageThreads` (`$lib/queries/hooks/useMessageThreads`); `totalUnread` (`$lib/messaging/inboxCache`); `createInboxStream` (`$lib/messaging/useInboxStream.svelte`); `useQueryClient` (`@tanstack/svelte-query`).
- Produces:
  - `Header.svelte` — add `{ href: '/messages', label: 'Messages' }` to `navLinks`. Next to the "Messages" link, when `unread > 0`, render `<span data-testid="nav-unread" class="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-xs">{unread}</span>`. `unread` comes from `const threads = useMessageThreads(); const unread = $derived(totalUnread(threads.data?.messageThreads ?? []));`. (The link renders for signed-in users; it is fine to always show it — an unauthenticated visitor never reaches an authed route, and `<Show when="signed-in">` already gates the app shell.)
  - `InboxStreamMount.svelte` — no markup. `const qc = useQueryClient(); const stream = createInboxStream(qc); $effect(() => { stream.start(); return () => stream.stop(); });`
  - `+layout.svelte` — inside `<Show when="signed-in">`, above `<OnboardingShell />`, add `<InboxStreamMount />`.

- [ ] **Step 1: Write the failing tests**

```ts
// frontend/tests/components/InboxStreamMount.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/svelte';

const mocks = vi.hoisted(() => ({ start: vi.fn(), stop: vi.fn() }));

vi.mock('@tanstack/svelte-query', () => ({ useQueryClient: vi.fn(() => ({})) }));
vi.mock('$lib/messaging/useInboxStream.svelte', () => ({
	createInboxStream: () => ({ start: mocks.start, stop: mocks.stop }),
}));

import InboxStreamMount from '$lib/components/messaging/InboxStreamMount.svelte';

describe('InboxStreamMount', () => {
	beforeEach(() => vi.clearAllMocks());

	it('starts the inbox stream on mount and stops on unmount', () => {
		const { unmount } = render(InboxStreamMount);
		expect(mocks.start).toHaveBeenCalledTimes(1);
		unmount();
		expect(mocks.stop).toHaveBeenCalledTimes(1);
	});
});
```

For `Header.test.ts`, add a case (mirror the file's existing mock style; it already mocks `svelte-clerk` and `AddVideoPopover` — add a mock for the two new imports):

```ts
// add near the other vi.mock calls in tests/components/Header.test.ts
vi.mock('$lib/queries/hooks/useMessageThreads', () => ({
	useMessageThreads: () => ({ data: { messageThreads: [{ id: 't1', unreadCount: 3, title: null, participants: [], lastMessageAt: 'x', latestSeq: 3, myLastReadSeq: 0, createdAt: 'x' }] } }),
}));

// add inside describe(...)
it('shows a Messages nav link with the unread total', () => {
	renderHeader();
	const link = screen.getByRole('link', { name: /messages/i });
	expect(link).toHaveAttribute('href', '/messages');
	expect(screen.getByTestId('nav-unread')).toHaveTextContent('3');
});
```

- [ ] **Step 2: Run them, expect failure**

Run: `cd frontend && pnpm run test:run -- InboxStreamMount Header`
Expected: FAIL — `InboxStreamMount` missing; Header has no `/messages` link.

- [ ] **Step 3: Create `src/lib/components/messaging/InboxStreamMount.svelte`**

```svelte
<script lang="ts">
	import { useQueryClient } from '@tanstack/svelte-query';
	import { createInboxStream } from '$lib/messaging/useInboxStream.svelte';

	const queryClient = useQueryClient();
	const stream = createInboxStream(queryClient);

	$effect(() => {
		stream.start();
		return () => stream.stop();
	});
</script>
```

- [ ] **Step 4: Edit `src/lib/components/Header.svelte`**

Add the imports:
```ts
	import { useMessageThreads } from '$lib/queries/hooks/useMessageThreads';
	import { totalUnread } from '$lib/messaging/inboxCache';
```
Add after the existing `navLinks` const:
```ts
	const threads = useMessageThreads();
	const unread = $derived(totalUnread(threads.data?.messageThreads ?? []));
```
Add `{ href: '/messages', label: 'Messages' }` to the `navLinks` array. In the `{#each navLinks ...}` block, after the link label text, add:
```svelte
					{#if link.href === '/messages' && unread > 0}
						<span
							data-testid="nav-unread"
							class="ml-1 rounded-full bg-primary-foreground/20 px-1.5 text-xs"
						>{unread}</span>
					{/if}
```

- [ ] **Step 5: Edit `src/routes/+layout.svelte`**

Add the import next to the other component imports:
```ts
	import InboxStreamMount from '$lib/components/messaging/InboxStreamMount.svelte';
```
Inside `<Show when="signed-in">`, immediately before `<OnboardingShell />`:
```svelte
				<InboxStreamMount />
```

- [ ] **Step 6: Run tests, expect pass**

Run: `cd frontend && pnpm run test:run -- InboxStreamMount Header`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/lib/components/Header.svelte src/routes/+layout.svelte src/lib/components/messaging/InboxStreamMount.svelte frontend/tests/components/InboxStreamMount.test.ts frontend/tests/components/Header.test.ts
git commit -m "feat(messaging): header link with unread badge and inbox stream mount"
```

---

## Task 22: Full verification & PR

**Files:** none (verification + PR only).

- [ ] **Step 1: Type-check**

Run: `cd frontend && pnpm run check`
Expected: 0 errors. Fix any type errors before proceeding (common cause: a `queryKey` factory returns a readonly tuple — cast with `as unknown as` only if TanStack's overloads reject it, otherwise adjust the call site).

- [ ] **Step 2: Full frontend test suite**

Run: `cd frontend && pnpm run test:run`
Expected: all pass (the pre-existing suite plus every `messaging-*`, `hooks-*messaging*`, and new component test). If `messaging-useThreadStream` or `messaging-typing` is flaky under the full run, check for a leaked real timer — every `setInterval`/`setTimeout` path in this plan is injectable; the test must use `vi.useFakeTimers()` or the injected clock.

- [ ] **Step 3: Prettier**

Run: `cd frontend && pnpm exec prettier --write src/lib/messaging src/lib/queries/messaging.ts src/lib/queries/hooks src/lib/components/messaging src/routes/messages tests`
Expected: files reformatted in place, no errors.

- [ ] **Step 4: Stale-reference grep**

Run: `git grep -n "ws-client\.ts\b" -- frontend` (should be empty — the file is `ws-client.svelte.ts`).
Run: `git grep -n "messages-frontend" -- docs` (sanity: plan filename only).

- [ ] **Step 5: Build**

Run: `cd frontend && pnpm run build`
Expected: adapter-static build succeeds; `build/_headers` and `build/_redirects` still present.

- [ ] **Step 6: Commit any formatting/type fixups**

```bash
git add -A
git commit -m "chore(messaging): prettier + type fixups"
```

- [ ] **Step 7: Session reflection, then open the PR**

Run the `/revise-claude-md` command (required by the pre-PR hook — it cannot be called via the Skill tool). If it surfaces no learnings, proceed straight to the PR.

Push and open the PR **against the messaging backend branch**, using `gh api` (not `gh pr create`), shaped to `.github/PULL_REQUEST_TEMPLATE/feature.md`:

```bash
git push -u origin feature/messaging-frontend
gh api repos/CodeWarrior-debug/perspectize/pulls \
  -f title="feat(messaging): SvelteKit messaging client — threads, realtime, receipts, presence" \
  -f head="feature/messaging-frontend" \
  -f base="worktree-feature+messaging-architecture-research" \
  -F body=@<path-to-filled-template>
```

PR body must:
- Fill **Feature Description**, **Technical Changes** (WS client, cache-reducer approach, hooks, components, routes), **Test Plan** (unit + component coverage; note browser verification is local-only per CLAUDE.md and deferred to a local session).
- State the base branch is the messaging backend branch and this PR should merge only after (or together with) it.
- Leave the **Demo** screenshot table with a note that UI screenshots are pending a local self-verification session (no Clerk sign-in available in cloud/CI).
- End with:
  ```
  🤖 Generated with [Claude Code](https://claude.com/claude-code)
  ```

- [ ] **Step 8: Report**

Summarise: files added, test counts, `pnpm run check` / `pnpm run test:run` / `pnpm run build` results (paste the summary lines), and the PR URL.

---

## Self-Review

**Spec coverage**

| Spec "Frontend integration" point | Task |
|---|---|
| Add `graphql-ws`; one shared browser-only WS client to `VITE_GRAPHQL_URL` (ws/wss), lazy | Task 1, Task 8 |
| Clerk token via `connectionParams`, refreshed each reconnect | Task 8 (`connectionParams` async fn re-invoked by graphql-ws on every connect) |
| Queries/mutations stay on `graphql-request` + TanStack, function-wrapper, `queryKey` mirrors variables | Tasks 3, 9–11 |
| Subscription events folded into TanStack cache via `setQueryData`, no parallel store | Tasks 4–5, 12–13 |
| On reconnect: re-subscribe `threadEvents(threadId, sinceSeq)` + invalidate thread list | Task 13 (`StreamReset`/restart with `nextSinceSeq`), Task 12 (unknown-thread invalidate) |
| Components: ThreadList, ThreadView (virtualized list), MessageComposer, TypingIndicator, ReadReceiptAvatars | Tasks 15–19 (note: plain `overflow-y-auto` list, not a virtualization lib — YAGNI at the 1,000-message cap; called out below) |
| Typing: `true` on first keystroke, `false` on send / 5s idle | Task 7, Task 16 |
| No service worker changes | Confirmed — no PWA/SW files touched |
| WS connects to backend origin directly | Task 8 (`wsEndpoint` derives from `VITE_GRAPHQL_URL`, the backend origin) |
| Presence per open thread | Task 13 (`presenceReducer`), Task 19 header dots |
| Offline replay on reconnect | Task 13 `sinceSeq` + backend `threadEvents` replay contract |

**Deviations from the spec (intentional, YAGNI):**
- **No virtualization library** for the message list. The thread history is hard-capped near 1,000 messages server-side and paged in 40 at a time; a plain scroll container with load-older-on-scroll is enough and avoids a new dependency. If profiling later shows jank, swapping in `@tanstack/svelte-virtual` is a localized change inside `ThreadView.svelte`.
- **`messageThreads` is fetched once with default paging** (no infinite scroll on the thread list). The inbox is small for v1; add paging when a user reasonably has >50 threads.
- **`addThreadParticipants` ADDED events** don't synthesize a participant client-side (no user object on the event) — the reducer is a no-op for ADDED and the thread detail is invalidated/refetched instead (Task 11).

**Placeholder scan:** none — every step has literal code or a literal command.

**Type consistency:** `ThreadMessagesCache` shape (`items`/`oldestLoadedSeq`/`hasMoreOlder`) is defined in Task 4 and consumed unchanged in Tasks 6, 9, 10, 13, 19. `SendArgs.__nonce` is written in `onMutate` and read in `mutationFn`/`onError`/`onSuccess` (Task 10) — matches the test. `queryKeys.messaging.*` signatures (Task 2) match every call site. `subscribeGraphql`/`createThreadStream`/`createInboxStream` signatures match their tests.

---

## Execution Handoff

Plan complete and saved to `docs/superpowers/plans/2026-09-07-messaging-frontend.md`. Two execution options:

**1. Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints for review.

Which approach?
