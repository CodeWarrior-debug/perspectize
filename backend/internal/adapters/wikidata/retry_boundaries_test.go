package wikidata

import (
	"context"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// lookup abstracts Search and GetWikipediaURL so retry behaviour is tested on both.
type lookup struct {
	name string
	call func(ctx context.Context, c *Client) error
}

var lookups = []lookup{
	{"Search", func(ctx context.Context, c *Client) error {
		_, err := c.Search(ctx, "q", "en", 5)
		return err
	}},
	{"GetWikipediaURL", func(ctx context.Context, c *Client) error {
		_, err := c.GetWikipediaURL(ctx, "Q42")
		return err
	}},
}

type roundTripFunc func(*http.Request) (*http.Response, error)

func (f roundTripFunc) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }

func newTestClient(url string) *Client {
	c := NewClient()
	c.baseURL = url
	return c
}

func TestNewClient_HasTenSecondTimeout(t *testing.T) {
	assert.Equal(t, 10*time.Second, NewClient().httpClient.Timeout)
}

// A cancelled context during the backoff before the first retry must abort
// with the bare context error and not send a second request.
func TestRetry_ContextCancelledDuringBackoffStopsRetrying(t *testing.T) {
	for _, l := range lookups {
		t.Run(l.name, func(t *testing.T) {
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()

			var hits int32
			c := NewClient()
			c.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
				if atomic.AddInt32(&hits, 1) > 5 {
					return nil, errors.New("runaway retry loop") // fail instead of hanging
				}
				cancel() // cancelled after the response arrives, before the retry backoff
				return &http.Response{
					StatusCode: http.StatusInternalServerError,
					Body:       io.NopCloser(strings.NewReader("boom")),
					Header:     http.Header{},
				}, nil
			})}

			err := l.call(ctx, c)

			assert.Equal(t, context.Canceled, err)
			assert.EqualValues(t, 1, atomic.LoadInt32(&hits))
		})
	}
}

// The first attempt must not go through the backoff select: with an already
// cancelled context the request is attempted and fails as a wrapped transport
// error rather than returning the bare context error from the backoff branch.
func TestRetry_FirstAttemptHasNoBackoff(t *testing.T) {
	for _, l := range lookups {
		t.Run(l.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.WriteHeader(http.StatusOK)
				_, _ = w.Write([]byte(`{}`))
			}))
			defer server.Close()

			// The select picks randomly between ready cases, so repeat.
			for i := 0; i < 30; i++ {
				ctx, cancel := context.WithCancel(context.Background())
				cancel()

				err := l.call(ctx, newTestClient(server.URL))

				require.Error(t, err)
				assert.NotEqual(t, context.Canceled, err, "iteration %d skipped the request", i)
				assert.ErrorIs(t, err, context.Canceled)
				assert.Contains(t, err.Error(), "executing request")
			}
		})
	}
}

// The wait before the first retry is one second, not zero: a short deadline
// must expire during the wait, so the server sees exactly one request.
func TestRetry_BackoffWaitsBeforeRetry(t *testing.T) {
	for _, l := range lookups {
		t.Run(l.name, func(t *testing.T) {
			var hits int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				atomic.AddInt32(&hits, 1)
				w.WriteHeader(http.StatusServiceUnavailable)
			}))
			defer server.Close()

			ctx, cancel := context.WithTimeout(context.Background(), 150*time.Millisecond)
			defer cancel()

			err := l.call(ctx, newTestClient(server.URL))

			assert.Equal(t, context.DeadlineExceeded, err)
			assert.EqualValues(t, 1, atomic.LoadInt32(&hits))
		})
	}
}

func TestSearch_DefaultsAndPassThroughOfLanguageAndLimit(t *testing.T) {
	tests := []struct {
		name         string
		language     string
		limit        int
		wantLanguage string
		wantLimit    string
	}{
		{"empty language defaults to en", "", 5, "en", "5"},
		{"explicit language is kept", "fr", 5, "fr", "5"},
		{"zero limit defaults to 10", "en", 0, "en", "10"},
		{"negative limit defaults to 10", "en", -3, "en", "10"},
		{"limit of one is kept", "en", 1, "en", "1"},
		{"large limit is kept", "en", 50, "en", "50"},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var gotLang, gotLimit string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				gotLang = r.URL.Query().Get("language")
				gotLimit = r.URL.Query().Get("limit")
				_, _ = w.Write([]byte(`{"search":[]}`))
			}))
			defer server.Close()

			_, err := newTestClient(server.URL).Search(context.Background(), "q", tt.language, tt.limit)

			require.NoError(t, err)
			assert.Equal(t, tt.wantLanguage, gotLang)
			assert.Equal(t, tt.wantLimit, gotLimit)
		})
	}
}
