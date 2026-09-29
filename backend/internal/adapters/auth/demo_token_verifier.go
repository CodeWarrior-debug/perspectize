package auth

import (
	"context"
	"errors"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/demo"
)

// DemoTokenVerifier accepts unsigned "demo.<persona>" bearer tokens and maps
// them to the seeded demo_<persona> Clerk ID. Any other token is handed to
// the fallback (normally the Clerk verifier), so real sign-in keeps working
// on a demo stack that also has Clerk keys.
//
// Only wired when config.LoadDemo reports demo mode, which it refuses under
// APP_ENV=production — these tokens prove nothing about the caller.
type DemoTokenVerifier struct {
	fallback portservices.TokenVerifier
}

var _ portservices.TokenVerifier = (*DemoTokenVerifier)(nil)

// NewDemoTokenVerifier wraps fallback with demo-token support.
func NewDemoTokenVerifier(fallback portservices.TokenVerifier) *DemoTokenVerifier {
	return &DemoTokenVerifier{fallback: fallback}
}

// ErrInvalidDemoToken is returned for a "demo." token with a malformed persona key.
var ErrInvalidDemoToken = errors.New("invalid demo token")

// Verify resolves demo tokens locally and delegates everything else.
func (v *DemoTokenVerifier) Verify(ctx context.Context, token string) (domain.Identity, error) {
	if key, ok := strings.CutPrefix(token, demo.TokenPrefix); ok {
		if !demo.ValidPersonaKey(key) {
			return domain.Identity{}, ErrInvalidDemoToken
		}
		return domain.Identity{ClerkID: demo.ClerkIDFor(key)}, nil
	}
	return v.fallback.Verify(ctx, token)
}
