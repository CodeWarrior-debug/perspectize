package auth

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type recordingVerifier struct {
	calls []string
	id    domain.Identity
	err   error
}

func (v *recordingVerifier) Verify(_ context.Context, token string) (domain.Identity, error) {
	v.calls = append(v.calls, token)
	return v.id, v.err
}

func TestDemoTokenVerifier(t *testing.T) {
	tests := []struct {
		name         string
		token        string
		wantClerkID  string
		wantErr      bool
		wantFallback bool
	}{
		{name: "persona token maps to demo clerk id", token: "demo.alice", wantClerkID: "demo_alice"},
		{name: "underscores and digits allowed", token: "demo.qa_user2", wantClerkID: "demo_qa_user2"},
		{name: "empty persona rejected", token: "demo.", wantErr: true},
		{name: "uppercase rejected", token: "demo.Alice", wantErr: true},
		{name: "injection-shaped key rejected", token: "demo.alice' OR 1=1", wantErr: true},
		{name: "clerk JWT goes to fallback", token: "eyJhbGciOi.x.y", wantClerkID: "user_real", wantFallback: true},
		{name: "empty token goes to fallback", token: "", wantClerkID: "user_real", wantFallback: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			fb := &recordingVerifier{id: domain.Identity{ClerkID: "user_real"}}
			id, err := NewDemoTokenVerifier(fb).Verify(context.Background(), tt.token)
			if tt.wantErr {
				require.ErrorIs(t, err, ErrInvalidDemoToken)
				assert.Empty(t, fb.calls, "a malformed demo token must not reach the fallback")
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantClerkID, id.ClerkID)
			assert.Equal(t, tt.wantFallback, len(fb.calls) == 1)
		})
	}
}

func TestDemoTokenVerifier_FallbackErrorPropagates(t *testing.T) {
	boom := errors.New("bad jwt")
	_, err := NewDemoTokenVerifier(&recordingVerifier{err: boom}).Verify(context.Background(), "eyJ.x.y")
	assert.ErrorIs(t, err, boom)
}

func TestBearerToken(t *testing.T) {
	for header, want := range map[string]string{
		"":                   "",
		"Bearer demo.alice":  "demo.alice",
		"bearer demo.alice":  "demo.alice",
		"Bearer  spaced ":    "spaced",
		"Basic dXNlcjpwYXNz": "",
		"Bearer":             "",
	} {
		req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
		if header != "" {
			req.Header.Set("Authorization", header)
		}
		assert.Equal(t, want, bearerToken(req), "header %q", header)
	}
}

// runDemoMiddleware drives the full Middleware (Clerk header middleware
// included) with a demo verifier and the given Authorization header.
func runDemoMiddleware(t *testing.T, repo *stubUserRepo, header string) (*domain.AuthenticatedUser, bool) {
	t.Helper()
	var seen *domain.AuthenticatedUser
	var found, nextCalled bool
	handler := Middleware(repo, NewDemoTokenVerifier(NewClerkTokenVerifier()))(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		seen, found = ForContext(r.Context())
	}))
	req := httptest.NewRequest(http.MethodPost, "/graphql", nil)
	req.Header.Set("Authorization", header)
	handler.ServeHTTP(httptest.NewRecorder(), req)
	require.True(t, nextCalled)
	return seen, found
}

func TestMiddleware_DemoTokenResolvesSeededPersona(t *testing.T) {
	repo := &stubUserRepo{
		getByClerkIDFn: func(_ context.Context, clerkID string) (*domain.User, error) {
			require.Equal(t, "demo_alice", clerkID)
			return &domain.User{ID: 3, ClerkUserID: clerkID, Username: "alice_demo", Role: domain.UserRoleDefault}, nil
		},
	}
	user, ok := runDemoMiddleware(t, repo, "Bearer demo.alice")
	require.True(t, ok)
	assert.Equal(t, 3, user.ID)
	assert.Equal(t, "alice_demo", user.Username)
}

func TestMiddleware_UnseededDemoPersonaIsNotCreatedOnDemand(t *testing.T) {
	repo := &stubUserRepo{
		createFromClerkFn: func(context.Context, string, string, string) (*domain.User, error) {
			t.Fatal("demo personas must never be created on demand")
			return nil, nil
		},
	}
	user, ok := runDemoMiddleware(t, repo, "Bearer demo.ghost")
	assert.False(t, ok)
	assert.Nil(t, user)
}

func TestMiddleware_DemoTokenIgnoredWithoutDemoVerifier(t *testing.T) {
	// A production (Clerk-only) stack must treat demo tokens as anonymous.
	var found bool
	handler := Middleware(&stubUserRepo{
		getByClerkIDFn: func(context.Context, string) (*domain.User, error) {
			t.Fatal("no user lookup should happen for an unverifiable token")
			return nil, nil
		},
	}, NewClerkTokenVerifier())(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, found = ForContext(r.Context())
	}))
	req := httptest.NewRequest(http.MethodPost, "/graphql", nil)
	req.Header.Set("Authorization", "Bearer demo.alice")
	handler.ServeHTTP(httptest.NewRecorder(), req)
	assert.False(t, found)
}
