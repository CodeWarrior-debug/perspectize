package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// IdentityResolver maps a verified identity to a local user. The HTTP
// middleware, the WebSocket InitFunc and the Clerk webhook all go through it.
type IdentityResolver interface {
	// Resolve returns the local user for a verified Clerk ID, provisioning the
	// user from the Clerk profile the first time the ID is seen. It returns
	// domain.ErrUserInactive for a deactivated user.
	Resolve(ctx context.Context, clerkID string) (*domain.User, error)

	// Provision ensures a local user exists for the profile and is idempotent:
	// an existing row is returned, never an error. It returns the row whatever
	// its Active flag, so a redelivered webhook for a deactivated user succeeds.
	Provision(ctx context.Context, profile domain.ClerkProfile) (*domain.User, error)
}
