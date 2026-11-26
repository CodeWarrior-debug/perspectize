package postgres

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

// VisibleIDs checks every linked id in one statement, whatever the batch size,
// and skips the database entirely for an empty batch.
func TestQueryCount_PerspectiveVisibleIDs_IsOneQueryForAnyBatchSize(t *testing.T) {
	ctx := context.Background()
	for _, n := range []int{1, 50} {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`FROM "perspectives" WHERE id = ANY\(CAST\(\$1 AS bigint\[\]\)\)`).
			WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

		querycount.AssertAtMost(t, db, 1, func() {
			_, err := NewGormPerspectiveRepository(db).VisibleIDs(ctx, seqIDs(n), 7)
			require.NoError(t, err)
		})
		assertAllExpectationsMet(t, mock)
	}
}

func TestQueryCount_PerspectiveVisibleIDs_EmptyInputIssuesNoQuery(t *testing.T) {
	db, mock := newMockDB(t)

	querycount.AssertAtMost(t, db, 0, func() {
		ids, err := NewGormPerspectiveRepository(db).VisibleIDs(context.Background(), nil, 7)
		require.NoError(t, err)
		require.Empty(t, ids)
	})
	assertAllExpectationsMet(t, mock)
}
