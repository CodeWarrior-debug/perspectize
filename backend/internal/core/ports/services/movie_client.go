package services

import (
	"context"
	"encoding/json"
)

// MovieMetadata contains the shaped information extracted from a TMDB movie response.
type MovieMetadata struct {
	TMDBID         int
	Title          string
	Response       json.RawMessage // shaped payload stored with the content row
	RuntimeSeconds *int            // nil when runtime is 0/unknown
}

// MovieClient defines the contract for movie metadata lookups (TMDB).
type MovieClient interface {
	// GetMovie fetches and shapes metadata for a TMDB movie id.
	// Returns domain.ErrNotFound when TMDB has no such movie.
	GetMovie(ctx context.Context, tmdbID int) (*MovieMetadata, error)

	// FindMovieByIMDbID resolves an IMDb id (tt...) to a TMDB movie id.
	// Returns domain.ErrNotFound when there is no movie match.
	FindMovieByIMDbID(ctx context.Context, imdbID string) (int, error)
}
