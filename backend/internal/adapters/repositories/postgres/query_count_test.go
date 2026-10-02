package postgres

// Query-count guards: these fail when a batched lookup degrades into one query
// per row (the N+1 shape fixed by the dataloader work) or when a path starts
// issuing statements it did not before. See backend/CLAUDE.md → "Query budget".

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

func seqIDs(n int) []int {
	ids := make([]int, n)
	for i := range ids {
		ids[i] = i + 1
	}
	return ids
}

func TestQueryCount_CounterDetectsNPlusOne(t *testing.T) {
	// Meta-test: proves the helper actually fails on the bad shape, so a green
	// budget test below means something. A per-row loop must count N statements.
	db, mock := newMockDB(t)
	const n = 5
	for i := 0; i < n; i++ {
		mock.ExpectQuery(`SELECT \* FROM "categories"`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "wikidata_qid", "label"}).AddRow(i+1, "Q1", "x"))
	}

	c := querycount.Attach(t, db)
	for i := 0; i < n; i++ {
		var m CategoryModel
		require.NoError(t, db.Where("id = ?", i+1).First(&m).Error)
	}

	c.AssertExactly(t, n)
	assertAllExpectationsMet(t, mock)
}

func TestQueryCount_CategoryGetByIDs_IsOneQueryForAnyBatchSize(t *testing.T) {
	ctx := context.Background()
	db, mock := newMockDB(t)
	mock.ExpectQuery(`SELECT \* FROM "categories" WHERE id = ANY\(CAST\(\$1 AS bigint\[\]\)\)`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "wikidata_qid", "label"}).AddRow(1, "Q1", "x"))

	c := querycount.Attach(t, db)
	_, err := NewGormCategoryRepository(db).GetByIDs(ctx, seqIDs(50))
	require.NoError(t, err)

	c.AssertExactly(t, 1)
	assertAllExpectationsMet(t, mock)
}

func TestQueryCount_CategoryGetByIDs_EmptyInputIssuesNoQuery(t *testing.T) {
	db, mock := newMockDB(t)

	c := querycount.Attach(t, db)
	got, err := NewGormCategoryRepository(db).GetByIDs(context.Background(), nil)
	require.NoError(t, err)

	assert.Empty(t, got)
	c.AssertExactly(t, 0)
	assertAllExpectationsMet(t, mock)
}

func TestQueryCount_PerspectiveAggregateByContentIDs_IsOneQueryForAnyBatchSize(t *testing.T) {
	ctx := context.Background()
	db, mock := newMockDB(t)
	mock.ExpectQuery(`FROM "perspectives" WHERE content_id = ANY\(CAST\(\$1 AS bigint\[\]\)\)`).
		WillReturnRows(sqlmock.NewRows([]string{"content_id", "count", "quality_count", "avg_quality"}).
			AddRow(1, 2, 2, 5000.0))

	querycount.AssertAtMost(t, db, 1, func() {
		_, err := NewGormPerspectiveRepository(db).AggregateByContentIDs(ctx, seqIDs(50))
		require.NoError(t, err)
	})
	assertAllExpectationsMet(t, mock)
}
