package domain

import "time"

// Identity is the authenticated principal, resolved from a Clerk token by a
// TokenVerifier. It is transport-agnostic (HTTP middleware and the WebSocket
// InitFunc both produce it).
type Identity struct {
	UserID   int
	ClerkID  string
	Username string
}

// EventEnvelope is the decoded pg_notify('thread_events', ...) payload.
type EventEnvelope struct {
	Type      string `json:"type"`
	ThreadID  int    `json:"thread_id"`
	Seq       int64  `json:"seq"`
	MessageID int64  `json:"message_id"`
	// Ephemeral-only fields (absent for MESSAGE_POSTED):
	UserID      int    `json:"user_id,omitempty"`
	Typing      bool   `json:"typing,omitempty"`
	LastReadSeq int64  `json:"last_read_seq,omitempty"`
	Change      string `json:"change,omitempty"`
	State       string `json:"state,omitempty"`
}

// ThreadEvent is a marker interface for events delivered on a thread's real-time event stream.
type ThreadEvent interface{ isThreadEvent() }

// MessagePostedEvent is delivered when a new message is persisted to a thread.
type MessagePostedEvent struct{ Message Message }

// ReadReceiptChangedEvent is delivered when a user's read receipt position changes.
type ReadReceiptChangedEvent struct {
	ThreadID    int
	UserID      int
	LastReadSeq int64
}

// TypingChangedEvent is delivered when a user's typing status changes.
type TypingChangedEvent struct {
	ThreadID int
	UserID   int
	Typing   bool
}

// ParticipantChangedEvent is delivered when a participant is added to or removed from the thread.
type ParticipantChangedEvent struct {
	ThreadID int
	UserID   int
	Change   string // "ADDED" | "REMOVED"
}

// PresenceChangedEvent is delivered when a participant's presence state changes.
type PresenceChangedEvent struct {
	ThreadID int
	UserID   int
	State    PresenceState
}

// StreamResetEvent signals that the event stream should be reset (e.g., on reconnect).
type StreamResetEvent struct{ ThreadID int }

// MessageEditedEvent is delivered when a message's body is edited.
type MessageEditedEvent struct{ Message Message }

// MessageDeletedEvent is delivered when a message is tombstoned (row and seq kept, body blanked).
type MessageDeletedEvent struct {
	ThreadID  int
	MessageID int64
	Seq       int64
}

func (MessagePostedEvent) isThreadEvent()      {}
func (ReadReceiptChangedEvent) isThreadEvent() {}
func (TypingChangedEvent) isThreadEvent()      {}
func (ParticipantChangedEvent) isThreadEvent() {}
func (PresenceChangedEvent) isThreadEvent()    {}
func (StreamResetEvent) isThreadEvent()        {}
func (MessageEditedEvent) isThreadEvent()      {}
func (MessageDeletedEvent) isThreadEvent()     {}

// InboxEvent represents a summary of a thread in a user's inbox.
type InboxEvent struct {
	ThreadID      int
	LastMessageAt time.Time
	LatestSeq     int64
	UnreadCount   int
}
