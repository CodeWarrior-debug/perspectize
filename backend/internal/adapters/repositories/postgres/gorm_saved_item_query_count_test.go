package postgres

// Query budgets for the saved item repository, measured on a real Postgres. Each
// budget is the number of statements the method issues today. Adding a query
// turns the matching test red.
//
// Like the integration tests, these skip unless DATABASE_URL names a local
// throwaway database (see openLocalSavedItemTestDB).

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
	"github.com/stretchr/testify/require"
)

func TestSavedItemQueryCount_ListIsOneStatementAndTheCountIsOptIn(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	f.create(f.ownerA, "q-1", domain.PrivacyPrivate)
	f.create(f.ownerA, "q-2", domain.PrivacyPrivate)
	f.createPublic(f.ownerB, "q-3", savedItemTestPayload)

	t.Run("page only", func(t *testing.T) {
		c := querycount.Attach(t, f.db)
		_, err := f.repo.List(ctx, mineParams(f.ownerA))
		require.NoError(t, err)
		c.AssertExactly(t, 1)
	})

	t.Run("page with a total", func(t *testing.T) {
		params := mineParams(f.ownerA)
		params.IncludeTotalCount = true
		c := querycount.Attach(t, f.db)
		_, err := f.repo.List(ctx, params)
		require.NoError(t, err)
		c.AssertExactly(t, 2)
	})

	t.Run("shared page, anonymous", func(t *testing.T) {
		c := querycount.Attach(t, f.db)
		_, err := f.repo.List(ctx, sharedParams(nil))
		require.NoError(t, err)
		c.AssertExactly(t, 1)
	})
}

func TestSavedItemQueryCount_PointReadsAreOneStatement(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	src := f.createPublic(f.ownerB, "pr-src", savedItemTestPayload)
	lk := f.link(f.ownerA, src, "pr-link")

	// The link read resolves the source's payload in the same statement.
	c := querycount.Attach(t, f.db)
	_, err := f.repo.GetByID(ctx, lk.ID)
	require.NoError(t, err)
	c.AssertExactly(t, 1)

	c = querycount.Attach(t, f.db)
	_, err = f.repo.NamesWithPrefix(ctx, f.ownerA, domain.SavedItemTypeFormula, "pr")
	require.NoError(t, err)
	c.AssertExactly(t, 1)
}

func TestSavedItemQueryCount_WritesAreOneStatement(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	owned := f.create(f.ownerA, "w-own", domain.PrivacyPrivate)
	src := f.createPublic(f.ownerB, "w-src", savedItemTestPayload)
	lk := f.link(f.ownerA, src, "w-link")

	c := querycount.Attach(t, f.db)
	_, err := f.repo.Create(ctx, &domain.SavedItem{
		UserID: f.ownerA, Type: domain.SavedItemTypeFormula, Name: "w-new",
		Payload: savedItemTestPayload, PayloadVersion: 1, Privacy: domain.PrivacyPrivate, Origin: domain.SavedItemOriginOwn,
	})
	require.NoError(t, err)
	c.AssertExactly(t, 1)

	c = querycount.Attach(t, f.db)
	_, err = f.repo.Update(ctx, &domain.SavedItem{ID: owned.ID, Type: domain.SavedItemTypeFormula, Name: "w-renamed",
		Payload: savedItemTestPayload, Origin: domain.SavedItemOriginOwn}, f.ownerA)
	require.NoError(t, err)
	c.AssertExactly(t, 1)

	c = querycount.Attach(t, f.db)
	_, err = f.repo.SetPrivacy(ctx, owned.ID, domain.PrivacyPublic, f.ownerA)
	require.NoError(t, err)
	c.AssertExactly(t, 1)

	c = querycount.Attach(t, f.db)
	require.NoError(t, f.repo.Delete(ctx, owned.ID, f.ownerA))
	c.AssertExactly(t, 1)

	c = querycount.Attach(t, f.db)
	require.NoError(t, f.repo.Restore(ctx, owned.ID, f.ownerA))
	c.AssertExactly(t, 1)

	c = querycount.Attach(t, f.db)
	_, err = f.repo.ConvertLinkToCopy(ctx, lk.ID, f.ownerA)
	require.NoError(t, err)
	c.AssertExactly(t, 1)
}

func TestSavedItemQueryCount_MissesCostTheSameStatement(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	owned := f.create(f.ownerA, "m-own", domain.PrivacyPrivate)

	// A zero-row write is still one statement: the repository does not read back
	// to tell not-found from forbidden. The service does that, and its budget
	// covers it.
	c := querycount.Attach(t, f.db)
	_, err := f.repo.Update(ctx, &domain.SavedItem{ID: owned.ID, Type: domain.SavedItemTypeFormula, Name: "m-x",
		Payload: savedItemTestPayload, Origin: domain.SavedItemOriginOwn}, f.ownerB)
	require.ErrorIs(t, err, domain.ErrNotFound)
	c.AssertExactly(t, 1)

	c = querycount.Attach(t, f.db)
	_, err = f.repo.SetPrivacy(ctx, owned.ID, domain.PrivacyPublic, f.ownerB)
	require.ErrorIs(t, err, domain.ErrNotFound)
	c.AssertExactly(t, 1)

	c = querycount.Attach(t, f.db)
	require.ErrorIs(t, f.repo.Delete(ctx, owned.ID, f.ownerB), domain.ErrNotFound)
	c.AssertExactly(t, 1)

	c = querycount.Attach(t, f.db)
	require.ErrorIs(t, f.repo.Restore(ctx, owned.ID, f.ownerB), domain.ErrNotFound)
	c.AssertExactly(t, 1)

	src := f.createPublic(f.ownerB, "m-src", json.RawMessage(`{"expression":{"const":1}}`))
	lk := f.link(f.ownerA, src, "m-link")
	c = querycount.Attach(t, f.db)
	_, err = f.repo.ConvertLinkToCopy(ctx, lk.ID, f.ownerB)
	require.ErrorIs(t, err, domain.ErrNotFound)
	c.AssertExactly(t, 1)
}

func TestSavedItemQueryCount_ReassignByUserIsOneStatement(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	f.create(f.ownerA, "ra-1", domain.PrivacyPublic)
	f.create(f.ownerA, "ra-2", domain.PrivacyPublic)

	c := querycount.Attach(t, f.db)
	require.NoError(t, f.repo.ReassignByUser(ctx, f.ownerA, f.sentinel))
	c.AssertExactly(t, 1)
}
