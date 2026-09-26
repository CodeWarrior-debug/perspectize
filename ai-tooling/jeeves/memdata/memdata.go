// Package memdata is an in-memory jeeves.PerspectizeData for botler and eval
// fixtures, so evals never touch the shared dev database (EVAL-01).
package memdata

import (
	"context"
	"sort"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
)

// Data holds perspectives in memory. OwnerID and Private must be set on each;
// Mine is computed per viewer and ignored on input.
type Data struct {
	perspectives []jeeves.Perspective
}

// New returns Data over a copy of ps.
func New(ps []jeeves.Perspective) *Data {
	return &Data{perspectives: append([]jeeves.Perspective(nil), ps...)}
}

// ListPerspectives implements jeeves.PerspectizeData, newest first.
func (d *Data) ListPerspectives(_ context.Context, viewer jeeves.Viewer, q jeeves.PerspectiveQuery) ([]jeeves.Perspective, error) {
	limit := q.Limit
	if limit <= 0 || limit > jeeves.MaxPerspectives {
		limit = jeeves.MaxPerspectives
	}
	var out []jeeves.Perspective
	for _, p := range d.perspectives {
		mine := !viewer.Anonymous() && p.OwnerID == viewer.UserID
		switch {
		case q.Mine && !mine:
			continue
		case !q.Mine && p.ContentID != q.ContentID:
			continue
		case p.Private && !mine:
			continue
		}
		p.Mine = mine
		out = append(out, p)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if len(out) > limit {
		out = out[:limit]
	}
	return out, nil
}
