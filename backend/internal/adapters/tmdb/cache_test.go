package tmdb

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeTrendingInner counts trending calls. Each successful call returns a page
// whose TotalResults equals the call number, so tests can tell fresh from cached.
type fakeTrendingInner struct {
	calls int
	err   error
}

func (f *fakeTrendingInner) TrendingMovies(_ context.Context, _ domain.TrendingWindow, page int) (*services.MovieSearchPage, error) {
	f.calls++
	if f.err != nil {
		return nil, f.err
	}
	return &services.MovieSearchPage{Page: page, TotalPages: 1, TotalResults: f.calls}, nil
}

func TestDefaultTrendingTTL_IsOneHour(t *testing.T) {
	assert.Equal(t, time.Hour, DefaultTrendingTTL)
}

func TestTrendingCache_ServesRepeatCallFromCache(t *testing.T) {
	inner := &fakeTrendingInner{}
	cache := NewTrendingCache(inner, time.Minute)
	ctx := context.Background()

	first, err := cache.TrendingMovies(ctx, domain.TrendingWindowWeek, 1)
	require.NoError(t, err)
	again, err := cache.TrendingMovies(ctx, domain.TrendingWindowWeek, 1)
	require.NoError(t, err)

	assert.Equal(t, 1, inner.calls, "same window + page must be served from cache")
	assert.Same(t, first, again)
}

func TestTrendingCache_DistinctKeysPerWindowAndPage(t *testing.T) {
	inner := &fakeTrendingInner{}
	cache := NewTrendingCache(inner, time.Minute)
	ctx := context.Background()

	keys := []struct {
		window domain.TrendingWindow
		page   int
	}{
		{domain.TrendingWindowWeek, 1},
		{domain.TrendingWindowDay, 1},
		{domain.TrendingWindowWeek, 2},
	}
	for _, k := range keys {
		_, err := cache.TrendingMovies(ctx, k.window, k.page)
		require.NoError(t, err)
	}
	assert.Equal(t, 3, inner.calls, "a different window or page is a different cache entry")

	for _, k := range keys {
		_, err := cache.TrendingMovies(ctx, k.window, k.page)
		require.NoError(t, err)
	}
	assert.Equal(t, 3, inner.calls, "every key is now cached")
}

func TestTrendingCache_ErrorsAreNotCached(t *testing.T) {
	upstream := errors.New("tmdb down")
	inner := &fakeTrendingInner{err: upstream}
	cache := NewTrendingCache(inner, time.Minute)
	ctx := context.Background()

	_, err := cache.TrendingMovies(ctx, domain.TrendingWindowDay, 1)
	require.ErrorIs(t, err, upstream)

	inner.err = nil
	page, err := cache.TrendingMovies(ctx, domain.TrendingWindowDay, 1)
	require.NoError(t, err, "the failure must not have been cached")
	assert.Equal(t, 2, inner.calls)
	assert.Equal(t, 2, page.TotalResults)

	_, err = cache.TrendingMovies(ctx, domain.TrendingWindowDay, 1)
	require.NoError(t, err)
	assert.Equal(t, 2, inner.calls, "the successful result is cached")
}

func TestTrendingCache_RefetchesAfterExpiry(t *testing.T) {
	inner := &fakeTrendingInner{}
	cache := NewTrendingCache(inner, time.Millisecond)
	ctx := context.Background()

	_, err := cache.TrendingMovies(ctx, domain.TrendingWindowWeek, 1)
	require.NoError(t, err)
	time.Sleep(5 * time.Millisecond)

	page, err := cache.TrendingMovies(ctx, domain.TrendingWindowWeek, 1)
	require.NoError(t, err)
	assert.Equal(t, 2, inner.calls, "an expired entry is fetched again")
	assert.Equal(t, 2, page.TotalResults)
}

func TestTrendingCache_ZeroTTLPassesThrough(t *testing.T) {
	inner := &fakeTrendingInner{}
	cache := NewTrendingCache(inner, 0)
	ctx := context.Background()

	_, err := cache.TrendingMovies(ctx, domain.TrendingWindowWeek, 1)
	require.NoError(t, err)
	_, err = cache.TrendingMovies(ctx, domain.TrendingWindowWeek, 1)
	require.NoError(t, err)
	assert.Equal(t, 2, inner.calls, "a non-positive TTL disables caching")
}
