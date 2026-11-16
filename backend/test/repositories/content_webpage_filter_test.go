package repositories

import (
	"context"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

// newCapturingContentDB returns a sqlmock-backed *gorm.DB that records the SQL of
// every statement it receives, so a test can assert the exact shape of a filter.
// The gorm settings match the postgres package harness (no ping, no default
// transaction, silent logger).
func newCapturingContentDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock, *[]string) {
	t.Helper()
	var captured []string
	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherFunc(
		func(_, actual string) error {
			captured = append(captured, actual)
			return nil
		})))
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })

	gdb, err := gorm.Open(gormpg.New(gormpg.Config{Conn: sqlDB}), &gorm.Config{
		DisableAutomaticPing:   true,
		SkipDefaultTransaction: true,
		Logger:                 logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)
	return gdb, mock, &captured
}

// listSQL runs one content list and returns the single statement it issued.
func listSQL(t *testing.T, params domain.ContentListParams) string {
	t.Helper()
	db, mock, captured := newCapturingContentDB(t)
	mock.ExpectQuery("FROM").WillReturnRows(sqlmock.NewRows([]string{"id"}))

	_, err := postgres.NewGormContentRepository(db).List(context.Background(), params)
	require.NoError(t, err)
	require.Len(t, *captured, 1, "a list is one statement")
	return (*captured)[0]
}

func pageOf(n int, filter *domain.ContentFilter) domain.ContentListParams {
	return domain.ContentListParams{First: &n, Filter: filter}
}

func TestContentListWebPageRoles_OneValueIsOneContainment(t *testing.T) {
	db, mock, _ := newCapturingContentDB(t)
	// Bound parameters: the content type, the role as a JSON array, the privacy a signed-out
	// viewer may read, then the limit.
	mock.ExpectQuery("FROM").
		WithArgs("web_page", `["BLOG_POST"]`, "public", int64(11)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	first := 10
	_, err := postgres.NewGormContentRepository(db).List(context.Background(), domain.ContentListParams{
		First:  &first,
		Filter: &domain.ContentFilter{WebPageRoles: []domain.WebPageRole{domain.WebPageRoleBlogPost}},
	})
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestContentListWebPageRoles_SeveralValuesAreORd(t *testing.T) {
	sql := listSQL(t, pageOf(10, &domain.ContentFilter{
		WebPageRoles: []domain.WebPageRole{domain.WebPageRoleBlogPost, domain.WebPageRoleSessionTranscript},
	}))
	assert.Contains(t, sql,
		"(response->'webPageRoles' @> $2::jsonb OR response->'webPageRoles' @> $3::jsonb)")
}

func TestContentListWebPageRoles_OmittedOrEmptyAddsNoCondition(t *testing.T) {
	for name, filter := range map[string]*domain.ContentFilter{
		"omitted": {},
		"empty":   {WebPageRoles: []domain.WebPageRole{}},
	} {
		t.Run(name, func(t *testing.T) {
			sql := listSQL(t, pageOf(10, filter))
			assert.NotContains(t, sql, "webPageRoles")
		})
	}
}

func TestContentListWebPageRoles_ANDedWithContentTypes(t *testing.T) {
	sql := listSQL(t, pageOf(10, &domain.ContentFilter{
		ContentTypes: []domain.ContentType{domain.ContentTypeWebPage, domain.ContentTypeYouTubeVideo},
		WebPageRoles: []domain.WebPageRole{domain.WebPageRoleSessionTranscript},
	}))
	assert.Contains(t, sql, "content_type IN ($1,$2)")
	assert.Contains(t, sql, "content_type = $3 AND (response->'webPageRoles' @> $4::jsonb)")
}

// statementsForList runs one content list and returns how many statements it issued.
func statementsForList(t *testing.T, params domain.ContentListParams) int {
	t.Helper()
	db, mock, _ := newCapturingContentDB(t)
	mock.ExpectQuery("FROM").WillReturnRows(sqlmock.NewRows([]string{"id"}))
	c := querycount.Attach(t, db)

	_, err := postgres.NewGormContentRepository(db).List(context.Background(), params)
	require.NoError(t, err)
	return c.Count()
}

// A webpage role filter adds no statement over a plain content list, with or
// without the total. The absolute counts are what the list costs today.
func TestContentListWebPageRoles_AddsNoStatementOverPlainList(t *testing.T) {
	first := 10
	roles := &domain.ContentFilter{WebPageRoles: []domain.WebPageRole{domain.WebPageRoleBlogPost, domain.WebPageRoleSessionTranscript}}

	t.Run("without total count: one statement", func(t *testing.T) {
		plain := statementsForList(t, domain.ContentListParams{First: &first})
		withRoles := statementsForList(t, domain.ContentListParams{First: &first, Filter: roles})
		assert.Equal(t, plain, withRoles)
		assert.Equal(t, 1, withRoles)
	})

	// Budget today is 2, not 1: a standalone COUNT(*) runs before the page query
	// even though the total is also selected as a subquery. This is pre-existing in
	// the shared list path (it shows for every content type). When it is fixed, lower
	// this to 1 and the plain-list comparison still holds.
	t.Run("with total count: pinned at today's cost", func(t *testing.T) {
		plain := statementsForList(t, domain.ContentListParams{First: &first, IncludeTotalCount: true})
		withRoles := statementsForList(t, domain.ContentListParams{First: &first, IncludeTotalCount: true, Filter: roles})
		assert.Equal(t, plain, withRoles)
		assert.Equal(t, 2, withRoles)
	})
}

func TestContentListPublishedAt_MixedSortUsesWebPageBranch(t *testing.T) {
	sql := listSQL(t, domain.ContentListParams{
		First:  intPtrRepo(10),
		SortBy: domain.ContentSortByPublishedAt,
	})
	assert.True(t, strings.Contains(sql, "CASE WHEN content_type = 'web_page' THEN response->>'publishedAt'"),
		"the published-at sort reads a webpage's own publishedAt: %s", sql)
	assert.Contains(t, sql, "response->'items'->0->'snippet'->>'publishedAt'")
	assert.Contains(t, sql, "ORDER BY")
}

func intPtrRepo(v int) *int { return &v }
