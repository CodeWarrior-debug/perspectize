package auth

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// An empty token with no session claims must be rejected up front (before any
// JWT verification is attempted) with a specific error.
func TestClerkTokenVerifier_EmptyTokenRejectedBeforeVerification(t *testing.T) {
	_, err := NewClerkTokenVerifier().Verify(context.Background(), "")
	require.Error(t, err)
	assert.EqualError(t, err, "no session claims and no token")
}

// A non-empty token must fall through to JWT verification, so a malformed token
// fails with a verification error, not the "no token" short-circuit error.
func TestClerkTokenVerifier_NonEmptyInvalidTokenGoesToVerification(t *testing.T) {
	_, err := NewClerkTokenVerifier().Verify(context.Background(), "not-a-jwt")
	require.Error(t, err)
	assert.NotEqual(t, "no session claims and no token", err.Error())
}
