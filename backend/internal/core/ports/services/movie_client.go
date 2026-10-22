package services

import (
	"context"
	"encoding/json"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
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

// MovieSearchResult is one movie from a TMDB title search, trimmed to what the
// Discover page renders. Optional fields are nil when TMDB has no value.
type MovieSearchResult struct {
	TMDBID int
	Title  string
	// ReleaseDate is YYYY-MM-DD; nil when TMDB has no date.
	ReleaseDate *string
	Overview    string
	// PosterPath is a TMDB image path (e.g. "/abc.jpg"); nil when there is no poster.
	PosterPath *string
	// VoteAverage is 0-10; nil when there are no votes.
	VoteAverage *float64
}

// MovieSearchPage is one page of TMDB title search results.
type MovieSearchPage struct {
	Items        []MovieSearchResult
	Page         int
	TotalPages   int
	TotalResults int
}

// MovieSearchClient searches movies by title (TMDB /search/movie). It is a
// separate port from MovieClient so existing MovieClient implementations and
// mocks are unaffected.
type MovieSearchClient interface {
	// SearchMovies returns one page of title matches. Adult titles are excluded.
	SearchMovies(ctx context.Context, query string, page int) (*MovieSearchPage, error)
}

// MovieTrendingClient fetches TMDB's trending movie lists (/trending/movie/{day|week}).
// Like MovieSearchClient it is a separate port so existing mocks are unaffected.
type MovieTrendingClient interface {
	// TrendingMovies returns one page of trending movies for the window.
	TrendingMovies(ctx context.Context, window domain.TrendingWindow, page int) (*MovieSearchPage, error)
}
