package postgres

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var perspRepoTime = time.Date(2026, 9, 10, 11, 12, 13, 0, time.UTC)

func pStr(s string) *string { return &s }
func pInt(i int) *int       { return &i }

func perspectiveRows() *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"id", "user_id", "content_id", "like", "quality", "agreement", "importance",
		"confidence", "privacy", "parts", "category", "labels", "description",
		"review_status", "categorized_ratings", "primary_perspective_id",
		"related_perspective_ids", "custom_fields", "review", "created_at", "updated_at",
	})
}

// fullPerspectiveRow adds one row exercising every array/JSONB column codec.
func fullPerspectiveRow(rows *sqlmock.Rows, id int) *sqlmock.Rows {
	return rows.AddRow(
		id, 2, 11, "loved it", 9000, 8000, 7000,
		6000, "public", "{1,2,3}", "film", "{a,b}", "desc",
		"approved", `{"{\"category\":\"acting\",\"rating\":7}"}`, 4,
		"{10,20}", []byte(`{"k":"v"}`), "review text", perspRepoTime, perspRepoTime,
	)
}

func TestGormPerspectiveRepository_GetByID(t *testing.T) {
	ctx := context.Background()

	t.Run("maps every array and JSONB column through the custom codecs", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).
			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

		got, err := NewGormPerspectiveRepository(db).GetByID(ctx, 5)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, 5, got.ID)
		assert.Equal(t, 2, got.UserID)
		require.NotNil(t, got.ContentID)
		assert.Equal(t, 11, *got.ContentID)
		assert.Equal(t, domain.PrivacyPublic, got.Privacy)
		require.NotNil(t, got.ReviewStatus)
		assert.Equal(t, domain.ReviewStatusApproved, *got.ReviewStatus)
		assert.Equal(t, []int{1, 2, 3}, got.Parts)
		assert.Equal(t, []string{"a", "b"}, got.Labels)
		assert.Equal(t, []domain.CategorizedRating{{Category: "acting", Rating: 7}}, got.CategorizedRatings)
		require.NotNil(t, got.PrimaryPerspectiveID)
		assert.Equal(t, 4, *got.PrimaryPerspectiveID)
		assert.Equal(t, []int{10, 20}, got.RelatedPerspectiveIDs)
		assert.JSONEq(t, `{"k":"v"}`, string(got.CustomFields))
		require.NotNil(t, got.Review)
		assert.Equal(t, "review text", *got.Review)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("NULL privacy defaults to PUBLIC", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).
			WillReturnRows(perspectiveRows().AddRow(
				6, 2, nil, nil, nil, nil, nil,
				nil, nil, nil, nil, nil, nil,
				nil, nil, nil,
				nil, nil, nil, perspRepoTime, perspRepoTime))

		got, err := NewGormPerspectiveRepository(db).GetByID(ctx, 6)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, domain.PrivacyPublic, got.Privacy)
		assert.Nil(t, got.ReviewStatus)
		assert.Nil(t, got.Parts)
		assert.Nil(t, got.Labels)
		assert.Nil(t, got.CategorizedRatings)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("maps empty result to domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).WillReturnRows(perspectiveRows())

		got, err := NewGormPerspectiveRepository(db).GetByID(ctx, 404)
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps other errors with context", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).WillReturnError(errors.New("p boom"))

		got, err := NewGormPerspectiveRepository(db).GetByID(ctx, 5)
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get perspective by id")
		assert.Contains(t, err.Error(), "p boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormPerspectiveRepository_Create(t *testing.T) {
	ctx := context.Background()

	t.Run("inserts then re-reads the created row via GetByID", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "perspectives"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(5, perspRepoTime, perspRepoTime))
		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).
			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

		got, err := NewGormPerspectiveRepository(db).Create(ctx, &domain.Perspective{
			UserID: 2, ContentID: pInt(11), Privacy: domain.PrivacyPublic,
			Parts: []int{1, 2, 3}, Labels: []string{"a", "b"},
			CategorizedRatings: []domain.CategorizedRating{{Category: "acting", Rating: 7}},
		})
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, 5, got.ID)
		assert.Equal(t, perspRepoTime, got.CreatedAt)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps insert errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "perspectives"`).WillReturnError(errors.New("p ins boom"))

		got, err := NewGormPerspectiveRepository(db).Create(ctx, &domain.Perspective{UserID: 2})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to insert perspective")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormPerspectiveRepository_Update(t *testing.T) {
	ctx := context.Background()

	t.Run("saves then re-reads the row", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "perspectives" SET`).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).
			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

		got, err := NewGormPerspectiveRepository(db).Update(ctx, &domain.Perspective{
			ID: 5, UserID: 2, Privacy: domain.PrivacyPublic, Description: pStr("desc"),
		})
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, 5, got.ID)
		assert.Equal(t, perspRepoTime, got.UpdatedAt)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps save errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "perspectives" SET`).WillReturnError(errors.New("p upd boom"))

		got, err := NewGormPerspectiveRepository(db).Update(ctx, &domain.Perspective{ID: 5, UserID: 2})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to update perspective")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormPerspectiveRepository_Delete(t *testing.T) {
	ctx := context.Background()

	t.Run("succeeds when one row is removed", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "perspectives"`).WillReturnResult(sqlmock.NewResult(0, 1))

		assert.NoError(t, NewGormPerspectiveRepository(db).Delete(ctx, 5))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "perspectives"`).WillReturnResult(sqlmock.NewResult(0, 0))

		err := NewGormPerspectiveRepository(db).Delete(ctx, 404)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps delete errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "perspectives"`).WillReturnError(errors.New("p del boom"))

		err := NewGormPerspectiveRepository(db).Delete(ctx, 5)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to delete perspective")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormPerspectiveRepository_ReassignByUser(t *testing.T) {
	ctx := context.Background()

	t.Run("succeeds even when no rows match", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "perspectives" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

		assert.NoError(t, NewGormPerspectiveRepository(db).ReassignByUser(ctx, 2, 3))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("propagates errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "perspectives" SET`).WillReturnError(errors.New("p reassign boom"))

		err := NewGormPerspectiveRepository(db).ReassignByUser(ctx, 2, 3)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "p reassign boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormPerspectiveRepository_List(t *testing.T) {
	ctx := context.Background()

	t.Run("no filter maps rows and leaves TotalCount nil", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).
			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
			SortBy:    domain.PerspectiveSortByCreatedAt,
			SortOrder: domain.SortOrderDesc,
		})
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Len(t, got.Items, 1)
		assert.Equal(t, 5, got.Items[0].ID)
		assert.Equal(t, []int{1, 2, 3}, got.Items[0].Parts)
		assert.Nil(t, got.TotalCount)
		assert.False(t, got.HasNext)
		assert.False(t, got.HasPrev)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("IncludeTotalCount issues a separate COUNT query", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT count\(\*\) FROM "perspectives"`).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(12))
		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).WillReturnRows(perspectiveRows())

		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{IncludeTotalCount: true})
		require.NoError(t, err)
		require.NotNil(t, got.TotalCount)
		assert.Equal(t, 12, *got.TotalCount)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("count query failure is wrapped and short-circuits", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT count\(\*\) FROM "perspectives"`).WillReturnError(errors.New("p count boom"))

		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{IncludeTotalCount: true})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to count perspectives")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("pagination query failure is wrapped", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "perspectives"`).WillReturnError(errors.New("p page boom"))

		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to list perspectives")
		assertAllExpectationsMet(t, mock)
	})

	privacy := domain.PrivacyPublic
	filterCases := []struct {
		name      string
		filter    *domain.PerspectiveFilter
		wantSQLRe string
	}{
		{"user id", &domain.PerspectiveFilter{UserID: pInt(2)}, `user_id = `},
		{"content id", &domain.PerspectiveFilter{ContentID: pInt(11)}, `content_id = `},
		// Name intentionally doesn't claim the lowercasing is verified here — the
		// mock only matches the WHERE-clause shape (`privacy = `), not the bound
		// argument value. privacyToDBValue's lowercasing is asserted directly in
		// helpers_test.go; this case only proves the filter is wired into the query.
		{"privacy filter", &domain.PerspectiveFilter{Privacy: &privacy}, `privacy = `},
	}

	for _, fc := range filterCases {
		t.Run("filter: "+fc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(fc.wantSQLRe).WillReturnRows(perspectiveRows())

			got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
				First:     pInt(5),
				SortBy:    domain.PerspectiveSortByUpdatedAt,
				SortOrder: domain.SortOrderAsc,
				Filter:    fc.filter,
			})
			require.NoError(t, err)
			require.NotNil(t, got)
			assert.Len(t, got.Items, 0)
			assertAllExpectationsMet(t, mock)
		})
	}

	t.Run("RestrictToPublicOrOwner with a viewer adds the public-or-owner predicate", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`WHERE .*privacy = .* OR user_id = `).
			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

		viewer := 7
		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
			Filter:                  &domain.PerspectiveFilter{UserID: pInt(9)},
			ViewerID:                &viewer,
			RestrictToPublicOrOwner: true,
			SortBy:                  domain.PerspectiveSortByCreatedAt,
			SortOrder:               domain.SortOrderDesc,
		})
		require.NoError(t, err)
		require.Len(t, got.Items, 1)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("RestrictToPublicOrOwner with no viewer restricts to public only", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`WHERE .*privacy = `).
			WillReturnRows(perspectiveRows())

		got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
			Filter:                  &domain.PerspectiveFilter{UserID: pInt(9)},
			ViewerID:                nil,
			RestrictToPublicOrOwner: true,
		})
		require.NoError(t, err)
		require.NotNil(t, got)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("RestrictToPublicOrOwner false leaves the query unrestricted", func(t *testing.T) {
		db, mock := newMockDB(t)
		// No privacy predicate expected — a plain user_id filter only.
		mock.ExpectQuery(`SELECT \* FROM "perspectives" WHERE user_id = \$1 ORDER BY`).
			WillReturnRows(perspectiveRows())

		_, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
			Filter:                  &domain.PerspectiveFilter{UserID: pInt(7)},
			RestrictToPublicOrOwner: false,
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})
}
