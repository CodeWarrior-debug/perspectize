package roundtrips

import "testing"

func TestCreateClaim(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("claim")
	parentID := h.content(userID, "claim-parent")
	h.warm(token)

	// SELECT parent, INSERT
	data := h.roundTrips(2, token, `mutation($input: CreateClaimInput!) { createClaim(input: $input) { id name } }`, map[string]any{
		"input": map[string]any{"text": "the sky is blue", "userID": userID, "parentContentID": parentID},
	})
	c := decode[struct {
		ID string `json:"id"`
	}](t, data, "createClaim")
	h.trackContent(c.ID)
}
