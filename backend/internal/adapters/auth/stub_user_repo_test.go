package auth

import (
	"context"
	"errors"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// stubUserRepo is a function-field test double for repositories.UserRepository.
// Only the fields a given test sets are exercised; unset methods return
// domain.ErrNotFound (or a zero value) so a test that accidentally hits an
// unexpected method fails loudly rather than silently succeeding.
type stubUserRepo struct {
	createFn              func(ctx context.Context, user *domain.User) (*domain.User, error)
	getByIDFn             func(ctx context.Context, id int) (*domain.User, error)
	getByClerkIDFn        func(ctx context.Context, clerkID string) (*domain.User, error)
	getByUsernameFn       func(ctx context.Context, username string) (*domain.User, error)
	getByEmailFn          func(ctx context.Context, email string) (*domain.User, error)
	listAllFn             func(ctx context.Context) ([]*domain.User, error)
	updateFn              func(ctx context.Context, user *domain.User) (*domain.User, error)
	deleteFn              func(ctx context.Context, id int) error
	createFromClerkFn     func(ctx context.Context, clerkID, username, email string) (*domain.User, error)
	updateByClerkIDFn     func(ctx context.Context, clerkID, username, email string) error
	deactivateByClerkIDFn func(ctx context.Context, clerkID string) error
}

func (s *stubUserRepo) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	if s.createFn != nil {
		return s.createFn(ctx, user)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) GetByID(ctx context.Context, id int) (*domain.User, error) {
	if s.getByIDFn != nil {
		return s.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (s *stubUserRepo) GetByIDs(ctx context.Context, ids []int) ([]*domain.User, error) {
	out := []*domain.User{}
	for _, id := range ids {
		if u, err := s.GetByID(ctx, id); err == nil && u != nil {
			out = append(out, u)
		}
	}
	return out, nil
}
func (s *stubUserRepo) GetByClerkID(ctx context.Context, clerkID string) (*domain.User, error) {
	if s.getByClerkIDFn != nil {
		return s.getByClerkIDFn(ctx, clerkID)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	if s.getByUsernameFn != nil {
		return s.getByUsernameFn(ctx, username)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	if s.getByEmailFn != nil {
		return s.getByEmailFn(ctx, email)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) ListAll(ctx context.Context) ([]*domain.User, error) {
	if s.listAllFn != nil {
		return s.listAllFn(ctx)
	}
	return nil, nil
}
func (s *stubUserRepo) Update(ctx context.Context, user *domain.User) (*domain.User, error) {
	if s.updateFn != nil {
		return s.updateFn(ctx, user)
	}
	return nil, domain.ErrNotFound
}
func (s *stubUserRepo) Delete(ctx context.Context, id int) error {
	if s.deleteFn != nil {
		return s.deleteFn(ctx, id)
	}
	return domain.ErrNotFound
}
func (s *stubUserRepo) CreateFromClerk(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
	if s.createFromClerkFn != nil {
		return s.createFromClerkFn(ctx, clerkID, username, email)
	}
	return nil, errors.New("CreateFromClerk not stubbed")
}
func (s *stubUserRepo) UpdateByClerkID(ctx context.Context, clerkID, username, email string) error {
	if s.updateByClerkIDFn != nil {
		return s.updateByClerkIDFn(ctx, clerkID, username, email)
	}
	return errors.New("UpdateByClerkID not stubbed")
}
func (s *stubUserRepo) DeactivateByClerkID(ctx context.Context, clerkID string) error {
	if s.deactivateByClerkIDFn != nil {
		return s.deactivateByClerkIDFn(ctx, clerkID)
	}
	return errors.New("DeactivateByClerkID not stubbed")
}
func (s *stubUserRepo) UpdateOnboarding(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error) {
	return nil, errors.New("UpdateOnboarding not stubbed")
}

func (s *stubUserRepo) SetOnboardingDisplayNextSession(ctx context.Context, userID int, display bool) (*domain.User, error) {
	return nil, errors.New("SetOnboardingDisplayNextSession not stubbed")
}
