package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// TokenVerifier turns a bearer token into a verified Identity.
// Implementations may also accept a context that already carries verified
// session claims (set by upstream middleware) and skip re-verification.
type TokenVerifier interface {
	Verify(ctx context.Context, token string) (domain.Identity, error)
}
