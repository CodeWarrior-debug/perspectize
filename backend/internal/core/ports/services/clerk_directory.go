package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// ClerkDirectory fetches a user's profile from the identity provider. It is
// only called when a verified identity has no local row yet.
type ClerkDirectory interface {
	// Profile returns domain.ErrNotFound when no such identity exists.
	Profile(ctx context.Context, clerkID string) (domain.ClerkProfile, error)
}
