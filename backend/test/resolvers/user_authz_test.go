package resolvers_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// The test server authenticates every request as user 1, role DEFAULT (see
// injectAuthMiddleware). Account mutations on anyone else must be refused
// before anything is written.
func TestUserMutations_NonOwnerDenied(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: id, Username: "someone", Email: "s@example.com", Role: domain.UserRoleDefault}, nil
		},
	}
	server := setupTestServerWithUserRepo(repo)
	defer server.Close()

	cases := []struct{ name, query, wantMsg string }{
		{"update another user", `mutation { updateUser(input: {id: 2, username: "hijacked"}) { id } }`, "access denied: you can only modify your own account"},
		{"delete another user", `mutation { deleteUser(id: "2") }`, "access denied: you can only delete your own account"},
		{"create a user as non-admin", `mutation { createUser(input: {username: "made-up"}) { id } }`, "access denied: admin only"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			result := executeGraphQL(t, server, tc.query)
			require.NotEmpty(t, result.Errors)
			assert.Contains(t, result.Errors[0].Message, tc.wantMsg)
		})
	}
}

func TestUpdateUser_SelfAllowed(t *testing.T) {
	repo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return &domain.User{ID: id, Username: "testuser", Email: "test@example.com", Role: domain.UserRoleDefault}, nil
		},
	}
	server := setupTestServerWithUserRepo(repo)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { updateUser(input: {id: 1, username: "renamed"}) { id username } }`)
	require.Empty(t, result.Errors)
	assert.Contains(t, string(result.Data), `"renamed"`)
}

func TestUserMutations_UnauthenticatedDenied(t *testing.T) {
	server := setupTestServerNoAuth(&mockUserRepository{})
	defer server.Close()

	for _, q := range []string{
		`mutation { updateUser(input: {id: 1, username: "x"}) { id } }`,
		`mutation { deleteUser(id: "1") }`,
		`mutation { createUser(input: {username: "x"}) { id } }`,
	} {
		result := executeGraphQL(t, server, q)
		require.NotEmpty(t, result.Errors, q)
	}
}
