package roundtrips

import (
	"strconv"
	"testing"
)

const createPerspectiveMutation = `mutation($input: CreatePerspectiveInput!) {
  createPerspective(input: $input) { id quality review updatedAt }
}`

const updatePerspectiveMutation = `mutation($input: UpdatePerspectiveInput!) {
  updatePerspective(input: $input) { id quality review updatedAt }
}`

type perspectiveResult struct {
	ID      string  `json:"id"`
	Quality *int    `json:"quality"`
	Review  *string `json:"review"`
}

func createPerspective(h *harness, token string, contentID int) perspectiveResult {
	h.t.Helper()
	data := h.gql(token, createPerspectiveMutation, map[string]any{
		"input": map[string]any{"userID": 0, "contentID": contentID, "quality": 5},
	})
	return decode[perspectiveResult](h.t, data, "createPerspective")
}

func TestAuthUserLookup(t *testing.T) {
	h := newHarness(t)
	_, token := h.user("auth")

	// First request resolves the Clerk ID -> user; after that it's cached.
	h.roundTrips(1, token, `{ __typename }`, nil)
	h.roundTrips(0, token, `{ __typename }`, nil)
}

func TestCreatePerspective(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("create")
	contentID := h.content(userID, "create")
	h.warm(token)

	// INSERT ... RETURNING
	data := h.roundTrips(1, token, createPerspectiveMutation, map[string]any{
		"input": map[string]any{"userID": 0, "contentID": contentID, "quality": 5, "review": "<p>hi</p>"},
	})
	got := decode[perspectiveResult](t, data, "createPerspective")
	if got.ID == "" || got.Quality == nil || *got.Quality != 5 {
		t.Fatalf("unexpected create result: %+v", got)
	}
}

func TestUpdatePerspective(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("update")
	contentID := h.content(userID, "update")
	h.warm(token)
	p := createPerspective(h, token, contentID)
	id, _ := strconv.Atoi(p.ID)

	// SELECT (tri-state merge + owner check), UPDATE ... WHERE user_id RETURNING
	data := h.roundTrips(2, token, updatePerspectiveMutation, map[string]any{
		"input": map[string]any{"id": id, "quality": 7, "review": nil},
	})
	got := decode[perspectiveResult](t, data, "updatePerspective")
	if got.Quality == nil || *got.Quality != 7 || got.Review != nil {
		t.Fatalf("unexpected update result: %+v", got)
	}
}

func TestDeletePerspective(t *testing.T) {
	h := newHarness(t)
	userID, token := h.user("delete")
	contentID := h.content(userID, "delete")
	h.warm(token)
	p := createPerspective(h, token, contentID)

	// @owner SELECT, service SELECT, owner-scoped DELETE
	data := h.roundTrips(3, token, `mutation($id: ID!) { deletePerspective(id: $id) }`, map[string]any{"id": p.ID})
	if !decode[bool](t, data, "deletePerspective") {
		t.Fatal("deletePerspective returned false")
	}
}
