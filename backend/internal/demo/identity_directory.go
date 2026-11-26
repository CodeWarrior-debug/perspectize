package demo

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// IdentityDirectory decorates a ClerkDirectory so demo personas are never
// fetched or created on demand. They exist only once seeded (cmd/seed-demo) and
// have no Clerk profile, so a demo ID reports not-found and the resolver refuses it.
type IdentityDirectory struct {
	inner portservices.ClerkDirectory
}

var _ portservices.ClerkDirectory = (*IdentityDirectory)(nil)

// NewIdentityDirectory wraps inner with the demo-persona rule.
func NewIdentityDirectory(inner portservices.ClerkDirectory) *IdentityDirectory {
	return &IdentityDirectory{inner: inner}
}

// Profile returns domain.ErrNotFound for a demo persona without calling the
// wrapped directory; every other ID is passed through.
func (d *IdentityDirectory) Profile(ctx context.Context, clerkID string) (domain.ClerkProfile, error) {
	if IsDemoClerkID(clerkID) {
		return domain.ClerkProfile{}, domain.ErrNotFound
	}
	return d.inner.Profile(ctx, clerkID)
}
