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

// AssistantToolService runs the assistant's read-only tools for callers other
// than the in-app agent loop, such as the browser's own agent via WebMCP.
// Tools run as userID: the viewer always comes from the session, never from
// the tool input.
type AssistantToolService interface {
	Specs() []domain.AssistantToolSpec
	Run(ctx context.Context, userID int, name, inputJSON string) (string, error)
}
