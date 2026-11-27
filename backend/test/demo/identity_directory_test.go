package demo_test

import (
	"context"
	"errors"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/demo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// countingDirectory records every Clerk lookup the decorator lets through.
type countingDirectory struct {
	calls int
}

func (d *countingDirectory) Profile(_ context.Context, clerkID string) (domain.ClerkProfile, error) {
	d.calls++
	return domain.ClerkProfile{ClerkID: clerkID, Username: "from-clerk"}, nil
}

func TestDemoDirectory_NeverFetchesDemoIdentity(t *testing.T) {
	inner := &countingDirectory{}
	dir := demo.NewIdentityDirectory(inner)

	_, err := dir.Profile(context.Background(), demo.ClerkIDPrefix+"alice")
	assert.True(t, errors.Is(err, domain.ErrNotFound), "expected ErrNotFound, got %v", err)
	assert.Equal(t, 0, inner.calls, "a demo persona must never reach the Clerk API")
}

func TestDemoDirectory_PassesRealIdentityThrough(t *testing.T) {
	inner := &countingDirectory{}
	dir := demo.NewIdentityDirectory(inner)

	profile, err := dir.Profile(context.Background(), "user_2abc")
	require.NoError(t, err)
	assert.Equal(t, "user_2abc", profile.ClerkID)
	assert.Equal(t, 1, inner.calls)
}
