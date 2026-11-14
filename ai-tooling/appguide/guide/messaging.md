# Messaging

**Route:** /messages, /messages/[threadId]
**Summary:** Messaging is direct conversation between users, separate from perspectives and content. You reach it from the floating messages button that appears once you're signed in, which opens a panel where you can see your conversations, start a new one, and read and reply without leaving the page you're on.

## messaging.open
**Task:** Open your messages
**Where:** Floating messages button
**Steps:**
1. Select the round speech-bubble button that floats over the page (bottom-right corner by default). While the panel is closed it shows the total number of unread messages as a badge, when you have any.
2. The panel opens on your list of conversations, unless you left a conversation open when you last closed it: then it reopens on that conversation, and the left-arrow button at the top returns you to the list. Each row shows the other people's names, the month and year of the latest message (for example "Nov '26"), and an unread count when that conversation has unread messages.
3. To close the panel, select the same button again (it shows an X while the panel is open).
**Notes:** The button and panel only appear once you're signed in. `/messages` and `/messages/[threadId]` also exist as plain page routes (for example when following a link straight to a conversation), but the floating button is the normal way in.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/MessagingWidget.svelte`, `frontend/src/lib/components/messaging/ThreadList.svelte`, `frontend/src/lib/components/messaging/ThreadListItem.svelte`, `frontend/src/routes/+layout.svelte`, `frontend/src/routes/messages/+page.svelte`, `frontend/src/routes/messages/+layout.svelte`

## messaging.move-button
**Task:** Move the floating messages button somewhere else on the screen
**Where:** Floating messages button
**Steps:**
1. Press and hold the button (mouse or finger) for about 0.4 seconds without moving (with a mouse the cursor turns into a grabbing hand once the button is picked up; a touch screen shows no clear sign).
2. Without letting go, drag it to where you want it.
3. Release. The button stays where you dropped it, and the panel opens next to it from then on.
**Notes:** Releasing after a drag does not open or close the panel. If you move the pointer more than about 8 pixels before the hold completes, the pickup is cancelled and the button stays where it was. The spot is remembered on this device and browser, and the button is kept fully on screen if the window gets smaller.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/MessagingWidget.svelte`, `frontend/src/lib/components/messaging/fabPosition.ts`

## messaging.start-conversation
**Task:** Start a new conversation
**Where:** Messages panel → plus button
**Steps:**
1. Open your messages, on the list of conversations (select the left-arrow button at the top first if a conversation is open).
2. Select the plus (+) button at the right end of the panel's top row, opposite the "Messages" heading.
3. In the "New conversation" dialog, type in the "Filter people…" box to narrow the list, then select one or more names (a selected name is highlighted; select it again to remove it).
4. Select **Start**.
**Not supported:** Adding people to a conversation that already exists, or leaving one.
**Notes:** **Start** stays disabled until you pick at least one person. Picking more than one person creates a group conversation with all of them. The list excludes yourself and the filter matches usernames only. Once it is created, the new conversation opens in the panel.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/ThreadList.svelte`, `frontend/src/lib/components/messaging/NewThreadDialog.svelte`, `frontend/src/lib/components/messaging/MessagingWidget.svelte`

## messaging.read-and-reply
**Task:** Read a conversation and send a reply
**Where:** Messages panel → a conversation
**Steps:**
1. Open your messages, on the list of conversations (select the left-arrow button at the top first if a conversation is open).
2. Select a conversation from the list to open it. It lands on the first message from someone else that you haven't read yet, or on the latest message when you're caught up.
3. Scroll up to read earlier messages; scrolling close to the top loads older ones ("Loading earlier messages…").
4. Type a reply in the "Write a message…" box and press Enter (Shift+Enter starts a new line), or select the send button next to the box.
5. To return to your conversation list, select the left-arrow button at the top of the panel.
**Not supported:** Emoji reactions, and file or image attachments. Messages are plain text.
**Notes:** Opening a conversation marks it read. Each message shows the time it was sent, and your own message shows "· sending…" beside the time until it is confirmed. The conversation header shows the other people's names, or "Just you" when nobody else is in it.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/ThreadView.svelte`, `frontend/src/lib/components/messaging/threadView.helpers.ts`, `frontend/src/lib/components/messaging/MessageComposer.svelte`, `frontend/src/lib/components/messaging/MessageBubble.svelte`, `frontend/src/lib/components/messaging/MessagingWidget.svelte`

## messaging.edit-delete-message
**Task:** Edit or delete a message you sent
**Where:** Messages panel → a conversation → one of your own messages
**Steps:**
1. Open the conversation and hover the mouse pointer over a message you sent. A small toolbar with a pencil (Edit message) and a trash can (Delete message) appears.
2. To edit, select the pencil, change the text in the box that replaces the message, then press Enter or select the check mark to save. Press Escape or select the X to cancel.
3. To delete, select the trash can. The message turns into "message deleted" right away, with no confirmation step.
**Not supported:** Editing or deleting other people's messages, and bringing a deleted message back.
**Notes:** The toolbar appears only on hover, so a device with no mouse or trackpad (a phone or tablet) does not show it, and the keyboard does not reach it. An edited message is marked "(edited)". A deleted message shows as "message deleted" for everyone in the conversation. Saving an edit with the text unchanged or empty does nothing.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/MessageBubble.svelte`, `frontend/src/lib/components/messaging/MessagingWidget.svelte`, `frontend/src/lib/queries/messaging/useEditMessage.ts`, `frontend/src/lib/queries/messaging/useDeleteMessage.ts`

## messaging.open-links
**Task:** Open a link someone sent in a message
**Where:** Messages panel → a conversation → a link inside a message
**Steps:**
1. Open the conversation and select the underlined link in the message. Any web address starting with http:// or https:// in a message becomes a link automatically.
2. A link to another website opens in a new browser tab.
3. A link to a page inside Perspectize opens a small menu instead. Choose **Open in new tab** to see that page in a new browser tab, or **Go there** to open it in the current tab.
**Notes:** Holding Ctrl, Cmd, Shift or Alt while selecting a link, or middle-clicking it, skips the menu and leaves it to the browser. Sentence punctuation right after a pasted address is not part of the link, and addresses without http:// or https:// (such as www.example.com) stay plain text.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/MessageBubble.svelte`, `frontend/src/lib/components/messaging/MessageLink.svelte`, `frontend/src/lib/components/messaging/linkify.ts`

## messaging.presence-typing-receipts
**Task:** Understand the online, typing, and read indicators in a conversation
**Where:** Conversation header, the space above the message box, and the end of the message list
**Steps:**
1. Open a conversation.
2. In the header, after the names, there is one dot for each other person: green when they're online, gray when they're not.
3. While someone is typing, a line above the message box reads "<name> is typing…". Two people read "<name> and <name> are typing…"; with three or more it names two and counts the rest, such as "<name>, <name> and 1 other are typing…".
4. After the latest message, small circles with people's initials show who has read the conversation up to that point (up to three, then "+N" for the rest).
**Notes:** Live updates (new messages, typing, online dots) pause after about 5 minutes without any mouse, keyboard, touch or scroll activity, and resume when you next interact with the page.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/ThreadView.svelte`, `frontend/src/lib/components/messaging/PresenceDot.svelte`, `frontend/src/lib/components/messaging/TypingIndicator.svelte`, `frontend/src/lib/components/messaging/ReadReceiptAvatars.svelte`, `frontend/src/lib/messaging/format.ts`, `frontend/src/lib/messaging/streamIdle.svelte.ts`

## messaging.mute-thread
**Task:** Mute or unmute a conversation
**Where:** Messages panel → conversation list row
**Steps:**
1. Open your messages, on the list of conversations (select the left-arrow button at the top first if a conversation is open).
2. Hover the mouse pointer over a conversation in the list. A small bell button appears at the right end of the row: a crossed-out bell with the tooltip "Mute notifications" when the conversation is not muted, and a plain bell with the tooltip "Unmute" when it is.
3. Select it to mute or unmute that conversation.
**Notes:** The bell button is revealed only by hovering, so a device with no mouse or trackpad (a phone or tablet) shows it invisibly: tapping its spot at the right end of the row still mutes or unmutes. A muted conversation shows a small crossed-out bell next to its name in the list, and the app shows no other effect of muting. Muting does not change unread counts: a muted conversation still shows its unread badge and still counts toward the number on the floating button.
**Sign-in required:** yes
**Source:** `frontend/src/lib/components/messaging/ThreadListItem.svelte`, `frontend/src/lib/queries/messaging/useMuteThread.ts`
