package tmdb

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/demo"
)

// DemoClient is the offline movie client for demo mode. Films staged in the
// demo import sheet resolve to their real title, overview, runtime and
// genres; any other id falls back to the FixtureClient's canned movie.
type DemoClient struct {
	FixtureClient
}

var _ services.MovieClient = DemoClient{}

// NewDemoClient builds the demo-mode movie client.
func NewDemoClient() DemoClient { return DemoClient{} }

// GetMovie shapes a staged film through the same ShapeMovie path as a live
// TMDB response, so stored content looks the same.
func (c DemoClient) GetMovie(ctx context.Context, tmdbID int) (*services.MovieMetadata, error) {
	film, ok := demo.ImportFilmByID(strconv.Itoa(tmdbID))
	if !ok {
		return c.FixtureClient.GetMovie(ctx, tmdbID)
	}
	raw := map[string]any{"id": tmdbID, "title": film.Title, "overview": film.Description}
	if film.PublishedAt != nil && len(*film.PublishedAt) >= 10 {
		raw["release_date"] = (*film.PublishedAt)[:10]
	}
	if film.DurationSeconds != nil {
		raw["runtime"] = *film.DurationSeconds / 60
	}
	genres := make([]map[string]string, len(film.Genres))
	for i, g := range film.Genres {
		genres[i] = map[string]string{"name": g}
	}
	raw["genres"] = genres
	crew := []map[string]any{}
	for _, p := range film.People {
		if p.Role == "Director" {
			crew = append(crew, map[string]any{"name": p.Name, "job": "Director"})
		}
	}
	raw["credits"] = map[string]any{"cast": []any{}, "crew": crew}
	body, err := json.Marshal(raw)
	if err != nil {
		return nil, fmt.Errorf("encode demo movie: %w", err)
	}
	meta, err := ShapeMovie(body)
	if err != nil {
		return nil, err
	}
	meta.TMDBID = tmdbID
	return meta, nil
}
