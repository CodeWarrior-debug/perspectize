package repositories

import (
	"context"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func TestContentListParentContentID_FiltersOnTheParentColumn(t *testing.T) {
	db, mock, _ := newCapturingContentDB(t)
	// Bound parameters: the parent id, the privacy a signed-out viewer may read, then the limit.
	mock.ExpectQuery("FROM").
		WithArgs(int64(9), "public", int64(11)).
		WillReturnRows(sqlmock.NewRows([]string{"id"}))

	parent := 9
	_, err := postgres.NewGormContentRepository(db).List(context.Background(), pageOf(10, &domain.ContentFilter{ParentContentID: &parent}))
	require.NoError(t, err)
	require.NoError(t, mock.ExpectationsWereMet())
}

func TestContentListParentContentID_SQLUsesTheColumnNotTheJSON(t *testing.T) {
	parent := 9
	sql := listSQL(t, pageOf(10, &domain.ContentFilter{ParentContentID: &parent}))
	assert.Contains(t, sql, "parent_content_id = $1")
}

func TestContentListParentContentID_OmittedAddsNoCondition(t *testing.T) {
	sql := listSQL(t, pageOf(10, &domain.ContentFilter{}))
	assert.NotContains(t, sql, "parent_content_id")
}

// The parent filter adds no statement over a plain list.
func TestContentListParentContentID_AddsNoStatementOverPlainList(t *testing.T) {
	parent := 9
	plain := statementsForList(t, pageOf(10, nil))
	filtered := statementsForList(t, pageOf(10, &domain.ContentFilter{ParentContentID: &parent}))
	assert.Equal(t, plain, filtered)
	assert.Equal(t, 1, filtered)
}
