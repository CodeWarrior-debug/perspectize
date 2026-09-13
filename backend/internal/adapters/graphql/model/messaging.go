package model

import (
	"sync"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// The messaging GraphQL types below are hand-written (and bound in gqlgen.yml)
// rather than generated, because their field resolvers need access to the
// underlying domain aggregate — participant rows, sender IDs — which the
// wire-shaped model alone does not carry.

// MessageThread is the GraphQL projection of domain.MessageThread. Src is the
// resolver-only back-reference used by the participants / read-pointer field
// resolvers; it is never exposed on the wire.
type MessageThread struct {
	ID            string  `json:"id"`
	Title         *string `json:"title,omitempty"`
	LastMessageAt string  `json:"lastMessageAt"`
	CreatedAt     string  `json:"createdAt"`

	Src *domain.MessageThread `json:"-"`

	// memo caches per-thread lookups (currently latestSeq) so the several field
	// resolvers that need them issue one query between them instead of one each
	// — the difference between ~2 and ~6 queries per row on a thread-list page.
	// It is a pointer because generated gqlgen code copies MessageThread by
	// value and a struct holding a sync.Once must not be copied.
	memo *threadMemo `json:"-"`
}

// threadMemo holds the once-per-thread resolved values shared by the copies
// gqlgen makes of a MessageThread.
type threadMemo struct {
	latestSeqOnce sync.Once
	latestSeq     int64
	latestSeqErr  error
}

// EnableMemo attaches a fresh memo, and is called once at projection time. A
// thread without one still resolves correctly; it just re-queries per field.
func (t *MessageThread) EnableMemo() {
	t.memo = &threadMemo{}
}

// ResolveLatestSeq returns the thread's highest message seq, calling load at
// most once per memo and reusing the result (including the error) on every
// later call. Safe for the concurrent field resolution gqlgen may perform. With
// no memo attached it simply calls load.
func (t *MessageThread) ResolveLatestSeq(load func() (int64, error)) (int64, error) {
	if t.memo == nil {
		return load()
	}
	t.memo.latestSeqOnce.Do(func() {
		t.memo.latestSeq, t.memo.latestSeqErr = load()
	})
	return t.memo.latestSeq, t.memo.latestSeqErr
}

// ThreadParticipant is the GraphQL projection of domain.ThreadParticipant.
// SrcUserID feeds the `user` field resolver.
type ThreadParticipant struct {
	Role        domain.ThreadRole `json:"role"`
	LastReadSeq int               `json:"lastReadSeq"`
	JoinedAt    string            `json:"joinedAt"`

	SrcUserID int `json:"-"`
}

// Message is the GraphQL projection of domain.Message. SrcSenderID feeds the
// `sender` field resolver.
type Message struct {
	ID        string  `json:"id"`
	ThreadID  string  `json:"threadId"`
	Seq       int     `json:"seq"`
	Body      string  `json:"body"`
	CreatedAt string  `json:"createdAt"`
	EditedAt  *string `json:"editedAt,omitempty"`
	DeletedAt *string `json:"deletedAt,omitempty"`

	SrcSenderID int `json:"-"`
}
