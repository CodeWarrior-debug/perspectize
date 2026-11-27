package auth

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClerkDirectory_MapsProfile(t *testing.T) {
	setClerkAPIResponse(t, 200, `{
		"id": "user_alice",
		"username": "alice",
		"primary_email_address_id": "idn_2",
		"email_addresses": [
			{"id": "idn_1", "email_address": "old@example.com"},
			{"id": "idn_2", "email_address": "alice@example.com"}
		]
	}`)

	profile, err := NewClerkDirectory().Profile(context.Background(), "user_alice")
	require.NoError(t, err)
	assert.Equal(t, "user_alice", profile.ClerkID)
	assert.Equal(t, "alice", profile.Username)
	assert.Equal(t, "alice@example.com", profile.PrimaryEmail())
}

func TestClerkDirectory_APIErrorPropagates(t *testing.T) {
	setClerkAPIResponse(t, 404, `{"errors": [{"message": "not found", "code": "resource_not_found"}]}`)

	_, err := NewClerkDirectory().Profile(context.Background(), "user_ghost")
	assert.Error(t, err)
}
