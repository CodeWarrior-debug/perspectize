package resolvers_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Regression test for #309: `email` on the User type must only resolve for
// the requesting user's own account. Querying `users` (authenticated as user
// 1, via injectAuthMiddleware) must return null for another user's email
// while still returning the caller's own.
func TestUsersQuery_EmailHiddenForOtherUsers(t *testing.T) {
	userRepo := &mockUserRepository{
		listAllFn: func(ctx context.Context) ([]*domain.User, error) {
			return []*domain.User{
				{ID: 1, Username: "self", Email: "self@example.com", Active: true, Role: domain.UserRoleDefault},
				{ID: 2, Username: "other", Email: "other@example.com", Active: true, Role: domain.UserRoleDefault},
			}, nil
		},
	}

	server := setupTestServerWithUserRepo(userRepo)
	defer server.Close()

	result := executeGraphQL(t, server, `{ users { id username email } }`)
	assert.Empty(t, result.Errors)

	var data struct {
		Users []struct {
			ID       string  `json:"id"`
			Username string  `json:"username"`
			Email    *string `json:"email"`
		} `json:"users"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)
	require.Len(t, data.Users, 2)

	assert.Equal(t, "1", data.Users[0].ID)
	require.NotNil(t, data.Users[0].Email, "the requesting user's own email must still resolve")
	assert.Equal(t, "self@example.com", *data.Users[0].Email)

	assert.Equal(t, "2", data.Users[1].ID)
	assert.Nil(t, data.Users[1].Email, "another user's email must not be exposed")
}
