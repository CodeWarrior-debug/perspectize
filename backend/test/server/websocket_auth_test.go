package server_test

import (
	"context"
	"errors"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/server"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// memUsers is the user table as far as the WebSocket path needs it: lookup by
// Clerk ID and insert. Other methods panic if reached.
type memUsers struct {
	repositories.UserRepository
	rows   []*domain.User
	nextID int
}

func (m *memUsers) GetByClerkID(_ context.Context, clerkID string) (*domain.User, error) {
	for _, r := range m.rows {
		if r.ClerkUserID == clerkID {
			c := *r
			return &c, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (m *memUsers) CreateFromClerk(_ context.Context, clerkID, username, email string) (*domain.User, error) {
	m.nextID++
	row := &domain.User{ID: m.nextID, ClerkUserID: clerkID, Username: username, Email: email, Role: domain.UserRoleDefault, Active: true}
	m.rows = append(m.rows, row)
	c := *row
	return &c, nil
}

// profileDir is the Clerk directory: it knows only the identities listed.
type profileDir map[string]domain.ClerkProfile

func (d profileDir) Profile(_ context.Context, clerkID string) (domain.ClerkProfile, error) {
	p, ok := d[clerkID]
	if !ok {
		return domain.ClerkProfile{}, domain.ErrNotFound
	}
	return p, nil
}

// tokenVerifier maps a bearer token to a verified Clerk ID.
type tokenVerifier map[string]string

func (v tokenVerifier) Verify(_ context.Context, token string) (domain.Identity, error) {
	id, ok := v[token]
	if !ok {
		return domain.Identity{}, errors.New("bad token")
	}
	return domain.Identity{ClerkID: id}, nil
}

var (
	newProfile = domain.ClerkProfile{ClerkID: "user_new", Username: "new", PrimaryEmailID: "e1", Emails: []domain.ClerkEmail{{ID: "e1", Address: "new@example.com"}}}
	verifier   = tokenVerifier{"tok_new": "user_new", "tok_alice": "user_alice"}
)

func wsResolver(users *memUsers, dir profileDir) portservices.IdentityResolver {
	return services.NewIdentityResolver(users, dir)
}

func TestWebSocketAuth_FirstConnectionCreatesUser(t *testing.T) {
	users := &memUsers{}

	user, err := server.AuthenticateWebSocket(context.Background(), "tok_new", verifier, wsResolver(users, profileDir{"user_new": newProfile}))
	require.NoError(t, err)
	assert.Equal(t, "user_new", user.ClerkID)
	assert.Equal(t, "new", user.Username)
	assert.Equal(t, 1, user.ID)
	assert.Len(t, users.rows, 1, "the first connection provisions the user, as HTTP does")
}

func TestWebSocketAuth_ExistingUserAuthenticates(t *testing.T) {
	users := &memUsers{rows: []*domain.User{{ID: 5, ClerkUserID: "user_alice", Username: "alice", Active: true}}}

	user, err := server.AuthenticateWebSocket(context.Background(), "tok_alice", verifier, wsResolver(users, profileDir{}))
	require.NoError(t, err)
	assert.Equal(t, 5, user.ID)
	assert.Equal(t, "user_alice", user.ClerkID)
}

func TestWebSocketAuth_InactiveUserRejected(t *testing.T) {
	users := &memUsers{rows: []*domain.User{{ID: 5, ClerkUserID: "user_alice", Username: "alice", Active: false}}}

	_, err := server.AuthenticateWebSocket(context.Background(), "tok_alice", verifier, wsResolver(users, profileDir{}))
	assert.ErrorContains(t, err, "inactive user")
}

func TestWebSocketAuth_UnknownIdentityRejected(t *testing.T) {
	users := &memUsers{}

	_, err := server.AuthenticateWebSocket(context.Background(), "tok_new", verifier, wsResolver(users, profileDir{}))
	assert.ErrorContains(t, err, "unknown user")
	assert.Empty(t, users.rows)
}

func TestWebSocketAuth_InvalidAndMissingTokensRejected(t *testing.T) {
	users := &memUsers{}
	resolver := wsResolver(users, profileDir{"user_new": newProfile})

	_, err := server.AuthenticateWebSocket(context.Background(), "", verifier, resolver)
	assert.ErrorContains(t, err, "missing token")

	_, err = server.AuthenticateWebSocket(context.Background(), "tok_forged", verifier, resolver)
	assert.ErrorContains(t, err, "invalid token")
	assert.Empty(t, users.rows)
}
