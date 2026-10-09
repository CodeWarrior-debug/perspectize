package youtube

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// An internal test so it can point baseURL at an httptest server (the
// external client tests are skipped for lack of that seam).

const trendingFixture = `{
  "nextPageToken": "CBkQAA",
  "items": [
    {
      "id": "vid1",
      "snippet": {
        "title": "First",
        "description": "d1",
        "channelTitle": "Chan 1",
        "publishedAt": "2026-09-26T12:00:00Z",
        "thumbnails": {
          "default": {"url": "https://i.ytimg.com/vi/vid1/default.jpg"},
          "medium": {"url": "https://i.ytimg.com/vi/vid1/mqdefault.jpg"},
          "high": {"url": "https://i.ytimg.com/vi/vid1/hqdefault.jpg"}
        }
      },
      "contentDetails": {"duration": "PT4M13S"}
    },
    {
      "id": "vid2",
      "snippet": {
        "title": "Second",
        "channelTitle": "Chan 2",
        "publishedAt": "2026-09-25T08:00:00Z",
        "thumbnails": {"default": {"url": "https://i.ytimg.com/vi/vid2/default.jpg"}}
      },
      "contentDetails": {"duration": "PT1H2M"}
    }
  ]
}`

func TestGetTrending_ParsesChartAndSendsChartParams(t *testing.T) {
	var got *http.Request
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(trendingFixture))
	}))
	defer server.Close()

	c := NewClient("test-key")
	c.baseURL = server.URL

	page, err := c.GetTrending(context.Background(), "GB", "CAoQAA")
	require.NoError(t, err)

	require.NotNil(t, got)
	assert.Equal(t, "/videos", got.URL.Path)
	q := got.URL.Query()
	assert.Equal(t, "mostPopular", q.Get("chart"))
	assert.Equal(t, "GB", q.Get("regionCode"))
	assert.Equal(t, "CAoQAA", q.Get("pageToken"))
	assert.Equal(t, "snippet,contentDetails", q.Get("part"))
	assert.Equal(t, "25", q.Get("maxResults"))
	assert.Equal(t, "test-key", q.Get("key"))

	assert.Equal(t, "CBkQAA", page.NextPageToken)
	require.Len(t, page.Items, 2)
	first := page.Items[0]
	assert.Equal(t, "vid1", first.ID)
	assert.Equal(t, "First", first.Title)
	assert.Equal(t, "Chan 1", first.ChannelTitle)
	assert.Equal(t, "d1", first.Description)
	assert.Equal(t, "PT4M13S", first.Duration)
	assert.Equal(t, "https://i.ytimg.com/vi/vid1/mqdefault.jpg", first.ThumbnailURL, "medium thumbnail is preferred")
	assert.Equal(t, "https://i.ytimg.com/vi/vid2/default.jpg", page.Items[1].ThumbnailURL, "falls back when medium is missing")
}

func TestGetTrending_OmitsEmptyPageToken(t *testing.T) {
	var hasToken bool
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, hasToken = r.URL.Query()["pageToken"]
		_, _ = w.Write([]byte(`{"items": []}`))
	}))
	defer server.Close()

	c := NewClient("k")
	c.baseURL = server.URL

	page, err := c.GetTrending(context.Background(), "US", "")
	require.NoError(t, err)
	assert.False(t, hasToken, "first page must not send an empty pageToken")
	assert.Empty(t, page.Items)
	assert.Empty(t, page.NextPageToken)
}

func TestGetTrending_NonOKStatusIsYouTubeAPIError(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_, _ = w.Write([]byte(`{"error": {"errors": [{"reason": "quotaExceeded"}]}}`))
	}))
	defer server.Close()

	c := NewClient("k")
	c.baseURL = server.URL

	_, err := c.GetTrending(context.Background(), "US", "")
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrYouTubeAPI))
	assert.NotContains(t, err.Error(), "key=", "the API key must never surface in errors")
}

func TestGetTrending_InvalidJSON(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`not json`))
	}))
	defer server.Close()

	c := NewClient("k")
	c.baseURL = server.URL

	_, err := c.GetTrending(context.Background(), "US", "")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "parse")
}
