package auth

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Only a "verified" status marks an address verified. A missing verification
// object, a null one, and any other status all map to unverified.
func TestClerkDirectory_EmailVerificationStatus(t *testing.T) {
	cases := []struct {
		name         string
		verification string
		want         bool
	}{
		{"verified", `{"status": "verified"}`, true},
		{"unverified", `{"status": "unverified"}`, false},
		{"transferable", `{"status": "transferable"}`, false},
		{"failed", `{"status": "failed"}`, false},
		{"status missing", `{}`, false},
		{"verification null", `null`, false},
		{"verification key absent", ``, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			addr := `{"id": "idn_1", "email_address": "alice@example.com"`
			if tc.verification != "" {
				addr += `, "verification": ` + tc.verification
			}
			addr += `}`
			setClerkAPIResponse(t, 200, `{
				"id": "user_alice",
				"primary_email_address_id": "idn_1",
				"email_addresses": [`+addr+`]
			}`)

			profile, err := NewClerkDirectory().Profile(context.Background(), "user_alice")
			require.NoError(t, err)
			require.Len(t, profile.Emails, 1)
			assert.Equal(t, tc.want, profile.Emails[0].Verified)
			assert.Equal(t, tc.want, profile.PrimaryEmailVerified())
		})
	}
}

// The webhook payload carries the same verification object as the Clerk API.
func TestWebhookProfile_EmailVerificationStatus(t *testing.T) {
	payload := `{
		"id": "user_alice",
		"primary_email_address_id": "idn_2",
		"email_addresses": [
			{"id": "idn_1", "email_address": "old@example.com", "verification": {"status": "verified"}},
			{"id": "idn_2", "email_address": "alice@example.com", "verification": {"status": "unverified"}},
			{"id": "idn_3", "email_address": "third@example.com"}
		]
	}`
	var data clerkUserData
	require.NoError(t, json.Unmarshal([]byte(payload), &data))

	profile := data.profile()
	require.Len(t, profile.Emails, 3)
	assert.True(t, profile.Emails[0].Verified, "verified status")
	assert.False(t, profile.Emails[1].Verified, "unverified status")
	assert.False(t, profile.Emails[2].Verified, "missing verification object")
	assert.Equal(t, "alice@example.com", profile.PrimaryEmail())
	assert.False(t, profile.PrimaryEmailVerified(), "the primary address is unverified")
}
