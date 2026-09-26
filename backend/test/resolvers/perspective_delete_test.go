package resolvers_test

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// End-to-end deletePerspective through the real schema, directives, resolver
// and service (only the repository is mocked). injectAuthMiddleware
// authenticates as user ID 1.

const deletePerspectiveMutation = `mutation { deletePerspective(id: "100") }`

func TestDeletePerspective_OwnerDeletes(t *testing.T) {
	// "SHARED" isn't a real Privacy value yet; it stands in for any future
	// state -- deletion must stay owner-only regardless of privacy.
	for _, privacy := range []domain.Privacy{domain.PrivacyPublic, domain.PrivacyPrivate, domain.Privacy("SHARED")} {
		t.Run(string(privacy), func(t *testing.T) {
			var gotID, gotOwner int
			repo := &mockPerspectiveRepository{
				getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
					return &domain.Perspective{ID: 100, UserID: 1, Privacy: privacy}, nil
				},
				deleteFn: func(ctx context.Context, id int, ownerUserID int) error {
					gotID, gotOwner = id, ownerUserID
					return nil
				},
			}
			server := setupPerspectiveVisibilityServer(repo, true)
			defer server.Close()

			result := executeGraphQL(t, server, deletePerspectiveMutation)
			require.Empty(t, result.Errors)
			assert.JSONEq(t, `{"deletePerspective": true}`, string(result.Data))
			assert.Equal(t, 100, gotID)
			assert.Equal(t, 1, gotOwner, "owner passed to the repository must be the session user")
		})
	}
}

func TestDeletePerspective_NonOwnerCannotDelete(t *testing.T) {
	tests := []struct {
		privacy domain.Privacy
		wantMsg string
	}{
		{domain.PrivacyPublic, "access denied"},
		// Someone else's non-public perspective is indistinguishable from a missing one.
		{domain.PrivacyPrivate, "resource not found"},
		{domain.Privacy("SHARED"), "resource not found"},
	}
	for _, tc := range tests {
		t.Run(string(tc.privacy), func(t *testing.T) {
			deleteCalled := false
			repo := &mockPerspectiveRepository{
				getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
					return &domain.Perspective{ID: 100, UserID: 2, Privacy: tc.privacy}, nil
				},
				deleteFn: func(ctx context.Context, id int, ownerUserID int) error {
					deleteCalled = true
					return nil
				},
			}
			server := setupPerspectiveVisibilityServer(repo, true)
			defer server.Close()

			result := executeGraphQL(t, server, deletePerspectiveMutation)
			require.NotEmpty(t, result.Errors)
			assert.Contains(t, result.Errors[0].Message, tc.wantMsg)
			assert.False(t, deleteCalled, "repository Delete must never run for a non-owner")
		})
	}
}

func TestDeletePerspective_UnauthenticatedRejected(t *testing.T) {
	getCalled, deleteCalled := false, false
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			getCalled = true
			return &domain.Perspective{ID: 100, UserID: 1}, nil
		},
		deleteFn: func(ctx context.Context, id int, ownerUserID int) error {
			deleteCalled = true
			return nil
		},
	}
	server := setupPerspectiveVisibilityServer(repo, false)
	defer server.Close()

	result := executeGraphQL(t, server, deletePerspectiveMutation)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "authentication required")
	assert.False(t, getCalled)
	assert.False(t, deleteCalled)
}

func TestDeletePerspective_NotFound(t *testing.T) {
	repo := &mockPerspectiveRepository{} // getByIDFn nil => ErrNotFound
	server := setupPerspectiveVisibilityServer(repo, true)
	defer server.Close()

	result := executeGraphQL(t, server, deletePerspectiveMutation)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "not found")
}
