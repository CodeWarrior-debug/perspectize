package youtube

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestFixtureClient_KnownVideo(t *testing.T) {
	c := NewFixtureClient()
	id, err := c.ExtractVideoID("https://youtu.be/aircAruvnKk")
	require.NoError(t, err)

	meta, err := c.GetVideoMetadata(context.Background(), id)
	require.NoError(t, err)
	assert.Equal(t, "3Blue1Brown", meta.ChannelName)
	assert.Equal(t, 1120, meta.Duration)

	// Stored response must decode like a live, trimmed API response.
	var resp YouTubeAPIResponse
	require.NoError(t, json.Unmarshal(meta.Response, &resp))
	require.Len(t, resp.Items, 1)
	assert.Equal(t, meta.Title, resp.Items[0].Snippet.Title)
	assert.Equal(t, "PT18M40S", resp.Items[0].ContentDetails.Duration)
	d, err := ParseISO8601Duration(resp.Items[0].ContentDetails.Duration)
	require.NoError(t, err)
	assert.Equal(t, meta.Duration, d)
}

func TestFixtureClient_UnknownVideoGetsPlaceholder(t *testing.T) {
	meta, err := NewFixtureClient().GetVideoMetadata(context.Background(), "abcdefghijk")
	require.NoError(t, err)
	assert.Contains(t, meta.Title, "abcdefghijk")
	assert.Equal(t, 300, meta.Duration)
}
