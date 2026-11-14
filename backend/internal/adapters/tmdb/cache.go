package tmdb

import (
	"context"
	"log/slog"
	"strconv"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// DefaultTrendingTTL is how long a page of TMDB trending movies is cached.
const DefaultTrendingTTL = time.Hour

// trendingCacheEntry holds one cached page of trending movies and when it expires.
type trendingCacheEntry struct {
	page      *services.MovieSearchPage
	expiresAt time.Time
}

// TrendingCache wraps a MovieTrendingClient with an in-memory, TTL-based cache,
// keyed by window and page, so every Discover visitor shares one TMDB call per
// page per TTL. Only trending is cached: TMDB title search is deliberately
// uncached, so the cache never wraps SearchMovies.
//
// The cache is per-process only (reset on restart, not shared across replicas).
// Errors are never cached. The key space is bounded: two windows times at most
// 500 pages.
type TrendingCache struct {
	inner services.MovieTrendingClient
	ttl   time.Duration

	mu      sync.Mutex
	entries map[string]trendingCacheEntry
}

// NewTrendingCache wraps inner with a TTL cache. A ttl of zero or less disables
// caching: every call passes straight through to inner.
func NewTrendingCache(inner services.MovieTrendingClient, ttl time.Duration) *TrendingCache {
	return &TrendingCache{
		inner:   inner,
		ttl:     ttl,
		entries: make(map[string]trendingCacheEntry),
	}
}

// TrendingMovies returns a cached page if present and not expired; otherwise it
// fetches from the wrapped client and caches the result. Every outcome is logged
// under "tmdb trending cache" with a stable "event" field (cache_disabled,
// cache_hit, cache_miss, cache_store).
func (c *TrendingCache) TrendingMovies(ctx context.Context, window domain.TrendingWindow, page int) (*services.MovieSearchPage, error) {
	if c.ttl <= 0 {
		slog.Info("tmdb trending cache", "event", "cache_disabled", "window", string(window), "page", page)
		return c.inner.TrendingMovies(ctx, window, page)
	}

	key := string(window) + "|" + strconv.Itoa(page)

	c.mu.Lock()
	entry, hit := c.entries[key]
	c.mu.Unlock()

	if hit && time.Now().Before(entry.expiresAt) {
		slog.Info("tmdb trending cache", "event", "cache_hit", "window", string(window), "page", page, "expiresIn", time.Until(entry.expiresAt).String())
		return entry.page, nil
	}

	slog.Info("tmdb trending cache", "event", "cache_miss", "window", string(window), "page", page)

	result, err := c.inner.TrendingMovies(ctx, window, page)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.entries[key] = trendingCacheEntry{page: result, expiresAt: time.Now().Add(c.ttl)}
	size := len(c.entries)
	c.mu.Unlock()

	slog.Info("tmdb trending cache", "event", "cache_store", "window", string(window), "page", page, "ttl", c.ttl.String(), "cacheSize", size)

	return result, nil
}
