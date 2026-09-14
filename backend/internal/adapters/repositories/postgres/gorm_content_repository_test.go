package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

var contentRepoTime = time.Date(2026, 7, 8, 9, 10, 11, 0, time.UTC)

func cStr(s string) *string { return &s }
func cInt(i int) *int       { return &i }

func contentRows() *sqlmock.Rows {
	return sqlmock.NewRows([]string{
		"id", "name", "url", "content_type", "added_by_user_id",
		"length", "length_units", "response", "primary_category_id",
		"created_at", "updated_at",
	})
}

func TestGormContentRepository_GetByID(t *testing.T) {
	ctx := context.Background()

	t.Run("returns mapped content with uppercased content type", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "content"`).
			WillReturnRows(contentRows().AddRow(
				11, "Some Video", "https://youtu.be/abc", "youtube", 4,
				300, "seconds", []byte(`{"items":[]}`), 9,
				contentRepoTime, contentRepoTime))

		got, err := NewGormContentRepository(db).GetByID(ctx, 11)
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, 11, got.ID)
		assert.Equal(t, "Some Video", got.Name)
		assert.Equal(t, domain.ContentTypeYouTube, got.ContentType)
		assert.Equal(t, 4, got.AddedByUserID)
		require.NotNil(t, got.Length)
		assert.Equal(t, 300, *got.Length)
		require.NotNil(t, got.PrimaryCategoryID)
		assert.Equal(t, 9, *got.PrimaryCategoryID)
		assert.JSONEq(t, `{"items":[]}`, string(got.Response))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("maps empty result to domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnRows(contentRows())

		got, err := NewGormContentRepository(db).GetByID(ctx, 404)
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps other errors with context", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnError(errors.New("get boom"))

		got, err := NewGormContentRepository(db).GetByID(ctx, 11)
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get content by id")
		assert.Contains(t, err.Error(), "get boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormContentRepository_GetByURL(t *testing.T) {
	ctx := context.Background()

	t.Run("returns mapped content", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "content" WHERE url`).
			WillReturnRows(contentRows().AddRow(
				11, "Some Video", "https://youtu.be/abc", "claim", 4,
				nil, nil, nil, nil, contentRepoTime, contentRepoTime))

		got, err := NewGormContentRepository(db).GetByURL(ctx, "https://youtu.be/abc")
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, domain.ContentTypeClaim, got.ContentType)
		assert.Nil(t, got.Length)
		assert.Nil(t, got.PrimaryCategoryID)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("maps empty result to domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnRows(contentRows())

		got, err := NewGormContentRepository(db).GetByURL(ctx, "https://missing")
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps other errors with context", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnError(errors.New("url boom"))

		got, err := NewGormContentRepository(db).GetByURL(ctx, "https://x")
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to get content by url")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormContentRepository_Create(t *testing.T) {
	ctx := context.Background()

	t.Run("returns created content with GORM-populated id", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "content"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(21, contentRepoTime, contentRepoTime))

		got, err := NewGormContentRepository(db).Create(ctx, &domain.Content{
			Name: "New", URL: cStr("https://x"), ContentType: domain.ContentTypeYouTube, AddedByUserID: 4,
		})
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, 21, got.ID)
		assert.Equal(t, "New", got.Name)
		assert.Equal(t, domain.ContentTypeYouTube, got.ContentType)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps insert errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "content"`).WillReturnError(errors.New("ins boom"))

		got, err := NewGormContentRepository(db).Create(ctx, &domain.Content{Name: "New"})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to insert content")
		assert.Contains(t, err.Error(), "ins boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormContentRepository_GetOrCreateByURL(t *testing.T) {
	ctx := context.Background()
	newContent := func() *domain.Content {
		return &domain.Content{Name: "New", URL: cStr("https://x"), ContentType: domain.ContentTypeYouTube, AddedByUserID: 4}
	}

	t.Run("fresh insert re-reads by id and reports alreadyExisted=false", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "content" .* ON CONFLICT`).
			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(21))
		mock.ExpectQuery(`SELECT \* FROM "content"`).
			WillReturnRows(contentRows().AddRow(21, "New", "https://x", "youtube", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime))

		got, existed, err := NewGormContentRepository(db).GetOrCreateByURL(ctx, newContent(), true)
		require.NoError(t, err)
		assert.False(t, existed)
		require.NotNil(t, got)
		assert.Equal(t, 21, got.ID)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("conflict with zero rows affected falls back to lookup by URL and reports alreadyExisted=true", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "content" .* ON CONFLICT`).
			WillReturnRows(sqlmock.NewRows([]string{"id"}))
		mock.ExpectQuery(`SELECT \* FROM "content" WHERE url`).
			WillReturnRows(contentRows().AddRow(19, "Existing", "https://x", "youtube", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime))

		got, existed, err := NewGormContentRepository(db).GetOrCreateByURL(ctx, newContent(), false)
		require.NoError(t, err)
		assert.True(t, existed)
		require.NotNil(t, got)
		assert.Equal(t, 19, got.ID)
		assert.Equal(t, "Existing", got.Name)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps upsert errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "content"`).WillReturnError(errors.New("conflict boom"))

		got, existed, err := NewGormContentRepository(db).GetOrCreateByURL(ctx, newContent(), true)
		assert.Nil(t, got)
		assert.False(t, existed)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to upsert content")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps post-conflict lookup errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "content"`).WillReturnRows(sqlmock.NewRows([]string{"id"}))
		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnRows(contentRows())

		got, existed, err := NewGormContentRepository(db).GetOrCreateByURL(ctx, newContent(), false)
		assert.Nil(t, got)
		assert.False(t, existed)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to fetch existing content after conflict")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps post-create re-read errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`INSERT INTO "content"`).WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(21))
		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnError(errors.New("post-create boom"))

		got, existed, err := NewGormContentRepository(db).GetOrCreateByURL(ctx, newContent(), true)
		assert.Nil(t, got)
		assert.False(t, existed)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to fetch created content")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormContentRepository_UpdateMetadata(t *testing.T) {
	ctx := context.Background()

	t.Run("updates then re-reads", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectQuery(`SELECT \* FROM "content"`).
			WillReturnRows(contentRows().AddRow(11, "Refreshed", "https://x", "youtube", 4, 420, "seconds", []byte(`{"a":1}`), nil, contentRepoTime, contentRepoTime))

		got, err := NewGormContentRepository(db).UpdateMetadata(ctx, 11, "Refreshed", json.RawMessage(`{"a":1}`), cInt(420))
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Equal(t, "Refreshed", got.Name)
		require.NotNil(t, got.Length)
		assert.Equal(t, 420, *got.Length)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows affected means domain.ErrNotFound and no re-read", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

		got, err := NewGormContentRepository(db).UpdateMetadata(ctx, 404, "Refreshed", json.RawMessage(`{}`), nil)
		assert.Nil(t, got)
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps update errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "content" SET`).WillReturnError(errors.New("meta boom"))

		got, err := NewGormContentRepository(db).UpdateMetadata(ctx, 11, "x", json.RawMessage(`{}`), nil)
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to update content metadata")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps re-read errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 1))
		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnError(errors.New("reread boom"))

		got, err := NewGormContentRepository(db).UpdateMetadata(ctx, 11, "x", json.RawMessage(`{}`), nil)
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to fetch updated content")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormContentRepository_ReassignByUser(t *testing.T) {
	ctx := context.Background()

	t.Run("succeeds even when no rows match", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

		assert.NoError(t, NewGormContentRepository(db).ReassignByUser(ctx, 4, 5))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("propagates errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "content" SET`).WillReturnError(errors.New("reassign boom"))

		err := NewGormContentRepository(db).ReassignByUser(ctx, 4, 5)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "reassign boom")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormContentRepository_UpdatePrimaryCategoryID(t *testing.T) {
	ctx := context.Background()

	t.Run("succeeds when one row is updated", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 1))

		assert.NoError(t, NewGormContentRepository(db).UpdatePrimaryCategoryID(ctx, 11, cInt(9)))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("nil category id clears the FK", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 1))

		assert.NoError(t, NewGormContentRepository(db).UpdatePrimaryCategoryID(ctx, 11, nil))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("zero rows affected means domain.ErrNotFound", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "content" SET`).WillReturnResult(sqlmock.NewResult(0, 0))

		err := NewGormContentRepository(db).UpdatePrimaryCategoryID(ctx, 404, cInt(9))
		assert.True(t, errors.Is(err, domain.ErrNotFound), "expected domain.ErrNotFound, got %v", err)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("wraps update errors", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "content" SET`).WillReturnError(errors.New("cat fk boom"))

		err := NewGormContentRepository(db).UpdatePrimaryCategoryID(ctx, 11, cInt(9))
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to update primary category")
		assertAllExpectationsMet(t, mock)
	})
}

func TestGormContentRepository_List(t *testing.T) {
	ctx := context.Background()

	t.Run("no filter, default limit, maps rows to domain", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "content"`).
			WillReturnRows(contentRows().
				AddRow(11, "A", "https://a", "youtube", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime).
				AddRow(12, "B", "https://b", "claim", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime))

		got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
			SortBy:    domain.ContentSortByCreatedAt,
			SortOrder: domain.SortOrderDesc,
		})
		require.NoError(t, err)
		require.NotNil(t, got)
		require.Len(t, got.Items, 2)
		assert.Equal(t, "A", got.Items[0].Name)
		assert.Equal(t, domain.ContentTypeClaim, got.Items[1].ContentType)
		assert.Nil(t, got.TotalCount, "TotalCount must stay nil when IncludeTotalCount is false")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("IncludeTotalCount issues a separate COUNT query", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT count\(\*\) FROM "content"`).
			WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(37))
		mock.ExpectQuery(`SELECT \* FROM "content"`).
			WillReturnRows(contentRows().AddRow(11, "A", "https://a", "youtube", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime))

		got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
			SortBy:            domain.ContentSortByCreatedAt,
			SortOrder:         domain.SortOrderDesc,
			IncludeTotalCount: true,
		})
		require.NoError(t, err)
		require.NotNil(t, got.TotalCount)
		assert.Equal(t, 37, *got.TotalCount)
		assertAllExpectationsMet(t, mock)
	})

	t.Run("count query failure is wrapped and short-circuits", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT count\(\*\) FROM "content"`).WillReturnError(errors.New("count boom"))

		got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{IncludeTotalCount: true})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to count content")
		assertAllExpectationsMet(t, mock)
	})

	t.Run("pagination query failure is wrapped", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnError(errors.New("page boom"))

		got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{})
		assert.Nil(t, got)
		require.Error(t, err)
		assert.Contains(t, err.Error(), "failed to list content")
		assertAllExpectationsMet(t, mock)
	})

	// Each subtest below drives exactly one branch of the ~20-branch filter chain and
	// asserts the generated SQL contains that branch's predicate. This is the whole
	// point of these tests: they are the only thing standing between a typo in a
	// JSONB path and a silently wrong query.
	filterCases := []struct {
		name      string
		filter    *domain.ContentFilter
		wantSQLRe string
	}{
		// Only the WHERE-clause shape is matched here, not the bound argument value
		// — contentTypeToDBValue's lowercasing is asserted directly in
		// helpers_test.go; this case only proves the filter is wired into the query.
		{"content type", &domain.ContentFilter{ContentType: func() *domain.ContentType { ct := domain.ContentTypeYouTube; return &ct }()}, `content_type = `},
		{"min length", &domain.ContentFilter{MinLengthSeconds: cInt(60)}, `length >= `},
		{"max length", &domain.ContentFilter{MaxLengthSeconds: cInt(600)}, `length <= `},
		{"name search", &domain.ContentFilter{Search: cStr("go")}, `name ILIKE `},
		{"empty name search is ignored", &domain.ContentFilter{Search: cStr("")}, `SELECT \* FROM "content"`},
		{"min view count", &domain.ContentFilter{MinViewCount: cInt(1000)}, `'statistics'->>'viewCount'.*>= `},
		{"max view count", &domain.ContentFilter{MaxViewCount: cInt(9000)}, `'statistics'->>'viewCount'.*<= `},
		{"min like count", &domain.ContentFilter{MinLikeCount: cInt(10)}, `'statistics'->>'likeCount'.*>= `},
		{"max like count", &domain.ContentFilter{MaxLikeCount: cInt(90)}, `'statistics'->>'likeCount'.*<= `},
		{"published after", &domain.ContentFilter{PublishedAfter: cStr("2026-01-01")}, `'snippet'->>'publishedAt' >= `},
		{"published before", &domain.ContentFilter{PublishedBefore: cStr("2026-12-31")}, `'snippet'->>'publishedAt' <= `},
		{"channel title", &domain.ContentFilter{ChannelTitle: cStr("chan")}, `'snippet'->>'channelTitle' ILIKE `},
		{"tag contains", &domain.ContentFilter{TagContains: cStr("tag")}, `'snippet'->'tags'.*ILIKE `},
		{"description search", &domain.ContentFilter{DescriptionSearch: cStr("desc")}, `'snippet'->>'description' ILIKE `},
		{"created after", &domain.ContentFilter{CreatedAfter: cStr("2026-01-01")}, `created_at >= `},
		{"created before", &domain.ContentFilter{CreatedBefore: cStr("2026-12-31")}, `created_at <= `},
		{"updated after", &domain.ContentFilter{UpdatedAfter: cStr("2026-01-01")}, `updated_at >= `},
		{"updated before", &domain.ContentFilter{UpdatedBefore: cStr("2026-12-31")}, `updated_at <= `},
	}

	for _, fc := range filterCases {
		t.Run("filter: "+fc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(fc.wantSQLRe).WillReturnRows(contentRows())

			got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
				First:     cInt(5),
				SortBy:    domain.ContentSortByCreatedAt,
				SortOrder: domain.SortOrderDesc,
				Filter:    fc.filter,
			})
			require.NoError(t, err)
			require.NotNil(t, got)
			assert.Len(t, got.Items, 0)
			assert.False(t, got.HasNext)
			assert.False(t, got.HasPrev)
			assertAllExpectationsMet(t, mock)
		})
	}

	// SearchFields scopes the free-text Search term to specific columns, OR'd
	// together — distinct from the other filter fields above, which are each
	// independently ANDed in. These cases are the contract for that OR grouping.
	searchScopeCases := []struct {
		name      string
		fields    []domain.ContentSearchField
		wantSQLRe string
	}{
		{"omitted defaults to title only", nil, `WHERE name ILIKE \$1`},
		{"explicit TITLE only", []domain.ContentSearchField{domain.ContentSearchFieldTitle}, `WHERE name ILIKE \$1`},
		{
			"TITLE and DESCRIPTION are OR'd",
			[]domain.ContentSearchField{domain.ContentSearchFieldTitle, domain.ContentSearchFieldDescription},
			`WHERE name ILIKE \$1 OR response->'items'->0->'snippet'->>'description' ILIKE \$2`,
		},
		{
			"all four fields are OR'd",
			[]domain.ContentSearchField{
				domain.ContentSearchFieldTitle, domain.ContentSearchFieldDescription,
				domain.ContentSearchFieldChannelTitle, domain.ContentSearchFieldTags,
			},
			`WHERE name ILIKE \$1 OR response->'items'->0->'snippet'->>'description' ILIKE \$2 OR response->'items'->0->'snippet'->>'channelTitle' ILIKE \$3 OR \(response->'items'->0->'snippet'->'tags'\)::text ILIKE \$4`,
		},
		{
			"CHANNEL_TITLE and TAGS only (title/description excluded)",
			[]domain.ContentSearchField{domain.ContentSearchFieldChannelTitle, domain.ContentSearchFieldTags},
			`WHERE response->'items'->0->'snippet'->>'channelTitle' ILIKE \$1 OR \(response->'items'->0->'snippet'->'tags'\)::text ILIKE \$2`,
		},
	}

	for _, sc := range searchScopeCases {
		t.Run("searchFields: "+sc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(sc.wantSQLRe).WillReturnRows(contentRows())

			got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
				SortBy:    domain.ContentSortByCreatedAt,
				SortOrder: domain.SortOrderDesc,
				Filter:    &domain.ContentFilter{Search: cStr("term"), SearchFields: sc.fields},
			})
			require.NoError(t, err)
			require.NotNil(t, got)
			assertAllExpectationsMet(t, mock)
		})
	}

	t.Run("all filters combined produce a single query", func(t *testing.T) {
		db, mock := newMockDB(t)
		ct := domain.ContentTypeYouTube
		mock.ExpectQuery(`SELECT \* FROM "content" WHERE`).WillReturnRows(contentRows())

		got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
			First:     cInt(3),
			SortBy:    domain.ContentSortByViewCount,
			SortOrder: domain.SortOrderAsc,
			Filter: &domain.ContentFilter{
				ContentType: &ct, MinLengthSeconds: cInt(1), MaxLengthSeconds: cInt(2),
				Search: cStr("s"), MinViewCount: cInt(3), MaxViewCount: cInt(4),
				MinLikeCount: cInt(5), MaxLikeCount: cInt(6),
				PublishedAfter: cStr("2026-01-01"), PublishedBefore: cStr("2026-12-31"),
				ChannelTitle: cStr("c"), TagContains: cStr("t"), DescriptionSearch: cStr("d"),
				CreatedAfter: cStr("2026-01-01"), CreatedBefore: cStr("2026-12-31"),
				UpdatedAfter: cStr("2026-01-01"), UpdatedBefore: cStr("2026-12-31"),
			},
		})
		require.NoError(t, err)
		require.NotNil(t, got)
		assert.Len(t, got.Items, 0)
		assertAllExpectationsMet(t, mock)
	})
}
