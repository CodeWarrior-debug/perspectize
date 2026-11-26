package auth

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/clerk/clerk-sdk-go/v2/clerktest"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeResolver is the identity-resolver port as a test double. It records the
// Clerk IDs it was asked about so tests can assert on the call.
type fakeResolver struct {
	resolve func(ctx context.Context, clerkID string) (*domain.User, error)
	calls   []string
}

func (f *fakeResolver) Resolve(ctx context.Context, clerkID string) (*domain.User, error) {
	f.calls = append(f.calls, clerkID)
	if f.resolve == nil {
		return nil, domain.ErrNotFound
	}
	return f.resolve(ctx, clerkID)
}

func (f *fakeResolver) Provision(context.Context, domain.ClerkProfile) (*domain.User, error) {
	return nil, errors.New("Provision is not used by the middleware")
}

// setClerkAPIResponse points the package-level Clerk backend at a canned HTTP
// response so clerkuser.Get can be driven without network access. The previous
// backend is restored on test cleanup. Tests using this must not run in
// parallel — clerk.SetBackend is process-global.
func setClerkAPIResponse(t *testing.T, status int, body string) {
	t.Helper()
	previous := clerk.GetBackend()
	clerk.SetBackend(clerk.NewBackend(&clerk.BackendConfig{
		HTTPClient: &http.Client{Transport: &clerktest.RoundTripper{
			T:      t,
			Status: status,
			Out:    json.RawMessage(body),
		}},
	}))
	t.Cleanup(func() { clerk.SetBackend(previous) })
}

// runAuthHandler drives newAuthHandler with the given session subject (empty
// string = no Clerk session at all) and returns whichever AuthenticatedUser the
// handler injected into the downstream context, or nil.
func runAuthHandler(t *testing.T, resolver *fakeResolver, subject string) (*domain.AuthenticatedUser, bool) {
	t.Helper()

	var seen *domain.AuthenticatedUser
	var found bool
	var nextCalled bool

	next := http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		seen, found = ForContext(r.Context())
		w.WriteHeader(http.StatusOK)
	})

	req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
	if subject != "" {
		ctx := clerk.ContextWithSessionClaims(req.Context(), &clerk.SessionClaims{
			RegisteredClaims: clerk.RegisteredClaims{Subject: subject},
		})
		req = req.WithContext(ctx)
	}

	rec := httptest.NewRecorder()
	newAuthHandler(resolver, NewClerkTokenVerifier(), next).ServeHTTP(rec, req)

	require.True(t, nextCalled, "the middleware must always call next (it is permissive)")
	assert.Equal(t, http.StatusOK, rec.Code)
	return seen, found
}

func TestNewAuthHandler_NoSessionClaimsPassesThroughUnauthenticated(t *testing.T) {
	resolver := &fakeResolver{}

	_, found := runAuthHandler(t, resolver, "")

	assert.False(t, found)
	assert.Empty(t, resolver.calls, "no verified identity means no resolution")
}

func TestNewAuthHandler_ResolvedUserIsInjected(t *testing.T) {
	resolver := &fakeResolver{resolve: func(context.Context, string) (*domain.User, error) {
		return &domain.User{ID: 7, ClerkUserID: "user_alice", Username: "alice", Email: "alice@example.com", Role: domain.UserRoleDefault, Active: true}, nil
	}}

	user, found := runAuthHandler(t, resolver, "user_alice")

	require.True(t, found)
	assert.Equal(t, 7, user.ID)
	assert.Equal(t, "user_alice", user.ClerkID)
	assert.Equal(t, "alice", user.Username)
	assert.Equal(t, []string{"user_alice"}, resolver.calls)
}

func TestNewAuthHandler_UnknownIdentityIsGuest(t *testing.T) {
	resolver := &fakeResolver{resolve: func(context.Context, string) (*domain.User, error) {
		return nil, domain.ErrNotFound
	}}

	_, found := runAuthHandler(t, resolver, "user_ghost")
	assert.False(t, found)
}

func TestNewAuthHandler_InactiveUserIsGuest(t *testing.T) {
	resolver := &fakeResolver{resolve: func(context.Context, string) (*domain.User, error) {
		return nil, domain.ErrUserInactive
	}}

	_, found := runAuthHandler(t, resolver, "user_alice")
	assert.False(t, found)
}

func TestNewAuthHandler_ResolverErrorPassesThrough(t *testing.T) {
	resolver := &fakeResolver{resolve: func(context.Context, string) (*domain.User, error) {
		return nil, errors.New("database unavailable")
	}}

	_, found := runAuthHandler(t, resolver, "user_alice")
	assert.False(t, found)
}

func TestMiddleware_UnauthenticatedRequestPassesThrough(t *testing.T) {
	// Exercises the clerkhttp.WithHeaderAuthorization wiring in Middleware itself.
	// With no Authorization header, Clerk's middleware adds no session claims, so
	// our handler must fall through to next without resolving anyone.
	resolver := &fakeResolver{}
	var nextCalled bool
	var seen *domain.AuthenticatedUser
	var found bool

	handler := Middleware(resolver, NewClerkTokenVerifier())(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		seen, found = ForContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, httptest.NewRequest(http.MethodGet, "/graphql", nil))

	require.True(t, nextCalled)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.False(t, found)
	assert.Nil(t, seen)
	assert.Empty(t, resolver.calls)
}

func TestMiddleware_UnparseableBearerTokenPassesThrough(t *testing.T) {
	// jwt.Decode fails on a non-JWT bearer token; Clerk's middleware calls next
	// without claims rather than rejecting, so the request stays anonymous.
	resolver := &fakeResolver{}
	var nextCalled bool
	var found bool

	handler := Middleware(resolver, NewClerkTokenVerifier())(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		nextCalled = true
		_, found = ForContext(r.Context())
		w.WriteHeader(http.StatusOK)
	}))

	req := httptest.NewRequest(http.MethodGet, "/graphql", nil)
	req.Header.Set("Authorization", "Bearer not-a-jwt")

	rec := httptest.NewRecorder()
	handler.ServeHTTP(rec, req)

	require.True(t, nextCalled)
	assert.Equal(t, http.StatusOK, rec.Code)
	assert.False(t, found)
	assert.Empty(t, resolver.calls)
}
