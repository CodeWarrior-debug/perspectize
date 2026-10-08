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
