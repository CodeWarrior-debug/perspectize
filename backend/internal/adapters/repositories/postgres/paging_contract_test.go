package postgres

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// pagingContractList is one list driven through the shared paging contract.
// Each list supplies its own SQL and row shape. The contract (the limit, the
// direction, the flags at both ends, the errors) is the same for all of them.
type pagingContractList struct {
	name    string
	fromSQL string // regex for the list's page query
	newRows func() *sqlmock.Rows
	addRow  func(rows *sqlmock.Rows, id int) *sqlmock.Rows
	// list runs one call with createdAt DESC order and returns the ids in list order.
	list func(db *gorm.DB, first, last *int, after, before *string) (pagingOutcome, error)
}

// pagingOutcome is what a list call reports, normalised across the three lists.
type pagingOutcome struct {
	IDs         []int
	HasNext     bool
	HasPrev     bool
	StartCursor *string
	EndCursor   *string
}

func contractStr(s string) *string { return &s }
func contractInt(i int) *int       { return &i }

func pagingContractLists() []pagingContractList {
	ctx := context.Background()
	return []pagingContractList{
		{
			name:    "content",
			fromSQL: `FROM "content"`,
			newRows: contentRows,
			addRow: func(rows *sqlmock.Rows, id int) *sqlmock.Rows {
				return rows.AddRow(id, "A", "https://a", "youtube_video", 4, nil, nil, nil, nil, contentRepoTime, contentRepoTime)
			},
			list: func(db *gorm.DB, first, last *int, after, before *string) (pagingOutcome, error) {
				got, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
					First: first, Last: last, After: after, Before: before,
					SortBy: domain.ContentSortByCreatedAt, SortOrder: domain.SortOrderDesc,
				})
				if err != nil {
					return pagingOutcome{}, err
				}
				ids := make([]int, len(got.Items))
				for i, it := range got.Items {
					ids[i] = it.ID
				}
				return pagingOutcome{IDs: ids, HasNext: got.HasNext, HasPrev: got.HasPrev, StartCursor: got.StartCursor, EndCursor: got.EndCursor}, nil
			},
		},
		{
			name:    "perspective",
			fromSQL: `FROM "perspectives"`,
			newRows: perspectiveRows,
			addRow:  fullPerspectiveRow,
			list: func(db *gorm.DB, first, last *int, after, before *string) (pagingOutcome, error) {
				got, err := NewGormPerspectiveRepository(db).List(ctx, domain.PerspectiveListParams{
					First: first, Last: last, After: after, Before: before,
					SortBy: domain.PerspectiveSortByCreatedAt, SortOrder: domain.SortOrderDesc,
				})
				if err != nil {
					return pagingOutcome{}, err
				}
				ids := make([]int, len(got.Items))
				for i, it := range got.Items {
					ids[i] = it.ID
				}
				return pagingOutcome{IDs: ids, HasNext: got.HasNext, HasPrev: got.HasPrev, StartCursor: got.StartCursor, EndCursor: got.EndCursor}, nil
			},
		},
		{
			name:    "user todo",
			fromSQL: `FROM "user_todos"`,
			newRows: func() *sqlmock.Rows {
				return sqlmock.NewRows([]string{"id", "user_id", "action_id", "status", "percent_complete", "created_at", "updated_at"})
			},
			addRow: func(rows *sqlmock.Rows, id int) *sqlmock.Rows {
				return rows.AddRow(id, 1, 1, "not_started", 0, contentRepoTime, contentRepoTime)
			},
			list: func(db *gorm.DB, first, last *int, after, before *string) (pagingOutcome, error) {
				got, err := NewGormUserTodoRepository(db).List(ctx, domain.UserTodoListParams{
					First: first, Last: last, After: after, Before: before,
					SortBy: domain.UserTodoSortByCreatedAt, SortOrder: domain.SortOrderDesc,
				})
				if err != nil {
					return pagingOutcome{}, err
				}
				ids := make([]int, len(got.Items))
				for i, it := range got.Items {
					ids[i] = it.ID
				}
				return pagingOutcome{IDs: ids, HasNext: got.HasNext, HasPrev: got.HasPrev, StartCursor: got.StartCursor, EndCursor: got.EndCursor}, nil
			},
		},
	}
}

// expectPage queues one page query whose result set holds ids, in the order the
// database returns them (the reverse of list order for a backward page).
func (l pagingContractList) expectPage(mock sqlmock.Sqlmock, ids ...int) {
	rows := l.newRows()
	for _, id := range ids {
		rows = l.addRow(rows, id)
	}
	mock.ExpectQuery(l.fromSQL).WillReturnRows(rows)
}

// realCursors pages forward through the list on db and returns the cursors the
// paginator itself issued: the EndCursor of a first page (the position after
// rows 1 and 2) and the StartCursor of the next page (the position at row 3).
// The backward tests start from these, so every cursor they send is a real one.
func (l pagingContractList) realCursors(t *testing.T, db *gorm.DB, mock sqlmock.Sqlmock) (after, before string) {
	t.Helper()
	l.expectPage(mock, 1, 2, 3)
	first, err := l.list(db, contractInt(2), nil, nil, nil)
	require.NoError(t, err)
	require.NotNil(t, first.EndCursor)

	l.expectPage(mock, 3, 4)
	second, err := l.list(db, contractInt(2), nil, first.EndCursor, nil)
	require.NoError(t, err)
	require.NotNil(t, second.StartCursor)
	return *first.EndCursor, *second.StartCursor
}

func TestPagingContract(t *testing.T) {
	for _, l := range pagingContractLists() {
		t.Run(l.name, func(t *testing.T) {
			t.Run("first page reads limit+1 rows, trims them, and reports next only", func(t *testing.T) {
				db, mock := newMockDB(t)
				l.expectPage(mock, 1, 2, 3)

				c := querycount.Attach(t, db)
				got, err := l.list(db, contractInt(2), nil, nil, nil)
				require.NoError(t, err)
				c.AssertExactly(t, 1)
				assert.Equal(t, []int{1, 2}, got.IDs)
				assert.True(t, got.HasNext)
				assert.False(t, got.HasPrev)
				assert.Nil(t, got.StartCursor)
				assert.NotNil(t, got.EndCursor)
				assertAllExpectationsMet(t, mock)
			})

			t.Run("forward page after a cursor reports previous and no next", func(t *testing.T) {
				db, mock := newMockDB(t)
				after, _ := l.realCursors(t, db, mock)

				// Two rows for a page of two: nothing follows.
				l.expectPage(mock, 5, 6)
				c := querycount.Attach(t, db)
				got, err := l.list(db, contractInt(2), nil, contractStr(after), nil)
				require.NoError(t, err)
				c.AssertExactly(t, 1)
				assert.Equal(t, []int{5, 6}, got.IDs)
				assert.False(t, got.HasNext)
				assert.True(t, got.HasPrev)
				assert.NotNil(t, got.StartCursor)
				assertAllExpectationsMet(t, mock)
			})

			t.Run("backward page before a cursor reverses rows and reports both ends", func(t *testing.T) {
				db, mock := newMockDB(t)
				_, before := l.realCursors(t, db, mock)

				// The database returns limit+1 rows in reverse list order. Three
				// rows for a page of two means one more row sits before this page.
				l.expectPage(mock, 12, 11, 10)
				c := querycount.Attach(t, db)
				got, err := l.list(db, contractInt(2), contractInt(2), nil, contractStr(before))
				require.NoError(t, err)
				c.AssertExactly(t, 1)
				assert.Equal(t, []int{11, 12}, got.IDs, "rows come back in list order")
				assert.True(t, got.HasPrev)
				assert.True(t, got.HasNext)
				assertAllExpectationsMet(t, mock)
			})

			t.Run("backward page reaching the start reports no previous", func(t *testing.T) {
				db, mock := newMockDB(t)
				_, before := l.realCursors(t, db, mock)

				// Two rows for a page of two: the start of the list is in view.
				l.expectPage(mock, 2, 1)

				got, err := l.list(db, nil, contractInt(2), nil, contractStr(before))
				require.NoError(t, err)
				assert.Equal(t, []int{1, 2}, got.IDs)
				assert.False(t, got.HasPrev)
				assert.True(t, got.HasNext)
				assertAllExpectationsMet(t, mock)
			})

			t.Run("empty page after a cursor reports previous, not next", func(t *testing.T) {
				db, mock := newMockDB(t)
				after, _ := l.realCursors(t, db, mock)

				l.expectPage(mock)
				got, err := l.list(db, contractInt(2), nil, contractStr(after), nil)
				require.NoError(t, err)
				assert.Empty(t, got.IDs)
				assert.True(t, got.HasPrev)
				assert.False(t, got.HasNext)
				assert.Nil(t, got.StartCursor)
				assert.Nil(t, got.EndCursor)
				assertAllExpectationsMet(t, mock)
			})

			t.Run("empty page before a cursor reports next, not previous", func(t *testing.T) {
				db, mock := newMockDB(t)
				_, before := l.realCursors(t, db, mock)

				l.expectPage(mock)
				got, err := l.list(db, nil, contractInt(2), nil, contractStr(before))
				require.NoError(t, err)
				assert.Empty(t, got.IDs)
				assert.True(t, got.HasNext)
				assert.False(t, got.HasPrev)
				assertAllExpectationsMet(t, mock)
			})

			// Refused requests never reach the database.
			refused := []struct {
				name          string
				first, last   *int
				after, before *string
			}{
				{name: "first above the cap", first: contractInt(101)},
				{name: "first below the floor", first: contractInt(0)},
				{name: "last above the cap", last: contractInt(101), before: contractStr("Y3Vyc29y")},
				{name: "last below the floor", last: contractInt(0), before: contractStr("Y3Vyc29y")},
				{name: "last without before", last: contractInt(5)},
				{name: "after and before together", after: contractStr("Y3Vyc29y"), before: contractStr("Y3Vyc29y")},
				{name: "cursor that does not decode", after: contractStr("!!!")},
				{name: "backward cursor that does not decode", last: contractInt(2), before: contractStr("!!!")},
			}
			for _, tt := range refused {
				t.Run("refuses "+tt.name+" as INVALID_INPUT without a query", func(t *testing.T) {
					db, mock := newMockDB(t)

					c := querycount.Attach(t, db)
					_, err := l.list(db, tt.first, tt.last, tt.after, tt.before)
					require.Error(t, err)
					assert.ErrorIs(t, err, domain.ErrInvalidInput)
					c.AssertExactly(t, 0)
					assertAllExpectationsMet(t, mock)
				})
			}
		})
	}
}
