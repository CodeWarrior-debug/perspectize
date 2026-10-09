package postgres

import (
	"context"
	"database/sql/driver"
	"encoding/base64"
	"encoding/json"
	"reflect"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

// derefArg matches a bound arg after dereferencing pointers (the paginator decodes
// cursor values into pointer-typed fields) and compares it to want.
type derefArg struct{ want interface{} }

func (m derefArg) Match(v driver.Value) bool {
	rv := reflect.ValueOf(v)
	for rv.IsValid() && rv.Kind() == reflect.Ptr {
		if rv.IsNil() {
			return m.want == nil
		}
		rv = rv.Elem()
	}
	if !rv.IsValid() {
		return m.want == nil
	}
	return reflect.DeepEqual(rv.Interface(), m.want)
}

func computedRows(alias string, val driver.Value) *sqlmock.Rows {
	r := sqlmock.NewRows([]string{
		"id", "name", "url", "content_type", "added_by_user_id", "length", "length_units",
		"response", "primary_category_id", "created_at", "updated_at", alias,
	})
	for _, id := range []int{161, 162} { // limit+1 rows => a next page exists
		r.AddRow(id, "n", "u", "movie", 1, nil, nil, []byte(`{}`), nil, contentRepoTime, contentRepoTime, val)
	}
	return r
}

// TestList_ComputedSortKeyCursor pins C-02: for computed sort keys the cursor must
// carry the real page-1 sort value (not 0), and page 2's WHERE must bind it.
func TestList_ComputedSortKeyCursor(t *testing.T) {
	ctx := context.Background()
	tests := []struct {
		name     string
		sortBy   domain.ContentSortBy
		order    domain.SortOrder
		alias    string
		dbVal    driver.Value
		wantJSON string      // first cursor element
		wantArg  interface{} // value bound for page 2's first comparison
	}{
		{"views", domain.ContentSortByViewCount, domain.SortOrderDesc, "view_count", int64(9000), `9000`, int64(9000)},
		{"likes", domain.ContentSortByLikeCount, domain.SortOrderDesc, "like_count", int64(40), `40`, int64(40)},
		{"percent liked", domain.ContentSortByPercentLiked, domain.SortOrderDesc, "percent_liked", 0.25, `0.25`, 0.25},
		{"published at", domain.ContentSortByPublishedAt, domain.SortOrderDesc, "published_at_sort", "2024-01-02T00:00:00Z", `"2024-01-02T00:00:00Z"`, "2024-01-02T00:00:00Z"},
		{"channel title", domain.ContentSortByChannelTitle, domain.SortOrderAsc, "channel_title_sort", "Chan", `"Chan"`, "Chan"},
		{"box office desc", domain.ContentSortByBoxOffice, domain.SortOrderDesc, "box_office", int64(161000000), `161000000`, int64(161000000)},
		{"box office asc", domain.ContentSortByBoxOffice, domain.SortOrderAsc, "box_office", int64(161000000), `161000000`, int64(161000000)},
		{"vs budget", domain.ContentSortByVsBudget, domain.SortOrderDesc, "vs_budget", 3.5, `3.5`, 3.5},
		{"age rating", domain.ContentSortByAgeRating, domain.SortOrderAsc, "age_rating", int64(3), `3`, int64(3)},
		// NULL page-1 value: cursor carries null, page 2 binds the sentinel that sorts unknowns last.
		{"box office null asc", domain.ContentSortByBoxOffice, domain.SortOrderAsc, "box_office", nil, `null`, nullBoxOfficeAsc},
		{"box office null desc", domain.ContentSortByBoxOffice, domain.SortOrderDesc, "box_office", nil, `null`, nullBoxOfficeDesc},
		{"vs budget null asc", domain.ContentSortByVsBudget, domain.SortOrderAsc, "vs_budget", nil, `null`, nullVsBudgetAsc},
		{"age rating null desc", domain.ContentSortByAgeRating, domain.SortOrderDesc, "age_rating", nil, `null`, nullAgeRatingDesc},
		{"release date", domain.ContentSortByReleaseDate, domain.SortOrderDesc, "release_date_sort", "2001-12-18", `"2001-12-18"`, "2001-12-18"},
		{"release date null asc", domain.ContentSortByReleaseDate, domain.SortOrderAsc, "release_date_sort", nil, `null`, nullReleaseDateAsc},
		{"tmdb score", domain.ContentSortByTmdbScore, domain.SortOrderDesc, "tmdb_score", 8.4, `8.4`, 8.4},
		{"tmdb score null desc", domain.ContentSortByTmdbScore, domain.SortOrderDesc, "tmdb_score", nil, `null`, nullTmdbScoreDesc},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			repo := NewGormContentRepository(db)
			first := 1
			params := domain.ContentListParams{First: &first, SortBy: tt.sortBy, SortOrder: tt.order}

			// Page 1 must select the sort expression under the field's column alias.
			mock.ExpectQuery(`SELECT content\.\*, \(.+\) AS ` + tt.alias).WillReturnRows(computedRows(tt.alias, tt.dbVal))
			c := querycount.Attach(t, db)
			page1, err := repo.List(ctx, params)
			require.NoError(t, err)
			c.AssertExactly(t, 1)
			require.NotNil(t, page1.EndCursor)

			raw, err := base64.StdEncoding.DecodeString(*page1.EndCursor)
			require.NoError(t, err)
			var elems []json.RawMessage
			require.NoError(t, json.Unmarshal(raw, &elems))
			require.Len(t, elems, 2)
			assert.JSONEq(t, tt.wantJSON, string(elems[0]), "cursor must carry the real sort value, not 0")

			// Page 2: the keyset comparison binds that value, then the id, then limit+1.
			params.After = page1.EndCursor
			mock.ExpectQuery(`SELECT content\.\*, \(.+\) AS `+tt.alias+`.*WHERE .*COALESCE`).
				WithArgs(derefArg{tt.wantArg}, derefArg{int64(161)}, 2).
				WillReturnRows(computedRows(tt.alias, tt.dbVal))
			_, err = repo.List(ctx, params)
			require.NoError(t, err)
			assertAllExpectationsMet(t, mock)
		})
	}
}

func TestList_RealColumnSortSelectsNoComputedColumns(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT \* FROM "content"`).WillReturnRows(contentRows())
	first := 1
	_, err := NewGormContentRepository(db).List(context.Background(), domain.ContentListParams{
		First: &first, SortBy: domain.ContentSortByCreatedAt, SortOrder: domain.SortOrderDesc,
	})
	require.NoError(t, err)
	assertAllExpectationsMet(t, mock)
}
