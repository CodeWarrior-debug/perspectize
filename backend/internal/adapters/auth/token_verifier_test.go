package auth

import (
	"context"
	"testing"

	"github.com/clerk/clerk-sdk-go/v2"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClerkTokenVerifier_UsesSessionClaimsFromContext(t *testing.T) {
	// The verifier is a thin wrapper: given a context that already carries
	// Clerk session claims (as clerkhttp middleware would set), Verify returns
	// an Identity with the Clerk subject.
	v := NewClerkTokenVerifier()
	ctx := clerk.ContextWithSessionClaims(context.Background(), &clerk.SessionClaims{
		RegisteredClaims: clerk.RegisteredClaims{Subject: "user_abc123"},
	})

	id, err := v.Verify(ctx, "ignored-when-claims-present")
	require.NoError(t, err)
	assert.Equal(t, "user_abc123", id.ClerkID)
}

func TestClerkTokenVerifier_NoClaims_Errors(t *testing.T) {
	v := NewClerkTokenVerifier()
	_, err := v.Verify(context.Background(), "")
	assert.Error(t, err)
}
