package demo

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// fixtureBatchSize matches the live listers' batch size, so demo listing
// stages in the same steps.
const fixtureBatchSize = 50

// ImportLister lists the sources in imports.json, so requesting and approving
// an import works in demo mode with no API keys. It knows only the fixture's
// sources; anything else is "not found", naming the ones it does know.
type ImportLister struct {
	sourceType string // youtube_channel | tmdb_person
	now        func() time.Time
}

var _ services.ImportSourceLister = (*ImportLister)(nil)

// NewImportLister returns the demo lister for one source type.
func NewImportLister(t domain.ImportSourceType) *ImportLister {
	return &ImportLister{sourceType: strings.ToLower(string(t)), now: time.Now}
}

func (l *ImportLister) sources() ([]ImportFixtureSource, error) {
	fx, err := Imports()
	if err != nil {
		return nil, err
	}
	var out []ImportFixtureSource
	seen := map[string]bool{}
	for _, job := range fx.Imports {
		for _, src := range job.Sources {
			if src.Type == l.sourceType && !seen[src.Ref] {
				seen[src.Ref] = true
				out = append(out, src)
			}
		}
	}
	return out, nil
}

func (l *ImportLister) find(ref string) (ImportFixtureSource, error) {
	srcs, err := l.sources()
	if err != nil {
		return ImportFixtureSource{}, err
	}
	want := strings.ToLower(strings.TrimSpace(ref))
	known := make([]string, len(srcs))
	for i, src := range srcs {
		known[i] = fmt.Sprintf("%s (%s)", src.Title, src.Ref)
		for _, key := range []string{src.Ref, src.Title, src.URL, strings.TrimPrefix(src.Ref, "@")} {
			if key != "" && strings.ToLower(key) == want {
				return src, nil
			}
		}
	}
	return ImportFixtureSource{}, fmt.Errorf("%w: demo mode only has sample data for %s", domain.ErrNotFound, strings.Join(known, ", "))
}

// Resolve matches a fixture source by its ref, title or URL (case-insensitive).
func (l *ImportLister) Resolve(_ context.Context, ref string) (*services.ResolvedImportSource, error) {
	src, err := l.find(ref)
	if err != nil {
		return nil, err
	}
	return &services.ResolvedImportSource{ID: src.Ref, Title: src.Title, URL: src.URL}, nil
}

// List emits the fixture source's rows in batches, as the live listers do.
func (l *ImportLister) List(ctx context.Context, source services.ResolvedImportSource, _ *domain.ImportPersonRole, emit services.ImportBatchFunc) error {
	src, err := l.find(source.ID)
	if err != nil {
		return err
	}
	rows := src.Rows(l.now().UTC())
	for start := 0; start < len(rows); start += fixtureBatchSize {
		if err := ctx.Err(); err != nil {
			return err
		}
		if err := emit(rows[start:min(start+fixtureBatchSize, len(rows))]); err != nil {
			return err
		}
	}
	return nil
}
