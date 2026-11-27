package postgres

// Integration tests for the saved item repository against a real Postgres.
//
// They run only when DATABASE_URL points at a LOCAL throwaway database (host
// localhost or 127.0.0.1, database saveditems_test or testdb). Any other URL makes
// the tests skip, so they can never write to the shared database.
//
//	DATABASE_URL="postgres://demo:demo@localhost:5434/saveditems_test?sslmode=disable" \
//	  go test -p 1 ./internal/adapters/repositories/postgres/ -run SavedItemIntegration -v

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"strings"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// openLocalSavedItemTestDB connects only when DATABASE_URL names a local
// throwaway database. Anything else skips the test.
func openLocalSavedItemTestDB(t *testing.T) *gorm.DB {
	t.Helper()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping saved item integration tests")
	}
	u, err := url.Parse(dsn)
	if err != nil {
		t.Skip("DATABASE_URL does not parse; skipping saved item integration tests")
	}
	host, dbName := u.Hostname(), strings.TrimPrefix(u.Path, "/")
	if (host != "localhost" && host != "127.0.0.1") || (dbName != "saveditems_test" && dbName != "testdb") {
		t.Skipf("refusing to run saved item integration tests against host %q database %q: only the local throwaway databases are allowed", host, dbName)
	}

	db, err := gorm.Open(gormpg.Open(dsn), &gorm.Config{
		SkipDefaultTransaction: true,
		Logger:                 logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)
	sqlDB, err := db.DB()
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })
	if err := sqlDB.Ping(); err != nil {
		t.Skipf("local test database not reachable: %v", err)
	}
	return db
}

type savedItemFixture struct {
	t        *testing.T
	db       *gorm.DB
	repo     *GormSavedItemRepository
	ownerA   int
	ownerB   int
	sentinel int
}

// newSavedItemFixture creates two owners and a sentinel user (standing in for a
// deleted user's reassignment target), and removes every row and user it created
// when the test ends. Each call uses fresh users, so reruns never collide.
func newSavedItemFixture(t *testing.T) *savedItemFixture {
	t.Helper()
	db := openLocalSavedItemTestDB(t)

	salt := time.Now().UnixNano() % 0xFFFFFFFF
	// users.username is varchar(24): keep the generated names short.
	mkUser := func(label string) int {
		var id int
		require.NoError(t, db.Raw("INSERT INTO users (username) VALUES (?) RETURNING id",
			fmt.Sprintf("si-%s-%08x", label, salt)).Scan(&id).Error)
		return id
	}
	f := &savedItemFixture{
		t:        t,
		db:       db,
		repo:     NewGormSavedItemRepository(db),
		ownerA:   mkUser("a"),
		ownerB:   mkUser("b"),
		sentinel: mkUser("s"),
	}

	t.Cleanup(func() {
		ids := []int{f.ownerA, f.ownerB, f.sentinel}
		// Copies and links reference their source with RESTRICT, so they go first.
		db.Exec("DELETE FROM user_saved_items WHERE user_id IN ? AND source_id IS NOT NULL", ids)
		db.Exec("DELETE FROM user_saved_items WHERE user_id IN ?", ids)
		db.Exec("DELETE FROM users WHERE id IN ?", ids)
	})
	return f
}

var savedItemTestPayload = json.RawMessage(`{"expression":{"const":1}}`)

func (f *savedItemFixture) create(owner int, name string, privacy domain.Privacy) *domain.SavedItem {
	f.t.Helper()
	got, err := f.repo.Create(context.Background(), &domain.SavedItem{
		UserID: owner, Type: domain.SavedItemTypeFormula, Name: name,
		Payload: savedItemTestPayload, PayloadVersion: domain.SavedFormulaPayloadVersion,
		Privacy: privacy, Origin: domain.SavedItemOriginOwn,
	})
	require.NoError(f.t, err)
	return got
}

// createPublic creates a public OWN formula with the given payload, for use as a
// copy or link source.
func (f *savedItemFixture) createPublic(owner int, name string, payload json.RawMessage) *domain.SavedItem {
	f.t.Helper()
	got, err := f.repo.Create(context.Background(), &domain.SavedItem{
		UserID: owner, Type: domain.SavedItemTypeFormula, Name: name,
		Payload: payload, PayloadVersion: domain.SavedFormulaPayloadVersion,
		Privacy: domain.PrivacyPublic, Origin: domain.SavedItemOriginOwn,
	})
	require.NoError(f.t, err)
	return got
}

func (f *savedItemFixture) link(owner int, source *domain.SavedItem, name string) *domain.SavedItem {
	f.t.Helper()
	sid := source.ID
	got, err := f.repo.Create(context.Background(), &domain.SavedItem{
		UserID: owner, Type: source.Type, Name: name,
		Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginLink, SourceID: &sid,
	})
	require.NoError(f.t, err)
	return got
}

// rawSavedItem is a row read straight from the table, bypassing every read
// predicate, so a test can see deleted rows and check what a write changed.
type rawSavedItem struct {
	UserID         int        `gorm:"column:user_id"`
	Name           string     `gorm:"column:name"`
	Payload        []byte     `gorm:"column:payload"`
	PayloadVersion int        `gorm:"column:payload_version"`
	Privacy        string     `gorm:"column:privacy"`
	Origin         string     `gorm:"column:origin"`
	SourceID       *int       `gorm:"column:source_id"`
	DeletedAt      *time.Time `gorm:"column:deleted_at"`
	UpdatedAt      time.Time  `gorm:"column:updated_at"`
}

func (f *savedItemFixture) raw(id int) rawSavedItem {
	f.t.Helper()
	var r rawSavedItem
	require.NoError(f.t, f.db.Raw("SELECT user_id, name, payload, payload_version, privacy, origin, source_id, deleted_at, updated_at FROM user_saved_items WHERE id = ?", id).Scan(&r).Error)
	return r
}

// softDelete marks a row deleted through the repository, as the owner would.
func (f *savedItemFixture) softDelete(id, owner int) {
	f.t.Helper()
	require.NoError(f.t, f.repo.Delete(context.Background(), id, owner))
}

func ids(items []*domain.SavedItem) []int {
	out := make([]int, 0, len(items))
	for _, it := range items {
		out = append(out, it.ID)
	}
	return out
}

func names(items []*domain.SavedItem) []string {
	out := make([]string, 0, len(items))
	for _, it := range items {
		out = append(out, it.Name)
	}
	return out
}

func containsID(items []*domain.SavedItem, id int) bool {
	for _, it := range items {
		if it.ID == id {
			return true
		}
	}
	return false
}

func mineParams(owner int) domain.SavedItemListParams {
	return domain.SavedItemListParams{Type: domain.SavedItemTypeFormula, Scope: domain.SavedItemScopeMine, ViewerID: intPtr(owner)}
}

func sharedParams(viewer *int) domain.SavedItemListParams {
	return domain.SavedItemListParams{Type: domain.SavedItemTypeFormula, Scope: domain.SavedItemScopeShared, ViewerID: viewer}
}

// --- create and read -------------------------------------------------------

func TestSavedItemIntegration_CreateAndGetOwnRow(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	created := f.create(f.ownerA, "Own formula", domain.PrivacyPrivate)
	require.NotZero(t, created.ID)
	assert.Equal(t, domain.SavedItemOriginOwn, created.Origin)
	assert.Nil(t, created.SourceID)

	got, err := f.repo.GetByID(ctx, created.ID)
	require.NoError(t, err)
	assert.Equal(t, f.ownerA, got.UserID)
	assert.Equal(t, domain.SavedItemTypeFormula, got.Type)
	assert.Equal(t, "Own formula", got.Name)
	assert.Equal(t, domain.PrivacyPrivate, got.Privacy)
	assert.Equal(t, domain.SavedItemOriginOwn, got.Origin)
	assert.Equal(t, domain.SavedFormulaPayloadVersion, got.PayloadVersion)
	assert.JSONEq(t, string(savedItemTestPayload), string(got.Payload))
	assert.False(t, got.SourceAvailable, "an own row has no source")
	assert.False(t, got.CreatedAt.IsZero())
}

func TestSavedItemIntegration_GetByIDMissingIsNotFound(t *testing.T) {
	f := newSavedItemFixture(t)
	_, err := f.repo.GetByID(context.Background(), 2147483000)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestSavedItemIntegration_LinkReadsSourcePayloadThroughJoin(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	src := f.createPublic(f.ownerB, "Source formula", json.RawMessage(`{"expression":{"const":7}}`))
	linked := f.link(f.ownerA, src, "Linked formula")

	raw := f.raw(linked.ID)
	assert.Nil(t, raw.Payload, "a link stores no payload of its own")
	assert.Equal(t, "link", raw.Origin)

	got, err := f.repo.GetByID(ctx, linked.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.SavedItemOriginLink, got.Origin)
	require.NotNil(t, got.SourceID)
	assert.Equal(t, src.ID, *got.SourceID)
	assert.True(t, got.SourceAvailable)
	assert.JSONEq(t, `{"expression":{"const":7}}`, string(got.Payload))
	assert.Equal(t, src.PayloadVersion, got.PayloadVersion)
}

func TestSavedItemIntegration_LinkToPrivateOrDeletedSourceHasNoPayload(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	t.Run("private source", func(t *testing.T) {
		src := f.createPublic(f.ownerB, "Will go private", savedItemTestPayload)
		linked := f.link(f.ownerA, src, "Link to private")

		_, err := f.repo.SetPrivacy(ctx, src.ID, domain.PrivacyPrivate, f.ownerB)
		require.NoError(t, err)

		got, err := f.repo.GetByID(ctx, linked.ID)
		require.NoError(t, err)
		assert.False(t, got.SourceAvailable)
		assert.Nil(t, got.Payload)
	})

	t.Run("deleted source", func(t *testing.T) {
		src := f.createPublic(f.ownerB, "Will be deleted", savedItemTestPayload)
		linked := f.link(f.ownerA, src, "Link to deleted")

		f.softDelete(src.ID, f.ownerB)

		got, err := f.repo.GetByID(ctx, linked.ID)
		require.NoError(t, err)
		assert.False(t, got.SourceAvailable)
		assert.Nil(t, got.Payload)
		assert.Equal(t, domain.SavedItemOriginLink, got.Origin, "the link itself stays live")
	})
}

func TestSavedItemIntegration_CopyKeepsItsOwnPayloadAndSourceFlag(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	src := f.createPublic(f.ownerB, "Copy source", json.RawMessage(`{"expression":{"const":3}}`))
	sid := src.ID
	copied, err := f.repo.Create(ctx, &domain.SavedItem{
		UserID: f.ownerA, Type: domain.SavedItemTypeFormula, Name: "My copy",
		Payload: json.RawMessage(`{"expression":{"const":9}}`), PayloadVersion: 1,
		Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginCopy, SourceID: &sid,
	})
	require.NoError(t, err)

	got, err := f.repo.GetByID(ctx, copied.ID)
	require.NoError(t, err)
	assert.Equal(t, domain.SavedItemOriginCopy, got.Origin)
	assert.True(t, got.SourceAvailable)
	assert.JSONEq(t, `{"expression":{"const":9}}`, string(got.Payload), "a copy shows its own payload, not the source's")

	f.softDelete(src.ID, f.ownerB)
	got, err = f.repo.GetByID(ctx, copied.ID)
	require.NoError(t, err)
	assert.False(t, got.SourceAvailable, "the copy keeps its payload but loses the credit")
	assert.JSONEq(t, `{"expression":{"const":9}}`, string(got.Payload))
}

// --- constraints -----------------------------------------------------------

func TestSavedItemIntegration_ConstraintsMapToDomainErrors(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	src := f.createPublic(f.ownerB, "Constraint source", savedItemTestPayload)
	theme := f.createPublic(f.ownerB, "Theme source", savedItemTestPayload)
	require.NoError(t, f.repo.db.Exec("UPDATE user_saved_items SET type = 'theme' WHERE id = ?", theme.ID).Error)
	srcID := src.ID
	themeID := theme.ID

	cases := []struct {
		name string
		item *domain.SavedItem
	}{
		{"setting made public", &domain.SavedItem{UserID: f.ownerA, Type: domain.SavedItemTypeSetting, Name: "s1",
			Payload: savedItemTestPayload, Privacy: domain.PrivacyPublic, Origin: domain.SavedItemOriginOwn}},
		{"setting as a copy", &domain.SavedItem{UserID: f.ownerA, Type: domain.SavedItemTypeSetting, Name: "s2",
			Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginCopy, SourceID: &srcID}},
		{"link with a payload", &domain.SavedItem{UserID: f.ownerA, Type: domain.SavedItemTypeFormula, Name: "l1",
			Payload: savedItemTestPayload, Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginLink, SourceID: &srcID}},
		{"own row with a source", &domain.SavedItem{UserID: f.ownerA, Type: domain.SavedItemTypeFormula, Name: "o1",
			Payload: savedItemTestPayload, Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginOwn, SourceID: &srcID}},
		{"copy without a source", &domain.SavedItem{UserID: f.ownerA, Type: domain.SavedItemTypeFormula, Name: "c1",
			Payload: savedItemTestPayload, Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginCopy}},
		{"copy whose source is another type (composite FK)", &domain.SavedItem{UserID: f.ownerA, Type: domain.SavedItemTypeFormula, Name: "c2",
			Payload: savedItemTestPayload, Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginCopy, SourceID: &themeID}},
		{"unknown owner", &domain.SavedItem{UserID: 2147483000, Type: domain.SavedItemTypeFormula, Name: "u1",
			Payload: savedItemTestPayload, Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginOwn}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			_, err := f.repo.Create(ctx, tc.item)
			assert.ErrorIs(t, err, domain.ErrInvalidInput)
		})
	}

	t.Run("setting made public through SetPrivacy", func(t *testing.T) {
		setting := f.create(f.ownerA, "Setting", domain.PrivacyPrivate)
		require.NoError(t, f.repo.db.Exec("UPDATE user_saved_items SET type = 'setting' WHERE id = ?", setting.ID).Error)

		_, err := f.repo.SetPrivacy(ctx, setting.ID, domain.PrivacyPublic, f.ownerA)
		assert.ErrorIs(t, err, domain.ErrInvalidInput)
		assert.Equal(t, "private", f.raw(setting.ID).Privacy, "the refused write changes nothing")
	})
}

func TestSavedItemIntegration_DuplicateLiveNameIsAlreadyExists(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	f.create(f.ownerA, "Dup", domain.PrivacyPrivate)
	_, err := f.repo.Create(ctx, &domain.SavedItem{
		UserID: f.ownerA, Type: domain.SavedItemTypeFormula, Name: "Dup",
		Payload: savedItemTestPayload, PayloadVersion: 1, Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginOwn,
	})
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)

	// Another owner may use the same name.
	_, err = f.repo.Create(ctx, &domain.SavedItem{
		UserID: f.ownerB, Type: domain.SavedItemTypeFormula, Name: "Dup",
		Payload: savedItemTestPayload, PayloadVersion: 1, Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginOwn,
	})
	require.NoError(t, err)
}

func TestSavedItemIntegration_NameIsFreeAgainAfterSoftDelete(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	old := f.create(f.ownerA, "Reusable", domain.PrivacyPrivate)
	f.softDelete(old.ID, f.ownerA)

	fresh, err := f.repo.Create(ctx, &domain.SavedItem{
		UserID: f.ownerA, Type: domain.SavedItemTypeFormula, Name: "Reusable",
		Payload: savedItemTestPayload, PayloadVersion: 1, Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginOwn,
	})
	require.NoError(t, err, "the partial unique index covers live rows only")
	assert.NotEqual(t, old.ID, fresh.ID)
}

// --- soft-delete scope on every read path ----------------------------------

func TestSavedItemIntegration_DeletedRowsNeverAppearOnAnyReadPath(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	live := f.create(f.ownerA, "Keep me", domain.PrivacyPublic)
	gone := f.create(f.ownerA, "Gone formula", domain.PrivacyPublic)
	srcGone := f.createPublic(f.ownerB, "Source gone link", savedItemTestPayload)
	goneLink := f.link(f.ownerA, srcGone, "Gone link")
	f.softDelete(gone.ID, f.ownerA)
	f.softDelete(goneLink.ID, f.ownerA)

	_, err := f.repo.GetByID(ctx, gone.ID)
	assert.ErrorIs(t, err, domain.ErrNotFound, "GetByID")
	_, err = f.repo.GetByID(ctx, goneLink.ID)
	assert.ErrorIs(t, err, domain.ErrNotFound, "GetByID on a deleted link")

	mine, err := f.repo.List(ctx, mineParams(f.ownerA))
	require.NoError(t, err)
	assert.ElementsMatch(t, []int{live.ID}, ids(mine.Items), "ListMine")

	shared, err := f.repo.List(ctx, sharedParams(intPtr(f.ownerA)))
	require.NoError(t, err)
	assert.True(t, containsID(shared.Items, live.ID), "ListShared keeps the live public row")
	assert.False(t, containsID(shared.Items, gone.ID), "ListShared excludes a deleted public row")
	assert.False(t, containsID(shared.Items, goneLink.ID), "ListShared excludes a deleted link")

	anon, err := f.repo.List(ctx, sharedParams(nil))
	require.NoError(t, err)
	assert.False(t, containsID(anon.Items, gone.ID), "anonymous ListShared excludes a deleted row")

	prefixNames, err := f.repo.NamesWithPrefix(ctx, f.ownerA, domain.SavedItemTypeFormula, "Gone")
	require.NoError(t, err)
	assert.Empty(t, prefixNames, "NamesWithPrefix excludes deleted names")
}

// --- lists -----------------------------------------------------------------

func TestSavedItemIntegration_ListSharedIncludesPublicAndOwnAndExcludesOtherLinks(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	aPub := f.createPublic(f.ownerA, "A public", savedItemTestPayload)
	aPriv := f.create(f.ownerA, "A private", domain.PrivacyPrivate)
	bPub := f.createPublic(f.ownerB, "B public", savedItemTestPayload)
	bPriv := f.create(f.ownerB, "B private", domain.PrivacyPrivate)
	bLink := f.link(f.ownerB, aPub, "B link to A")
	_, err := f.repo.SetPrivacy(ctx, bLink.ID, domain.PrivacyPublic, f.ownerB)
	require.NoError(t, err, "a public link is still a link: other people must not see it")
	aLink := f.link(f.ownerA, bPub, "A link to B")

	t.Run("viewer A sees public rows, own rows and own links, not B's private row or B's link", func(t *testing.T) {
		page, err := f.repo.List(ctx, sharedParams(intPtr(f.ownerA)))
		require.NoError(t, err)
		assert.True(t, containsID(page.Items, aPub.ID))
		assert.True(t, containsID(page.Items, aPriv.ID))
		assert.True(t, containsID(page.Items, bPub.ID))
		assert.True(t, containsID(page.Items, aLink.ID), "a viewer's own link is visible to them")
		assert.False(t, containsID(page.Items, bPriv.ID))
		assert.False(t, containsID(page.Items, bLink.ID), "another user's LINK row is excluded")
	})

	t.Run("anonymous sees public rows only, no links", func(t *testing.T) {
		page, err := f.repo.List(ctx, sharedParams(nil))
		require.NoError(t, err)
		assert.True(t, containsID(page.Items, aPub.ID))
		assert.True(t, containsID(page.Items, bPub.ID))
		assert.False(t, containsID(page.Items, aPriv.ID))
		assert.False(t, containsID(page.Items, bPriv.ID))
		assert.False(t, containsID(page.Items, aLink.ID))
		assert.False(t, containsID(page.Items, bLink.ID))
	})

	t.Run("viewer B sees their own link", func(t *testing.T) {
		page, err := f.repo.List(ctx, sharedParams(intPtr(f.ownerB)))
		require.NoError(t, err)
		assert.True(t, containsID(page.Items, bLink.ID))
		assert.False(t, containsID(page.Items, aLink.ID))
	})
}

func TestSavedItemIntegration_ListMineReturnsOnlyTheOwnersRows(t *testing.T) {
	f := newSavedItemFixture(t)

	mineA := f.create(f.ownerA, "A one", domain.PrivacyPrivate)
	pubA := f.createPublic(f.ownerA, "A two", savedItemTestPayload)
	f.create(f.ownerB, "B private", domain.PrivacyPrivate)
	f.createPublic(f.ownerB, "B public", savedItemTestPayload)

	page, err := f.repo.List(context.Background(), mineParams(f.ownerA))
	require.NoError(t, err)
	assert.ElementsMatch(t, []int{mineA.ID, pubA.ID}, ids(page.Items))
	assert.Nil(t, page.TotalCount, "no total count unless requested")
}

func TestSavedItemIntegration_KeysetPaginationWalksEveryRowOnce(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	for _, n := range []string{"pg-1", "pg-2", "pg-3", "pg-4", "pg-5"} {
		f.create(f.ownerA, n, domain.PrivacyPrivate)
	}
	base := mineParams(f.ownerA)
	base.SortBy = domain.SavedItemSortByName
	base.SortOrder = domain.SortOrderAsc

	first := base
	first.First = intPtr(2)
	first.IncludeTotalCount = true
	p1, err := f.repo.List(ctx, first)
	require.NoError(t, err)
	assert.Equal(t, []string{"pg-1", "pg-2"}, names(p1.Items))
	assert.True(t, p1.HasNext)
	require.NotNil(t, p1.EndCursor)
	require.NotNil(t, p1.TotalCount)
	assert.Equal(t, 5, *p1.TotalCount, "the total counts the whole scope, not the page")

	second := base
	second.First = intPtr(2)
	second.After = p1.EndCursor
	p2, err := f.repo.List(ctx, second)
	require.NoError(t, err)
	assert.Equal(t, []string{"pg-3", "pg-4"}, names(p2.Items))
	assert.True(t, p2.HasNext)
	assert.Nil(t, p2.TotalCount, "the total is only counted when requested")

	third := base
	third.First = intPtr(2)
	third.After = p2.EndCursor
	p3, err := f.repo.List(ctx, third)
	require.NoError(t, err)
	assert.Equal(t, []string{"pg-5"}, names(p3.Items))
	assert.False(t, p3.HasNext)
}

func TestSavedItemIntegration_BeforeCursorReturnsThePreviousPage(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	for _, n := range []string{"bk-1", "bk-2", "bk-3", "bk-4"} {
		f.create(f.ownerA, n, domain.PrivacyPrivate)
	}
	base := mineParams(f.ownerA)
	base.SortBy = domain.SavedItemSortByName
	base.SortOrder = domain.SortOrderAsc
	base.First = intPtr(2)

	p1, err := f.repo.List(ctx, base)
	require.NoError(t, err)
	p2Params := base
	p2Params.After = p1.EndCursor
	p2, err := f.repo.List(ctx, p2Params)
	require.NoError(t, err)
	require.Equal(t, []string{"bk-3", "bk-4"}, names(p2.Items))
	require.NotNil(t, p2.StartCursor)

	back := base
	back.Before = p2.StartCursor
	prev, err := f.repo.List(ctx, back)
	require.NoError(t, err)
	assert.Equal(t, []string{"bk-1", "bk-2"}, names(prev.Items))
}

func TestSavedItemIntegration_NamesWithPrefixMatchesLiterally(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	f.create(f.ownerA, "Alpha one", domain.PrivacyPrivate)
	f.create(f.ownerA, "Alpha two", domain.PrivacyPrivate)
	f.create(f.ownerA, "Beta", domain.PrivacyPrivate)
	f.create(f.ownerA, "100% off", domain.PrivacyPrivate)
	f.create(f.ownerA, "100x", domain.PrivacyPrivate)
	f.create(f.ownerB, "Alpha other owner", domain.PrivacyPrivate)

	alpha, err := f.repo.NamesWithPrefix(ctx, f.ownerA, domain.SavedItemTypeFormula, "Alpha")
	require.NoError(t, err)
	assert.ElementsMatch(t, []string{"Alpha one", "Alpha two"}, alpha, "other owners' names are excluded")

	percent, err := f.repo.NamesWithPrefix(ctx, f.ownerA, domain.SavedItemTypeFormula, "100%")
	require.NoError(t, err)
	assert.Equal(t, []string{"100% off"}, percent, "the prefix is literal, not a LIKE pattern")

	none, err := f.repo.NamesWithPrefix(ctx, f.ownerA, domain.SavedItemTypeFormula, "")
	require.NoError(t, err)
	assert.Len(t, none, 5, "an empty prefix matches every live name of the owner")
}

// --- owner-scoped writes ---------------------------------------------------

func TestSavedItemIntegration_NonOwnerWritesNeverChangeTheRow(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	owned := f.create(f.ownerA, "Owned by A", domain.PrivacyPrivate)
	before := f.raw(owned.ID)

	_, err := f.repo.Update(ctx, &domain.SavedItem{ID: owned.ID, Type: domain.SavedItemTypeFormula, Name: "Hijacked",
		Payload: savedItemTestPayload, Origin: domain.SavedItemOriginOwn}, f.ownerB)
	assert.ErrorIs(t, err, domain.ErrNotFound, "Update")

	_, err = f.repo.SetPrivacy(ctx, owned.ID, domain.PrivacyPublic, f.ownerB)
	assert.ErrorIs(t, err, domain.ErrNotFound, "SetPrivacy")

	err = f.repo.Delete(ctx, owned.ID, f.ownerB)
	assert.ErrorIs(t, err, domain.ErrNotFound, "Delete")

	after := f.raw(owned.ID)
	assert.Equal(t, before.Name, after.Name)
	assert.Equal(t, before.Privacy, after.Privacy)
	assert.Equal(t, before.DeletedAt, after.DeletedAt)
	assert.Equal(t, before.UpdatedAt, after.UpdatedAt, "a refused write must not touch the row")
}

func TestSavedItemIntegration_NonOwnerRestoreAndConvertAreNotFound(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	deleted := f.create(f.ownerA, "Deleted by A", domain.PrivacyPrivate)
	f.softDelete(deleted.ID, f.ownerA)
	err := f.repo.Restore(ctx, deleted.ID, f.ownerB)
	assert.ErrorIs(t, err, domain.ErrNotFound, "Restore")
	assert.NotNil(t, f.raw(deleted.ID).DeletedAt, "the row stays deleted")

	src := f.createPublic(f.ownerB, "Convert source", savedItemTestPayload)
	lk := f.link(f.ownerA, src, "A's link")
	_, err = f.repo.ConvertLinkToCopy(ctx, lk.ID, f.ownerB)
	assert.ErrorIs(t, err, domain.ErrNotFound, "ConvertLinkToCopy")
	assert.Equal(t, "link", f.raw(lk.ID).Origin)
}

func TestSavedItemIntegration_ZeroActorIsNotFound(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	owned := f.create(f.ownerA, "Zero actor", domain.PrivacyPrivate)

	_, err := f.repo.Update(ctx, &domain.SavedItem{ID: owned.ID, Type: domain.SavedItemTypeFormula, Name: "x", Origin: domain.SavedItemOriginOwn}, 0)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	_, err = f.repo.SetPrivacy(ctx, owned.ID, domain.PrivacyPublic, 0)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.ErrorIs(t, f.repo.Delete(ctx, owned.ID, 0), domain.ErrNotFound)
	assert.ErrorIs(t, f.repo.Restore(ctx, owned.ID, 0), domain.ErrNotFound)
	_, err = f.repo.ConvertLinkToCopy(ctx, owned.ID, 0)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.Equal(t, "Zero actor", f.raw(owned.ID).Name)
}

func TestSavedItemIntegration_UpdateOwnRow(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	owned := f.create(f.ownerA, "Before", domain.PrivacyPrivate)

	updated, err := f.repo.Update(ctx, &domain.SavedItem{
		ID: owned.ID, UserID: f.ownerA, Type: domain.SavedItemTypeFormula, Name: "After",
		Payload: json.RawMessage(`{"expression":{"const":42}}`), PayloadVersion: 1,
		Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginOwn,
	}, f.ownerA)
	require.NoError(t, err)
	assert.Equal(t, "After", updated.Name)

	raw := f.raw(owned.ID)
	assert.Equal(t, "After", raw.Name)
	assert.JSONEq(t, `{"expression":{"const":42}}`, string(raw.Payload))
}

func TestSavedItemIntegration_UpdateNameClashIsAlreadyExists(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	f.create(f.ownerA, "Taken", domain.PrivacyPrivate)
	mine := f.create(f.ownerA, "Mine", domain.PrivacyPrivate)

	_, err := f.repo.Update(ctx, &domain.SavedItem{ID: mine.ID, Type: domain.SavedItemTypeFormula, Name: "Taken",
		Payload: savedItemTestPayload, Origin: domain.SavedItemOriginOwn}, f.ownerA)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Equal(t, "Mine", f.raw(mine.ID).Name)
}

func TestSavedItemIntegration_UpdateNeverWritesALinkPayload(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	src := f.createPublic(f.ownerB, "Link source", savedItemTestPayload)
	lk := f.link(f.ownerA, src, "Rename only")

	updated, err := f.repo.Update(ctx, &domain.SavedItem{
		ID: lk.ID, UserID: f.ownerA, Type: domain.SavedItemTypeFormula, Name: "Renamed link",
		Payload: json.RawMessage(`{"expression":{"const":5}}`), Origin: domain.SavedItemOriginLink, SourceID: &src.ID,
	}, f.ownerA)
	require.NoError(t, err)
	assert.Equal(t, "Renamed link", updated.Name)
	assert.Nil(t, updated.Payload, "the returned link has no payload of its own")

	raw := f.raw(lk.ID)
	assert.Equal(t, "Renamed link", raw.Name)
	assert.Nil(t, raw.Payload, "the link's payload column stays NULL")
}

func TestSavedItemIntegration_SetPrivacyOwnRow(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	owned := f.create(f.ownerA, "Publish me", domain.PrivacyPrivate)

	got, err := f.repo.SetPrivacy(ctx, owned.ID, domain.PrivacyPublic, f.ownerA)
	require.NoError(t, err)
	assert.Equal(t, domain.PrivacyPublic, got.Privacy)
	assert.Equal(t, "public", f.raw(owned.ID).Privacy)
}

func TestSavedItemIntegration_DeleteAndRestore(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	owned := f.create(f.ownerA, "Round trip", domain.PrivacyPrivate)

	f.softDelete(owned.ID, f.ownerA)
	assert.NotNil(t, f.raw(owned.ID).DeletedAt)
	assert.ErrorIs(t, f.repo.Delete(ctx, owned.ID, f.ownerA), domain.ErrNotFound, "deleting twice is a miss")

	require.NoError(t, f.repo.Restore(ctx, owned.ID, f.ownerA))
	assert.Nil(t, f.raw(owned.ID).DeletedAt)
	got, err := f.repo.GetByID(ctx, owned.ID)
	require.NoError(t, err)
	assert.Equal(t, "Round trip", got.Name)
	assert.ErrorIs(t, f.repo.Restore(ctx, owned.ID, f.ownerA), domain.ErrNotFound, "restoring a live row is a miss")
}

func TestSavedItemIntegration_RestoreWhenNameIsLiveAgainIsAlreadyExists(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	old := f.create(f.ownerA, "Clash", domain.PrivacyPrivate)
	f.softDelete(old.ID, f.ownerA)
	f.create(f.ownerA, "Clash", domain.PrivacyPrivate)

	err := f.repo.Restore(ctx, old.ID, f.ownerA)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.NotNil(t, f.raw(old.ID).DeletedAt, "the refused restore leaves the row deleted")
}

func TestSavedItemIntegration_ConvertLinkToCopyTakesTheSourcePayload(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	src := f.createPublic(f.ownerB, "Convert me from", json.RawMessage(`{"expression":{"const":11}}`))
	lk := f.link(f.ownerA, src, "Becomes a copy")

	got, err := f.repo.ConvertLinkToCopy(ctx, lk.ID, f.ownerA)
	require.NoError(t, err)
	assert.Equal(t, domain.SavedItemOriginCopy, got.Origin)
	require.NotNil(t, got.SourceID)
	assert.Equal(t, src.ID, *got.SourceID, "the copy keeps its credit")
	assert.JSONEq(t, `{"expression":{"const":11}}`, string(got.Payload))

	raw := f.raw(lk.ID)
	assert.Equal(t, "copy", raw.Origin)
	assert.JSONEq(t, `{"expression":{"const":11}}`, string(raw.Payload))
	assert.Equal(t, src.PayloadVersion, raw.PayloadVersion)
}

func TestSavedItemIntegration_ConvertLinkToCopyRefusesUnreadableSourceAndOwnRows(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	src := f.createPublic(f.ownerB, "Goes private first", savedItemTestPayload)
	lk := f.link(f.ownerA, src, "Stale link")
	_, err := f.repo.SetPrivacy(ctx, src.ID, domain.PrivacyPrivate, f.ownerB)
	require.NoError(t, err)

	_, err = f.repo.ConvertLinkToCopy(ctx, lk.ID, f.ownerA)
	assert.ErrorIs(t, err, domain.ErrNotFound, "the source is no longer public")
	raw := f.raw(lk.ID)
	assert.Equal(t, "link", raw.Origin)
	assert.Nil(t, raw.Payload)

	own := f.create(f.ownerA, "Not a link", domain.PrivacyPrivate)
	_, err = f.repo.ConvertLinkToCopy(ctx, own.ID, f.ownerA)
	assert.ErrorIs(t, err, domain.ErrNotFound, "an own row is not a link")
}

func TestSavedItemIntegration_ReassignByUserMovesEveryRowToTheSentinel(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	live := f.create(f.ownerA, "Alpha", domain.PrivacyPublic)
	gone := f.create(f.ownerA, "Beta", domain.PrivacyPublic)
	f.softDelete(gone.ID, f.ownerA)
	goneAt := f.raw(gone.ID).DeletedAt
	require.NotNil(t, goneAt)
	src := f.createPublic(f.ownerB, "Link source for A", savedItemTestPayload)
	lk := f.link(f.ownerA, src, "A link")

	require.NoError(t, f.repo.ReassignByUser(ctx, f.ownerA, f.sentinel))

	for _, id := range []int{live.ID, gone.ID, lk.ID} {
		r := f.raw(id)
		assert.Equal(t, f.sentinel, r.UserID)
		assert.Equal(t, "private", r.Privacy)
		assert.NotNil(t, r.DeletedAt)
	}
	assert.Equal(t, fmt.Sprintf("Alpha (#%d)", live.ID), f.raw(live.ID).Name)
	assert.Equal(t, fmt.Sprintf("Beta (#%d)", gone.ID), f.raw(gone.ID).Name)
	assert.Equal(t, goneAt.UTC(), f.raw(gone.ID).DeletedAt.UTC(), "an already deleted row keeps its deleted_at")
	assert.Equal(t, "link", f.raw(lk.ID).Origin, "a reassigned link stays a link")
	assert.Nil(t, f.raw(lk.ID).Payload)
}

func TestSavedItemIntegration_ReassignByUserDoesNotCollideOnNames(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	a := f.create(f.ownerA, "Same name", domain.PrivacyPublic)
	b := f.create(f.ownerB, "Same name", domain.PrivacyPublic)

	require.NoError(t, f.repo.ReassignByUser(ctx, f.ownerA, f.sentinel))
	require.NoError(t, f.repo.ReassignByUser(ctx, f.ownerB, f.sentinel))

	assert.Equal(t, fmt.Sprintf("Same name (#%d)", a.ID), f.raw(a.ID).Name)
	assert.Equal(t, fmt.Sprintf("Same name (#%d)", b.ID), f.raw(b.ID).Name)
}

func TestSavedItemIntegration_ReassignByUserKeepsA100CharNameInVarchar100(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()

	long := strings.Repeat("n", 100)
	item := f.create(f.ownerA, long, domain.PrivacyPrivate)

	require.NoError(t, f.repo.ReassignByUser(ctx, f.ownerA, f.sentinel))

	want := fmt.Sprintf("%s (#%d)", strings.Repeat("n", 80), item.ID)
	assert.Equal(t, want, f.raw(item.ID).Name)
	assert.LessOrEqual(t, len(f.raw(item.ID).Name), 100)
}
