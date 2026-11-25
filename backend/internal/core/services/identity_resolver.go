package services

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// maxIdentityCreateAttempts bounds the create loop. Postgres reports only the
// first constraint a row violates, so one insert can hide a second conflict;
// each retry handles one more.
const maxIdentityCreateAttempts = 3

// IdentityResolver maps verified identities to local users. Callers see only
// the portservices.IdentityResolver interface.
type IdentityResolver struct {
	users     repositories.UserRepository
	directory portservices.ClerkDirectory
}

var _ portservices.IdentityResolver = (*IdentityResolver)(nil)

// NewIdentityResolver builds a resolver over the user table and the Clerk
// profile source. The directory is consulted only when a Clerk ID has no row.
func NewIdentityResolver(users repositories.UserRepository, directory portservices.ClerkDirectory) *IdentityResolver {
	return &IdentityResolver{users: users, directory: directory}
}

// Resolve returns the local user for a verified Clerk ID. An existing row costs
// one lookup and no Clerk API call; a miss fetches the profile and provisions.
func (r *IdentityResolver) Resolve(ctx context.Context, clerkID string) (*domain.User, error) {
	user, err := r.users.GetByClerkID(ctx, clerkID)
	if err == nil {
		return requireActive(user)
	}
	if !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	profile, err := r.directory.Profile(ctx, clerkID)
	if err != nil {
		return nil, fmt.Errorf("clerk profile for %s: %w", clerkID, err)
	}
	user, err = r.create(ctx, profile)
	if err != nil {
		return nil, err
	}
	return requireActive(user)
}

// Provision ensures a row exists for the profile. An existing row is returned
// as success whatever its Active flag, so webhook redelivery never fails.
func (r *IdentityResolver) Provision(ctx context.Context, profile domain.ClerkProfile) (*domain.User, error) {
	user, err := r.users.GetByClerkID(ctx, profile.ClerkID)
	if err == nil {
		return user, nil
	}
	if !errors.Is(err, domain.ErrNotFound) {
		return nil, err
	}
	return r.create(ctx, profile)
}

// create inserts the profile's row. Each conflict has one response: a Clerk ID
// conflict is the idempotent success case, a username conflict retries with a
// disambiguated name, and an email conflict links the existing row.
func (r *IdentityResolver) create(ctx context.Context, profile domain.ClerkProfile) (*domain.User, error) {
	username := profile.LocalUsername()
	email := profile.PrimaryEmail()
	suffixed := false
	for attempt := 0; attempt < maxIdentityCreateAttempts; attempt++ {
		user, err := r.users.CreateFromClerk(ctx, profile.ClerkID, username, email)
		switch {
		case err == nil:
			slog.Info("provisioned local user for clerk identity", "local_user_id", user.ID)
			return user, nil
		case errors.Is(err, domain.ErrClerkIDTaken):
			return r.users.GetByClerkID(ctx, profile.ClerkID)
		case errors.Is(err, domain.ErrUsernameTaken) && !suffixed:
			slog.Info("username taken, retrying with disambiguated name", "clerk_id", profile.ClerkID)
			username = profile.DisambiguatedUsername()
			suffixed = true
		case errors.Is(err, domain.ErrEmailTaken) && email != "":
			return r.link(ctx, profile, email)
		default:
			return nil, err
		}
	}
	return nil, fmt.Errorf("provision clerk user %s after %d attempts: %w", profile.ClerkID, maxIdentityCreateAttempts, domain.ErrAlreadyExists)
}

// link attaches the Clerk ID to the existing row that owns the email. It only
// links a row with no Clerk identity and no sentinel role, so an account
// already linked elsewhere is never re-pointed.
func (r *IdentityResolver) link(ctx context.Context, profile domain.ClerkProfile, email string) (*domain.User, error) {
	existing, err := r.users.GetByEmail(ctx, email)
	if err != nil {
		return nil, err
	}
	if existing.ClerkUserID == profile.ClerkID {
		return existing, nil
	}
	if existing.ClerkUserID != "" || existing.IsSentinel() {
		slog.Warn("refused to link clerk identity to an email owned by another account",
			"clerk_id", profile.ClerkID, "local_user_id", existing.ID)
		return nil, fmt.Errorf("%w: email belongs to another account", domain.ErrEmailTaken)
	}
	existing.ClerkUserID = profile.ClerkID
	linked, err := r.users.Update(ctx, existing)
	if err != nil {
		return nil, err
	}
	slog.Info("linked clerk identity to existing user by email", "local_user_id", linked.ID)
	return linked, nil
}

// requireActive refuses a deactivated user; callers treat the refusal as signed out.
func requireActive(user *domain.User) (*domain.User, error) {
	if !user.Active {
		return nil, domain.ErrUserInactive
	}
	return user, nil
}
