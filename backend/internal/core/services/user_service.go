package services

import (
	"context"
	"errors"
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// UserService implements business logic for user operations
type UserService struct {
	repo            repositories.UserRepository
	contentRepo     repositories.ContentRepository
	perspectiveRepo repositories.PerspectiveRepository
}

// NewUserService creates a new user service
func NewUserService(
	repo repositories.UserRepository,
	contentRepo repositories.ContentRepository,
	perspectiveRepo repositories.PerspectiveRepository,
) *UserService {
	return &UserService{
		repo:            repo,
		contentRepo:     contentRepo,
		perspectiveRepo: perspectiveRepo,
	}
}

// emailRegex validates email format
var emailRegex = regexp.MustCompile(`^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$`)

// Create creates a new user with validation
func (s *UserService) Create(ctx context.Context, actor *domain.AuthenticatedUser, username, email string) (*domain.User, error) {
	if !isAdmin(actor) {
		return nil, fmt.Errorf("%w: only an admin may create users", domain.ErrForbidden)
	}
	// Validate username
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, fmt.Errorf("%w: username is required", domain.ErrInvalidInput)
	}
	if len(username) > 24 {
		return nil, fmt.Errorf("%w: username must be 24 characters or less", domain.ErrInvalidInput)
	}
	if username == domain.DeletedUserUsername || username == domain.SystemUserUsername {
		return nil, fmt.Errorf("%w: username is reserved", domain.ErrInvalidInput)
	}

	// Validate email (optional — only validate format if provided)
	email = strings.TrimSpace(email)
	if email != "" {
		if !emailRegex.MatchString(email) {
			return nil, fmt.Errorf("%w: invalid email format", domain.ErrInvalidInput)
		}
	}

	// Check if username already exists
	existing, err := s.repo.GetByUsername(ctx, username)
	if err == nil && existing != nil {
		return nil, fmt.Errorf("%w: username already taken", domain.ErrAlreadyExists)
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check username: %w", err)
	}

	// Check if email already exists (only if email provided)
	if email != "" {
		existing, err = s.repo.GetByEmail(ctx, email)
		if err == nil && existing != nil {
			return nil, fmt.Errorf("%w: email already registered", domain.ErrAlreadyExists)
		}
		if err != nil && !errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("failed to check email: %w", err)
		}
	}

	user := &domain.User{
		Username:   username,
		Email:      email,
		Role:       domain.UserRoleDefault,
		Active:     true,
		Onboarding: domain.DefaultUserOnboarding(),
	}

	created, err := s.repo.Create(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("failed to create user: %w", err)
	}

	return created, nil
}

// GetByID retrieves a user by ID
func (s *UserService) GetByID(ctx context.Context, id int) (*domain.User, error) {
	if id <= 0 {
		return nil, fmt.Errorf("%w: user id must be a positive integer", domain.ErrInvalidInput)
	}

	user, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

// GetByUsername retrieves a user by username
func (s *UserService) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	username = strings.TrimSpace(username)
	if username == "" {
		return nil, fmt.Errorf("%w: username is required", domain.ErrInvalidInput)
	}

	user, err := s.repo.GetByUsername(ctx, username)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	return user, nil
}

// ListAll retrieves all users
func (s *UserService) ListAll(ctx context.Context) ([]*domain.User, error) {
	users, err := s.repo.ListAll(ctx)
	if err != nil {
		return nil, fmt.Errorf("failed to list users: %w", err)
	}
	return users, nil
}

// Update updates an existing user's username and/or email
func (s *UserService) Update(ctx context.Context, actor *domain.AuthenticatedUser, input portservices.UpdateUserInput) (*domain.User, error) {
	if input.ID <= 0 {
		return nil, fmt.Errorf("%w: user id must be a positive integer", domain.ErrInvalidInput)
	}
	if !isSelfOrAdmin(actor, input.ID) {
		return nil, fmt.Errorf("%w: you can only modify your own account", domain.ErrForbidden)
	}

	// Fetch existing user
	user, err := s.repo.GetByID(ctx, input.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}

	// Block modification of sentinel user
	if user.IsSentinel() {
		return nil, fmt.Errorf("%w", domain.ErrSentinelUser)
	}

	// Apply username change if provided
	if input.Username != nil {
		username := strings.TrimSpace(*input.Username)
		if username == "" {
			return nil, fmt.Errorf("%w: username is required", domain.ErrInvalidInput)
		}
		if len(username) > 24 {
			return nil, fmt.Errorf("%w: username must be 24 characters or less", domain.ErrInvalidInput)
		}
		if username == domain.DeletedUserUsername || username == domain.SystemUserUsername {
			return nil, fmt.Errorf("%w: username is reserved", domain.ErrInvalidInput)
		}
		// Check uniqueness (only if actually changing)
		if username != user.Username {
			existing, err := s.repo.GetByUsername(ctx, username)
			if err == nil && existing != nil {
				return nil, fmt.Errorf("%w: username already taken", domain.ErrAlreadyExists)
			}
			if err != nil && !errors.Is(err, domain.ErrNotFound) {
				return nil, fmt.Errorf("failed to check username: %w", err)
			}
		}
		user.Username = username
	}

	// Apply email change if provided
	if input.Email != nil {
		email := strings.TrimSpace(*input.Email)
		if email == "" {
			return nil, fmt.Errorf("%w: email is required", domain.ErrInvalidInput)
		}
		if !emailRegex.MatchString(email) {
			return nil, fmt.Errorf("%w: invalid email format", domain.ErrInvalidInput)
		}
		// Check uniqueness (only if actually changing)
		if email != user.Email {
			existing, err := s.repo.GetByEmail(ctx, email)
			if err == nil && existing != nil {
				return nil, fmt.Errorf("%w: email already registered", domain.ErrAlreadyExists)
			}
			if err != nil && !errors.Is(err, domain.ErrNotFound) {
				return nil, fmt.Errorf("failed to check email: %w", err)
			}
		}
		user.Email = email
	}

	updated, err := s.repo.Update(ctx, user)
	if err != nil {
		return nil, fmt.Errorf("failed to update user: %w", err)
	}

	return updated, nil
}

// Delete reassigns the user's content and perspectives to the sentinel
// "[deleted]" user, then removes the user row.
func (s *UserService) Delete(ctx context.Context, actor *domain.AuthenticatedUser, id int) error {
	if id <= 0 {
		return fmt.Errorf("%w: user id must be a positive integer", domain.ErrInvalidInput)
	}
	if !isSelfOrAdmin(actor, id) {
		return fmt.Errorf("%w: you can only delete your own account", domain.ErrForbidden)
	}

	// Fetch the user to verify it exists
	user, err := s.repo.GetByID(ctx, id)
	if err != nil {
		return fmt.Errorf("failed to get user: %w", err)
	}

	// Block deletion of sentinel user
	if user.IsSentinel() {
		return fmt.Errorf("%w", domain.ErrDeleteSentinel)
	}

	// Look up the sentinel user
	sentinel, err := s.repo.GetByUsername(ctx, domain.DeletedUserUsername)
	if err != nil {
		return fmt.Errorf("failed to find sentinel user: %w", err)
	}

	// Reassign content and perspectives to sentinel
	if err := s.contentRepo.ReassignByUser(ctx, id, sentinel.ID); err != nil {
		return fmt.Errorf("failed to reassign content: %w", err)
	}
	if err := s.perspectiveRepo.ReassignByUser(ctx, id, sentinel.ID); err != nil {
		return fmt.Errorf("failed to reassign perspectives: %w", err)
	}

	// Now safe to delete — no FKs reference this user
	if err := s.repo.Delete(ctx, id); err != nil {
		return fmt.Errorf("failed to delete user: %w", err)
	}

	return nil
}

// MarkOnboardingSeen records that the user finished or dismissed the intro coach.
func (s *UserService) MarkOnboardingSeen(ctx context.Context, userID int, version int) (*domain.UserOnboarding, error) {
	if userID <= 0 {
		return nil, fmt.Errorf("%w: user id must be a positive integer", domain.ErrInvalidInput)
	}
	if version < 0 {
		return nil, fmt.Errorf("%w: version must be non-negative", domain.ErrInvalidInput)
	}

	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	if user.IsSentinel() {
		return nil, fmt.Errorf("%w", domain.ErrSentinelUser)
	}

	now := time.Now().UTC().Format(time.RFC3339)
	onboarding := domain.UserOnboarding{
		Version:            version,
		DisplayNextSession: false,
		CompletedAt:        &now,
	}

	updated, err := s.repo.UpdateOnboarding(ctx, userID, onboarding)
	if err != nil {
		return nil, fmt.Errorf("failed to mark onboarding seen: %w", err)
	}
	return &updated.Onboarding, nil
}

// SetOnboardingDisplayNextSession toggles soft coach display (Help replay).
func (s *UserService) SetOnboardingDisplayNextSession(ctx context.Context, userID int, displayNextSession bool) (*domain.UserOnboarding, error) {
	if userID <= 0 {
		return nil, fmt.Errorf("%w: user id must be a positive integer", domain.ErrInvalidInput)
	}

	user, err := s.repo.GetByID(ctx, userID)
	if err != nil {
		return nil, fmt.Errorf("failed to get user: %w", err)
	}
	if user.IsSentinel() {
		return nil, fmt.Errorf("%w", domain.ErrSentinelUser)
	}

	onboarding := user.Onboarding
	onboarding.DisplayNextSession = displayNextSession

	updated, err := s.repo.UpdateOnboarding(ctx, userID, onboarding)
	if err != nil {
		return nil, fmt.Errorf("failed to set onboarding display flag: %w", err)
	}
	return &updated.Onboarding, nil
}

// isAdmin reports whether the actor is an authenticated admin.
func isAdmin(actor *domain.AuthenticatedUser) bool {
	return actor != nil && actor.Role == domain.UserRoleAdmin
}

// isSelfOrAdmin reports whether the actor may act on the account userID:
// their own, or any account if they are an admin.
func isSelfOrAdmin(actor *domain.AuthenticatedUser, userID int) bool {
	return actor != nil && (actor.ID == userID || actor.Role == domain.UserRoleAdmin)
}
