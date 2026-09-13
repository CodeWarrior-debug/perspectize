package domain

import "time"

// ThreadRole is a participant's role within a message thread.
type ThreadRole string

const (
	// ThreadRoleOwner is the creator/owner of the thread.
	ThreadRoleOwner ThreadRole = "OWNER"
	// ThreadRoleMember is a regular participant in the thread.
	ThreadRoleMember ThreadRole = "MEMBER"
)

// PresenceState indicates whether a user is online or offline.
type PresenceState string

const (
	// PresenceOnline indicates the user is currently online.
	PresenceOnline PresenceState = "ONLINE"
	// PresenceOffline indicates the user is currently offline.
	PresenceOffline PresenceState = "OFFLINE"
)

// MessageThread represents a conversation between one or more users.
type MessageThread struct {
	ID            int
	Title         *string
	CreatedBy     int
	LastMessageAt time.Time
	CreatedAt     time.Time
	Participants  []ThreadParticipant
}

// ThreadParticipant represents a user's membership in a message thread.
type ThreadParticipant struct {
	ThreadID    int
	UserID      int
	Role        ThreadRole
	LastReadSeq int64
	Muted       bool
	JoinedAt    time.Time
	LeftAt      *time.Time
}

// IsActiveParticipant returns true if the user is currently active in the thread.
func (t MessageThread) IsActiveParticipant(userID int) bool {
	for _, p := range t.Participants {
		if p.UserID == userID && p.LeftAt == nil {
			return true
		}
	}
	return false
}

// Message represents a single message in a thread.
type Message struct {
	ID          int64
	ThreadID    int
	SenderID    int
	Seq         int64
	Body        string
	ClientNonce string
	CreatedAt   time.Time
	EditedAt    *time.Time
	DeletedAt   *time.Time
}
