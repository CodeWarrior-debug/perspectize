package wikidata

import (
	"context"
	"errors"
	"io"
	"net/http"
	"strings"
	"testing"
	"testing/synctest"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// scriptedClient returns a Client whose transport replays the given status
// codes (the last one repeats) without touching the network. It aborts the
// retry loop with a non-retryable error if more than maxCalls requests are made,
// so a runaway loop fails the test instead of hanging it.
func scriptedClient(t *testing.T, statuses []int, body string, calls *int) *Client {
	t.Helper()
	const maxCalls = 10
	c := NewClient()
	c.httpClient = &http.Client{Transport: roundTripFunc(func(r *http.Request) (*http.Response, error) {
		*calls++
		if *calls > maxCalls {
			t.Errorf("runaway retry loop: %d requests", *calls)
			return nil, errors.New("runaway")
		}
		i := *calls - 1
		if i >= len(statuses) {
			i = len(statuses) - 1
		}
		return &http.Response{
			StatusCode: statuses[i],
			Body:       io.NopCloser(strings.NewReader(body)),
			Header:     http.Header{},
		}, nil
	})}
	return c
}

// Backoff is 1s before the first retry and 2s before the second. synctest
// makes the waits instantaneous while keeping the virtual clock exact.
func TestRetry_ExhaustionMakesThreeAttemptsWithLinearBackoff(t *testing.T) {
	for _, l := range lookups {
		t.Run(l.name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				var calls int
				c := scriptedClient(t, []int{http.StatusServiceUnavailable}, `{}`, &calls)

				start := time.Now()
				err := l.call(context.Background(), c)

				require.Error(t, err)
				assert.Contains(t, err.Error(), "failed after 2 retries")
				assert.Equal(t, maxRetries+1, calls)
				assert.Equal(t, 3*time.Second, time.Since(start), "1s + 2s of backoff")
			})
		})
	}
}

// A success on the final allowed attempt must be returned, not reported as exhaustion.
func TestRetry_SucceedsOnFinalAttempt(t *testing.T) {
	for _, l := range lookups {
		t.Run(l.name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				var calls int
				c := scriptedClient(t, []int{http.StatusTooManyRequests, http.StatusBadGateway, http.StatusOK}, `{}`, &calls)

				err := l.call(context.Background(), c)

				require.NoError(t, err)
				assert.Equal(t, 3, calls)
			})
		})
	}
}

// Non-retryable statuses must fail immediately with a single request and no wait.
func TestRetry_NonRetryableStatusFailsFast(t *testing.T) {
	for _, l := range lookups {
		t.Run(l.name, func(t *testing.T) {
			synctest.Test(t, func(t *testing.T) {
				var calls int
				c := scriptedClient(t, []int{http.StatusBadRequest}, `{}`, &calls)

				start := time.Now()
				err := l.call(context.Background(), c)

				var apiErr *APIError
				require.ErrorAs(t, err, &apiErr)
				assert.Equal(t, http.StatusBadRequest, apiErr.StatusCode)
				assert.Equal(t, 1, calls)
				assert.Zero(t, time.Since(start))
			})
		})
	}
}
