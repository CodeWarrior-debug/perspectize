package assistant

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// errReadFailed is the only error text a data tool returns for a backend
// failure; details stay in the logs.
var errReadFailed = errors.New("couldn't read perspectives right now; try again shortly")

// ratingScale converts stored ratings (0–10000) to the 0–10 scale users see.
const ratingScale = 1000.0

// PerspectiveData implements jeeves.PerspectizeData over the backend's
// services, in-process. PerspectiveService enforces visibility; this adapter
// checks every row again before it reaches the model (defence in depth), so
// a future service change can't leak a private perspective into a prompt.
type PerspectiveData struct {
	perspectives portservices.PerspectiveService
	content      portservices.ContentService
}

var _ jeeves.PerspectizeData = (*PerspectiveData)(nil)

// NewPerspectiveData builds the data source. content may be nil (no titles).
func NewPerspectiveData(p portservices.PerspectiveService, c portservices.ContentService) *PerspectiveData {
	return &PerspectiveData{perspectives: p, content: c}
}

// ListPerspectives implements jeeves.PerspectizeData.
func (d *PerspectiveData) ListPerspectives(ctx context.Context, viewer jeeves.Viewer, q jeeves.PerspectiveQuery) ([]jeeves.Perspective, error) {
	limit := q.Limit
	if limit <= 0 || limit > jeeves.MaxPerspectives {
		limit = jeeves.MaxPerspectives
	}
	params := domain.PerspectiveListParams{
		First:     &limit,
		SortBy:    domain.PerspectiveSortByCreatedAt,
		SortOrder: domain.SortOrderDesc,
		Filter:    &domain.PerspectiveFilter{},
	}
	if !viewer.Anonymous() {
		id := viewer.UserID
		params.ViewerID = &id
	}
	switch {
	case q.Mine:
		if viewer.Anonymous() {
			return nil, nil
		}
		id := viewer.UserID
		params.Filter.UserID = &id
	case q.ContentID > 0:
		id := q.ContentID
		params.Filter.ContentID = &id
	default:
		return nil, fmt.Errorf("assistant data: a content id or Mine is required")
	}

	res, err := d.perspectives.ListPerspectives(ctx, params)
	if err != nil {
		// The tool result reaches the model (and, via WebMCP, the browser's
		// agent), so log the real error and return a plain one.
		slog.ErrorContext(ctx, "assistant data: list perspectives", "viewer_id", viewer.UserID, "error", err)
		return nil, errReadFailed
	}

	titles := map[int]string{}
	out := make([]jeeves.Perspective, 0, len(res.Items))
	for _, p := range res.Items {
		mine := !viewer.Anonymous() && p.UserID == viewer.UserID
		if p.Privacy == domain.PrivacyPrivate && !mine {
			slog.WarnContext(ctx, "assistant data: dropped a private perspective the service returned",
				"perspective_id", p.ID, "viewer_id", viewer.UserID)
			continue
		}
		jp := jeeves.Perspective{
			ID:         p.ID,
			OwnerID:    p.UserID,
			Mine:       mine,
			Private:    p.Privacy == domain.PrivacyPrivate,
			Quality:    displayRating(p.Quality),
			Agreement:  displayRating(p.Agreement),
			Importance: displayRating(p.Importance),
			Confidence: displayRating(p.Confidence),
			Like:       deref(p.Like),
			Review:     deref(p.Review),
			Labels:     p.Labels,
			CreatedAt:  p.CreatedAt,
		}
		if p.ContentID != nil {
			jp.ContentID = *p.ContentID
			jp.ContentTitle = d.title(ctx, titles, *p.ContentID)
		}
		out = append(out, jp)
	}
	return out, nil
}

// title looks up a content title once per call. A failed lookup leaves the
// title empty rather than failing the whole answer.
func (d *PerspectiveData) title(ctx context.Context, cache map[int]string, id int) string {
	if t, ok := cache[id]; ok || d.content == nil {
		return t
	}
	t := ""
	if c, err := d.content.GetByID(ctx, id); err == nil && c != nil {
		t = c.Name
		if c.DisplayTitle != nil && *c.DisplayTitle != "" {
			t = *c.DisplayTitle
		}
	}
	cache[id] = t
	return t
}

func displayRating(v *int) *float64 {
	if v == nil {
		return nil
	}
	f := float64(*v) / ratingScale
	return &f
}

func deref(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}
