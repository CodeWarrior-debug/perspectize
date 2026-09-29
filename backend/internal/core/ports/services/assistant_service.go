package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// AssistantService is the port for the in-app assistant (Jeeves).
//
// Ask validates the request, enforces per-user limits, and starts a reply.
// The returned channel streams events and is closed after the final DONE or
// ERROR event. Cancelling ctx (e.g. the client unsubscribes) aborts the
// upstream model call.
type AssistantService interface {
	Ask(ctx context.Context, userID int, message, page string) (<-chan domain.AssistantEvent, error)
}
