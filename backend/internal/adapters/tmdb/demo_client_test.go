package tmdb

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/demo"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestDemoMovieURLMatchesCanonical(t *testing.T) {
	assert.Equal(t, CanonicalMovieURL(27205), demo.MovieURL("27205"))
}

func TestDemoClient_GetMovie(t *testing.T) {
	c := NewDemoClient()
	meta, err := c.GetMovie(context.Background(), 27205)
	require.NoError(t, err)
	assert.Equal(t, 27205, meta.TMDBID)
	assert.Equal(t, "Inception", meta.Title)
	require.NotNil(t, meta.RuntimeSeconds)
	assert.Equal(t, 148*60, *meta.RuntimeSeconds)
	var shaped map[string]any
	require.NoError(t, json.Unmarshal(meta.Response, &shaped))

	other, err := c.GetMovie(context.Background(), 603)
	require.NoError(t, err)
	assert.Equal(t, 603, other.TMDBID, "unknown ids fall back to the canned fixture")
}
