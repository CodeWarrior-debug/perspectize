package resolvers_test

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// End-to-end updatePerspective through the real schema, directives, resolver
// and service (only the repository is mocked). The @owner directive is no
// longer on this mutation; ownership is enforced by the service and the
// owner-scoped repository UPDATE. injectAuthMiddleware authenticates as user 1.

const updatePerspectiveMutation = `mutation { updatePerspective(input: {id: "100", like: "up"}) { id } }`

func TestUpdatePerspective_OwnerUpdatesWithSessionUserAsOwner(t *testing.T) {
	getCalls := 0
	var gotOwner int
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			getCalls++
			return &domain.Perspective{ID: 100, UserID: 1, Privacy: domain.PrivacyPrivate}, nil
		},
		updateFn: func(ctx context.Context, p *domain.Perspective, ownerUserID int) (*domain.Perspective, error) {
			gotOwner = ownerUserID
			return p, nil
		},
	}
	server := setupPerspectiveVisibilityServer(repo, true)
	defer server.Close()

	result := executeGraphQL(t, server, updatePerspectiveMutation)
	require.Empty(t, result.Errors)
	assert.JSONEq(t, `{"updatePerspective": {"id": "100"}}`, string(result.Data))
	assert.Equal(t, 1, gotOwner, "owner passed to the repository must be the session user")
	assert.Equal(t, 1, getCalls, "the directive's duplicate read must be gone: exactly one GetByID")
}

func TestUpdatePerspective_NonOwnerDenied(t *testing.T) {
	tests := []struct {
		name    string
		privacy domain.Privacy
		wantMsg string
	}{
		{"public", domain.PrivacyPublic, "access denied: you can only modify your own perspectives"},
		{"private looks missing", domain.PrivacyPrivate, "perspective not found"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			updateCalled := false
			repo := &mockPerspectiveRepository{
				getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
					return &domain.Perspective{ID: 100, UserID: 2, Privacy: tc.privacy}, nil
				},
				updateFn: func(ctx context.Context, p *domain.Perspective, ownerUserID int) (*domain.Perspective, error) {
					updateCalled = true
					return p, nil
				},
			}
			server := setupPerspectiveVisibilityServer(repo, true)
			defer server.Close()

			result := executeGraphQL(t, server, updatePerspectiveMutation)
			require.NotEmpty(t, result.Errors)
			assert.Contains(t, result.Errors[0].Message, tc.wantMsg)
			assert.False(t, updateCalled, "repository Update must never run for a non-owner")
		})
	}
}

func TestUpdatePerspective_UnauthenticatedRejected(t *testing.T) {
	getCalled, updateCalled := false, false
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			getCalled = true
			return &domain.Perspective{ID: 100, UserID: 1}, nil
		},
		updateFn: func(ctx context.Context, p *domain.Perspective, ownerUserID int) (*domain.Perspective, error) {
			updateCalled = true
			return p, nil
		},
	}
	server := setupPerspectiveVisibilityServer(repo, false)
	defer server.Close()

	result := executeGraphQL(t, server, updatePerspectiveMutation)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "authentication required")
	assert.False(t, getCalled)
	assert.False(t, updateCalled)
}

func TestUpdatePerspective_MissingIsNotFound(t *testing.T) {
	repo := &mockPerspectiveRepository{} // getByIDFn nil => ErrNotFound
	server := setupPerspectiveVisibilityServer(repo, true)
	defer server.Close()

	result := executeGraphQL(t, server, updatePerspectiveMutation)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "perspective not found")
}
