package roundtrips

import "testing"

func TestMarkOnboardingSeen(t *testing.T) {
	h := newHarness(t)
	_, token := h.user("onb")
	h.warm(token)

	// UPDATE ... WHERE role <> sentinel RETURNING
	h.roundTrips(1, token, `mutation { markOnboardingSeen(version: 1) { version displayNextSession } }`, nil)
}

func TestSetOnboardingDisplayNextSession(t *testing.T) {
	h := newHarness(t)
	_, token := h.user("onbnext")
	h.warm(token)

	h.gql(token, `mutation { markOnboardingSeen(version: 3) { version } }`, nil)

	// UPDATE ... SET onboarding = jsonb_set(...) RETURNING
	data := h.roundTrips(1, token, `mutation { setOnboardingDisplayNextSession(displayNextSession: true) { version displayNextSession completedAt } }`, nil)
	got := decode[struct {
		Version            int     `json:"version"`
		DisplayNextSession bool    `json:"displayNextSession"`
		CompletedAt        *string `json:"completedAt"`
	}](t, data, "setOnboardingDisplayNextSession")
	if got.Version != 3 || !got.DisplayNextSession || got.CompletedAt == nil {
		t.Fatalf("jsonb_set must flip only displayNextSession, got %+v", got)
	}
}
