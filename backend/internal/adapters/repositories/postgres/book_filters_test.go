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

func cF64(f float64) *float64 { return &f }

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
			`WHERE \(response->'authors'->0->>'name'\) ILIKE \$1 AND content.privacy = \$2 ORDER BY`, []driver.Value{"%stein%", "public", int64(11)}},
		{"empty author contains adds nothing", domain.ContentFilter{AuthorContains: cStr("")},
			`SELECT \* FROM "content" WHERE content.privacy = \$1 ORDER BY`, []driver.Value{"public", int64(11)}},
		// The value is bound, never interpolated: the apostrophe must not appear in the SQL text.
		{"apostrophe is bound, not interpolated", domain.ContentFilter{AuthorContains: cStr("O'Brien")},
			`WHERE \(response->'authors'->0->>'name'\) ILIKE \$1 AND content.privacy = \$2 ORDER BY`, []driver.Value{"%O'Brien%", "public", int64(11)}},
		// Movie and book filters AND together; the book clause follows the movie clauses.
		{"combined with genre contains", domain.ContentFilter{GenreContains: cStr("drama"), AuthorContains: cStr("stein")},
			`WHERE \(response->'genres'\)::text ILIKE \$1 AND \(response->'authors'->0->>'name'\) ILIKE \$2 AND content.privacy = \$3 ORDER BY`,
			[]driver.Value{"%drama%", "%stein%", "public", int64(11)}},
		// Numeric ranges read the stored book keys as NUMERIC and bind every bound.
		{"published year range", domain.ContentFilter{MinPublishYear: cInt(1950), MaxPublishYear: cInt(1960)},
			`WHERE \(response->>'firstPublishYear'\)::NUMERIC >= \$1 AND \(response->>'firstPublishYear'\)::NUMERIC <= \$2 AND content.privacy = \$3 ORDER BY`,
			[]driver.Value{int64(1950), int64(1960), "public", int64(11)}},
		{"min pages only", domain.ContentFilter{MinPages: cInt(300)},
			`WHERE \(response->>'pageCountMedian'\)::NUMERIC >= \$1 AND content.privacy = \$2 ORDER BY`, []driver.Value{int64(300), "public", int64(11)}},
		{"max pages only", domain.ContentFilter{MaxPages: cInt(500)},
			`WHERE \(response->>'pageCountMedian'\)::NUMERIC <= \$1 AND content.privacy = \$2 ORDER BY`, []driver.Value{int64(500), "public", int64(11)}},
		{"book rating range", domain.ContentFilter{MinBookRating: cF64(3.5), MaxBookRating: cF64(4.5)},
			`WHERE \(response->>'ratingsAverage'\)::NUMERIC >= \$1 AND \(response->>'ratingsAverage'\)::NUMERIC <= \$2 AND content.privacy = \$3 ORDER BY`,
			[]driver.Value{3.5, 4.5, "public", int64(11)}},
		{"author, year, pages and rating AND together", domain.ContentFilter{
			AuthorContains: cStr("stein"), MinPublishYear: cInt(1900), MinPages: cInt(100), MinBookRating: cF64(4)},
			`WHERE \(response->'authors'->0->>'name'\) ILIKE \$1 AND \(response->>'firstPublishYear'\)::NUMERIC >= \$2 AND \(response->>'pageCountMedian'\)::NUMERIC >= \$3 AND \(response->>'ratingsAverage'\)::NUMERIC >= \$4 AND content.privacy = \$5 ORDER BY`,
			[]driver.Value{"%stein%", int64(1900), int64(100), float64(4), "public", int64(11)}},
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
