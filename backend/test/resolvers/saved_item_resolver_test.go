package resolvers_test

// Saved formulas through the GraphQL layer: auth on every write and on
// mySavedFormulas, null for hidden rows, the source and payload rules on read,
// the field mapping, and the error text each service error becomes. The fake
// repository is in memory and owner-scoped like the SQL; the service is real.

import (
	"context"
	"encoding/json"
	"errors"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/dataloader"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

const (
	ssAlice = 1
	ssBob   = 2
)

// ssRepo is an in-memory SavedItemRepository. Only the methods the tests reach
// are implemented; any other call panics (nil embedded interface). writes counts
// the writes that succeeded.
type ssRepo struct {
	repositories.SavedItemRepository
	rows   []*domain.SavedItem
	writes int
}

func (r *ssRepo) row(id int) *domain.SavedItem {
	for _, it := range r.rows {
		if it.ID == id {
			return it
		}
	}
	return nil
}

func (r *ssRepo) GetByID(_ context.Context, id int) (*domain.SavedItem, error) {
	if it := r.row(id); it != nil {
		c := *it
		return &c, nil
	}
	return nil, domain.ErrNotFound
}

// List applies the scope the way the SQL does: MINE is the viewer's own rows;
// SHARED is public rows plus the viewer's own.
func (r *ssRepo) List(_ context.Context, p domain.SavedItemListParams) (*domain.PaginatedSavedItems, error) {
	var items []*domain.SavedItem
	for _, it := range r.rows {
		if it.Type != p.Type {
			continue
		}
		own := p.ViewerID != nil && *p.ViewerID == it.UserID
		switch p.Scope {
		case domain.SavedItemScopeMine:
			if !own {
				continue
			}
		case domain.SavedItemScopeShared:
			if it.Privacy != domain.PrivacyPublic && !own {
				continue
			}
		}
		c := *it
		items = append(items, &c)
	}
	return &domain.PaginatedSavedItems{Items: items}, nil
}

func (r *ssRepo) NamesWithPrefix(_ context.Context, userID int, itemType domain.SavedItemType, prefix string) ([]string, error) {
	var names []string
	for _, it := range r.rows {
		if it.UserID == userID && it.Type == itemType && len(it.Name) >= len(prefix) && it.Name[:len(prefix)] == prefix {
			names = append(names, it.Name)
		}
	}
	return names, nil
}

// Create refuses a name the owner already uses (ErrAlreadyExists). The name
// "explode" stands for an unexpected database failure.
func (r *ssRepo) Create(_ context.Context, item *domain.SavedItem) (*domain.SavedItem, error) {
	if item.Name == "explode" {
		return nil, errors.New("disk on fire")
	}
	for _, it := range r.rows {
		if it.UserID == item.UserID && it.Type == item.Type && it.Name == item.Name {
			return nil, domain.ErrAlreadyExists
		}
	}
	c := *item
	c.ID = 1000 + len(r.rows)
	c.CreatedAt = time.Date(2026, 11, 20, 9, 0, 0, 0, time.UTC)
	c.UpdatedAt = c.CreatedAt
	r.rows = append(r.rows, &c)
	r.writes++
	out := c
	return &out, nil
}

// Update is owner-scoped: a row the actor does not own (or a missing row) is
// ErrNotFound and writes nothing.
func (r *ssRepo) Update(_ context.Context, item *domain.SavedItem, actorUserID int) (*domain.SavedItem, error) {
	it := r.row(item.ID)
	if it == nil || it.UserID != actorUserID {
		return nil, domain.ErrNotFound
	}
	it.Name = item.Name
	it.Payload = item.Payload
	r.writes++
	c := *it
	return &c, nil
}

// ssFixture: alice (1) and bob (2). Alice's rows are 1, 2, 5 to 9; bob's are 3
// and 4. Row 8 is a THEME, which the formula endpoints must not touch.
func ssFixture() *ssRepo {
	created := time.Date(2026, 11, 1, 10, 0, 0, 0, time.UTC)
	updated := time.Date(2026, 11, 2, 10, 0, 0, 0, time.UTC)
	formula := json.RawMessage(`{"expression":{"op":"div","args":[{"operand":"tmdb"},{"operand":"budget"}]},"subtitle":"per $1M"}`)
	row := func(id, owner int, typ domain.SavedItemType, name string, privacy domain.Privacy, origin domain.SavedItemOrigin) *domain.SavedItem {
		return &domain.SavedItem{
			ID: id, UserID: owner, Type: typ, Name: name, Privacy: privacy, Origin: origin,
			Payload: formula, PayloadVersion: 1, CreatedAt: created, UpdatedAt: updated,
		}
	}
	src := 4
	mine := row(1, ssAlice, domain.SavedItemTypeFormula, "Mine", domain.PrivacyPrivate, domain.SavedItemOriginOwn)
	shared := row(2, ssAlice, domain.SavedItemTypeFormula, "Shared", domain.PrivacyPublic, domain.SavedItemOriginOwn)
	bobPrivate := row(3, ssBob, domain.SavedItemTypeFormula, "Bob private", domain.PrivacyPrivate, domain.SavedItemOriginOwn)
	bobPublic := row(4, ssBob, domain.SavedItemTypeFormula, "Bob public", domain.PrivacyPublic, domain.SavedItemOriginOwn)
	copyLive := row(5, ssAlice, domain.SavedItemTypeFormula, "Copy live", domain.PrivacyPrivate, domain.SavedItemOriginCopy)
	copyLive.SourceID, copyLive.SourceAvailable = &src, true
	copyGone := row(6, ssAlice, domain.SavedItemTypeFormula, "Copy gone", domain.PrivacyPrivate, domain.SavedItemOriginCopy)
	copyGone.SourceID, copyGone.SourceAvailable = &src, false
	linkGone := row(7, ssAlice, domain.SavedItemTypeFormula, "Link gone", domain.PrivacyPrivate, domain.SavedItemOriginLink)
	linkGone.SourceID, linkGone.SourceAvailable, linkGone.Payload = &src, false, nil
	theme := row(8, ssAlice, domain.SavedItemTypeTheme, "Dark", domain.PrivacyPrivate, domain.SavedItemOriginOwn)
	theme.Payload = nil
	linkLive := row(9, ssAlice, domain.SavedItemTypeFormula, "Link live", domain.PrivacyPrivate, domain.SavedItemOriginLink)
	linkLive.SourceID, linkLive.SourceAvailable = &src, true
	return &ssRepo{rows: []*domain.SavedItem{mine, shared, bobPrivate, bobPublic, copyLive, copyGone, linkGone, theme, linkLive}}
}

// ssServer serves the schema with the saved item service over repo, with the
// given viewer (0 = anonymous), behind the real dataloader middleware.
func ssServer(t *testing.T, repo *ssRepo, viewer int) *httptest.Server {
	t.Helper()
	userRepo := &mockUserRepository{getByIDFn: func(_ context.Context, id int) (*domain.User, error) {
		name, ok := utUsernames[id]
		if !ok {
			return nil, domain.ErrNotFound
		}
		return &domain.User{ID: id, Username: name, Active: true, Role: domain.UserRoleDefault}, nil
	}}
	contentRepo := &mockContentRepository{}
	perspectiveRepo := &mockPerspectiveRepository{}
	contentService := services.NewContentService(contentRepo, &mockYouTubeClient{}, nil)
	userService := services.NewUserService(userRepo, contentRepo, perspectiveRepo, nil, nil, nil)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(&mockCategoryRepository{}, contentRepo, &mockWikidataClient{})
	savedService := services.NewSavedItemService(repo)

	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService, nil, savedService, nil, nil, nil)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
	gqlConfig := generated.Config{
		Resolvers: resolver,
		Directives: generated.DirectiveRoot{
			Auth:  directiveRoot.Auth,
			Owner: directiveRoot.Owner,
		},
	}
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(gqlConfig))
	loaders := dataloader.Middleware(dataloader.Services{User: userService, Content: contentService})
	return httptest.NewServer(loaders(utWithViewer(viewer, srv)))
}

// ssItem reads savedItem(id) with the common fields and the formula payload.
type ssItem struct {
	ID              string         `json:"id"`
	Type            string         `json:"type"`
	Name            string         `json:"name"`
	Privacy         string         `json:"privacy"`
	Origin          string         `json:"origin"`
	SourceID        *string        `json:"sourceId"`
	SourceAvailable bool           `json:"sourceAvailable"`
	PayloadVersion  int            `json:"payloadVersion"`
	CreatedAt       string         `json:"createdAt"`
	UpdatedAt       string         `json:"updatedAt"`
	Payload         map[string]any `json:"payload"`
}

const ssItemFields = `id type name privacy origin sourceId sourceAvailable payloadVersion createdAt updatedAt ... on SavedFormula { payload }`

// ssReadItem runs savedItem(id) and decodes the item. A null item is returned as
// nil with no error.
func ssReadItem(t *testing.T, srv *httptest.Server, id string) (*ssItem, utResponse) {
	t.Helper()
	resp := utQuery(t, srv, `{ savedItem(id: "`+id+`") { `+ssItemFields+` } }`)
	require.Empty(t, resp.Errors)
	var data struct {
		SavedItem *ssItem `json:"savedItem"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	return data.SavedItem, resp
}

// --- auth ---------------------------------------------------------------------

// Every write and mySavedFormulas refuse an anonymous caller, and nothing is
// written.
func TestSavedItemOperations_RejectAnonymous(t *testing.T) {
	operations := map[string]string{
		"createSavedFormula":  `mutation { createSavedFormula(input: { name: "x", payload: { expression: { const: 1 } } }) { id } }`,
		"updateSavedFormula":  `mutation { updateSavedFormula(input: { id: 1, name: "x" }) { id } }`,
		"deleteSavedItem":     `mutation { deleteSavedItem(id: "1") }`,
		"restoreSavedItem":    `mutation { restoreSavedItem(id: "1") { id } }`,
		"setSavedItemPrivacy": `mutation { setSavedItemPrivacy(id: "1", privacy: PUBLIC) { id } }`,
		"copySavedItem":       `mutation { copySavedItem(id: "2") { id } }`,
		"linkSavedItem":       `mutation { linkSavedItem(id: "2") { id } }`,
		"convertLinkToCopy":   `mutation { convertLinkToCopy(id: "7") { id } }`,
		"mySavedFormulas":     `{ mySavedFormulas(first: 10) { items { id } } }`,
	}
	for name, query := range operations {
		t.Run(name, func(t *testing.T) {
			repo := ssFixture()
			srv := ssServer(t, repo, 0)
			defer srv.Close()

			resp := utQuery(t, srv, query)
			require.NotEmpty(t, resp.Errors, "anonymous %s must be refused", name)
			assert.Contains(t, resp.Errors[0].Message, "access denied")
			assert.Zero(t, repo.writes, "a refused request must not write")
		})
	}
}

func TestMySavedFormulas_ListsOnlyTheViewersOwnFormulas(t *testing.T) {
	repo := ssFixture()
	srv := ssServer(t, repo, ssAlice)
	defer srv.Close()

	resp := utQuery(t, srv, `{ mySavedFormulas(first: 10) { items { id } } }`)
	require.Empty(t, resp.Errors)
	var data struct {
		MySavedFormulas struct {
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
		} `json:"mySavedFormulas"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	var ids []string
	for _, it := range data.MySavedFormulas.Items {
		ids = append(ids, it.ID)
	}
	// Alice's formulas: 1, 2, 5, 6, 7 and 9. Bob's rows and the THEME (8) are out.
	assert.ElementsMatch(t, []string{"1", "2", "5", "6", "7", "9"}, ids)
}

// --- reads --------------------------------------------------------------------

// A copy or link with an unreadable source shows no sourceId, so a private or
// deleted source is not confirmed to exist.
func TestSavedItem_SourceIDOnlyWhileReadable(t *testing.T) {
	srv := ssServer(t, ssFixture(), ssAlice)
	defer srv.Close()

	readable, _ := ssReadItem(t, srv, "5")
	require.NotNil(t, readable)
	require.NotNil(t, readable.SourceID)
	assert.Equal(t, "4", *readable.SourceID)
	assert.True(t, readable.SourceAvailable)

	gone, _ := ssReadItem(t, srv, "6")
	require.NotNil(t, gone)
	assert.Nil(t, gone.SourceID, "an unreadable source is not exposed")
	assert.False(t, gone.SourceAvailable)
}

// A link whose source is unreadable has no payload.
func TestSavedItem_UnreadableLinkHasNullPayload(t *testing.T) {
	srv := ssServer(t, ssFixture(), ssAlice)
	defer srv.Close()

	link, _ := ssReadItem(t, srv, "7")
	require.NotNil(t, link)
	assert.Equal(t, "LINK", link.Origin)
	assert.Nil(t, link.Payload)
	assert.False(t, link.SourceAvailable)

	readable, _ := ssReadItem(t, srv, "9")
	require.NotNil(t, readable)
	assert.NotNil(t, readable.Payload, "a link with a readable source shows its payload")
}

// A missing row, and a non-formula row read as a saved item, are null.
func TestSavedItem_NullForMissingAndNonFormulaRows(t *testing.T) {
	srv := ssServer(t, ssFixture(), ssAlice)
	defer srv.Close()

	for _, id := range []string{"999", "8"} {
		t.Run("id "+id, func(t *testing.T) {
			item, resp := ssReadItem(t, srv, id)
			assert.Nil(t, item)
			assert.Empty(t, resp.Errors)
		})
	}
}

// Another user's PRIVATE row answers null, not an error, so the id isn't confirmed.
func TestSavedItem_OtherUsersPrivateRowIsNull(t *testing.T) {
	srv := ssServer(t, ssFixture(), ssAlice)
	defer srv.Close()

	item, resp := ssReadItem(t, srv, "3")
	assert.Nil(t, item)
	assert.Empty(t, resp.Errors)

	public, _ := ssReadItem(t, srv, "4")
	require.NotNil(t, public, "another user's public row is visible")
}

// Every field of the formula maps through, including the owner and the payload.
func TestSavedItem_MapsEveryField(t *testing.T) {
	srv := ssServer(t, ssFixture(), ssAlice)
	defer srv.Close()

	resp := utQuery(t, srv, `{ savedItem(id: "5") { id type name privacy origin sourceId sourceAvailable payloadVersion createdAt updatedAt user { id username } ... on SavedFormula { payload } } }`)
	require.Empty(t, resp.Errors)
	var data struct {
		SavedItem struct {
			ID              string  `json:"id"`
			Type            string  `json:"type"`
			Name            string  `json:"name"`
			Privacy         string  `json:"privacy"`
			Origin          string  `json:"origin"`
			SourceID        *string `json:"sourceId"`
			SourceAvailable bool    `json:"sourceAvailable"`
			PayloadVersion  int     `json:"payloadVersion"`
			CreatedAt       string  `json:"createdAt"`
			UpdatedAt       string  `json:"updatedAt"`
			User            struct {
				ID       string `json:"id"`
				Username string `json:"username"`
			} `json:"user"`
			Payload map[string]any `json:"payload"`
		} `json:"savedItem"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	got := data.SavedItem

	assert.Equal(t, "5", got.ID)
	assert.Equal(t, "FORMULA", got.Type)
	assert.Equal(t, "Copy live", got.Name)
	assert.Equal(t, "PRIVATE", got.Privacy)
	assert.Equal(t, "COPY", got.Origin)
	require.NotNil(t, got.SourceID)
	assert.Equal(t, "4", *got.SourceID)
	assert.True(t, got.SourceAvailable)
	assert.Equal(t, 1, got.PayloadVersion)
	assert.Equal(t, "2026-11-01T10:00:00Z", got.CreatedAt)
	assert.Equal(t, "2026-11-02T10:00:00Z", got.UpdatedAt)
	assert.Equal(t, "1", got.User.ID)
	assert.Equal(t, "alice", got.User.Username)
	assert.Equal(t, map[string]any{
		"expression": map[string]any{
			"op":   "div",
			"args": []any{map[string]any{"operand": "tmdb"}, map[string]any{"operand": "budget"}},
		},
		"subtitle": "per $1M",
	}, got.Payload)
}

// --- writes -------------------------------------------------------------------

// A write's error text is the client-facing contract, one case per service error.
func TestSavedItem_WriteErrorsReadAsTheirCategory(t *testing.T) {
	cases := []struct {
		name         string
		query        string
		wantContains string
		wantNotIn    string
	}{
		{
			name:         "another user's public formula is forbidden",
			query:        `mutation { updateSavedFormula(input: { id: 4, name: "x" }) { id } }`,
			wantContains: "access denied: you can only modify your own saved items",
		},
		{
			name:         "another user's private formula is not found",
			query:        `mutation { updateSavedFormula(input: { id: 3, name: "x" }) { id } }`,
			wantContains: "saved item not found",
		},
		{
			name:         "a name the owner already uses is already exists",
			query:        `mutation { createSavedFormula(input: { name: "Mine", payload: { expression: { operand: "x" } } }) { id } }`,
			wantContains: "already exists",
		},
		{
			name:         "a malformed payload is invalid input",
			query:        `mutation { createSavedFormula(input: { name: "Fresh", payload: { expression: { op: "pow" } } }) { id } }`,
			wantContains: "invalid input",
		},
		{
			name:         "a formula update on a theme row is invalid input",
			query:        `mutation { updateSavedFormula(input: { id: 8, name: "Renamed" }) { id } }`,
			wantContains: "invalid input",
		},
		{
			name:         "an unexpected repository failure is generic and does not leak",
			query:        `mutation { createSavedFormula(input: { name: "explode", payload: { expression: { operand: "x" } } }) { id } }`,
			wantContains: "failed to process saved item",
			wantNotIn:    "disk on fire",
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := ssFixture()
			srv := ssServer(t, repo, ssAlice)
			defer srv.Close()
			before := repo.writes

			resp := utQuery(t, srv, tc.query)
			require.NotEmpty(t, resp.Errors)
			assert.Contains(t, resp.Errors[0].Message, tc.wantContains)
			if tc.wantNotIn != "" {
				assert.NotContains(t, resp.Errors[0].Message, tc.wantNotIn)
			}
			assert.Equal(t, before, repo.writes, "a refused write must not change the store")
		})
	}
}

func TestSavedItem_CreateFormulaDefaultsToPrivate(t *testing.T) {
	repo := ssFixture()
	srv := ssServer(t, repo, ssAlice)
	defer srv.Close()

	resp := utQuery(t, srv, `mutation { createSavedFormula(input: { name: "Fresh", payload: { expression: { operand: "tmdb" } } }) { id name privacy origin } }`)
	require.Empty(t, resp.Errors)
	var data struct {
		CreateSavedFormula struct {
			Name    string `json:"name"`
			Privacy string `json:"privacy"`
			Origin  string `json:"origin"`
		} `json:"createSavedFormula"`
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	assert.Equal(t, "Fresh", data.CreateSavedFormula.Name)
	assert.Equal(t, "PRIVATE", data.CreateSavedFormula.Privacy)
	assert.Equal(t, "OWN", data.CreateSavedFormula.Origin)
	assert.Equal(t, 1, repo.writes)
}
