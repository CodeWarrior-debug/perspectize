package auth

import (
	"context"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

type contextKey string

const authContextKey contextKey = "authenticated_user"

// userRowContextKey holds the full user row the auth middleware resolved, so
// `me` can answer without reading it again.
const userRowContextKey contextKey = "authenticated_user_row"

// ForContext extracts the authenticated user from the request context.
// Returns the user and true if authenticated, nil and false otherwise.
func ForContext(ctx context.Context) (*domain.AuthenticatedUser, bool) {
	user, ok := ctx.Value(authContextKey).(*domain.AuthenticatedUser)
	if !ok || user == nil {
		return nil, false
	}
	return user, true
}

// RequireAuth extracts the authenticated user or returns an error.
func RequireAuth(ctx context.Context) (*domain.AuthenticatedUser, error) {
	user, ok := ForContext(ctx)
	if !ok {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	return user, nil
}

// UserRowForContext returns the full user row the auth middleware resolved
// for this request (from the per-instance user cache), if any. It is only
// set on the HTTP path; callers fall back to a lookup without it.
func UserRowForContext(ctx context.Context) (*domain.User, bool) {
	user, ok := ctx.Value(userRowContextKey).(*domain.User)
	return user, ok && user != nil
}

// withUserRow stores the resolved user row alongside the AuthenticatedUser.
func withUserRow(ctx context.Context, user *domain.User) context.Context {
	return context.WithValue(ctx, userRowContextKey, user)
}

// withUser stores an authenticated user in the context.
func withUser(ctx context.Context, user *domain.AuthenticatedUser) context.Context {
	return context.WithValue(ctx, authContextKey, user)
}

// WithAuthenticatedUser stores an authenticated user in the context.
// Exported for use in tests that need to simulate authenticated requests.
func WithAuthenticatedUser(ctx context.Context, user *domain.AuthenticatedUser) context.Context {
	return context.WithValue(ctx, authContextKey, user)
}
