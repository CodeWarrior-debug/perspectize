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
	tests := []struct {
		name   string
		sortBy domain.ContentSortBy
		want   paginator.Rule
	}{
		{"box office", domain.ContentSortByBoxOffice, paginator.Rule{
			Key: "BoxOffice", Order: paginator.DESC,
			SQLRepr:         "(response->>'revenue')::BIGINT",
			NULLReplacement: int64(0),
		}},
		{"vs budget", domain.ContentSortByVsBudget, paginator.Rule{
			Key: "VsBudget", Order: paginator.DESC,
			SQLRepr: "CASE WHEN response->>'budget' IS NULL OR response->>'revenue' IS NULL " +
				"OR (response->>'budget')::BIGINT = 0 THEN NULL " +
				"ELSE (response->>'revenue')::FLOAT8 / NULLIF((response->>'budget')::BIGINT,0) END",
			NULLReplacement: float64(-1),
		}},
		{"age rating", domain.ContentSortByAgeRating, paginator.Rule{
			Key: "AgeRating", Order: paginator.DESC,
			SQLRepr: "CASE response->>'certification' WHEN 'G' THEN 1 WHEN 'PG' THEN 2 " +
				"WHEN 'PG-13' THEN 3 WHEN 'R' THEN 4 WHEN 'NC-17' THEN 5 ELSE NULL END",
			NULLReplacement: int64(0),
		}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rules := buildContentSortRules(tt.sortBy, domain.SortOrderDesc)
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
			`WHERE response->'cast' @> \$1::jsonb ORDER BY`,
			[]driver.Value{`[{"id":525}]`, int64(11)}},
		{"director only", cInt(525), role(domain.PersonRoleDirector),
			`WHERE response->'directors' @> \$1::jsonb ORDER BY`,
			[]driver.Value{`[{"id":525}]`, int64(11)}},
		{"any role ORs both", cInt(525), nil,
			`WHERE \(response->'cast' @> \$1::jsonb OR response->'directors' @> \$2::jsonb\) ORDER BY`,
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
				PersonID: &id, Search: cStr("x"),
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
