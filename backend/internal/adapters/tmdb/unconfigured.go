package tmdb

import (
	"context"
	"errors"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// ErrNotConfigured is returned by UnconfiguredClient when no TMDB token is set.
var ErrNotConfigured = errors.New("movie lookup is not configured")

// UnconfiguredClient satisfies services.MovieClient when TMDB_API_READ_ACCESS_TOKEN
// is blank, so the server still starts and movie lookups fail with a clear error.
type UnconfiguredClient struct{}

// GetMovie always fails with ErrNotConfigured.
func (UnconfiguredClient) GetMovie(context.Context, int) (*services.MovieMetadata, error) {
	return nil, ErrNotConfigured
}

// FindMovieByIMDbID always fails with ErrNotConfigured.
func (UnconfiguredClient) FindMovieByIMDbID(context.Context, string) (int, error) {
	return 0, ErrNotConfigured
}
