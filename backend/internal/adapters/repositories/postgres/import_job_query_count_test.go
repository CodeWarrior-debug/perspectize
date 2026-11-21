package postgres

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

func TestQueryCount_ImportGetItemDetailsByIDs_IsOneQueryForAnyBatchSize(t *testing.T) {
	for _, n := range []int{1, 50} {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`FROM "import_job_items" WHERE job_id = \$1 AND id = ANY\(CAST\(\$2 AS bigint\[\]\)\)`).
			WillReturnRows(sqlmock.NewRows([]string{"id", "details"}).
				AddRow(1, []byte(`{"people":[{"name":"Jane","role":"AUTHOR"}]}`)).
				AddRow(2, nil))

		c := querycount.Attach(t, db)
		got, err := NewGormImportJobRepository(db).GetItemDetailsByIDs(context.Background(), 9, seqIDs(n))
		require.NoError(t, err)

		c.AssertExactly(t, 1)
		require.Len(t, got, 2)
		assert.Equal(t, "Jane", got[1].People[0].Name)
		assert.Empty(t, got[2].People, "a row with no payload has empty details")
		assertAllExpectationsMet(t, mock)
	}
}

func TestQueryCount_ImportGetItemDetailsByIDs_EmptyInputIssuesNoQuery(t *testing.T) {
	db, mock := newMockDB(t)

	c := querycount.Attach(t, db)
	got, err := NewGormImportJobRepository(db).GetItemDetailsByIDs(context.Background(), 9, nil)
	require.NoError(t, err)

	assert.Empty(t, got)
	c.AssertExactly(t, 0)
	assertAllExpectationsMet(t, mock)
}

func TestQueryCount_ImportGetJob_IsTwoQueries(t *testing.T) {
	db, mock := newMockDB(t)
	mock.ExpectQuery(`FROM "import_jobs" WHERE id = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(9))
	mock.ExpectQuery(`FROM "import_job_sources" WHERE job_id = ANY\(CAST\(\$1 AS bigint\[\]\)\)`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "job_id"}).AddRow(1, 9))

	c := querycount.Attach(t, db)
	job, err := NewGormImportJobRepository(db).GetJob(context.Background(), 9)
	require.NoError(t, err)

	c.AssertExactly(t, 2)
	assert.Len(t, job.Sources, 1)
	assertAllExpectationsMet(t, mock)
}
