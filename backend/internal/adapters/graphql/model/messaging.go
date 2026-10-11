package model

import (
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
