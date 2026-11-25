package auth

import (
	"context"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	clerkuser "github.com/clerk/clerk-sdk-go/v2/user"
)

// ClerkDirectory implements portservices.ClerkDirectory against the Clerk
// Backend API. It is the only place the Clerk user API is called.
type ClerkDirectory struct{}

var _ portservices.ClerkDirectory = (*ClerkDirectory)(nil)

// NewClerkDirectory constructs the Clerk-backed profile source.
func NewClerkDirectory() *ClerkDirectory { return &ClerkDirectory{} }

// Profile fetches the Clerk user and maps it to a domain.ClerkProfile. Local
// profile rules (primary email, username fallback) are applied by the domain type.
func (d *ClerkDirectory) Profile(ctx context.Context, clerkID string) (domain.ClerkProfile, error) {
	u, err := clerkuser.Get(ctx, clerkID)
	if err != nil {
		return domain.ClerkProfile{}, fmt.Errorf("clerk user %s: %w", clerkID, err)
	}
	profile := domain.ClerkProfile{ClerkID: clerkID}
	if u.Username != nil {
		profile.Username = *u.Username
	}
	if u.PrimaryEmailAddressID != nil {
		profile.PrimaryEmailID = *u.PrimaryEmailAddressID
	}
	for _, ea := range u.EmailAddresses {
		profile.Emails = append(profile.Emails, domain.ClerkEmail{ID: ea.ID, Address: ea.EmailAddress})
	}
	return profile, nil
}
