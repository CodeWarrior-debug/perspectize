package postgres

import (
	"context"
	"database/sql/driver"
	"errors"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/jackc/pgx/v5/pgconn"
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

// recordArg records one bound argument and accepts any value, so a test can
// assert on specific positions without listing every column value.
type recordArg struct{ got driver.Value }

func (r *recordArg) Match(v driver.Value) bool { r.got = v; return true }

func TestGormPerspectiveRepository_Create(t *testing.T) {
	ctx := context.Background()

	t.Run("single INSERT ... RETURNING, no follow-up SELECT", func(t *testing.T) {
		db, mock := newMockDB(t)
		// Only the INSERT is expected: a trailing SELECT (or BEGIN/COMMIT) would
		// fail with an unexpected-call error.
		mock.ExpectQuery(`INSERT INTO "perspectives" .* RETURNING `).
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
		assert.Equal(t, perspRepoTime, got.UpdatedAt)
		assert.Equal(t, []int{1, 2, 3}, got.Parts)
		assert.Equal(t, []string{"a", "b"}, got.Labels)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("FK violation on perspectives_users_fk maps to domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "perspectives"`).
			WillReturnError(&pgconn.PgError{Code: "23503", ConstraintName: "perspectives_users_fk"})

		got, err := NewGormPerspectiveRepository(db).Create(ctx, &domain.Perspective{UserID: 999})
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "999")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("other constraint errors stay generic", func(t *testing.T) {
		tests := []struct {
			name string
			err  *pgconn.PgError
		}{
			{"other FK (content)", &pgconn.PgError{Code: "23503", ConstraintName: "perspectives_content_fk"}},
			{"user FK name but different code", &pgconn.PgError{Code: "23505", ConstraintName: "perspectives_users_fk"}},
			{"check violation", &pgconn.PgError{Code: "23514", ConstraintName: "perspectives_quality_check"}},
		}
		for _, tt := range tests {
			t.Run(tt.name, func(t *testing.T) {
				db, mock := newMockDB(t)
				mock.ExpectQuery(`INSERT INTO "perspectives"`).WillReturnError(tt.err)

				got, err := NewGormPerspectiveRepository(db).Create(ctx, &domain.Perspective{UserID: 2})
				assert.Nil(t, got)
				require.Error(t, err)
				assert.False(t, errors.Is(err, domain.ErrNotFound), "must not be mapped to ErrNotFound: %v", err)
				assert.Contains(t, err.Error(), "failed to insert perspective")
				var pgErr *pgconn.PgError
				assert.True(t, errors.As(err, &pgErr), "original PgError must stay in the chain")
				assertAllExpectationsMet(t, mock)
			})
		}
	})

	t.Run("wraps insert errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "perspectives"`).WillReturnError(errors.New("p ins boom"))

		got, err := NewGormPerspectiveRepository(db).Create(ctx, &domain.Perspective{UserID: 2})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to insert perspective")
		assert.Contains(t, err.Error(), "p ins boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormPerspectiveRepository_Update(t *testing.T) {
	ctx := context.Background()

	t.Run("single owner-scoped UPDATE ... RETURNING, no follow-up SELECT", func(t *testing.T) {
		db, mock := newMockDB(t)
		// 18 SET values (id, user_id and created_at are omitted from SET, and the
		// nil custom_fields is inlined as NULL), then the owner and id predicates.
		recs := make([]*recordArg, 20)
		matchers := make([]driver.Value, 20)
		for i := range recs {
			recs[i] = &recordArg{}
			matchers[i] = recs[i]
		}
		mock.ExpectQuery(`UPDATE "perspectives" SET "content_id"=\$1,.*"review"=\$17,"updated_at"=\$18 WHERE user_id = \$19 AND "id" = \$20 RETURNING `).
			WithArgs(matchers...).
			WillReturnRows(fullPerspectiveRow(perspectiveRows(), 5))

		got, err := NewGormPerspectiveRepository(db).Update(ctx, &domain.Perspective{
			ID: 5, UserID: 2, Privacy: domain.PrivacyPublic, Description: pStr("desc"),
		}, 42)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, 5, got.ID)
		assert.Equal(t, perspRepoTime, got.UpdatedAt)
		assert.Equal(t, []int{1, 2, 3}, got.Parts)
		assertAllExpectationsMet(t, mock)

		// The owner predicate binds ownerUserID (42), never the perspective's own
		// UserID (2); the id predicate binds 5.
		assert.EqualValues(t, 42, recs[18].got, "user_id predicate must use ownerUserID")
		assert.EqualValues(t, 5, recs[19].got, "id predicate")
		for i := 0; i < 18; i++ {
			assert.NotEqualValues(t, 42, recs[i].got, "owner id must not be written into SET (arg %d)", i+1)
		}
		// Select("*") writes nil fields too, so an unset rating is a real clear.
		assert.Nil(t, recs[2].got, "quality (nil) must be written as NULL")
	})

	t.Run("zero rows (missing or not owned) means domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "perspectives" SET`).WillReturnRows(perspectiveRows())

		got, err := NewGormPerspectiveRepository(db).Update(ctx, &domain.Perspective{ID: 404, UserID: 2}, 2)
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("non-positive owner never reaches the database", func(t *testing.T) {
		for _, owner := range []int{0, -1} {
			db, mock := newMockDB(t)

			got, err := NewGormPerspectiveRepository(db).Update(ctx, &domain.Perspective{ID: 5, UserID: 2}, owner)
			assert.Nil(t, got)
			assert.True(t, errors.Is(err, domain.ErrNotFound), "owner %d: expected domain.ErrNotFound, got %v", owner, err)
			assertAllExpectationsMet(t, mock)
		}
	})

	t.Run("wraps update errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`UPDATE "perspectives" SET`).WillReturnError(errors.New("p upd boom"))

		got, err := NewGormPerspectiveRepository(db).Update(ctx, &domain.Perspective{ID: 5, UserID: 2}, 2)
		assert.Nil(t, got)
		require.Error(t, err)
		assert.False(t, errors.Is(err, domain.ErrNotFound))
		assert.Contains(t, err.Error(), "failed to update perspective")
		assert.Contains(t, err.Error(), "p upd boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormPerspectiveRepository_Delete(t *testing.T) {
	ctx := context.Background()

	t.Run("scopes the DELETE to the owner and succeeds when one row is removed", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "perspectives" WHERE user_id = \$1 AND "perspectives"."id" = \$2`).
			WithArgs(42, 5).
			WillReturnResult(sqlmock.NewResult(0, 1))

		assert.NoError(t, NewGormPerspectiveRepository(db).Delete(ctx, 5, 42))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows affected (missing or not owned) means domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "perspectives"`).WillReturnResult(sqlmock.NewResult(0, 0))

		err := NewGormPerspectiveRepository(db).Delete(ctx, 404, 42)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("non-positive owner never reaches the database", func(t *testing.T) {
		db, mock := newMockDB(t)

		err := NewGormPerspectiveRepository(db).Delete(ctx, 5, 0)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps delete errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`DELETE FROM "perspectives"`).WillReturnError(errors.New("p del boom"))

		err := NewGormPerspectiveRepository(db).Delete(ctx, 5, 42)
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
		mock.ExpectQuery(`WHERE user_id = \$1 AND \(privacy = \$2 OR user_id = \$3\)`).
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
		mock.ExpectQuery(`WHERE user_id = \$1 AND privacy = \$2 ORDER BY`).
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

func TestGormPerspectiveRepository_AggregateByContentIDs(t *testing.T) {
	ctx := context.Background()

	t.Run("Count is COUNT(*) — a perspective with no Quality still counts", func(t *testing.T) {
		db, mock := newMockDB(t)
		// One content id, one row: quality_count=0 (no Quality set on the lone
		// perspective) but count=1 — proves Count isn't accidentally tied to
		// COUNT(quality)/the Quality column at all.
		rows := sqlmock.NewRows([]string{"content_id", "count", "quality_count", "avg_quality"}).
			AddRow(11, 1, 0, nil)
		mock.ExpectQuery(`SELECT content_id AS content_id, COUNT\(\*\) AS count, COUNT\(quality\) AS quality_count, AVG\(quality\) AS avg_quality FROM "perspectives" WHERE content_id IN \(\$1\) GROUP BY "content_id"`).
			WithArgs(11).
			WillReturnRows(rows)

		got, err := NewGormPerspectiveRepository(db).AggregateByContentIDs(ctx, []int{11})
		require.NoError(t, err)
		require.Contains(t, got, 11)
		assert.Equal(t, 1, got[11].Count)
		assert.Equal(t, 0, got[11].QualityCount)
		assert.Nil(t, got[11].AverageQuality)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("empty contentIDs short-circuits without a query", func(t *testing.T) {
		db, mock := newMockDB(t)
		got, err := NewGormPerspectiveRepository(db).AggregateByContentIDs(ctx, []int{})
		require.NoError(t, err)
		assert.Empty(t, got)
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormPerspectiveRepository_FeelingStats(t *testing.T) {
	ctx := context.Background()

	t.Run("matches by emoji and label, forces stddev nil at count 1", func(t *testing.T) {
		db, mock := newMockDB(t)
		avg := 8500.0
		rows := sqlmock.NewRows([]string{"count", "avg_intensity", "stddev_intensity"}).
			AddRow(1, avg, 0.0)
		mock.ExpectQuery(`(?s)SELECT.*COUNT\(DISTINCT p\.id\) AS count.*FROM perspectives p.*CROSS JOIN LATERAL unnest\(p\.feelings\) AS f.*WHERE f->>'emoji' = \$1.*AND lower\(f->>'label'\) = lower\(\$2\).*AND p\.content_id = \$3`).
			WithArgs("🥰", "Love", 11).
			WillReturnRows(rows)

		countRows := sqlmock.NewRows([]string{"count"}).AddRow(4)
		mock.ExpectQuery(`SELECT count\(\*\) FROM "perspectives" WHERE content_id = \$1`).
			WithArgs(11).
			WillReturnRows(countRows)

		label := "Love"
		contentID := 11
		got, err := NewGormPerspectiveRepository(db).FeelingStats(ctx, &contentID, "🥰", &label)
		require.NoError(t, err)
		assert.Equal(t, 1, got.Count)
		assert.Equal(t, 4, got.TotalPerspectives)
		require.NotNil(t, got.AverageIntensity)
		assert.Equal(t, avg, *got.AverageIntensity)
		assert.Nil(t, got.StdDevIntensity) // forced nil at count == 1, not the DB's 0
		assertAllExpectationsMet(t, mock)
	})

	t.Run("no content scope omits the content_id filter and label", func(t *testing.T) {
		db, mock := newMockDB(t)
		avg, stddev := 6000.0, 1500.0
		rows := sqlmock.NewRows([]string{"count", "avg_intensity", "stddev_intensity"}).
			AddRow(5, avg, stddev)
		mock.ExpectQuery(`(?s)SELECT.*FROM perspectives p.*WHERE f->>'emoji' = \$1$`).
			WithArgs("🤬").
			WillReturnRows(rows)

		countRows := sqlmock.NewRows([]string{"count"}).AddRow(20)
		mock.ExpectQuery(`SELECT count\(\*\) FROM "perspectives"$`).
			WillReturnRows(countRows)

		got, err := NewGormPerspectiveRepository(db).FeelingStats(ctx, nil, "🤬", nil)
		require.NoError(t, err)
		assert.Equal(t, 5, got.Count)
		assert.Equal(t, 20, got.TotalPerspectives)
		assert.Equal(t, &stddev, got.StdDevIntensity)
		require.NotNil(t, got.PercentOfPerspectives())
		assert.Equal(t, 25.0, *got.PercentOfPerspectives())
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormPerspectiveRepository_CustomFieldStats(t *testing.T) {
	ctx := context.Background()

	t.Run("uses jsonb_exists, not the bare ? operator (avoids GORM Raw placeholder collision)", func(t *testing.T) {
		db, mock := newMockDB(t)
		rows := sqlmock.NewRows([]string{"count"}).AddRow(2)
		mock.ExpectQuery(`(?s)SELECT COUNT\(\*\) AS count.*FROM perspectives p.*WHERE jsonb_exists\(p\.custom_fields, \$1\).*AND p\.content_id = \$2`).
			WithArgs("mood", 11).
			WillReturnRows(rows)

		countRows := sqlmock.NewRows([]string{"count"}).AddRow(4)
		mock.ExpectQuery(`SELECT count\(\*\) FROM "perspectives" WHERE content_id = \$1`).
			WithArgs(11).
			WillReturnRows(countRows)

		contentID := 11
		got, err := NewGormPerspectiveRepository(db).CustomFieldStats(ctx, &contentID, "mood")
		require.NoError(t, err)
		assert.Equal(t, 2, got.Count)
		assert.Equal(t, 4, got.TotalPerspectives)
		assertAllExpectationsMet(t, mock)
	})
}
