package postgres

import (
	"errors"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	paginator "github.com/pilagod/gorm-cursor-paginator/v2/paginator"
	"gorm.io/gorm"
)

// pageCursors is the paging state a list reports back to its caller.
type pageCursors struct {
	HasNext     bool
	HasPrev     bool
	StartCursor *string
	EndCursor   *string
}

// listPage runs one page of query into dest and reports where the page sits.
// It is the one place that drives gorm-cursor-paginator. Each list supplies
// only its filtered query and its sort rules.
//
// The caller passes the window from domain.ResolvePage. rules must be built
// from the list's sort, with the tie-breaking ID rule last. A backward window
// (Before set) makes the paginator flip the ORDER BY and reverse the rows, so
// dest always comes back in the list's order.
//
// The paginator reports a failed query on the returned *gorm.DB, not as err,
// so both are checked. A cursor it cannot decode is returned as
// domain.ErrInvalidInput.
//
// Flags:
//   - HasNext is set when a row follows the page in list order.
//   - HasPrev is set when a row precedes it.
//   - An empty page has no row to read a cursor from. The side the cursor
//     came from still has rows (the cursor's own row), so that flag is set
//     and the other one is not.
func listPage(query *gorm.DB, rules []paginator.Rule, w domain.PageWindow, dest any) (pageCursors, error) {
	opts := []paginator.Option{
		paginator.WithRules(rules...),
		paginator.WithLimit(w.Limit),
		paginator.WithAllowTupleCmp(paginator.TRUE),
	}
	if w.After != nil {
		opts = append(opts, paginator.WithAfter(*w.After))
	}
	if w.Before != nil {
		opts = append(opts, paginator.WithBefore(*w.Before))
	}
	p := paginator.New(opts...)

	pageResult, cursor, err := p.Paginate(query, dest)
	if err != nil {
		if errors.Is(err, paginator.ErrInvalidCursor) {
			return pageCursors{}, fmt.Errorf("%w: cursor is not valid for this list", domain.ErrInvalidInput)
		}
		return pageCursors{}, err
	}
	if pageResult.Error != nil {
		return pageCursors{}, pageResult.Error
	}

	if pageResult.RowsAffected == 0 {
		return pageCursors{HasPrev: w.After != nil, HasNext: w.Before != nil}, nil
	}
	return pageCursors{
		HasNext:     cursor.After != nil,
		HasPrev:     cursor.Before != nil,
		StartCursor: cursor.Before,
		EndCursor:   cursor.After,
	}, nil
}
