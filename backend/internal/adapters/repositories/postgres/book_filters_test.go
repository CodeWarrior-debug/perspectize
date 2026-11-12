package postgres

import (
	"context"
	"database/sql/driver"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

func TestList_BookColumnFilters(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name     string
		filter   domain.ContentFilter
		wantRe   string
		wantArgs []driver.Value
	}{
		// The first author's name is read from the structured authors list. A row
		// without the key yields NULL, so ILIKE is NULL and the row is excluded.
		{"author contains", domain.ContentFilter{AuthorContains: cStr("stein")},
			`WHERE \(response->'authors'->0->>'name'\) ILIKE \$1 ORDER BY`, []driver.Value{"%stein%", int64(11)}},
		{"empty author contains adds nothing", domain.ContentFilter{AuthorContains: cStr("")},
			`SELECT \* FROM "content" ORDER BY`, []driver.Value{int64(11)}},
		// The value is bound, never interpolated: the apostrophe must not appear in the SQL text.
		{"apostrophe is bound, not interpolated", domain.ContentFilter{AuthorContains: cStr("O'Brien")},
			`WHERE \(response->'authors'->0->>'name'\) ILIKE \$1 ORDER BY`, []driver.Value{"%O'Brien%", int64(11)}},
		// Movie and book filters AND together; the book clause follows the movie clauses.
		{"combined with genre contains", domain.ContentFilter{GenreContains: cStr("drama"), AuthorContains: cStr("stein")},
			`WHERE \(response->'genres'\)::text ILIKE \$1 AND \(response->'authors'->0->>'name'\) ILIKE \$2 ORDER BY`,
			[]driver.Value{"%drama%", "%stein%", int64(11)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(tc.wantRe).WithArgs(tc.wantArgs...).WillReturnRows(contentRows())
			filter := tc.filter
			_, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
				SortBy:    domain.ContentSortByCreatedAt,
				SortOrder: domain.SortOrderDesc,
				Filter:    &filter,
			})
			require.NoError(t, err)
			assertAllExpectationsMet(t, mock)
		})
	}
}

func TestQueryCount_AuthorFilteredList_IsOnePageQuery(t *testing.T) {
	// A filtered list costs exactly what the unfiltered list costs: the page query only.
	// The filter is a WHERE predicate, so it adds no round trip.
	countFor := func(t *testing.T, filter *domain.ContentFilter) int {
		t.Helper()
		db, mock := newMockDB(t)
		mock.ExpectQuery(`FROM "content"`).WillReturnRows(contentRows())

		c := querycount.Attach(t, db)
		_, err := NewGormContentRepository(db).List(context.Background(), domain.ContentListParams{
			SortBy:    domain.ContentSortByCreatedAt,
			SortOrder: domain.SortOrderDesc,
			Filter:    filter,
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
		return c.Count()
	}

	unfiltered := countFor(t, nil)
	filtered := countFor(t, &domain.ContentFilter{AuthorContains: cStr("steinbeck")})
	assert.Equal(t, 1, unfiltered, "unfiltered list should issue one statement")
	assert.Equal(t, unfiltered, filtered, "author filter must not add statements")
}
