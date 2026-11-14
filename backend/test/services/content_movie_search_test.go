package services_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/tmdb"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recordingMovieSearchClient records the arguments the service passes through.
type recordingMovieSearchClient struct {
	query string
	page  int
	calls int
	err   error
}

func (r *recordingMovieSearchClient) SearchMovies(ctx context.Context, query string, page int) (*portservices.MovieSearchPage, error) {
	r.calls++
	r.query, r.page = query, page
	if r.err != nil {
		return nil, r.err
	}
	return &portservices.MovieSearchPage{Items: []portservices.MovieSearchResult{{TMDBID: 603, Title: "The Matrix"}}, Page: page, TotalPages: 1, TotalResults: 1}, nil
}

func TestSearchMovies_NormalisesQueryAndPage(t *testing.T) {
	tests := []struct {
		name, query string
		page        int
		wantQuery   string
		wantPage    int
	}{
		{"surrounding whitespace is trimmed", "  the matrix  ", 1, "the matrix", 1},
		{"page 0 means page 1", "matrix", 0, "matrix", 1},
		{"explicit page passes through", "matrix", 3, "matrix", 3},
		{"max page is accepted", "matrix", 500, "matrix", 500},
		{"exactly 100 runes is accepted", strings.Repeat("a", 100), 1, strings.Repeat("a", 100), 1},
		{"100 multibyte runes is accepted", strings.Repeat("é", 100), 1, strings.Repeat("é", 100), 1},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			client := &recordingMovieSearchClient{}
			svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil, services.WithMovieSearch(client))

			page, err := svc.SearchMovies(context.Background(), tc.query, tc.page)
			require.NoError(t, err)
			require.Len(t, page.Items, 1)
			assert.Equal(t, 1, client.calls)
			assert.Equal(t, tc.wantQuery, client.query)
			assert.Equal(t, tc.wantPage, client.page)
		})
	}
}

func TestSearchMovies_RejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name, query string
		page        int
	}{
		{"empty query", "", 1},
		{"whitespace-only query", "   ", 1},
		{"101 runes", strings.Repeat("a", 101), 1},
		{"101 multibyte runes", strings.Repeat("é", 101), 1},
		{"negative page", "matrix", -1},
		{"page above 500", "matrix", 501},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			client := &recordingMovieSearchClient{}
			svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil, services.WithMovieSearch(client))

			_, err := svc.SearchMovies(context.Background(), tc.query, tc.page)
			require.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Equal(t, 0, client.calls, "invalid input must not reach TMDB")
		})
	}
}

func TestSearchMovies_NotConfiguredIsNotInvalidInput(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil)

	_, err := svc.SearchMovies(context.Background(), "matrix", 1)
	require.ErrorIs(t, err, tmdb.ErrNotConfigured)
	assert.False(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestSearchMovies_UpstreamErrorPassesThrough(t *testing.T) {
	upstream := errors.New("upstream down")
	client := &recordingMovieSearchClient{err: upstream}
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil, services.WithMovieSearch(client))

	_, err := svc.SearchMovies(context.Background(), "matrix", 1)
	require.ErrorIs(t, err, upstream)
	assert.False(t, errors.Is(err, domain.ErrInvalidInput))
}
