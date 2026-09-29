package roundtrips

import (
	"fmt"
	"strconv"
	"testing"

	"github.com/stretchr/testify/require"
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

	// owner-scoped DELETE
	data := h.roundTrips(1, token, `mutation($id: ID!) { deletePerspective(id: $id) }`, map[string]any{"id": p.ID})
	if !decode[bool](t, data, "deletePerspective") {
		t.Fatal("deletePerspective returned false")
	}
}

func TestDeletePerspectiveNotOwner(t *testing.T) {
	h := newHarness(t)
	ownerID, ownerToken := h.user("delowner")
	_, otherToken := h.user("delother")
	contentID := h.content(ownerID, "delowner")
	h.warm(ownerToken)
	h.warm(otherToken)
	p := createPerspective(h, ownerToken, contentID)

	// The non-owner's DELETE matches nothing; one SELECT then picks the error.
	h.counter.Reset()
	msg := h.gqlError(otherToken, `mutation($id: ID!) { deletePerspective(id: $id) }`, map[string]any{"id": p.ID})
	if msg != "access denied: you can only delete your own perspectives" {
		t.Fatalf("unexpected error: %q", msg)
	}
	if n := len(h.counter.Statements()); n != 2 {
		t.Fatalf("round trips: want 2, got %d: %v", n, h.counter.Statements())
	}
}

// frontend LIST_PERSPECTIVES_BY_CONTENT-style selection plus the user and
// content fields (which used to always be null): one statement for the list,
// one for all users, one for all content — whatever the number of rows.
func TestPerspectiveUserAndContentBatched(t *testing.T) {
	h := newHarness(t)
	ownerID, owner := h.user("pc-owner")
	contentID := h.content(ownerID, "pc")
	for i := 0; i < 4; i++ {
		_, tok := h.user(fmt.Sprintf("pc%d", i))
		h.warm(tok)
		createPerspective(h, tok, contentID)
	}
	h.warm(owner)

	data := h.roundTrips(3, owner, `query($c: IntID) { perspectives(filter: {contentID: $c}, first: 100) {
		items { id userID user { id username } content { id name } } } }`, map[string]any{"c": contentID})
	got := decode[struct {
		Items []struct {
			UserID string `json:"userID"`
			User   *struct {
				ID string `json:"id"`
			} `json:"user"`
			Content *struct {
				Name string `json:"name"`
			} `json:"content"`
		} `json:"items"`
	}](t, data, "perspectives")
	require.Len(t, got.Items, 4)
	for _, it := range got.Items {
		require.NotNil(t, it.User, "user resolves")
		require.Equal(t, it.UserID, it.User.ID)
		require.NotNil(t, it.Content, "content resolves")
		require.Equal(t, "pc", it.Content.Name)
	}
}
