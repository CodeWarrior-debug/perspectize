package roundtrips

import (
	"context"
	"fmt"
	"strings"
	"testing"
)

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

func TestUpdateUser(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("upd")
	h.warm(token)

	// SELECT (sentinel check), UPDATE ... RETURNING (unique constraints check names)
	h.roundTrips(2, token, `mutation($input: UpdateUserInput!) { updateUser(input: $input) { id username } }`,
		map[string]any{"input": map[string]any{"id": userID, "username": fmt.Sprintf("renamed-%d", userID)}})
}

func TestUpdateUserUsernameTaken(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("taken1")
	otherID, _ := h.user("taken2")
	other, err := h.userRepo.GetByID(context.Background(), otherID)
	if err != nil {
		t.Fatal(err)
	}
	h.warm(token)

	msg := h.gqlError(token, `mutation($input: UpdateUserInput!) { updateUser(input: $input) { id } }`,
		map[string]any{"input": map[string]any{"id": userID, "username": other.Username}})
	if !strings.Contains(msg, "username already taken") {
		t.Fatalf("unexpected error: %q", msg)
	}
}
