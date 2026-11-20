# Messaging

Conversations between users, delivered live.

## Language

**Thread**:
A conversation between one or more users, with an optional title.
_Avoid_: Chat, conversation, channel

**Participant**:
A user's membership of a thread, with a role, a read position, a muted flag and a joined and left time.

**Thread role**:
Owner (the creator) or member.

**Active participant**:
A participant who has not left.

**Message**:
One post in a thread. It can be edited, and deleting it leaves a tombstone.

**Tombstone**:
What remains of a deleted message: the row and its place stay, the body is blank.

**Sequence number**:
A message's place within its thread. Gaps are possible once old messages are pruned.

**Client nonce**:
The sender's own token that makes a retried send safe: a duplicate returns the first message.

**Read position**:
The last message a participant has read. Read receipts are derived from it.

**Unread count**:
How many messages in a thread are newer than the viewer's read position.

**Muted**:
A participant's choice to stop notifications from a thread.

**Presence**:
Whether a user is online or offline, with a short grace period before going offline.

**Typing indicator**:
A brief signal that a participant is typing.

**Inbox**:
A user's list of threads, each with its latest message and unread count.

**Retention cap**:
Only the newest messages of a thread are kept.

**Messaging widget**:
The chat button, shown only to signed-in users.
