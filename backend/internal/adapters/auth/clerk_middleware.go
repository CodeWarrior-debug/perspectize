package auth

import (
	"errors"
	"log/slog"
	"net/http"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	clerkhttp "github.com/clerk/clerk-sdk-go/v2/http"
)

// Middleware verifies Clerk Bearer tokens and resolves local users through the
// identity resolver. Permissive: unauthenticated requests pass through for
// public queries.
func Middleware(resolver portservices.IdentityResolver, verifier portservices.TokenVerifier) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		// Wrap with Clerk's JWT verification middleware
		return clerkhttp.WithHeaderAuthorization()(newAuthHandler(resolver, verifier, next))
	}
}

// newAuthHandler verifies the request's identity and injects the resolved local
// user as a domain.AuthenticatedUser. It is split out of Middleware so tests can
// drive it with clerk.ContextWithSessionClaims, without a signed JWT.
//
// Every failure is permissive: the request continues unauthenticated, as a
// guest, rather than being rejected.
func newAuthHandler(resolver portservices.IdentityResolver, verifier portservices.TokenVerifier, next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Clerk-verified requests already carry session claims on the context,
		// which the Clerk verifier prefers; the raw bearer token is passed for
		// verifiers that resolve it themselves (demo mode's "demo.<persona>").
		id, err := verifier.Verify(r.Context(), bearerToken(r))
		if err != nil || id.ClerkID == "" {
			next.ServeHTTP(w, r)
			return
		}

		user, err := resolver.Resolve(r.Context(), id.ClerkID)
		if err != nil {
			logUnresolved(err)
			next.ServeHTTP(w, r)
			return
		}

		authUser := &domain.AuthenticatedUser{
			ID:       user.ID,
			ClerkID:  user.ClerkUserID,
			Username: user.Username,
			Email:    user.Email,
			Role:     user.Role,
		}
		ctx := withUserRow(withUser(r.Context(), authUser), user)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// logUnresolved records why a verified identity was treated as a guest.
func logUnresolved(err error) {
	switch {
	case errors.Is(err, domain.ErrUserInactive):
		slog.Info("deactivated user treated as signed out")
	case errors.Is(err, domain.ErrNotFound):
		slog.Warn("unknown identity treated as signed out")
	default:
		slog.Error("failed to resolve identity", "error", err)
	}
}

// bearerToken returns the token from an "Authorization: Bearer <token>"
// header, or "" when absent.
func bearerToken(r *http.Request) string {
	h := r.Header.Get("Authorization")
	if len(h) > 7 && strings.EqualFold(h[:7], "Bearer ") {
		return strings.TrimSpace(h[7:])
	}
	return ""
}
