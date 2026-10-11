package tmdb

import (
	"context"
	"net/http"
	"net/url"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const trendingBody = `{"page":3,"total_pages":9,"total_results":171,"results":[
	{"id":603,"title":"The Matrix","release_date":"1999-03-30","overview":"A hacker.","poster_path":"/m.jpg","vote_average":8.2,"vote_count":25000},
	{"id":7,"title":"Bare","release_date":"","overview":"","poster_path":null,"vote_average":0,"vote_count":0}]}`

func TestTrendingMovies_PathPerWindow(t *testing.T) {
	tests := []struct {
		window   domain.TrendingWindow
		wantPath string
	}{
		{domain.TrendingWindowDay, "/trending/movie/day"},
		{domain.TrendingWindowWeek, "/trending/movie/week"},
	}
	for _, tc := range tests {
		t.Run(string(tc.window), func(t *testing.T) {
			var gotPath, gotAuth string
			var gotParams url.Values
			c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				gotPath = r.URL.Path
				gotParams = r.URL.Query()
				gotAuth = r.Header.Get("Authorization")
				w.Header().Set("Content-Type", "application/json")
				_, _ = w.Write([]byte(trendingBody))
			})

			_, err := c.TrendingMovies(context.Background(), tc.window, 3)
			require.NoError(t, err)
			assert.Equal(t, tc.wantPath, gotPath)
			assert.Equal(t, "Bearer "+testToken, gotAuth)
			assert.Equal(t, "3", gotParams.Get("page"))
			assert.Equal(t, "en-US", gotParams.Get("language"))
		})
	}
}

func TestTrendingMovies_ParsesPage(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(trendingBody))
	})

	page, err := c.TrendingMovies(context.Background(), domain.TrendingWindowWeek, 3)
	require.NoError(t, err)
	assert.Equal(t, 3, page.Page)
	assert.Equal(t, 9, page.TotalPages)
	assert.Equal(t, 171, page.TotalResults)
	require.Len(t, page.Items, 2)

	first := page.Items[0]
	assert.Equal(t, 603, first.TMDBID)
	assert.Equal(t, "The Matrix", first.Title)
	assert.Equal(t, "A hacker.", first.Overview)
	require.NotNil(t, first.ReleaseDate)
	assert.Equal(t, "1999-03-30", *first.ReleaseDate)
	require.NotNil(t, first.PosterPath)
	assert.Equal(t, "/m.jpg", *first.PosterPath)
	require.NotNil(t, first.VoteAverage)
	assert.InDelta(t, 8.2, *first.VoteAverage, 0.001)

	bare := page.Items[1]
	assert.Equal(t, 7, bare.TMDBID)
	assert.Nil(t, bare.ReleaseDate, "empty release_date is nil")
	assert.Nil(t, bare.PosterPath, "null poster_path is nil")
	assert.Nil(t, bare.VoteAverage, "zero vote_count is nil")
}

func TestTrendingMovies_RejectsUnknownWindowWithoutRequest(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		t.Errorf("unknown window must not reach TMDB, got %s", r.URL.Path)
	})

	_, err := c.TrendingMovies(context.Background(), domain.TrendingWindow("MONTH"), 1)
	require.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestTrendingMovies_ErrorsSanitized(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusInternalServerError)
		_, _ = w.Write([]byte("upstream body " + testToken))
	})

	_, err := c.TrendingMovies(context.Background(), domain.TrendingWindowDay, 1)
	require.ErrorIs(t, err, ErrTMDBAPI)
	assert.NotContains(t, err.Error(), testToken)
	assert.NotContains(t, err.Error(), "upstream body")
}

func TestTrendingMovies_NotFoundIsErrNotFound(t *testing.T) {
	c := newTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusNotFound)
	})

	_, err := c.TrendingMovies(context.Background(), domain.TrendingWindowWeek, 1)
	require.ErrorIs(t, err, domain.ErrNotFound)
}

func TestUnconfiguredClient_TrendingNotConfigured(t *testing.T) {
	_, err := UnconfiguredClient{}.TrendingMovies(context.Background(), domain.TrendingWindowWeek, 1)
	assert.ErrorIs(t, err, ErrNotConfigured)
}

func TestFixtureClient_TrendingMovies(t *testing.T) {
	page, err := NewFixtureClient().TrendingMovies(context.Background(), domain.TrendingWindowDay, 2)
	require.NoError(t, err)
	assert.Equal(t, 2, page.Page)
	assert.Equal(t, 1, page.TotalPages)
	assert.Equal(t, 1, page.TotalResults)
	require.Len(t, page.Items, 1)
	assert.Equal(t, 603, page.Items[0].TMDBID)
}
