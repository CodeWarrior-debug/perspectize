package server

import (
	"context"
	"errors"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// AuthenticateWebSocket resolves a graphql-ws connection_init token to a local
// user. It is the WebSocket counterpart of the HTTP auth middleware and uses the
// same verifier and identity resolver, so a first connection provisions the user
// exactly as an HTTP request would. Any failure rejects the connection.
func AuthenticateWebSocket(ctx context.Context, token string, verifier portservices.TokenVerifier, resolver portservices.IdentityResolver) (*domain.AuthenticatedUser, error) {
	if token == "" {
		return nil, errors.New("unauthenticated websocket: missing token")
	}
	identity, err := verifier.Verify(ctx, token)
	if err != nil || identity.ClerkID == "" {
		return nil, errors.New("unauthenticated websocket: invalid token")
	}
	user, err := resolver.Resolve(ctx, identity.ClerkID)
	if err != nil {
		switch {
		case errors.Is(err, domain.ErrUserInactive):
			return nil, errors.New("unauthenticated websocket: inactive user")
		case errors.Is(err, domain.ErrNotFound):
			return nil, errors.New("unauthenticated websocket: unknown user")
		default:
			return nil, errors.New("unauthenticated websocket: could not resolve user")
		}
	}
	return &domain.AuthenticatedUser{
		ID:       user.ID,
		ClerkID:  identity.ClerkID,
		Username: user.Username,
		Email:    user.Email,
		Role:     user.Role,
	}, nil
}
