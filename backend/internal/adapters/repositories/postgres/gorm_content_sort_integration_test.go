package postgres

// Runs the LIKE_COUNT sort expression against a real Postgres, so a cast that
// Postgres rejects shows up as a failing query here rather than only in the
// masked "failed to list content" error. Needs no schema: the expression is
// evaluated over inline JSON. Same local-testdb guard as the other integration tests.
//
//	DATABASE_URL="postgres://postgres:postgres@localhost:5432/testdb?sslmode=disable" \
//	  go test -p 1 ./internal/adapters/repositories/postgres/ -run ContentSortIntegration -v

import (
	"database/sql"
	"fmt"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestContentSortIntegration_LikeCountExpressionIsCastSafe(t *testing.T) {
	db := openLocalUserTodoTestDB(t)

	expr := contentSortRule(domain.ContentSortByLikeCount, domain.SortOrderAsc).SQLRepr

	// Each row is a stored response. "" is how a hidden like count can appear; the
	// bare ::BIGINT cast rejects it and fails the whole query.
	query := fmt.Sprintf(`SELECT (%s) AS like_count
		FROM (VALUES
			('{"items":[{"statistics":{"likeCount":"5"}}]}'::jsonb),
			('{"items":[{"statistics":{"likeCount":""}}]}'::jsonb),
			('{"items":[{"statistics":{}}]}'::jsonb)
		) AS content(response)
		ORDER BY 1 NULLS FIRST`, expr)

	var got []sql.NullInt64
	require.NoError(t, db.Raw(query).Scan(&got).Error)
	require.Len(t, got, 3)

	var values []int64
	nulls := 0
	for _, v := range got {
		if v.Valid {
			values = append(values, v.Int64)
		} else {
			nulls++
		}
	}
	assert.Equal(t, []int64{5}, values, "a numeric likeCount is returned as its value")
	assert.Equal(t, 2, nulls, "an empty or missing likeCount is NULL, which the sort replaces with 0")
}

// Stored responses whose counts are empty, non-numeric or missing, next to ones that
// parse. Every expression below must run over all of them without a cast error.
const mixedStatsRows = `(VALUES
	(1, '{"items":[{"statistics":{"viewCount":"200","likeCount":"50"}}]}'::jsonb),
	(2, '{"items":[{"statistics":{"viewCount":"","likeCount":"7"}}]}'::jsonb),
	(3, '{"items":[{"statistics":{"viewCount":"100","likeCount":""}}]}'::jsonb),
	(4, '{"items":[{"statistics":{"viewCount":"n/a","likeCount":"3"}}]}'::jsonb),
	(5, '{"items":[{"statistics":{"viewCount":"0","likeCount":"3"}}]}'::jsonb),
	(6, '{"items":[{"statistics":{}}]}'::jsonb)
) AS content(id, response)`

func TestContentSortIntegration_ViewCountAndPercentLikedAreCastSafe(t *testing.T) {
	db := openLocalUserTodoTestDB(t)

	viewExpr := contentSortRule(domain.ContentSortByViewCount, domain.SortOrderAsc).SQLRepr
	var views []sql.NullInt64
	require.NoError(t, db.Raw(fmt.Sprintf(
		"SELECT (%s) FROM %s ORDER BY id", viewExpr, mixedStatsRows)).Scan(&views).Error)
	require.Len(t, views, 6)
	assert.Equal(t, []sql.NullInt64{
		{Int64: 200, Valid: true}, {}, {Int64: 100, Valid: true}, {}, {Int64: 0, Valid: true}, {},
	}, views, "empty and non-numeric view counts are NULL, numeric ones keep their value")

	percentExpr := contentSortRule(domain.ContentSortByPercentLiked, domain.SortOrderAsc).SQLRepr
	var percents []sql.NullFloat64
	require.NoError(t, db.Raw(fmt.Sprintf(
		"SELECT (%s) FROM %s ORDER BY id", percentExpr, mixedStatsRows)).Scan(&percents).Error)
	require.Len(t, percents, 6)
	assert.Equal(t, sql.NullFloat64{Float64: 0.25, Valid: true}, percents[0], "50 likes over 200 views")
	for i := 1; i < 6; i++ {
		assert.False(t, percents[i].Valid, "row %d has an empty, non-numeric, zero or missing count, so no rate", i+1)
	}
}

func TestContentSortIntegration_CountFilterIsCastSafe(t *testing.T) {
	db := openLocalUserTodoTestDB(t)

	// The same predicate shape the list filters build: min, max and both together.
	var ids []int
	require.NoError(t, db.Raw(fmt.Sprintf(
		"SELECT id FROM %s WHERE %s >= ? AND %s <= ? ORDER BY id",
		mixedStatsRows, statCountExpr("likeCount"), statCountExpr("likeCount")), 3, 50).Scan(&ids).Error)
	assert.Equal(t, []int{1, 2, 4, 5}, ids, "rows with an empty or missing likeCount match neither bound")

	require.NoError(t, db.Raw(fmt.Sprintf(
		"SELECT id FROM %s WHERE %s >= ? ORDER BY id",
		mixedStatsRows, statCountExpr("viewCount")), 100).Scan(&ids).Error)
	assert.Equal(t, []int{1, 3}, ids, "rows with an empty or non-numeric viewCount are excluded")
}
