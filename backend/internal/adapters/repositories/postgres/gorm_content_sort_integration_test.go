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
