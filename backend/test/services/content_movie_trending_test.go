package services_test

import (
	"context"
	"errors"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/tmdb"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recordingMovieTrendingClient records the arguments the service passes through.
type recordingMovieTrendingClient struct {
	window domain.TrendingWindow
	page   int
	calls  int
	err    error
}

func (r *recordingMovieTrendingClient) TrendingMovies(ctx context.Context, window domain.TrendingWindow, page int) (*portservices.MovieSearchPage, error) {
	r.calls++
	r.window, r.page = window, page
	if r.err != nil {
		return nil, r.err
	}
	return &portservices.MovieSearchPage{Items: []portservices.MovieSearchResult{{TMDBID: 603, Title: "The Matrix"}}, Page: page, TotalPages: 1, TotalResults: 1}, nil
}

func TestTrendingMovies_NormalisesWindowAndPage(t *testing.T) {
	tests := []struct {
		name       string
		window     domain.TrendingWindow
		page       int
		wantWindow domain.TrendingWindow
		wantPage   int
	}{
		{"empty window defaults to WEEK", "", 1, domain.TrendingWindowWeek, 1},
		{"DAY passes through", domain.TrendingWindowDay, 1, domain.TrendingWindowDay, 1},
		{"WEEK passes through", domain.TrendingWindowWeek, 2, domain.TrendingWindowWeek, 2},
		{"page 0 means page 1", domain.TrendingWindowWeek, 0, domain.TrendingWindowWeek, 1},
		{"max page is accepted", domain.TrendingWindowWeek, 500, domain.TrendingWindowWeek, 500},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			client := &recordingMovieTrendingClient{}
			svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil, services.WithMovieTrending(client))

			page, err := svc.TrendingMovies(context.Background(), tc.window, tc.page)
			require.NoError(t, err)
			require.Len(t, page.Items, 1)
			assert.Equal(t, 1, client.calls)
			assert.Equal(t, tc.wantWindow, client.window)
			assert.Equal(t, tc.wantPage, client.page)
		})
	}
}

func TestTrendingMovies_RejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name   string
		window domain.TrendingWindow
		page   int
	}{
		{"unknown window", domain.TrendingWindow("MONTH"), 1},
		{"lowercase window is not a domain value", domain.TrendingWindow("week"), 1},
		{"negative page", domain.TrendingWindowWeek, -1},
		{"page above 500", domain.TrendingWindowWeek, 501},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			client := &recordingMovieTrendingClient{}
			svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil, services.WithMovieTrending(client))

			_, err := svc.TrendingMovies(context.Background(), tc.window, tc.page)
			require.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Equal(t, 0, client.calls, "invalid input must not reach TMDB")
		})
	}
}

func TestTrendingMovies_NotConfiguredIsNotInvalidInput(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil)

	_, err := svc.TrendingMovies(context.Background(), domain.TrendingWindowWeek, 1)
	require.ErrorIs(t, err, tmdb.ErrNotConfigured)
	assert.False(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestTrendingMovies_UpstreamErrorPassesThrough(t *testing.T) {
	upstream := errors.New("upstream down")
	client := &recordingMovieTrendingClient{err: upstream}
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil, services.WithMovieTrending(client))

	_, err := svc.TrendingMovies(context.Background(), domain.TrendingWindowDay, 1)
	require.ErrorIs(t, err, upstream)
	assert.False(t, errors.Is(err, domain.ErrInvalidInput))
}
