package roundtrips

import (
	"context"
	"encoding/json"
	"fmt"
	"testing"

	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// savedItemSelection is every field a saved item response carries, including the
// owner (a dataloaded field) and the payload (a link's is resolved from its source
// in the read statement).
const savedItemSelection = `id type name privacy origin sourceId sourceAvailable payloadVersion createdAt updatedAt
	user { id }
	... on SavedFormula { payload }`

const mySavedFormulasRoundTripQuery = `query($first: Int, $includeTotalCount: Boolean) {
  mySavedFormulas(first: $first, includeTotalCount: $includeTotalCount) {
    items { ` + savedItemSelection + ` }
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    totalCount
  }
}`

const sharedFormulasRoundTripQuery = `query($first: Int) {
  sharedFormulas(first: $first) {
    items { ` + savedItemSelection + ` }
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    totalCount
  }
}`

const savedItemRoundTripQuery = `query($id: ID!) {
  savedItem(id: $id) { ` + savedItemSelection + ` }
}`

const createSavedFormulaRoundTripMutation = `mutation($input: CreateSavedFormulaInput!) {
  createSavedFormula(input: $input) { ` + savedItemSelection + ` }
}`

const updateSavedFormulaRoundTripMutation = `mutation($input: UpdateSavedFormulaInput!) {
  updateSavedFormula(input: $input) { ` + savedItemSelection + ` }
}`

const deleteSavedItemRoundTripMutation = `mutation($id: ID!) {
  deleteSavedItem(id: $id)
}`

const restoreSavedItemRoundTripMutation = `mutation($id: ID!) {
  restoreSavedItem(id: $id) { ` + savedItemSelection + ` }
}`

const setSavedItemPrivacyRoundTripMutation = `mutation($id: ID!, $privacy: Privacy!) {
  setSavedItemPrivacy(id: $id, privacy: $privacy) { ` + savedItemSelection + ` }
}`

const copySavedItemRoundTripMutation = `mutation($id: ID!) {
  copySavedItem(id: $id) { ` + savedItemSelection + ` }
}`

const linkSavedItemRoundTripMutation = `mutation($id: ID!) {
  linkSavedItem(id: $id) { ` + savedItemSelection + ` }
}`

const convertLinkToCopyRoundTripMutation = `mutation($id: ID!) {
  convertLinkToCopy(id: $id) { ` + savedItemSelection + ` }
}`

// savedItemNode is one saved item in a response. Every selected field is spelled
// out so a decode failure names the field that moved.
type savedItemNode struct {
	ID              string              `json:"id"`
	Type            string              `json:"type"`
	Name            string              `json:"name"`
	Privacy         string              `json:"privacy"`
	Origin          string              `json:"origin"`
	SourceID        *string             `json:"sourceId"`
	SourceAvailable bool                `json:"sourceAvailable"`
	PayloadVersion  int                 `json:"payloadVersion"`
	CreatedAt       string              `json:"createdAt"`
	UpdatedAt       string              `json:"updatedAt"`
	User            struct{ ID string } `json:"user"`
	Payload         json.RawMessage     `json:"payload"`
}

type savedItemPage struct {
	Items    []savedItemNode `json:"items"`
	PageInfo struct {
		HasNextPage     bool    `json:"hasNextPage"`
		HasPreviousPage bool    `json:"hasPreviousPage"`
		StartCursor     *string `json:"startCursor"`
		EndCursor       *string `json:"endCursor"`
	} `json:"pageInfo"`
	TotalCount *int `json:"totalCount"`
}

// savedItemSeed is the state the saved item round trips run against: owner A's
// items, owner B's public source, and A's link to it.
type savedItemSeed struct {
	ownerA, ownerB int
	tokenA, tokenB string
	publicA        int // A's public formula
	privateA       int // A's private formula
	sourceB        int // B's public formula, the source of the link and copy
	linkA          int // A's link to sourceB
}

// seedSavedItems creates the rows through the repository, so the measured request
// starts from a known state and no round trip is spent on setup.
func seedSavedItems(t *testing.T, h *harness) savedItemSeed {
	t.Helper()
	ctx := context.Background()
	repo := postgres.NewGormSavedItemRepository(h.db)
	payload := json.RawMessage(`{"expression":{"op":"add","args":[{"operand":"views"},{"const":2}]}}`)

	s := savedItemSeed{}
	s.ownerA, s.tokenA = h.user("saved-a")
	s.ownerB, s.tokenB = h.user("saved-b")

	create := func(owner int, name string, privacy domain.Privacy) int {
		item, err := repo.Create(ctx, &domain.SavedItem{
			UserID: owner, Type: domain.SavedItemTypeFormula, Name: name, Payload: payload,
			PayloadVersion: domain.SavedFormulaPayloadVersion, Privacy: privacy, Origin: domain.SavedItemOriginOwn,
		})
		require.NoError(t, err)
		return item.ID
	}
	s.publicA = create(s.ownerA, "A public", domain.PrivacyPublic)
	s.privateA = create(s.ownerA, "A private", domain.PrivacyPrivate)
	create(s.ownerA, "A third", domain.PrivacyPrivate)
	s.sourceB = create(s.ownerB, "B public source", domain.PrivacyPublic)
	create(s.ownerB, "B private", domain.PrivacyPrivate)

	sourceID := s.sourceB
	link, err := repo.Create(ctx, &domain.SavedItem{
		UserID: s.ownerA, Type: domain.SavedItemTypeFormula, Name: "A link to B",
		Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginLink, SourceID: &sourceID,
	})
	require.NoError(t, err)
	s.linkA = link.ID
	return s
}

// softDeleteSaved deletes a row through the repository, for restore round trips.
func softDeleteSaved(t *testing.T, h *harness, owner, id int) {
	t.Helper()
	require.NoError(t, postgres.NewGormSavedItemRepository(h.db).Delete(context.Background(), id, owner))
}

// TestMySavedFormulasRoundTrips pins the cost of one page of the caller's own
// formulas. The owner is loaded once for the page, and the link's source payload
// comes back in the same statement as the rows.
func TestMySavedFormulasRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	data := h.roundTrips(2, s.tokenA, mySavedFormulasRoundTripQuery, map[string]any{"first": 10})

	page := decode[savedItemPage](t, data, "mySavedFormulas")
	require.Len(t, page.Items, 4, "A owns three formulas and one link")
	require.Nil(t, page.TotalCount, "no total unless requested")
}

// TestMySavedFormulasWithTotalRoundTrips pins the extra statement a total costs.
func TestMySavedFormulasWithTotalRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	data := h.roundTrips(3, s.tokenA, mySavedFormulasRoundTripQuery, map[string]any{"first": 10, "includeTotalCount": true})

	page := decode[savedItemPage](t, data, "mySavedFormulas")
	require.NotNil(t, page.TotalCount)
	require.Equal(t, 4, *page.TotalCount)
}

// TestSharedFormulasRoundTrips pins the cost of the shared list for a signed-in
// viewer. Two owners appear, so the owner loader must batch them.
func TestSharedFormulasRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	data := h.roundTrips(2, s.tokenA, sharedFormulasRoundTripQuery, map[string]any{"first": 10})

	page := decode[savedItemPage](t, data, "sharedFormulas")
	ids := map[string]bool{}
	for _, it := range page.Items {
		ids[it.ID] = true
	}
	require.True(t, ids[fmt.Sprint(s.publicA)], "the viewer's own public formula is listed")
	require.True(t, ids[fmt.Sprint(s.sourceB)], "another owner's public formula is listed")
	require.True(t, ids[fmt.Sprint(s.linkA)], "SHARED includes the viewer's own rows, links too")
}

// TestSavedItemRoundTrips pins one read by id. A link's payload is resolved from
// its source in the same statement.
func TestSavedItemRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	data := h.roundTrips(2, s.tokenA, savedItemRoundTripQuery, map[string]any{"id": fmt.Sprint(s.linkA)})

	item := decode[*savedItemNode](t, data, "savedItem")
	require.NotNil(t, item)
	require.Equal(t, "LINK", item.Origin)
	require.True(t, item.SourceAvailable)
	require.NotEmpty(t, item.Payload, "the link shows its source's payload")
}

// TestCreateSavedFormulaRoundTrips pins the cost of creating one formula: one
// insert, and the owner returned through its loader.
func TestCreateSavedFormulaRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	input := map[string]any{
		"name":    "Created formula",
		"payload": map[string]any{"expression": map[string]any{"const": 1}},
	}
	data := h.roundTrips(2, s.tokenA, createSavedFormulaRoundTripMutation, map[string]any{"input": input})

	item := decode[savedItemNode](t, data, "createSavedFormula")
	require.Equal(t, "Created formula", item.Name)
	require.Equal(t, "PRIVATE", item.Privacy, "privacy defaults to PRIVATE")
}

// TestUpdateSavedFormulaRoundTrips pins the cost of renaming an owned formula.
func TestUpdateSavedFormulaRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	input := map[string]any{"id": fmt.Sprint(s.privateA), "name": "Renamed"}
	data := h.roundTrips(3, s.tokenA, updateSavedFormulaRoundTripMutation, map[string]any{"input": input})

	item := decode[savedItemNode](t, data, "updateSavedFormula")
	require.Equal(t, "Renamed", item.Name)
}

// TestDeleteSavedItemRoundTrips pins the cost of soft-deleting an owned item.
func TestDeleteSavedItemRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	data := h.roundTrips(1, s.tokenA, deleteSavedItemRoundTripMutation, map[string]any{"id": fmt.Sprint(s.privateA)})

	var deleted bool
	require.NoError(t, json.Unmarshal(data["deleteSavedItem"], &deleted))
	require.True(t, deleted)
}

// TestRestoreSavedItemRoundTrips pins the cost of restoring a deleted owned item.
func TestRestoreSavedItemRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	softDeleteSaved(t, h, s.ownerA, s.privateA)
	h.warm(s.tokenA)

	data := h.roundTrips(3, s.tokenA, restoreSavedItemRoundTripMutation, map[string]any{"id": fmt.Sprint(s.privateA)})

	item := decode[savedItemNode](t, data, "restoreSavedItem")
	require.Equal(t, "A private", item.Name)
}

// TestSetSavedItemPrivacyRoundTrips pins the cost of publishing an owned formula.
func TestSetSavedItemPrivacyRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	data := h.roundTrips(3, s.tokenA, setSavedItemPrivacyRoundTripMutation, map[string]any{"id": fmt.Sprint(s.privateA), "privacy": "PUBLIC"})

	item := decode[savedItemNode](t, data, "setSavedItemPrivacy")
	require.Equal(t, "PUBLIC", item.Privacy)
}

// TestCopySavedItemRoundTrips pins the cost of copying another owner's public
// formula: the source is read, then the copy is inserted.
func TestCopySavedItemRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	data := h.roundTrips(4, s.tokenA, copySavedItemRoundTripMutation, map[string]any{"id": fmt.Sprint(s.sourceB)})

	item := decode[savedItemNode](t, data, "copySavedItem")
	require.Equal(t, "COPY", item.Origin)
	require.NotNil(t, item.SourceID)
	require.Equal(t, fmt.Sprint(s.sourceB), *item.SourceID)
}

// TestLinkSavedItemRoundTrips pins the cost of linking to another owner's public
// formula: the source is read, then the link is inserted.
func TestLinkSavedItemRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	data := h.roundTrips(4, s.tokenA, linkSavedItemRoundTripMutation, map[string]any{"id": fmt.Sprint(s.sourceB)})

	item := decode[savedItemNode](t, data, "linkSavedItem")
	require.Equal(t, "LINK", item.Origin)
	require.True(t, item.SourceAvailable)
}

// TestConvertLinkToCopyRoundTrips pins the cost of turning an owned link into a
// copy: one statement that copies the source's payload.
func TestConvertLinkToCopyRoundTrips(t *testing.T) {
	h := newHarness(t)
	s := seedSavedItems(t, h)
	h.warm(s.tokenA)

	data := h.roundTrips(3, s.tokenA, convertLinkToCopyRoundTripMutation, map[string]any{"id": fmt.Sprint(s.linkA)})

	item := decode[savedItemNode](t, data, "convertLinkToCopy")
	require.Equal(t, "COPY", item.Origin)
	require.NotEmpty(t, item.Payload)
}
