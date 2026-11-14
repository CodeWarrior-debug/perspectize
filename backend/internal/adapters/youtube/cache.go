package youtube

import (
	"context"
	"errors"
	"log/slog"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// cacheEntry holds one cached YouTube API response and when it expires.
type cacheEntry struct {
	metadata  *services.VideoMetadata
	expiresAt time.Time
}

// trendingEntry holds one cached page of the most-popular chart.
type trendingEntry struct {
	page      *services.TrendingPage
	expiresAt time.Time
}

// ErrTrendingUnsupported is returned by GetTrending when the wrapped client
// cannot fetch the most-popular chart.
var ErrTrendingUnsupported = errors.New("youtube client does not support trending")

// CachingClient wraps a YouTubeClient with an in-memory, TTL-based cache. It
// exists to avoid burning YouTube API quota on repeat lookups:
//   - GetVideoMetadata, keyed by video ID (re-adding a video someone else
//     already added, refreshing metadata, etc).
//   - GetTrending, keyed by region + page token, so every Discover visitor
//     shares one videos.list call per page per TTL instead of making their own.
//
// The cache is in-memory and per-process only — not Postgres-backed, not
// shared across replicas, and reset on every deploy/restart. That's an
// accepted tradeoff. Discover no longer calls search.list at all (search
// hands off to youtube.com), so there is no search cache.
type CachingClient struct {
	inner services.YouTubeClient
	ttl   time.Duration

	trendingTTL time.Duration

	mu       sync.Mutex
	cache    map[string]cacheEntry
	trending map[string]trendingEntry
}

// CachingOption configures a CachingClient.
type CachingOption func(*CachingClient)

// WithTrendingTTL sets how long a page of the most-popular chart is cached.
// Zero or less disables trending caching. Defaults to the metadata TTL.
func WithTrendingTTL(ttl time.Duration) CachingOption {
	return func(c *CachingClient) { c.trendingTTL = ttl }
}

// NewCachingClient wraps inner with a TTL cache. A ttl of zero or less
// disables metadata caching — every call passes straight through to inner.
func NewCachingClient(inner services.YouTubeClient, ttl time.Duration, opts ...CachingOption) *CachingClient {
	c := &CachingClient{
		inner:       inner,
		ttl:         ttl,
		trendingTTL: ttl,
		cache:       make(map[string]cacheEntry),
		trending:    make(map[string]trendingEntry),
	}
	for _, opt := range opts {
		opt(c)
	}
	return c
}

// GetVideoMetadata returns cached metadata for videoID if present and not
// expired; otherwise it fetches from the wrapped client and caches the result.
//
// Every outcome is logged at Info level with a stable "event" field
// (cache_disabled/cache_hit/cache_miss/cache_store) precisely so this can be
// verified directly in logs, not just inferred from a drop in quota errors —
// e.g. `grep 'youtube cache' server.log` or the equivalent query in your log
// viewer (Sevalla's log tab in production; this app isn't on Kubernetes, so
// there's no kubectl to exec into — logs are the direct signal here).
func (c *CachingClient) GetVideoMetadata(ctx context.Context, videoID string) (*services.VideoMetadata, error) {
	if c.ttl <= 0 {
		slog.Info("youtube cache", "event", "cache_disabled", "videoID", videoID)
		return c.inner.GetVideoMetadata(ctx, videoID)
	}

	c.mu.Lock()
	entry, ok := c.cache[videoID]
	c.mu.Unlock()

	if ok && time.Now().Before(entry.expiresAt) {
		slog.Info("youtube cache", "event", "cache_hit", "videoID", videoID, "expiresIn", time.Until(entry.expiresAt).String())
		return entry.metadata, nil
	}

	slog.Info("youtube cache", "event", "cache_miss", "videoID", videoID)

	metadata, err := c.inner.GetVideoMetadata(ctx, videoID)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.cache[videoID] = cacheEntry{
		metadata:  metadata,
		expiresAt: time.Now().Add(c.ttl),
	}
	size := len(c.cache)
	c.mu.Unlock()

	slog.Info("youtube cache", "event", "cache_store", "videoID", videoID, "ttl", c.ttl.String(), "cacheSize", size)

	return metadata, nil
}

// ExtractVideoID delegates to the wrapped client — parsing a URL isn't an
// API call, so there's nothing to cache.
func (c *CachingClient) ExtractVideoID(url string) (string, error) {
	return c.inner.ExtractVideoID(url)
}

// GetTrending returns a cached page of the most-popular chart if present and
// not expired; otherwise it fetches from the wrapped client (which must also
// implement services.YouTubeTrendingClient) and caches the result. Logged with
// the same stable "event" field as GetVideoMetadata, under "youtube trending
// cache".
func (c *CachingClient) GetTrending(ctx context.Context, regionCode, pageToken string) (*services.TrendingPage, error) {
	inner, ok := c.inner.(services.YouTubeTrendingClient)
	if !ok {
		return nil, ErrTrendingUnsupported
	}
	if c.trendingTTL <= 0 {
		slog.Info("youtube trending cache", "event", "cache_disabled", "regionCode", regionCode)
		return inner.GetTrending(ctx, regionCode, pageToken)
	}

	key := regionCode + "|" + pageToken

	c.mu.Lock()
	entry, hit := c.trending[key]
	c.mu.Unlock()

	if hit && time.Now().Before(entry.expiresAt) {
		slog.Info("youtube trending cache", "event", "cache_hit", "regionCode", regionCode, "page", pageToken, "expiresIn", time.Until(entry.expiresAt).String())
		return entry.page, nil
	}

	slog.Info("youtube trending cache", "event", "cache_miss", "regionCode", regionCode, "page", pageToken)

	page, err := inner.GetTrending(ctx, regionCode, pageToken)
	if err != nil {
		return nil, err
	}

	c.mu.Lock()
	c.trending[key] = trendingEntry{page: page, expiresAt: time.Now().Add(c.trendingTTL)}
	size := len(c.trending)
	c.mu.Unlock()

	slog.Info("youtube trending cache", "event", "cache_store", "regionCode", regionCode, "page", pageToken, "ttl", c.trendingTTL.String(), "cacheSize", size)

	return page, nil
}
