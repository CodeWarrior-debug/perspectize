package postgres

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"

	"github.com/pilagod/gorm-cursor-paginator/v2/paginator"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

func TestMovieSortRules(t *testing.T) {
	const vsBudgetSQL = "CASE WHEN response->>'budget' IS NULL OR response->>'revenue' IS NULL " +
		"OR (response->>'budget')::BIGINT = 0 THEN NULL " +
		"ELSE (response->>'revenue')::FLOAT8 / NULLIF((response->>'budget')::BIGINT,0) END"
	const ageSQL = "CASE response->>'certification' WHEN 'G' THEN 1 WHEN 'PG' THEN 2 " +
		"WHEN 'PG-13' THEN 3 WHEN 'R' THEN 4 WHEN 'NC-17' THEN 5 ELSE NULL END"
	// Unknowns sort LAST: the paginator COALESCEs NULLs to NULLReplacement, so ASC
	// needs a high sentinel and DESC a low one.
	tests := []struct {
		name   string
		sortBy domain.ContentSortBy
		order  domain.SortOrder
		want   paginator.Rule
	}{
		{"box office desc", domain.ContentSortByBoxOffice, domain.SortOrderDesc, paginator.Rule{
			Key: "BoxOffice", Order: paginator.DESC,
			SQLRepr: "(response->>'revenue')::BIGINT", NULLReplacement: int64(0),
		}},
		{"box office asc", domain.ContentSortByBoxOffice, domain.SortOrderAsc, paginator.Rule{
			Key: "BoxOffice", Order: paginator.ASC,
			SQLRepr: "(response->>'revenue')::BIGINT", NULLReplacement: int64(1 << 53),
		}},
		{"vs budget desc", domain.ContentSortByVsBudget, domain.SortOrderDesc, paginator.Rule{
			Key: "VsBudget", Order: paginator.DESC, SQLRepr: vsBudgetSQL, NULLReplacement: float64(-1),
		}},
		{"vs budget asc", domain.ContentSortByVsBudget, domain.SortOrderAsc, paginator.Rule{
			Key: "VsBudget", Order: paginator.ASC, SQLRepr: vsBudgetSQL, NULLReplacement: float64(1e18),
		}},
		{"age rating desc", domain.ContentSortByAgeRating, domain.SortOrderDesc, paginator.Rule{
			Key: "AgeRating", Order: paginator.DESC, SQLRepr: ageSQL, NULLReplacement: int64(0),
		}},
		{"age rating asc", domain.ContentSortByAgeRating, domain.SortOrderAsc, paginator.Rule{
			Key: "AgeRating", Order: paginator.ASC, SQLRepr: ageSQL, NULLReplacement: int64(99),
		}},
		// ISO dates sort lexically; a missing or empty date is NULL and sorts last both ways.
		{"release date desc", domain.ContentSortByReleaseDate, domain.SortOrderDesc, paginator.Rule{
			Key: "ReleaseDate", Order: paginator.DESC, SQLRepr: "NULLIF(response->>'releaseDate', '')", NULLReplacement: "",
		}},
		{"release date asc", domain.ContentSortByReleaseDate, domain.SortOrderAsc, paginator.Rule{
			Key: "ReleaseDate", Order: paginator.ASC, SQLRepr: "NULLIF(response->>'releaseDate', '')", NULLReplacement: "9999-12-31",
		}},
		{"tmdb score desc", domain.ContentSortByTmdbScore, domain.SortOrderDesc, paginator.Rule{
			Key: "TmdbScore", Order: paginator.DESC, SQLRepr: "(response->>'voteAverage')::FLOAT8", NULLReplacement: float64(-1),
		}},
		{"tmdb score asc", domain.ContentSortByTmdbScore, domain.SortOrderAsc, paginator.Rule{
			Key: "TmdbScore", Order: paginator.ASC, SQLRepr: "(response->>'voteAverage')::FLOAT8", NULLReplacement: float64(99),
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rules := buildContentSortRules(tt.sortBy, tt.order)
			require.Len(t, rules, 2)
			assert.Equal(t, tt.want, rules[0])
		})
	}
}

func TestApplyContentSearch_CastAndDirector(t *testing.T) {
	ctx := context.Background()
	cases := []struct {
		name   string
		fields []domain.ContentSearchField
		wantRe string
	}{
		{"cast", []domain.ContentSearchField{domain.ContentSearchFieldCast},
			`WHERE EXISTS \(SELECT 1 FROM jsonb_array_elements\(CASE WHEN jsonb_typeof\(response->'cast'\) = 'array' THEN response->'cast' ELSE '\[\]'::jsonb END\) p WHERE p->>'name' ILIKE \$1\)`},
		{"director", []domain.ContentSearchField{domain.ContentSearchFieldDirector},
			`WHERE EXISTS \(SELECT 1 FROM jsonb_array_elements\(CASE WHEN jsonb_typeof\(response->'directors'\) = 'array' THEN response->'directors' ELSE '\[\]'::jsonb END\) p WHERE p->>'name' ILIKE \$1\)`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(tc.wantRe).WithArgs("%Nolan%", int64(11)).WillReturnRows(contentRows())
			_, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
				SortBy:    domain.ContentSortByCreatedAt,
				SortOrder: domain.SortOrderDesc,
				Filter:    &domain.ContentFilter{Search: cStr("Nolan"), SearchFields: tc.fields},
			})
			require.NoError(t, err)
			assertAllExpectationsMet(t, mock)
		})
	}

	t.Run("cast and director are OR'd with one arg each", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`jsonb_array_elements\(CASE WHEN jsonb_typeof\(response->'cast'\).*ILIKE \$1\) OR EXISTS .*response->'directors'.*ILIKE \$2`).
			WithArgs("%Nolan%", "%Nolan%", int64(11)).WillReturnRows(contentRows())
		_, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
			SortBy:    domain.ContentSortByCreatedAt,
			SortOrder: domain.SortOrderDesc,
			Filter: &domain.ContentFilter{Search: cStr("Nolan"), SearchFields: []domain.ContentSearchField{
				domain.ContentSearchFieldCast, domain.ContentSearchFieldDirector}},
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})
}

func TestList_PersonFilter(t *testing.T) {
	ctx := context.Background()
	role := func(r domain.PersonRole) *domain.PersonRole { return &r }

	cases := []struct {
		name     string
		personID *int
		role     *domain.PersonRole
		wantRe   string
		wantArgs []driver.Value
	}{
		{"cast only", cInt(525), role(domain.PersonRoleCast),
			`WHERE content_type = 'movie' AND response->'cast' @> \$1::jsonb ORDER BY`,
			[]driver.Value{`[{"id":525}]`, int64(11)}},
		{"director only", cInt(525), role(domain.PersonRoleDirector),
			`WHERE content_type = 'movie' AND response->'directors' @> \$1::jsonb ORDER BY`,
			[]driver.Value{`[{"id":525}]`, int64(11)}},
		{"any role ORs both", cInt(525), nil,
			`WHERE content_type = 'movie' AND \(response->'cast' @> \$1::jsonb OR response->'directors' @> \$2::jsonb\) ORDER BY`,
			[]driver.Value{`[{"id":525}]`, `[{"id":525}]`, int64(11)}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(tc.wantRe).WithArgs(tc.wantArgs...).WillReturnRows(contentRows())
			_, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
				SortBy:    domain.ContentSortByCreatedAt,
				SortOrder: domain.SortOrderDesc,
				Filter:    &domain.ContentFilter{PersonID: tc.personID, PersonRole: tc.role},
			})
			require.NoError(t, err)
			assertAllExpectationsMet(t, mock)
		})
	}

	t.Run("nil personId adds no condition even with a role", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "content" ORDER BY`).WillReturnRows(contentRows())
		_, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
			SortBy:    domain.ContentSortByCreatedAt,
			SortOrder: domain.SortOrderDesc,
			Filter:    &domain.ContentFilter{PersonRole: role(domain.PersonRoleCast)},
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})
}

func TestList_MovieColumnFilters(t *testing.T) {
	ctx := context.Background()
	f64 := func(v float64) *float64 { return &v }
	cases := []struct {
		name     string
		filter   domain.ContentFilter
		wantRe   string
		wantArgs []driver.Value
	}{
		{"genre contains", domain.ContentFilter{GenreContains: cStr("sci")},
			`WHERE \(response->'genres'\)::text ILIKE \$1 ORDER BY`, []driver.Value{"%sci%", int64(11)}},
		{"age rating any of", domain.ContentFilter{AgeRating: []string{"PG-13", "R"}},
			`WHERE response->>'certification' IN \(\$1,\$2\) ORDER BY`, []driver.Value{"PG-13", "R", int64(11)}},
		{"released after", domain.ContentFilter{ReleasedAfter: cStr("2000-01-01")},
			`WHERE response->>'releaseDate' >= \$1 ORDER BY`, []driver.Value{"2000-01-01", int64(11)}},
		{"released before", domain.ContentFilter{ReleasedBefore: cStr("2010-12-31")},
			`WHERE response->>'releaseDate' <= \$1 ORDER BY`, []driver.Value{"2010-12-31", int64(11)}},
		{"min box office", domain.ContentFilter{MinBoxOffice: f64(1e6)},
			`WHERE \(response->>'revenue'\)::FLOAT8 >= \$1 ORDER BY`, []driver.Value{1e6, int64(11)}},
		{"max box office", domain.ContentFilter{MaxBoxOffice: f64(2e9)},
			`WHERE \(response->>'revenue'\)::FLOAT8 <= \$1 ORDER BY`, []driver.Value{2e9, int64(11)}},
		{"min tmdb score", domain.ContentFilter{MinTmdbScore: f64(6.5)},
			`WHERE \(response->>'voteAverage'\)::FLOAT8 >= \$1 ORDER BY`, []driver.Value{6.5, int64(11)}},
		{"max tmdb score", domain.ContentFilter{MaxTmdbScore: f64(9)},
			`WHERE \(response->>'voteAverage'\)::FLOAT8 <= \$1 ORDER BY`, []driver.Value{9.0, int64(11)}},
		{"cast contains matches cast or director names", domain.ContentFilter{CastContains: cStr("keanu")},
			`WHERE \(EXISTS \(SELECT 1 FROM jsonb_array_elements\(CASE WHEN jsonb_typeof\(response->'cast'\) = 'array' .*p->>'name' ILIKE \$1\) ` +
				`OR EXISTS \(SELECT 1 FROM jsonb_array_elements\(CASE WHEN jsonb_typeof\(response->'directors'\) = 'array' .*p->>'name' ILIKE \$2\)\) ORDER BY`,
			[]driver.Value{"%keanu%", "%keanu%", int64(11)}},
		{"empty cast contains adds nothing", domain.ContentFilter{CastContains: cStr("")},
			`SELECT \* FROM "content" ORDER BY`, []driver.Value{int64(11)}},
		{"empty genre and ratings add nothing", domain.ContentFilter{GenreContains: cStr(""), AgeRating: []string{}},
			`SELECT \* FROM "content" ORDER BY`, []driver.Value{int64(11)}},
		{"filters AND together", domain.ContentFilter{GenreContains: cStr("x"), MinTmdbScore: f64(7)},
			`ILIKE \$1 AND \(response->>'voteAverage'\)::FLOAT8 >= \$2 ORDER BY`, []driver.Value{"%x%", 7.0, int64(11)}},
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

func TestQueryCount_FilteredMovieList_IsOnePageQuery(t *testing.T) {
	// Budget = what it costs today: the page query only. The total count rides along
	// in the same statement (scalar subquery), so includeTotalCount adds no round trip.
	for _, withTotal := range []bool{false, true} {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`FROM "content"`).WillReturnRows(contentRows())

		c := querycount.Attach(t, db)
		id := 525
		_, err := NewGormContentRepository(db).List(context.Background(), domain.ContentListParams{
			SortBy:            domain.ContentSortByBoxOffice,
			SortOrder:         domain.SortOrderDesc,
			IncludeTotalCount: withTotal,
			Filter: &domain.ContentFilter{
				PersonID: &id, Search: cStr("x"), GenreContains: cStr("drama"), AgeRating: []string{"R", "PG"},
				SearchFields: []domain.ContentSearchField{domain.ContentSearchFieldCast},
			},
		})
		require.NoError(t, err)

		// sqlmock expects exactly one round trip (a second query would error above).
		// The counter also records GORM building the total_count scalar subquery as a
		// "statement", though it is never sent on its own, so count only the executed
		// page statements (the ones carrying LIMIT).
		pages := 0
		for _, s := range c.Statements() {
			if strings.Contains(s, "LIMIT") {
				pages++
			}
		}
		assert.Equal(t, 1, pages, "withTotal=%v statements: %v", withTotal, c.Statements())
		if !withTotal {
			c.AssertExactly(t, 1)
		}
		assertAllExpectationsMet(t, mock)
	}
}
