# Messaging

**Route:** /messages, /messages/[threadId]
**Summary:** Messaging is direct conversation between users, separate from perspectives and content. You reach it from the floating messages button that appears in the corner once you're signed in, which opens a panel to see your conversations, start a new one, and read and reply without leaving the page you're on.

## messaging.open
**Task:** Open your messages
**Where:** Floating messages button
**Steps:**
1. Select the round message-circle button that floats over the page (it shows a count badge when you have unread messages).
2. The panel opens showing your list of conversations.
**Notes:** The button and panel only appear once you're signed in. `/messages` and `/messages/[threadId]` also exist as plain page routes (e.g. following a link straight to a thread), but the floating button is the normal way in.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/MessagingWidget.svelte`, `frontend/src/routes/+layout.svelte`, `frontend/src/routes/messages/+page.svelte`

## messaging.start-conversation
**Task:** Start a new conversation
**Where:** Messages panel → new-conversation button
**Steps:**
1. Open your messages.
2. Select the button next to "Messages" at the top of the panel (a plus icon).
3. In the "New conversation" dialog, type in the filter box to narrow the list of people, and select one or more names to add them.
4. Select **Start**.
**Notes:** Selecting more than one person creates a group conversation with all of them. The people list excludes yourself and only searches by username.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/ThreadList.svelte`, `frontend/src/lib/components/messaging/NewThreadDialog.svelte`, `frontend/src/lib/components/messaging/MessagingWidget.svelte`

## messaging.read-and-reply
**Task:** Read a conversation and send a reply
**Where:** Messages panel → a conversation
**Steps:**
1. Open your messages.
2. Select a conversation from the list to open it.
3. Read messages in the thread; scrolling to the top loads earlier messages.
4. Type a reply in the text box at the bottom and press Enter (Shift+Enter for a new line), or select the send button.
**Notes:** Opening a conversation marks it read. Your own messages can be edited or deleted: hovering over one of your messages reveals a pencil (edit) and trash (delete) icon; a deleted message shows as "message deleted" to everyone. An edited message is marked "(edited)".
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/ThreadView.svelte`, `frontend/src/lib/components/messaging/MessageComposer.svelte`, `frontend/src/lib/components/messaging/MessageBubble.svelte`

## messaging.presence-typing-receipts
**Task:** Understand the online, typing, and read indicators in a conversation
**Where:** Conversation header, bottom of the message list, and above the composer
**Steps:**
1. Open a conversation.
2. A dot next to each other participant's name in the header is green when they're online, gray when they're not.
3. While someone is typing, a line above the message box reads "<name> is typing…" (or lists multiple names).
4. Small avatars below the latest message show which other participants have read up to that point.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/ThreadView.svelte`, `frontend/src/lib/components/messaging/PresenceDot.svelte`, `frontend/src/lib/components/messaging/TypingIndicator.svelte`, `frontend/src/lib/components/messaging/ReadReceiptAvatars.svelte`

## messaging.mute-thread
**Task:** Mute or unmute a conversation
**Where:** Messages panel → conversation list row
**Steps:**
1. Open your messages.
2. Hover over a conversation in the list to reveal a bell icon on the right.
3. Select it to mute or unmute that conversation.
**Notes:** A muted conversation shows a bell-off icon next to its name in the list.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/ThreadListItem.svelte`, `frontend/src/lib/queries/messaging/useMuteThread.ts`
