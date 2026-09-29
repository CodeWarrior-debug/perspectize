package roundtrips

import "testing"

func TestMarkOnboardingSeen(t *testing.T) {
	h := newHarness(t)
	_, token := h.user("onb")
	h.warm(token)

	// SELECT user, UPDATE, re-SELECT
	h.roundTrips(3, token, `mutation { markOnboardingSeen(version: 1) { version displayNextSession } }`, nil)
}

func TestSetOnboardingDisplayNextSession(t *testing.T) {
	h := newHarness(t)
	_, token := h.user("onbnext")
	h.warm(token)

	// SELECT user, UPDATE, re-SELECT
	h.roundTrips(3, token, `mutation { setOnboardingDisplayNextSession(displayNextSession: true) { version displayNextSession } }`, nil)
}
