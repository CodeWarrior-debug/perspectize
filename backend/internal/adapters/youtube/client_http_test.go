package youtube

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const okVideoJSON = `{"items":[{"snippet":{"title":"T","description":"D","channelTitle":"C","publishedAt":"2020-01-01T00:00:00Z"},` +
	`"contentDetails":{"duration":"PT1M30S"},"statistics":{"viewCount":"1","likeCount":"2","commentCount":"3"}}]}`

func newHTTPTestClient(t *testing.T, handler http.HandlerFunc) *Client {
	t.Helper()
	server := httptest.NewServer(handler)
	t.Cleanup(server.Close)
	c := NewClient("test-key")
	c.baseURL = server.URL
	return c
}

func TestClient_GetVideoMetadata_Success(t *testing.T) {
	var gotID, gotKey string
	c := newHTTPTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		gotID = r.URL.Query().Get("id")
		gotKey = r.URL.Query().Get("key")
		_, _ = w.Write([]byte(okVideoJSON))
	})

	meta, err := c.GetVideoMetadata(context.Background(), "abc123DEF45")

	require.NoError(t, err)
	assert.Equal(t, "abc123DEF45", gotID)
	assert.Equal(t, "test-key", gotKey)
	assert.Equal(t, "T", meta.Title)
	assert.Equal(t, "D", meta.Description)
	assert.Equal(t, "C", meta.ChannelName)
	assert.Equal(t, 90, meta.Duration)
	assert.JSONEq(t, `{"items":[{"snippet":{"title":"T","description":"D","channelTitle":"C","publishedAt":"2020-01-01T00:00:00Z","tags":null},`+
		`"contentDetails":{"duration":"PT1M30S"},"statistics":{"viewCount":"1","likeCount":"2","commentCount":"3"}}]}`, string(meta.Response))
}

func TestClient_GetVideoMetadata_NonOKStatusIsYouTubeAPIError(t *testing.T) {
	tests := []struct {
		name   string
		status int
	}{
		{"forbidden (quota)", http.StatusForbidden},
		{"not found status", http.StatusNotFound},
		{"server error", http.StatusInternalServerError},
		{"created is not OK either", http.StatusCreated},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			c := newHTTPTestClient(t, func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(tt.status)
				// A body that would otherwise parse as a valid video must not be used.
				_, _ = w.Write([]byte(okVideoJSON))
			})

			meta, err := c.GetVideoMetadata(context.Background(), "abc123DEF45")

			assert.Nil(t, meta)
			require.ErrorIs(t, err, domain.ErrYouTubeAPI)
			assert.Contains(t, err.Error(), fmt.Sprintf("status %d", tt.status))
		})
	}
}

func TestClient_GetVideoMetadata_TruncatedBodyIsReadError(t *testing.T) {
	c := newHTTPTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Length", "1000")
		_, _ = w.Write([]byte(`{"items":`))
		w.(http.Flusher).Flush()
		panic(http.ErrAbortHandler) // drop the connection mid-body
	})

	meta, err := c.GetVideoMetadata(context.Background(), "abc123DEF45")

	assert.Nil(t, meta)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to read response body")
}

func TestClient_GetVideoMetadata_NoItemsIsNotFound(t *testing.T) {
	c := newHTTPTestClient(t, func(w http.ResponseWriter, r *http.Request) {
		_, _ = w.Write([]byte(`{"items":[]}`))
	})

	_, err := c.GetVideoMetadata(context.Background(), "abc123DEF45")

	require.ErrorIs(t, err, domain.ErrNotFound)
}

type stubInner struct{ calls int }

func (s *stubInner) GetVideoMetadata(ctx context.Context, videoID string) (*services.VideoMetadata, error) {
	s.calls++
	return &services.VideoMetadata{Title: videoID}, nil
}

func (s *stubInner) ExtractVideoID(url string) (string, error) { return url, nil }

// The cache_disabled log event is the documented way to verify the cache is off;
// it must fire for ttl <= 0 (including exactly 0) and never for a positive ttl.
func TestCachingClient_DisabledEventLoggedOnlyWhenTTLNotPositive(t *testing.T) {
	tests := []struct {
		name         string
		ttl          time.Duration
		wantDisabled bool
	}{
		{"zero ttl", 0, true},
		{"negative ttl", -time.Second, true},
		{"positive ttl", time.Minute, false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var buf bytes.Buffer
			prev := slog.Default()
			slog.SetDefault(slog.New(slog.NewJSONHandler(&buf, nil)))
			t.Cleanup(func() { slog.SetDefault(prev) })

			inner := &stubInner{}
			c := NewCachingClient(inner, tt.ttl)
			_, err := c.GetVideoMetadata(context.Background(), "vid")

			require.NoError(t, err)
			assert.Equal(t, 1, inner.calls)
			assert.Equal(t, tt.wantDisabled, bytes.Contains(buf.Bytes(), []byte(`"event":"cache_disabled"`)))
			assert.Equal(t, tt.wantDisabled, len(c.cache) == 0, "disabled cache must not store entries")
		})
	}
}
