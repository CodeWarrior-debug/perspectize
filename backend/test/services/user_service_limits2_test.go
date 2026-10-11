package services_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestUserCreate_UsernameLengthBoundary(t *testing.T) {
	tests := []struct {
		name    string
		length  int
		wantErr bool
	}{
		{"exactly 24 accepted", 24, false},
		{"25 rejected", 25, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := newTestUserService(&mockUserRepository{})
			result, err := svc.Create(context.Background(), testAdmin, strings.Repeat("a", tt.length), "")
			if tt.wantErr {
				assert.Nil(t, result)
				require.Error(t, err)
				assert.True(t, errors.Is(err, domain.ErrInvalidInput))
				return
			}
			require.NoError(t, err)
			assert.Len(t, result.Username, tt.length)
		})
	}
}

func TestUserUpdate_UsernameLengthBoundary(t *testing.T) {
	tests := []struct {
		name    string
		length  int
		wantErr bool
	}{
		{"exactly 24 accepted", 24, false},
		{"25 rejected", 25, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &mockUserRepository{
				getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
					return &domain.User{ID: id, Username: "olduser", Role: domain.UserRoleDefault}, nil
				},
			}
			svc := newTestUserService(repo)
			name := strings.Repeat("b", tt.length)
			result, err := svc.Update(context.Background(), testAdmin, portservices.UpdateUserInput{ID: 2, Username: &name})
			if tt.wantErr {
				assert.Nil(t, result)
				require.Error(t, err)
				assert.True(t, errors.Is(err, domain.ErrInvalidInput))
				return
			}
			require.NoError(t, err)
			assert.Equal(t, name, result.Username)
		})
	}
}

// Uniqueness is enforced by the users_unique_username constraint (the repository maps a clash to
// domain.ErrAlreadyExists), so a username change must not pre-check with a SELECT.
func TestUserUpdate_UsernameChangeDoesNotPreCheck(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: id, Username: "olduser", Role: domain.UserRoleDefault}, nil
		},
		getByUsernameFn: func(ctx context.Context, username string) (*domain.User, error) {
			t.Fatal("a username change must not look the name up first")
			return nil, nil
		},
		// An explicit updateFn bypasses the mock's default Update, which emulates the unique constraint via getByUsernameFn.
		updateFn: func(ctx context.Context, user *domain.User) (*domain.User, error) { return user, nil },
	}
	svc := newTestUserService(repo)
	name := "newname"

	result, err := svc.Update(context.Background(), testAdmin, portservices.UpdateUserInput{ID: 2, Username: &name})

	require.NoError(t, err)
	assert.Equal(t, "newname", result.Username)
}

func TestUserUpdate_RepoUpdateUnexpectedError(t *testing.T) {
	dbErr := errors.New("connection reset")
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: id, Username: "olduser", Role: domain.UserRoleDefault}, nil
		},
		updateFn: func(ctx context.Context, user *domain.User) (*domain.User, error) {
			return nil, dbErr
		},
	}
	svc := newTestUserService(repo)
	name := "newname"

	result, err := svc.Update(context.Background(), testAdmin, portservices.UpdateUserInput{ID: 2, Username: &name})

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, dbErr))
	assert.Contains(t, err.Error(), "failed to update user")
}

func TestMarkOnboardingSeen_VersionZeroAccepted(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: id, Username: "u", Role: domain.UserRoleDefault}, nil
		},
	}
	svc := newTestUserService(repo)

	o, err := svc.MarkOnboardingSeen(context.Background(), 1, 0)

	require.NoError(t, err)
	require.NotNil(t, o)
	assert.Equal(t, 0, o.Version)
	require.NotNil(t, o.CompletedAt)
}

func TestSetOnboardingDisplayNextSession_UserIDBoundary(t *testing.T) {
	tests := []struct {
		name    string
		userID  int
		wantErr bool
	}{
		{"negative rejected", -1, true},
		{"zero rejected", 0, true},
		{"one accepted", 1, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &mockUserRepository{
				getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
					return &domain.User{ID: id, Role: domain.UserRoleDefault}, nil
				},
			}
			svc := newTestUserService(repo)

			o, err := svc.SetOnboardingDisplayNextSession(context.Background(), tt.userID, true)

			if tt.wantErr {
				assert.Nil(t, o)
				require.Error(t, err)
				assert.True(t, errors.Is(err, domain.ErrInvalidInput))
				return
			}
			require.NoError(t, err)
			assert.True(t, o.DisplayNextSession)
		})
	}
}
