package resolvers

// User domain resolvers: user CRUD, "me", and onboarding checklist state.
// Split out of the single gqlgen-generated schema.resolvers.go for
// navigability — see resolver.go for why this survives `make graphql-gen`.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// CreateUser is the resolver for the createUser field.
func (r *mutationResolver) CreateUser(ctx context.Context, input model.CreateUserInput) (*model.User, error) {
	email := ""
	if input.Email != nil {
		email = *input.Email
	}
	user, err := r.UserService.Create(ctx, input.Username, email)
	if err != nil {
		if errors.Is(err, domain.ErrAlreadyExists) {
			return nil, fmt.Errorf("user already exists: %w", err)
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid input: %w", err)
		}
		slog.Error("creating user failed", "error", err)
		return nil, fmt.Errorf("failed to create user: %v", err)
	}

	return userDomainToModel(user), nil
}

// UpdateUser is the resolver for the updateUser field.
func (r *mutationResolver) UpdateUser(ctx context.Context, input model.UpdateUserInput) (*model.User, error) {
	serviceInput := portservices.UpdateUserInput{
		ID:       input.ID,
		Username: input.Username,
		Email:    input.Email,
	}

	user, err := r.UserService.Update(ctx, serviceInput)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("user not found")
		}
		if errors.Is(err, domain.ErrAlreadyExists) {
			return nil, fmt.Errorf("user already exists: %w", err)
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid input: %w", err)
		}
		if errors.Is(err, domain.ErrSentinelUser) {
			return nil, fmt.Errorf("cannot modify system user")
		}
		slog.Error("updating user failed", "error", err)
		return nil, fmt.Errorf("failed to update user: %v", err)
	}

	return userDomainToModel(user), nil
}

// DeleteUser is the resolver for the deleteUser field.
func (r *mutationResolver) DeleteUser(ctx context.Context, id string) (bool, error) {
	intID, err := strconv.Atoi(id)
	if err != nil {
		return false, fmt.Errorf("invalid user ID: %s", id)
	}

	err = r.UserService.Delete(ctx, intID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return false, fmt.Errorf("user not found")
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return false, fmt.Errorf("invalid user ID")
		}
		if errors.Is(err, domain.ErrDeleteSentinel) {
			return false, fmt.Errorf("cannot delete system user")
		}
		slog.Error("deleting user failed", "error", err)
		return false, fmt.Errorf("failed to delete user")
	}

	return true, nil
}

// MarkOnboardingSeen is the resolver for the markOnboardingSeen field.
func (r *mutationResolver) MarkOnboardingSeen(ctx context.Context, version int) (*model.UserOnboarding, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}

	onboarding, err := r.UserService.MarkOnboardingSeen(ctx, authUser.ID, version)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("user not found")
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid input: %w", err)
		}
		if errors.Is(err, domain.ErrSentinelUser) {
			return nil, fmt.Errorf("cannot modify system user")
		}
		slog.Error("mark onboarding seen failed", "userID", authUser.ID, "error", err)
		return nil, fmt.Errorf("failed to mark onboarding seen")
	}
	return onboardingDomainToModel(onboarding), nil
}

// SetOnboardingDisplayNextSession is the resolver for the setOnboardingDisplayNextSession field.
func (r *mutationResolver) SetOnboardingDisplayNextSession(ctx context.Context, displayNextSession bool) (*model.UserOnboarding, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}

	onboarding, err := r.UserService.SetOnboardingDisplayNextSession(ctx, authUser.ID, displayNextSession)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("user not found")
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid input: %w", err)
		}
		if errors.Is(err, domain.ErrSentinelUser) {
			return nil, fmt.Errorf("cannot modify system user")
		}
		slog.Error("set onboarding display failed", "userID", authUser.ID, "error", err)
		return nil, fmt.Errorf("failed to set onboarding display flag")
	}
	return onboardingDomainToModel(onboarding), nil
}

// Me is the resolver for the me field.
func (r *queryResolver) Me(ctx context.Context) (*model.User, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}

	user, err := r.UserService.GetByID(ctx, authUser.ID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("user not found")
		}
		slog.Error("getting current user failed", "userID", authUser.ID, "error", err)
		return nil, fmt.Errorf("failed to get current user")
	}

	return userDomainToModel(user), nil
}

// UserByID is the resolver for the userByID field.
func (r *queryResolver) UserByID(ctx context.Context, id string) (*model.User, error) {
	intID, err := strconv.Atoi(id)
	if err != nil {
		return nil, fmt.Errorf("invalid user ID: %s", id)
	}

	user, err := r.UserService.GetByID(ctx, intID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, nil // Return null for not found (GraphQL convention)
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid user ID: %s", id)
		}
		slog.Error("getting user failed", "id", id, "error", err)
		return nil, fmt.Errorf("failed to get user")
	}

	return userDomainToModel(user), nil
}

// UserByUsername is the resolver for the userByUsername field.
func (r *queryResolver) UserByUsername(ctx context.Context, username string) (*model.User, error) {
	user, err := r.UserService.GetByUsername(ctx, username)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, nil // Return null for not found (GraphQL convention)
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid username")
		}
		slog.Error("getting user by username failed", "username", username, "error", err)
		return nil, fmt.Errorf("failed to get user")
	}

	return userDomainToModel(user), nil
}

// Users is the resolver for the users field.
func (r *queryResolver) Users(ctx context.Context) ([]*model.User, error) {
	users, err := r.UserService.ListAll(ctx)
	if err != nil {
		slog.Error("listing users failed", "error", err)
		return nil, fmt.Errorf("failed to list users")
	}

	// Convert domain users to GraphQL model users
	modelUsers := make([]*model.User, len(users))
	for i, user := range users {
		modelUsers[i] = userDomainToModel(user)
	}

	return modelUsers, nil
}

// Email is the resolver for the email field.
// Returns email only when the authenticated user is requesting their own account (H-10).
func (r *userResolver) Email(ctx context.Context, obj *model.User) (*string, error) {
	authenticatedUser, authenticated := auth.ForContext(ctx)
	if !authenticated {
		return nil, nil
	}

	// Compare authenticated user ID with the requested user's ID
	requestedUserID, err := strconv.Atoi(obj.ID)
	if err != nil {
		return nil, nil
	}

	if authenticatedUser.ID != requestedUserID {
		return nil, nil // Not own account — hide email
	}

	return obj.Email, nil
}
