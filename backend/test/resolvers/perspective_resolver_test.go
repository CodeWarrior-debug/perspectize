package resolvers_test

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- CreatePerspective Mutation Tests (Issue #246) ---

func TestCreatePerspective_DerivesUserIDFromSession_WhenZero(t *testing.T) {
	var capturedUserID int
	perspectiveRepo := &mockPerspectiveRepository{
		createFn: func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
			capturedUserID = p.UserID
			p.ID = 1
			return p, nil
		},
	}
	userRepo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: id}, nil
		},
	}

	server := setupTestServerWithRepos(&mockContentRepository{}, &mockYouTubeClient{}, perspectiveRepo, userRepo)
	defer server.Close()

	// userID: 0 is the "derive from my session" sentinel. injectAuthMiddleware
	// authenticates as user ID 1.
	result := executeGraphQL(t, server, `mutation { createPerspective(input: { userID: 0, quality: 5 }) { id } }`)

	assert.Empty(t, result.Errors)
	assert.Equal(t, 1, capturedUserID)
}

func TestCreatePerspective_RejectsSpoofedUserID(t *testing.T) {
	// Issue #246: a non-zero userID that doesn't match the authenticated
	// session must be rejected, not trusted verbatim.
	var createCalled bool
	perspectiveRepo := &mockPerspectiveRepository{
		createFn: func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
			createCalled = true
			p.ID = 1
			return p, nil
		},
	}

	server := setupTestServerWithRepos(&mockContentRepository{}, &mockYouTubeClient{}, perspectiveRepo, &mockUserRepository{})
	defer server.Close()

	// injectAuthMiddleware authenticates as user ID 1; userID: 2 attempts to
	// attribute the perspective to a different user.
	result := executeGraphQL(t, server, `mutation { createPerspective(input: { userID: 2, quality: 5 }) { id } }`)

	require.NotEmpty(t, result.Errors, "Expected an error when userID doesn't match the authenticated session")
	assert.Contains(t, result.Errors[0].Message, "access denied")
	assert.False(t, createCalled, "Perspective should not be created when userID is spoofed")
}
