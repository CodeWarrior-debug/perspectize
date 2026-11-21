package postgres

// Query budgets for the saved item service over the real repository. The service
// reads before it writes, so a write costs more than the repository's one
// statement. Each number is what the path costs today.

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// vanishingSavedItemRepo deletes the row through a second connection just before
// a write, so the service's pre-read still finds it and the write matches nothing.
// That is the race the service's write-miss path exists for. The second connection
// is not counted, so only the service's own statements are measured.
type vanishingSavedItemRepo struct {
	*GormSavedItemRepository
	side *gorm.DB
}

func (r vanishingSavedItemRepo) vanish(id int) {
	_ = r.side.Exec("UPDATE user_saved_items SET deleted_at = NOW() WHERE id = ?", id).Error
}

func (r vanishingSavedItemRepo) Update(ctx context.Context, item *domain.SavedItem, actor int) (*domain.SavedItem, error) {
	r.vanish(item.ID)
	return r.GormSavedItemRepository.Update(ctx, item, actor)
}

func (r vanishingSavedItemRepo) SetPrivacy(ctx context.Context, id int, privacy domain.Privacy, actor int) (*domain.SavedItem, error) {
	r.vanish(id)
	return r.GormSavedItemRepository.SetPrivacy(ctx, id, privacy, actor)
}

func (r vanishingSavedItemRepo) ConvertLinkToCopy(ctx context.Context, id int, actor int) (*domain.SavedItem, error) {
	r.vanish(id)
	return r.GormSavedItemRepository.ConvertLinkToCopy(ctx, id, actor)
}

func TestSavedItemServiceQueryCount_ReadsAndWrites(t *testing.T) {
	f := newSavedItemFixture(t)
	ctx := context.Background()
	svc := services.NewSavedItemService(f.repo)

	own := f.create(f.ownerA, "svc-own", domain.PrivacyPrivate)
	other := f.create(f.ownerB, "svc-other", domain.PrivacyPrivate)
	src := f.createPublic(f.ownerB, "svc-src", json.RawMessage(`{"expression":{"const":4}}`))

	t.Run("ListMine is one statement, two with a total", func(t *testing.T) {
		c := querycount.Attach(t, f.db)
		_, err := svc.ListMine(ctx, f.ownerA, domain.SavedItemListParams{Type: domain.SavedItemTypeFormula})
		require.NoError(t, err)
		c.AssertExactly(t, 1)

		c = querycount.Attach(t, f.db)
		_, err = svc.ListMine(ctx, f.ownerA, domain.SavedItemListParams{Type: domain.SavedItemTypeFormula, IncludeTotalCount: true})
		require.NoError(t, err)
		c.AssertExactly(t, 2)
	})

	t.Run("CreateSavedItem is one insert", func(t *testing.T) {
		c := querycount.Attach(t, f.db)
		_, err := svc.CreateSavedItem(ctx, f.ownerA, domain.CreateSavedItemInput{
			Type: domain.SavedItemTypeFormula, Name: "svc-new", Payload: json.RawMessage(`{"expression":{"const":1}}`),
		})
		require.NoError(t, err)
		c.AssertExactly(t, 1)
	})

	t.Run("UpdateSavedItem reads then writes", func(t *testing.T) {
		c := querycount.Attach(t, f.db)
		_, err := svc.UpdateSavedItem(ctx, f.ownerA, domain.UpdateSavedItemInput{ID: own.ID, Type: domain.SavedItemTypeFormula, Name: strPtr("svc-own-2")})
		require.NoError(t, err)
		c.AssertExactly(t, 2)
	})

	t.Run("UpdateSavedItem on someone else's row stops after the read", func(t *testing.T) {
		c := querycount.Attach(t, f.db)
		_, err := svc.UpdateSavedItem(ctx, f.ownerA, domain.UpdateSavedItemInput{ID: other.ID, Type: domain.SavedItemTypeFormula, Name: strPtr("nope")})
		require.ErrorIs(t, err, domain.ErrNotFound)
		c.AssertExactly(t, 1)
	})

	t.Run("UpdateSavedItem that loses a race costs the write-miss read too", func(t *testing.T) {
		racing := vanishingSavedItemRepo{GormSavedItemRepository: f.repo, side: openLocalSavedItemTestDB(t)}
		raceSvc := services.NewSavedItemService(racing)
		target := f.create(f.ownerA, "svc-race-update", domain.PrivacyPrivate)
		c := querycount.Attach(t, f.db)
		_, err := raceSvc.UpdateSavedItem(ctx, f.ownerA, domain.UpdateSavedItemInput{ID: target.ID, Type: domain.SavedItemTypeFormula, Name: strPtr("raced")})
		require.ErrorIs(t, err, domain.ErrNotFound)
		c.AssertExactly(t, 3)
	})

	t.Run("DeleteSavedItem is one statement", func(t *testing.T) {
		target := f.create(f.ownerA, "svc-delete-own", domain.PrivacyPrivate)
		c := querycount.Attach(t, f.db)
		require.NoError(t, svc.DeleteSavedItem(ctx, f.ownerA, target.ID))
		c.AssertExactly(t, 1)
	})

	t.Run("DeleteSavedItem on someone else's row adds the write-miss read", func(t *testing.T) {
		c := querycount.Attach(t, f.db)
		require.ErrorIs(t, svc.DeleteSavedItem(ctx, f.ownerA, other.ID), domain.ErrNotFound)
		c.AssertExactly(t, 2)
	})

	t.Run("RestoreSavedItem is restore plus the read-back", func(t *testing.T) {
		target := f.create(f.ownerA, "svc-restore", domain.PrivacyPrivate)
		require.NoError(t, svc.DeleteSavedItem(ctx, f.ownerA, target.ID))
		c := querycount.Attach(t, f.db)
		_, err := svc.RestoreSavedItem(ctx, f.ownerA, target.ID)
		require.NoError(t, err)
		c.AssertExactly(t, 2)
	})

	t.Run("SetSavedItemPrivacy reads then writes", func(t *testing.T) {
		c := querycount.Attach(t, f.db)
		_, err := svc.SetSavedItemPrivacy(ctx, f.ownerA, own.ID, domain.PrivacyPublic)
		require.NoError(t, err)
		c.AssertExactly(t, 2)
	})

	t.Run("SetSavedItemPrivacy that loses a race costs the write-miss read too", func(t *testing.T) {
		racing := vanishingSavedItemRepo{GormSavedItemRepository: f.repo, side: openLocalSavedItemTestDB(t)}
		raceSvc := services.NewSavedItemService(racing)
		target := f.create(f.ownerA, "svc-race-privacy", domain.PrivacyPrivate)
		c := querycount.Attach(t, f.db)
		_, err := raceSvc.SetSavedItemPrivacy(ctx, f.ownerA, target.ID, domain.PrivacyPublic)
		require.ErrorIs(t, err, domain.ErrNotFound)
		c.AssertExactly(t, 3)
	})

	t.Run("CopySavedItem reads the source, picks a name, then inserts", func(t *testing.T) {
		c := querycount.Attach(t, f.db)
		_, err := svc.CopySavedItem(ctx, f.ownerA, src.ID)
		require.NoError(t, err)
		c.AssertExactly(t, 3)
	})

	t.Run("LinkSavedItem reads the source, picks a name, then inserts", func(t *testing.T) {
		c := querycount.Attach(t, f.db)
		_, err := svc.LinkSavedItem(ctx, f.ownerA, src.ID)
		require.NoError(t, err)
		c.AssertExactly(t, 3)
	})

	t.Run("ConvertLinkToCopy reads then writes", func(t *testing.T) {
		target := f.link(f.ownerA, src, "svc-convert")
		c := querycount.Attach(t, f.db)
		_, err := svc.ConvertLinkToCopy(ctx, f.ownerA, target.ID)
		require.NoError(t, err)
		c.AssertExactly(t, 2)
	})

	t.Run("ConvertLinkToCopy that loses a race costs the write-miss read too", func(t *testing.T) {
		racing := vanishingSavedItemRepo{GormSavedItemRepository: f.repo, side: openLocalSavedItemTestDB(t)}
		raceSvc := services.NewSavedItemService(racing)
		target := f.link(f.ownerA, src, "svc-race-convert")
		c := querycount.Attach(t, f.db)
		_, err := raceSvc.ConvertLinkToCopy(ctx, f.ownerA, target.ID)
		require.ErrorIs(t, err, domain.ErrNotFound)
		c.AssertExactly(t, 3)
	})
}
