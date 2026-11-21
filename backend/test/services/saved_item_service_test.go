package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const (
	siAnonymous = 0
	siAlice     = 1
	siBob       = 2
	siMissing   = 99
)

// siPayload is a valid formula payload.
var siPayload = json.RawMessage(`{"expression":{"op":"div","args":[{"operand":"tmdb"},{"operand":"budget"}]}}`)

// mockSavedItemRepo implements repositories.SavedItemRepository in memory. Its
// defaults follow the SQL: writes are scoped to the owner's live rows, and a
// zero-row write is domain.ErrNotFound. Each *Fn field overrides one method.
// calls records the method names in order; created records every Create input.
type mockSavedItemRepo struct {
	rows []*domain.SavedItem

	listFn       func(ctx context.Context, params domain.SavedItemListParams) (*domain.PaginatedSavedItems, error)
	createFn     func(ctx context.Context, item *domain.SavedItem) (*domain.SavedItem, error)
	updateFn     func(ctx context.Context, item *domain.SavedItem, actorUserID int) (*domain.SavedItem, error)
	setPrivacyFn func(ctx context.Context, id int, privacy domain.Privacy, actorUserID int) (*domain.SavedItem, error)
	deleteFn     func(ctx context.Context, id int, actorUserID int) error
	restoreFn    func(ctx context.Context, id int, actorUserID int) error
	convertFn    func(ctx context.Context, id int, actorUserID int) (*domain.SavedItem, error)
	reassignFn   func(ctx context.Context, fromUserID, toUserID int) error

	calls   []string
	created []*domain.SavedItem
	listed  []domain.SavedItemListParams
	// succeeded counts the writes that returned no error. A zero-row write that
	// the service reports as not found or forbidden is not a write.
	succeeded int
}

var _ repositories.SavedItemRepository = (*mockSavedItemRepo)(nil)

// writes reports how many writes succeeded.
func (m *mockSavedItemRepo) writes() int {
	return m.succeeded
}

// ok counts a successful write and passes err through.
func (m *mockSavedItemRepo) ok(err error) error {
	if err == nil {
		m.succeeded++
	}
	return err
}

// ownedLive returns a copy of the row when actor owns it, else ErrNotFound.
func (m *mockSavedItemRepo) ownedLive(id, actor int) (*domain.SavedItem, error) {
	for _, r := range m.rows {
		if r.ID == id && r.UserID == actor {
			c := *r
			return &c, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (m *mockSavedItemRepo) List(ctx context.Context, params domain.SavedItemListParams) (*domain.PaginatedSavedItems, error) {
	m.calls = append(m.calls, "list")
	m.listed = append(m.listed, params)
	if m.listFn != nil {
		return m.listFn(ctx, params)
	}
	return &domain.PaginatedSavedItems{Items: []*domain.SavedItem{}}, nil
}

func (m *mockSavedItemRepo) GetByID(_ context.Context, id int) (*domain.SavedItem, error) {
	m.calls = append(m.calls, "get")
	for _, r := range m.rows {
		if r.ID == id {
			c := *r
			return &c, nil
		}
	}
	return nil, domain.ErrNotFound
}

func (m *mockSavedItemRepo) NamesWithPrefix(_ context.Context, userID int, itemType domain.SavedItemType, prefix string) ([]string, error) {
	m.calls = append(m.calls, "names")
	var out []string
	for _, r := range m.rows {
		if r.UserID == userID && r.Type == itemType && strings.HasPrefix(r.Name, prefix) {
			out = append(out, r.Name)
		}
	}
	return out, nil
}

func (m *mockSavedItemRepo) Create(ctx context.Context, item *domain.SavedItem) (*domain.SavedItem, error) {
	m.calls = append(m.calls, "create")
	in := *item
	m.created = append(m.created, &in)
	if m.createFn != nil {
		created, err := m.createFn(ctx, item)
		return created, m.ok(err)
	}
	out := *item
	out.ID = 100
	return &out, m.ok(nil)
}

func (m *mockSavedItemRepo) Update(ctx context.Context, item *domain.SavedItem, actorUserID int) (*domain.SavedItem, error) {
	m.calls = append(m.calls, "update")
	if m.updateFn != nil {
		updated, err := m.updateFn(ctx, item, actorUserID)
		return updated, m.ok(err)
	}
	if _, err := m.ownedLive(item.ID, actorUserID); err != nil {
		return nil, err
	}
	out := *item
	return &out, m.ok(nil)
}

func (m *mockSavedItemRepo) SetPrivacy(ctx context.Context, id int, privacy domain.Privacy, actorUserID int) (*domain.SavedItem, error) {
	m.calls = append(m.calls, "setPrivacy")
	if m.setPrivacyFn != nil {
		updated, err := m.setPrivacyFn(ctx, id, privacy, actorUserID)
		return updated, m.ok(err)
	}
	out, err := m.ownedLive(id, actorUserID)
	if err != nil {
		return nil, err
	}
	out.Privacy = privacy
	return out, m.ok(nil)
}

func (m *mockSavedItemRepo) Delete(ctx context.Context, id int, actorUserID int) error {
	m.calls = append(m.calls, "delete")
	if m.deleteFn != nil {
		return m.ok(m.deleteFn(ctx, id, actorUserID))
	}
	_, err := m.ownedLive(id, actorUserID)
	return m.ok(err)
}

func (m *mockSavedItemRepo) Restore(ctx context.Context, id int, actorUserID int) error {
	m.calls = append(m.calls, "restore")
	if m.restoreFn != nil {
		return m.ok(m.restoreFn(ctx, id, actorUserID))
	}
	_, err := m.ownedLive(id, actorUserID)
	return m.ok(err)
}

func (m *mockSavedItemRepo) ConvertLinkToCopy(ctx context.Context, id int, actorUserID int) (*domain.SavedItem, error) {
	m.calls = append(m.calls, "convert")
	if m.convertFn != nil {
		converted, err := m.convertFn(ctx, id, actorUserID)
		return converted, m.ok(err)
	}
	out, err := m.ownedLive(id, actorUserID)
	if err != nil {
		return nil, err
	}
	if out.Origin != domain.SavedItemOriginLink {
		return nil, domain.ErrNotFound
	}
	out.Origin = domain.SavedItemOriginCopy
	return out, m.ok(nil)
}

func (m *mockSavedItemRepo) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	m.calls = append(m.calls, "reassign")
	if m.reassignFn != nil {
		return m.reassignFn(ctx, fromUserID, toUserID)
	}
	return nil
}

// siRow builds a formula row with the valid payload.
func siRow(id, owner int, name string, privacy domain.Privacy, origin domain.SavedItemOrigin) *domain.SavedItem {
	return &domain.SavedItem{
		ID: id, UserID: owner, Type: domain.SavedItemTypeFormula, Name: name,
		Payload: siPayload, PayloadVersion: 1, Privacy: privacy, Origin: origin,
		SourceAvailable: true,
	}
}

// siOwnerRows: alice owns a private row (1), a public row (2) and a live link (3).
// bob owns a private row (4) and a public row (5).
func siOwnerRows() []*domain.SavedItem {
	return []*domain.SavedItem{
		siRow(1, siAlice, "Alice private", domain.PrivacyPrivate, domain.SavedItemOriginOwn),
		siRow(2, siAlice, "Alice public", domain.PrivacyPublic, domain.SavedItemOriginOwn),
		siRow(3, siAlice, "Alice link", domain.PrivacyPrivate, domain.SavedItemOriginLink),
		siRow(4, siBob, "Bob private", domain.PrivacyPrivate, domain.SavedItemOriginOwn),
		siRow(5, siBob, "Bob public", domain.PrivacyPublic, domain.SavedItemOriginOwn),
	}
}

// siThemeRow is a row of a type the formula endpoint must not touch.
func siThemeRow(id, owner int, privacy domain.Privacy) *domain.SavedItem {
	return &domain.SavedItem{
		ID: id, UserID: owner, Type: domain.SavedItemTypeTheme, Name: "Dark",
		Privacy: privacy, Origin: domain.SavedItemOriginOwn, PayloadVersion: 1,
	}
}

// --- owner guard --------------------------------------------------------------

// A non-owner gets ErrNotFound for a private or missing row, and ErrForbidden for
// someone else's live public row. Each write refuses before it writes.
func TestSavedItem_OwnerGuardOnWrites(t *testing.T) {
	name := "renamed"
	ops := map[string]func(svc *services.SavedItemService, actor, id int) error{
		"update": func(svc *services.SavedItemService, actor, id int) error {
			_, err := svc.UpdateSavedItem(context.Background(), actor, domain.UpdateSavedItemInput{ID: id, Type: domain.SavedItemTypeFormula, Name: &name})
			return err
		},
		"setPrivacy": func(svc *services.SavedItemService, actor, id int) error {
			_, err := svc.SetSavedItemPrivacy(context.Background(), actor, id, domain.PrivacyPublic)
			return err
		},
		"delete": func(svc *services.SavedItemService, actor, id int) error {
			return svc.DeleteSavedItem(context.Background(), actor, id)
		},
		"convert": func(svc *services.SavedItemService, actor, id int) error {
			_, err := svc.ConvertLinkToCopy(context.Background(), actor, id)
			return err
		},
	}
	cases := []struct {
		name    string
		id      int
		wantErr error
	}{
		{"private row of another user is not found", 1, domain.ErrNotFound},
		{"public row of another user is forbidden", 2, domain.ErrForbidden},
		{"missing row is not found", siMissing, domain.ErrNotFound},
	}
	for opName, op := range ops {
		for _, tc := range cases {
			t.Run(opName+"/"+tc.name, func(t *testing.T) {
				repo := &mockSavedItemRepo{rows: siOwnerRows()}
				svc := services.NewSavedItemService(repo)

				err := op(svc, siBob, tc.id)
				require.Error(t, err)
				assert.ErrorIs(t, err, tc.wantErr)
				assert.Zero(t, repo.writes(), "a refused write must not reach the repository")
			})
		}
	}
}

// --- create -------------------------------------------------------------------

func TestSavedItem_CreateValidation(t *testing.T) {
	pub := domain.PrivacyPublic
	bogus := domain.Privacy("SECRET")
	cases := []struct {
		name    string
		actor   int
		typ     domain.SavedItemType
		newName string
		payload json.RawMessage
		privacy *domain.Privacy
		wantErr error
	}{
		{"anonymous is forbidden", siAnonymous, domain.SavedItemTypeFormula, "Bang", siPayload, nil, domain.ErrForbidden},
		{"unknown type", siAlice, "BOGUS", "Bang", siPayload, nil, domain.ErrInvalidInput},
		{"empty name", siAlice, domain.SavedItemTypeFormula, "   ", siPayload, nil, domain.ErrInvalidInput},
		{"name of 101 characters", siAlice, domain.SavedItemTypeFormula, strings.Repeat("n", 101), siPayload, nil, domain.ErrInvalidInput},
		{"formula without payload", siAlice, domain.SavedItemTypeFormula, "Bang", nil, nil, domain.ErrInvalidInput},
		{"formula with a malformed expression", siAlice, domain.SavedItemTypeFormula, "Bang", json.RawMessage(`{"expression":{"op":"pow"}}`), nil, domain.ErrInvalidInput},
		{"theme takes no payload yet", siAlice, domain.SavedItemTypeTheme, "Dark", siPayload, nil, domain.ErrInvalidInput},
		{"unknown privacy", siAlice, domain.SavedItemTypeFormula, "Bang", siPayload, &bogus, domain.ErrInvalidInput},
		{"valid public formula is accepted", siAlice, domain.SavedItemTypeFormula, "Bang", siPayload, &pub, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &mockSavedItemRepo{}
			svc := services.NewSavedItemService(repo)

			_, err := svc.CreateSavedItem(context.Background(), tc.actor, domain.CreateSavedItemInput{
				Type: tc.typ, Name: tc.newName, Payload: tc.payload, Privacy: tc.privacy,
			})
			if tc.wantErr == nil {
				require.NoError(t, err)
				assert.Equal(t, 1, repo.writes())
				return
			}
			assert.ErrorIs(t, err, tc.wantErr)
			assert.Zero(t, repo.writes(), "a refused create must not reach the repository")
		})
	}
}

func TestSavedItem_CreateDefaultsAndTrimming(t *testing.T) {
	pub := domain.PrivacyPublic
	cases := []struct {
		name        string
		privacy     *domain.Privacy
		wantPrivacy domain.Privacy
	}{
		{"omitted privacy is private", nil, domain.PrivacyPrivate},
		{"explicit public is kept", &pub, domain.PrivacyPublic},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &mockSavedItemRepo{}
			svc := services.NewSavedItemService(repo)

			created, err := svc.CreateSavedItem(context.Background(), siAlice, domain.CreateSavedItemInput{
				Type: domain.SavedItemTypeFormula, Name: "  Bang  ", Payload: siPayload, Privacy: tc.privacy,
			})
			require.NoError(t, err)
			require.Len(t, repo.created, 1)
			in := repo.created[0]
			assert.Equal(t, siAlice, in.UserID)
			assert.Equal(t, "Bang", in.Name, "the stored name is trimmed")
			assert.Equal(t, domain.SavedItemOriginOwn, in.Origin)
			assert.Equal(t, tc.wantPrivacy, in.Privacy)
			assert.Equal(t, domain.SavedFormulaPayloadVersion, in.PayloadVersion)
			assert.Equal(t, tc.wantPrivacy, created.Privacy)
		})
	}
}

func TestSavedItem_CreateDuplicateNameIsAlreadyExists(t *testing.T) {
	repo := &mockSavedItemRepo{createFn: func(context.Context, *domain.SavedItem) (*domain.SavedItem, error) {
		return nil, domain.ErrAlreadyExists
	}}
	svc := services.NewSavedItemService(repo)

	_, err := svc.CreateSavedItem(context.Background(), siAlice, domain.CreateSavedItemInput{
		Type: domain.SavedItemTypeFormula, Name: "Bang", Payload: siPayload,
	})
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
}

// --- update -------------------------------------------------------------------

// The formula update path must not write to a row of another type. A name-only
// update still goes through the type check, so a THEME row is refused.
func TestSavedItem_UpdateRules(t *testing.T) {
	rows := func() []*domain.SavedItem {
		rows := siOwnerRows()
		rows = append(rows, siThemeRow(6, siAlice, domain.PrivacyPrivate))
		rows = append(rows, siThemeRow(7, siBob, domain.PrivacyPrivate))
		rows = append(rows, siThemeRow(8, siBob, domain.PrivacyPublic))
		return rows
	}
	str := func(s string) *string { return &s }
	newPayload := json.RawMessage(`{"expression":{"const":3}}`)
	cases := []struct {
		name      string
		actor     int
		input     domain.UpdateSavedItemInput
		repoErr   error
		wantErr   error
		wantName  string
		wantWrite bool
	}{
		{"anonymous is forbidden", siAnonymous, domain.UpdateSavedItemInput{ID: 1, Type: domain.SavedItemTypeFormula, Name: str("x")}, nil, domain.ErrForbidden, "", false},
		{"id zero is invalid", siAlice, domain.UpdateSavedItemInput{ID: 0, Type: domain.SavedItemTypeFormula, Name: str("x")}, nil, domain.ErrInvalidInput, "", false},
		{"missing row is not found", siAlice, domain.UpdateSavedItemInput{ID: siMissing, Type: domain.SavedItemTypeFormula, Name: str("x")}, nil, domain.ErrNotFound, "", false},
		{"empty type is invalid", siAlice, domain.UpdateSavedItemInput{ID: 1, Name: str("x")}, nil, domain.ErrInvalidInput, "", false},
		{"unknown type is invalid", siAlice, domain.UpdateSavedItemInput{ID: 1, Type: "BOGUS", Name: str("x")}, nil, domain.ErrInvalidInput, "", false},
		{"rename is trimmed", siAlice, domain.UpdateSavedItemInput{ID: 1, Type: domain.SavedItemTypeFormula, Name: str("  Renamed  ")}, nil, nil, "Renamed", true},
		{"blank rename is invalid", siAlice, domain.UpdateSavedItemInput{ID: 1, Type: domain.SavedItemTypeFormula, Name: str("  ")}, nil, domain.ErrInvalidInput, "", false},
		{"rename to a name in use is already exists", siAlice, domain.UpdateSavedItemInput{ID: 1, Type: domain.SavedItemTypeFormula, Name: str("Taken")}, domain.ErrAlreadyExists, domain.ErrAlreadyExists, "", false},
		{"valid payload replaces the expression", siAlice, domain.UpdateSavedItemInput{ID: 1, Type: domain.SavedItemTypeFormula, Payload: newPayload}, nil, nil, "Alice private", true},
		{"invalid payload is refused", siAlice, domain.UpdateSavedItemInput{ID: 1, Type: domain.SavedItemTypeFormula, Payload: json.RawMessage(`{"expression":{"op":"pow"}}`)}, nil, domain.ErrInvalidInput, "", false},
		{"link takes no payload of its own", siAlice, domain.UpdateSavedItemInput{ID: 3, Type: domain.SavedItemTypeFormula, Payload: newPayload}, nil, domain.ErrInvalidInput, "", false},
		{"link can be renamed", siAlice, domain.UpdateSavedItemInput{ID: 3, Type: domain.SavedItemTypeFormula, Name: str("My link")}, nil, nil, "My link", true},
		{"theme row is refused for a formula update", siAlice, domain.UpdateSavedItemInput{ID: 6, Type: domain.SavedItemTypeFormula, Name: str("Renamed")}, nil, domain.ErrInvalidInput, "", false},
		{"another user's private theme is not found, not a type error", siAlice, domain.UpdateSavedItemInput{ID: 7, Type: domain.SavedItemTypeFormula, Name: str("Renamed")}, nil, domain.ErrNotFound, "", false},
		{"another user's public theme is forbidden, not a type error", siAlice, domain.UpdateSavedItemInput{ID: 8, Type: domain.SavedItemTypeFormula, Name: str("Renamed")}, nil, domain.ErrForbidden, "", false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &mockSavedItemRepo{rows: rows()}
			if tc.repoErr != nil {
				repo.updateFn = func(context.Context, *domain.SavedItem, int) (*domain.SavedItem, error) {
					return nil, tc.repoErr
				}
			}
			svc := services.NewSavedItemService(repo)

			updated, err := svc.UpdateSavedItem(context.Background(), tc.actor, tc.input)
			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.wantName, updated.Name)
			}
			if tc.wantWrite {
				assert.Equal(t, 1, repo.writes())
			} else {
				assert.Zero(t, repo.writes(), "a refused update must not reach the repository")
			}
		})
	}
}

func TestSavedItem_UpdateKeepsLinkPayloadAndSourceState(t *testing.T) {
	rows := siOwnerRows()
	rows[2].SourceAvailable = false
	rows[2].Payload = nil
	repo := &mockSavedItemRepo{rows: rows}
	svc := services.NewSavedItemService(repo)

	name := "My link"
	updated, err := svc.UpdateSavedItem(context.Background(), siAlice, domain.UpdateSavedItemInput{
		ID: 3, Type: domain.SavedItemTypeFormula, Name: &name,
	})
	require.NoError(t, err)
	assert.False(t, updated.SourceAvailable, "the read-side source flag comes from the read before the write")
	assert.Nil(t, updated.Payload, "a link with an unreadable source still has no payload")
}

// --- delete and restore -------------------------------------------------------

func TestSavedItem_DeleteRules(t *testing.T) {
	cases := []struct {
		name      string
		actor     int
		id        int
		repoErr   error
		wantErr   error
		wantOther bool // a wrapped repository failure, not a domain error
		wantWrite bool
	}{
		{"anonymous is forbidden", siAnonymous, 1, nil, domain.ErrForbidden, false, false},
		{"id zero is invalid", siAlice, 0, nil, domain.ErrInvalidInput, false, false},
		{"own row is soft-deleted", siAlice, 1, nil, nil, false, true},
		{"row already gone is not found", siAlice, siMissing, nil, domain.ErrNotFound, false, false},
		{"another user's private row is not found", siBob, 1, nil, domain.ErrNotFound, false, false},
		{"repository failure is wrapped, not a domain error", siAlice, 1, errors.New("db down"), nil, true, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &mockSavedItemRepo{rows: siOwnerRows()}
			if tc.repoErr != nil {
				repo.deleteFn = func(context.Context, int, int) error { return tc.repoErr }
			}
			svc := services.NewSavedItemService(repo)

			err := svc.DeleteSavedItem(context.Background(), tc.actor, tc.id)
			switch {
			case tc.wantOther:
				require.Error(t, err)
				assert.NotErrorIs(t, err, domain.ErrNotFound)
				assert.Contains(t, err.Error(), "failed to delete saved item")
			case tc.wantErr != nil:
				assert.ErrorIs(t, err, tc.wantErr)
			default:
				require.NoError(t, err)
			}
			if tc.wantWrite {
				assert.Equal(t, 1, repo.writes())
			} else {
				assert.Zero(t, repo.writes())
			}
		})
	}
}

func TestSavedItem_RestoreRules(t *testing.T) {
	cases := []struct {
		name      string
		actor     int
		id        int
		repoErr   error
		wantErr   error
		wantWrite bool
	}{
		{"anonymous is forbidden", siAnonymous, 1, nil, domain.ErrForbidden, false},
		{"id zero is invalid", siAlice, 0, nil, domain.ErrInvalidInput, false},
		{"a row the actor does not own is not found", siBob, 1, nil, domain.ErrNotFound, false},
		{"a name in use again is already exists", siAlice, 1, domain.ErrAlreadyExists, domain.ErrAlreadyExists, false},
		{"own deleted row is restored and returned", siAlice, 1, nil, nil, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &mockSavedItemRepo{rows: siOwnerRows()}
			if tc.repoErr != nil {
				repo.restoreFn = func(context.Context, int, int) error { return tc.repoErr }
			}
			svc := services.NewSavedItemService(repo)

			restored, err := svc.RestoreSavedItem(context.Background(), tc.actor, tc.id)
			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
			} else {
				require.NoError(t, err)
				require.NotNil(t, restored)
				assert.Equal(t, tc.id, restored.ID)
			}
			if tc.wantWrite {
				assert.Equal(t, 1, repo.writes())
			} else {
				assert.Zero(t, repo.writes())
			}
		})
	}
}

// --- privacy ------------------------------------------------------------------

func TestSavedItem_SetPrivacyRules(t *testing.T) {
	rows := func() []*domain.SavedItem {
		unavailableLink := siRow(10, siAlice, "Gone link", domain.PrivacyPrivate, domain.SavedItemOriginLink)
		unavailableLink.SourceAvailable = false
		unavailableLink.Payload = nil
		availableLink := siRow(11, siAlice, "Live link", domain.PrivacyPrivate, domain.SavedItemOriginLink)
		availableLink.SourceAvailable = true
		return append(siOwnerRows(), unavailableLink, availableLink)
	}
	cases := []struct {
		name      string
		actor     int
		id        int
		privacy   domain.Privacy
		repoErr   error
		wantErr   error
		wantWrite bool
	}{
		{"anonymous is forbidden", siAnonymous, 1, domain.PrivacyPublic, nil, domain.ErrForbidden, false},
		{"id zero is invalid", siAlice, 0, domain.PrivacyPublic, nil, domain.ErrInvalidInput, false},
		{"unknown privacy is invalid", siAlice, 1, domain.Privacy("SECRET"), nil, domain.ErrInvalidInput, false},
		{"own formula can be made public", siAlice, 1, domain.PrivacyPublic, nil, nil, true},
		{"own public formula can be made private", siAlice, 2, domain.PrivacyPrivate, nil, nil, true},
		{"link with unreadable source cannot be made public", siAlice, 10, domain.PrivacyPublic, nil, domain.ErrInvalidInput, false},
		{"link with readable source can be made public", siAlice, 11, domain.PrivacyPublic, nil, nil, true},
		{"link with unreadable source can be made private", siAlice, 10, domain.PrivacyPrivate, nil, nil, true},
		{"repository refusal is passed through", siAlice, 1, domain.PrivacyPublic, domain.ErrInvalidInput, domain.ErrInvalidInput, false},
		{"missing row is not found", siAlice, siMissing, domain.PrivacyPublic, nil, domain.ErrNotFound, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &mockSavedItemRepo{rows: rows()}
			if tc.repoErr != nil {
				repo.setPrivacyFn = func(context.Context, int, domain.Privacy, int) (*domain.SavedItem, error) {
					return nil, tc.repoErr
				}
			}
			svc := services.NewSavedItemService(repo)

			updated, err := svc.SetSavedItemPrivacy(context.Background(), tc.actor, tc.id, tc.privacy)
			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
			} else {
				require.NoError(t, err)
				assert.Equal(t, tc.privacy, updated.Privacy)
			}
			if tc.wantWrite {
				assert.Equal(t, 1, repo.writes())
			} else {
				assert.Zero(t, repo.writes())
			}
		})
	}
}

// --- copy and link ------------------------------------------------------------

// siSourceRows: bob's public OWN (10), public COPY (11), public LINK (12) and
// private OWN (14); alice's private OWN (13); nothing at 99.
func siSourceRows() []*domain.SavedItem {
	link := siRow(12, siBob, "Bob link", domain.PrivacyPublic, domain.SavedItemOriginLink)
	return []*domain.SavedItem{
		siRow(10, siBob, "Bang", domain.PrivacyPublic, domain.SavedItemOriginOwn),
		siRow(11, siBob, "Kept", domain.PrivacyPublic, domain.SavedItemOriginCopy),
		link,
		siRow(13, siAlice, "Mine", domain.PrivacyPrivate, domain.SavedItemOriginOwn),
		siRow(14, siBob, "Bob secret", domain.PrivacyPrivate, domain.SavedItemOriginOwn),
	}
}

// Copy and link share the source rules: public OWN or COPY only, no chains, and
// no copy of your own private item. Only a copy stores the payload.
func TestSavedItem_CopyAndLinkSourceRules(t *testing.T) {
	cases := []struct {
		name    string
		actor   int
		source  int
		wantErr error
	}{
		{"public own item is accepted", siAlice, 10, nil},
		{"public copy is accepted", siAlice, 11, nil},
		{"public link is refused (no chains)", siAlice, 12, domain.ErrInvalidInput},
		{"own private item is refused", siAlice, 13, domain.ErrInvalidInput},
		{"another user's private item is not found", siAlice, 14, domain.ErrNotFound},
		{"missing source is not found", siAlice, siMissing, domain.ErrNotFound},
		{"source id zero is invalid", siAlice, 0, domain.ErrInvalidInput},
		{"anonymous is forbidden", siAnonymous, 10, domain.ErrForbidden},
	}
	ops := []struct {
		name   string
		origin domain.SavedItemOrigin
		run    func(svc *services.SavedItemService, actor, source int) (*domain.SavedItem, error)
	}{
		{"copy", domain.SavedItemOriginCopy, func(svc *services.SavedItemService, actor, source int) (*domain.SavedItem, error) {
			return svc.CopySavedItem(context.Background(), actor, source)
		}},
		{"link", domain.SavedItemOriginLink, func(svc *services.SavedItemService, actor, source int) (*domain.SavedItem, error) {
			return svc.LinkSavedItem(context.Background(), actor, source)
		}},
	}
	for _, op := range ops {
		for _, tc := range cases {
			t.Run(op.name+"/"+tc.name, func(t *testing.T) {
				repo := &mockSavedItemRepo{rows: siSourceRows()}
				svc := services.NewSavedItemService(repo)

				created, err := op.run(svc, tc.actor, tc.source)
				if tc.wantErr != nil {
					assert.ErrorIs(t, err, tc.wantErr)
					assert.Zero(t, repo.writes(), "a refused copy or link must not reach the repository")
					return
				}
				require.NoError(t, err)
				require.Len(t, repo.created, 1)
				in := repo.created[0]
				assert.Equal(t, tc.actor, in.UserID)
				assert.Equal(t, domain.PrivacyPrivate, in.Privacy, "the new row is private")
				assert.Equal(t, op.origin, in.Origin)
				require.NotNil(t, in.SourceID)
				assert.Equal(t, tc.source, *in.SourceID)
				assert.Equal(t, domain.SavedItemTypeFormula, in.Type)

				assert.Equal(t, op.origin, created.Origin)
				assert.True(t, created.SourceAvailable)
				assert.Equal(t, siPayload, created.Payload, "the result shows the payload both ways")
				if op.origin == domain.SavedItemOriginCopy {
					assert.Equal(t, siPayload, in.Payload, "a copy stores the source payload")
				} else {
					assert.Nil(t, in.Payload, "a link stores no payload of its own")
				}
			})
		}
	}
}

// A copy or link takes the source's name, with " (copy)", " (copy 2)", ... when
// the owner already uses it. The stem is cut to 80 characters so the suffix fits.
func TestSavedItem_CopyNameSuffix(t *testing.T) {
	long := strings.Repeat("a", 100)
	cases := []struct {
		name     string
		srcName  string
		ownNames []string
		wantName string
	}{
		{"free name is kept", "Bang", nil, "Bang"},
		{"taken name gets copy suffix", "Bang", []string{"Bang"}, "Bang (copy)"},
		{"second copy gets copy 2", "Bang", []string{"Bang", "Bang (copy)"}, "Bang (copy 2)"},
		{"first free gap is used", "Bang", []string{"Bang", "Bang (copy 2)"}, "Bang (copy)"},
		{"a suffix alone does not take the base name", "Bang", []string{"Bang (copy)"}, "Bang"},
		{"long name is cut to fit the suffix", long, []string{long}, strings.Repeat("a", 80) + " (copy)"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			rows := []*domain.SavedItem{siRow(10, siBob, tc.srcName, domain.PrivacyPublic, domain.SavedItemOriginOwn)}
			for i, n := range tc.ownNames {
				rows = append(rows, siRow(20+i, siAlice, n, domain.PrivacyPrivate, domain.SavedItemOriginOwn))
			}
			repo := &mockSavedItemRepo{rows: rows}
			svc := services.NewSavedItemService(repo)

			copied, err := svc.CopySavedItem(context.Background(), siAlice, 10)
			require.NoError(t, err)
			assert.Equal(t, tc.wantName, copied.Name)
		})
	}
}

// --- convert link to copy -----------------------------------------------------

func TestSavedItem_ConvertLinkToCopyRules(t *testing.T) {
	rows := func() []*domain.SavedItem {
		unavailable := siRow(7, siAlice, "Gone", domain.PrivacyPrivate, domain.SavedItemOriginLink)
		unavailable.SourceAvailable = false
		unavailable.Payload = nil
		publicLink := siRow(8, siAlice, "Public link", domain.PrivacyPublic, domain.SavedItemOriginLink)
		ownCopy := siRow(9, siAlice, "Copied", domain.PrivacyPrivate, domain.SavedItemOriginCopy)
		return append(siOwnerRows(), unavailable, publicLink, ownCopy)
	}
	raceNotFound := func(context.Context, int, int) (*domain.SavedItem, error) { return nil, domain.ErrNotFound }
	cases := []struct {
		name      string
		actor     int
		id        int
		convertFn func(context.Context, int, int) (*domain.SavedItem, error)
		wantErr   error
		wantWrite bool
	}{
		{"anonymous is forbidden", siAnonymous, 3, nil, domain.ErrForbidden, false},
		{"id zero is invalid", siAlice, 0, nil, domain.ErrInvalidInput, false},
		{"own link with a readable source becomes a copy", siAlice, 3, nil, nil, true},
		{"own link with an unreadable source is not found", siAlice, 7, nil, domain.ErrNotFound, false},
		{"own formula that is not a link is invalid", siAlice, 1, nil, domain.ErrInvalidInput, false},
		{"own copy is invalid", siAlice, 9, nil, domain.ErrInvalidInput, false},
		{"another user's public link is forbidden", siBob, 8, nil, domain.ErrForbidden, false},
		{"another user's private link is not found", siBob, 3, nil, domain.ErrNotFound, false},
		{"source going private during the write is not found", siAlice, 3, raceNotFound, domain.ErrNotFound, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &mockSavedItemRepo{rows: rows(), convertFn: tc.convertFn}
			svc := services.NewSavedItemService(repo)

			converted, err := svc.ConvertLinkToCopy(context.Background(), tc.actor, tc.id)
			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
			} else {
				require.NoError(t, err)
				assert.Equal(t, domain.SavedItemOriginCopy, converted.Origin)
				assert.True(t, converted.SourceAvailable)
			}
			if tc.wantWrite {
				assert.Equal(t, 1, repo.writes())
			} else {
				assert.Zero(t, repo.writes())
			}
		})
	}
}

// --- reads --------------------------------------------------------------------

func TestSavedItem_ListMineAndSharedArguments(t *testing.T) {
	ten := 10
	zero := 0
	hundred := 100
	hundredOne := 101
	cases := []struct {
		name    string
		shared  bool
		actor   int
		first   *int
		last    *int
		typ     domain.SavedItemType
		wantErr error
	}{
		{"mine by anonymous is forbidden", false, siAnonymous, nil, nil, domain.SavedItemTypeFormula, domain.ErrForbidden},
		{"mine with first zero is invalid", false, siAlice, &zero, nil, domain.SavedItemTypeFormula, domain.ErrInvalidInput},
		{"mine with first 101 is invalid", false, siAlice, &hundredOne, nil, domain.SavedItemTypeFormula, domain.ErrInvalidInput},
		{"mine with first 100 is accepted", false, siAlice, &hundred, nil, domain.SavedItemTypeFormula, nil},
		{"mine with last zero is invalid", false, siAlice, nil, &zero, domain.SavedItemTypeFormula, domain.ErrInvalidInput},
		{"mine with an unknown type is invalid", false, siAlice, &ten, nil, "BOGUS", domain.ErrInvalidInput},
		{"shared with an unknown type is invalid", true, siAnonymous, &ten, nil, "BOGUS", domain.ErrInvalidInput},
		{"shared is accepted for anonymous viewers", true, siAnonymous, &ten, nil, domain.SavedItemTypeFormula, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &mockSavedItemRepo{}
			svc := services.NewSavedItemService(repo)
			params := domain.SavedItemListParams{Type: tc.typ, First: tc.first, Last: tc.last}

			var err error
			if tc.shared {
				var viewer *int
				if tc.actor != siAnonymous {
					v := tc.actor
					viewer = &v
				}
				_, err = svc.ListShared(context.Background(), viewer, params)
			} else {
				_, err = svc.ListMine(context.Background(), tc.actor, params)
			}
			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
				assert.Empty(t, repo.listed, "a refused list must not reach the repository")
				return
			}
			require.NoError(t, err)
			require.Len(t, repo.listed, 1)
		})
	}
}

func TestSavedItem_ListScopeAndViewer(t *testing.T) {
	repo := &mockSavedItemRepo{}
	svc := services.NewSavedItemService(repo)
	typ := domain.SavedItemTypeFormula

	_, err := svc.ListMine(context.Background(), siAlice, domain.SavedItemListParams{Type: typ})
	require.NoError(t, err)
	_, err = svc.ListShared(context.Background(), nil, domain.SavedItemListParams{Type: typ})
	require.NoError(t, err)

	require.Len(t, repo.listed, 2)
	mine, shared := repo.listed[0], repo.listed[1]
	assert.Equal(t, domain.SavedItemScopeMine, mine.Scope)
	require.NotNil(t, mine.ViewerID)
	assert.Equal(t, siAlice, *mine.ViewerID, "MINE is scoped to the actor")
	assert.Equal(t, domain.SavedItemScopeShared, shared.Scope)
	assert.Nil(t, shared.ViewerID, "an anonymous SHARED read has no viewer")
}

func TestSavedItem_GetVisibility(t *testing.T) {
	cases := []struct {
		name    string
		id      int
		viewer  *int
		wantNil bool
		wantErr error
	}{
		{"id zero is invalid", 0, nil, false, domain.ErrInvalidInput},
		{"missing row is nil, not an error", siMissing, nil, true, nil},
		{"another user's private row is nil", 1, nil, true, nil},
		{"own private row is visible", 1, intPtrSI(siAlice), false, nil},
		{"another user's private row is nil for a signed-in viewer", 4, intPtrSI(siAlice), true, nil},
		{"public row is visible to anonymous viewers", 2, nil, false, nil},
		{"public row of another user is visible", 5, intPtrSI(siAlice), false, nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			repo := &mockSavedItemRepo{rows: siOwnerRows()}
			svc := services.NewSavedItemService(repo)

			item, err := svc.GetSavedItem(context.Background(), tc.id, tc.viewer)
			if tc.wantErr != nil {
				assert.ErrorIs(t, err, tc.wantErr)
				return
			}
			require.NoError(t, err)
			if tc.wantNil {
				assert.Nil(t, item)
				return
			}
			require.NotNil(t, item)
			assert.Equal(t, tc.id, item.ID)
		})
	}
}

func intPtrSI(v int) *int { return &v }

// --- user deletion ------------------------------------------------------------

// Deleting a user reassigns the user's saved items to the sentinel, before the
// user row is removed. A nil saved item repository is skipped.
func TestSavedItem_UserDeleteReassignsSavedItems(t *testing.T) {
	cases := []struct {
		name        string
		withRepo    bool
		reassignErr error
		wantErr     bool
		wantCalls   []string
	}{
		{"reassigned to the sentinel before the user row is removed", true, nil, false,
			[]string{"saved.reassign 2->1", "user.delete"}},
		{"a failed reassignment stops the delete", true, errors.New("db down"), true,
			[]string{"saved.reassign 2->1"}},
		{"no saved item repository is skipped", false, nil, false,
			[]string{"user.delete"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var calls []string
			repo := &mockUserRepository{
				getByIDFn: func(context.Context, int) (*domain.User, error) {
					return &domain.User{ID: 2, Username: "testuser", Role: domain.UserRoleDefault}, nil
				},
				getByUsernameFn: func(context.Context, string) (*domain.User, error) {
					return &domain.User{ID: 1, Username: domain.DeletedUserUsername, Role: domain.UserRoleSentinel}, nil
				},
				deleteFn: func(context.Context, int) error {
					calls = append(calls, "user.delete")
					return nil
				},
			}
			var opts []services.UserServiceOption
			if tc.withRepo {
				saved := &mockSavedItemRepo{reassignFn: func(_ context.Context, from, to int) error {
					calls = append(calls, fmt.Sprintf("saved.reassign %d->%d", from, to))
					return tc.reassignErr
				}}
				opts = append(opts, services.WithSavedItemRepository(saved))
			}
			svc := services.NewUserService(repo, &mockContentRepoForUser{}, &mockPerspectiveRepoForUser{},
				&mockUserTodoRepo{}, &mockUserTodoListRepo{}, &mockTodoActionRepo{}, opts...)

			err := svc.Delete(context.Background(), testAdmin, 2)
			if tc.wantErr {
				require.Error(t, err)
				assert.Contains(t, err.Error(), "failed to reassign saved items")
			} else {
				require.NoError(t, err)
			}
			assert.Equal(t, tc.wantCalls, calls)
		})
	}
}

// A public link whose source is no longer readable keeps the name it took from
// the source. Only the link's owner may still fetch it.
func TestSavedItem_GetHidesOrphanedLinkFromOthers(t *testing.T) {
	cases := []struct {
		name            string
		viewer          *int
		sourceAvailable bool
		wantVisible     bool
	}{
		{"anonymous viewer, source gone", nil, false, false},
		{"other user, source gone", intPtrSI(siBob), false, false},
		{"owner, source gone", intPtrSI(siAlice), false, true},
		{"other user, source readable", intPtrSI(siBob), true, true},
		{"anonymous viewer, source readable", nil, true, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			link := siRow(7, siAlice, "Secret sauce", domain.PrivacyPublic, domain.SavedItemOriginLink)
			link.SourceAvailable = tc.sourceAvailable
			svc := services.NewSavedItemService(&mockSavedItemRepo{rows: []*domain.SavedItem{link}})

			item, err := svc.GetSavedItem(context.Background(), 7, tc.viewer)
			require.NoError(t, err)
			if tc.wantVisible {
				require.NotNil(t, item)
				return
			}
			assert.Nil(t, item)
		})
	}
}
