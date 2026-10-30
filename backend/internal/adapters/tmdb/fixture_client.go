package tmdb

import (
	"context"
	_ "embed"
	"encoding/json"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

//go:embed testdata/movie_603.json
var fixtureMovie603 []byte

// FixtureClient is an offline services.MovieClient for round-trip tests and demos.
// Every TMDB id resolves to the same canned movie (the committed movie_603 fixture
// run through ShapeMovie), with the requested id echoed back; no network or token.
type FixtureClient struct{}

var (
	_ services.MovieClient         = FixtureClient{}
	_ services.MovieSearchClient   = FixtureClient{}
	_ services.MovieTrendingClient = FixtureClient{}
)

// NewFixtureClient builds the offline movie client.
func NewFixtureClient() FixtureClient { return FixtureClient{} }

// GetMovie returns the shaped fixture metadata for any id.
func (FixtureClient) GetMovie(_ context.Context, tmdbID int) (*services.MovieMetadata, error) {
	meta, err := ShapeMovie(fixtureMovie603)
	if err != nil {
		return nil, fmt.Errorf("shape fixture movie: %w", err)
	}
	meta.TMDBID = tmdbID
	return meta, nil
}

// FindMovieByIMDbID resolves every IMDb id to the fixture movie (603).
func (FixtureClient) FindMovieByIMDbID(context.Context, string) (int, error) {
	return 603, nil
}

// SearchMovies returns one page holding the fixture movie (603) for any query,
// so Discover's Movies source works offline.
func (FixtureClient) SearchMovies(_ context.Context, _ string, page int) (*services.MovieSearchPage, error) {
	var m tmdbSearchMovie
	if err := json.Unmarshal(fixtureMovie603, &m); err != nil {
		return nil, fmt.Errorf("parse fixture movie: %w", err)
	}
	return &services.MovieSearchPage{
		Items:        []services.MovieSearchResult{m.toSearchResult()},
		Page:         page,
		TotalPages:   1,
		TotalResults: 1,
	}, nil
}

// TrendingMovies returns one page holding the fixture movie (603) for any
// window, so Discover's trending list works offline.
func (FixtureClient) TrendingMovies(_ context.Context, _ domain.TrendingWindow, page int) (*services.MovieSearchPage, error) {
	var m tmdbSearchMovie
	if err := json.Unmarshal(fixtureMovie603, &m); err != nil {
		return nil, fmt.Errorf("parse fixture movie: %w", err)
	}
	return &services.MovieSearchPage{
		Items:        []services.MovieSearchResult{m.toSearchResult()},
		Page:         page,
		TotalPages:   1,
		TotalResults: 1,
	}, nil
}
