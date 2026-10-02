package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// UpdateUserInput contains the data needed to update a user
type UpdateUserInput struct {
	ID       int
	Username *string
	Email    *string
}

// UserService defines the contract for user business logic
type UserService interface {
	// Create creates a new user with validation. Admin only: normal accounts
	// are created from Clerk, never by another user (domain.ErrForbidden).
	Create(ctx context.Context, actor *domain.AuthenticatedUser, username, email string) (*domain.User, error)

	// GetByID retrieves a user by ID
	GetByID(ctx context.Context, id int) (*domain.User, error)

	// GetByUsername retrieves a user by username
	GetByUsername(ctx context.Context, username string) (*domain.User, error)

	// ListAll retrieves all users
	ListAll(ctx context.Context) ([]*domain.User, error)

	// Update updates an existing user's username and/or email. Only the user
	// themself or an admin may (domain.ErrForbidden otherwise).
	Update(ctx context.Context, actor *domain.AuthenticatedUser, input UpdateUserInput) (*domain.User, error)

	// Delete reassigns the user's content and perspectives to the sentinel
	// "[deleted]" user, then removes the user row. Only the user themself or
	// an admin may (domain.ErrForbidden otherwise).
	Delete(ctx context.Context, actor *domain.AuthenticatedUser, id int) error

	// MarkOnboardingSeen sets displayNextSession=false, completedAt=now, and version.
	// Operates on the given user ID (caller must pass authenticated user only).
	MarkOnboardingSeen(ctx context.Context, userID int, version int) (*domain.UserOnboarding, error)

	// SetOnboardingDisplayNextSession updates only displayNextSession (Help replay).
	SetOnboardingDisplayNextSession(ctx context.Context, userID int, displayNextSession bool) (*domain.UserOnboarding, error)
}
