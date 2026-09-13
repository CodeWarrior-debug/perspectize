package auth

import (
	"context"
	"errors"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/clerk/clerk-sdk-go/v2"
	clerkjwt "github.com/clerk/clerk-sdk-go/v2/jwt"
)

// ClerkTokenVerifier implements portservices.TokenVerifier against Clerk.
type ClerkTokenVerifier struct{}

var _ portservices.TokenVerifier = (*ClerkTokenVerifier)(nil)

// NewClerkTokenVerifier constructs a Clerk-backed TokenVerifier.
func NewClerkTokenVerifier() *ClerkTokenVerifier { return &ClerkTokenVerifier{} }

// Verify prefers session claims already on the context (HTTP path, where
// clerkhttp.WithHeaderAuthorization has run). Falling back to verifying the
// raw token supports the WebSocket InitFunc, which has no HTTP middleware.
func (v *ClerkTokenVerifier) Verify(ctx context.Context, token string) (domain.Identity, error) {
	if claims, ok := clerk.SessionClaimsFromContext(ctx); ok && claims != nil {
		return domain.Identity{ClerkID: claims.Subject}, nil
	}
	if token == "" {
		return domain.Identity{}, errors.New("no session claims and no token")
	}
	claims, err := clerkjwt.Verify(ctx, &clerkjwt.VerifyParams{Token: token})
	if err != nil {
		return domain.Identity{}, err
	}
	return domain.Identity{ClerkID: claims.Subject}, nil
}
