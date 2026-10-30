package tmdb

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFixtureClient(t *testing.T) {
	c := NewFixtureClient()

	meta, err := c.GetMovie(context.Background(), 12345)
	require.NoError(t, err)
	assert.Equal(t, 12345, meta.TMDBID)
	assert.NotEmpty(t, meta.Title)
	assert.NotEmpty(t, meta.Response)

	id, err := c.FindMovieByIMDbID(context.Background(), "tt0133093")
	require.NoError(t, err)
	assert.Equal(t, 603, id)
}

func TestFixtureClient_SearchMovies(t *testing.T) {
	page, err := NewFixtureClient().SearchMovies(context.Background(), "anything at all", 1)
	require.NoError(t, err)
	assert.Equal(t, 1, page.TotalPages)
	assert.Equal(t, 1, page.TotalResults)
	require.Len(t, page.Items, 1)
	assert.Equal(t, 603, page.Items[0].TMDBID)
	assert.NotEmpty(t, page.Items[0].Title)
}

func TestUnconfiguredClient_SearchMoviesNotConfigured(t *testing.T) {
	_, err := UnconfiguredClient{}.SearchMovies(context.Background(), "matrix", 1)
	assert.ErrorIs(t, err, ErrNotConfigured)
}
