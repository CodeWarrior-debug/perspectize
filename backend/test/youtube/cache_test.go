package youtube_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeYouTubeClient counts calls so tests can assert cache hits vs. misses
// without hitting the network.
type fakeYouTubeClient struct {
	calls int
}

func (f *fakeYouTubeClient) GetVideoMetadata(ctx context.Context, videoID string) (*services.VideoMetadata, error) {
	f.calls++
	return &services.VideoMetadata{
		Title:    "Video " + videoID,
		Duration: f.calls, // changes per call so tests can detect a re-fetch
		Response: json.RawMessage(`{}`),
	}, nil
}

func (f *fakeYouTubeClient) ExtractVideoID(url string) (string, error) {
	return url, nil
}

func TestCachingClient_CachesWithinTTL(t *testing.T) {
	inner := &fakeYouTubeClient{}
	client := youtube.NewCachingClient(inner, time.Minute)

	first, err := client.GetVideoMetadata(context.Background(), "abc123")
	require.NoError(t, err)

	second, err := client.GetVideoMetadata(context.Background(), "abc123")
	require.NoError(t, err)

	assert.Equal(t, 1, inner.calls, "second lookup should be served from cache, not the wrapped client")
	assert.Equal(t, first.Duration, second.Duration)
}

func TestCachingClient_RefetchesAfterExpiry(t *testing.T) {
	inner := &fakeYouTubeClient{}
	client := youtube.NewCachingClient(inner, time.Millisecond)

	_, err := client.GetVideoMetadata(context.Background(), "abc123")
	require.NoError(t, err)

	time.Sleep(5 * time.Millisecond)

	_, err = client.GetVideoMetadata(context.Background(), "abc123")
	require.NoError(t, err)

	assert.Equal(t, 2, inner.calls, "expired entry should trigger a fresh fetch")
}

func TestCachingClient_ZeroTTLDisablesCaching(t *testing.T) {
	inner := &fakeYouTubeClient{}
	client := youtube.NewCachingClient(inner, 0)

	_, err := client.GetVideoMetadata(context.Background(), "abc123")
	require.NoError(t, err)
	_, err = client.GetVideoMetadata(context.Background(), "abc123")
	require.NoError(t, err)

	assert.Equal(t, 2, inner.calls, "ttl<=0 should pass every call through")
}

func TestCachingClient_DifferentVideoIDsCachedSeparately(t *testing.T) {
	inner := &fakeYouTubeClient{}
	client := youtube.NewCachingClient(inner, time.Minute)

	_, err := client.GetVideoMetadata(context.Background(), "video1")
	require.NoError(t, err)
	_, err = client.GetVideoMetadata(context.Background(), "video2")
	require.NoError(t, err)

	assert.Equal(t, 2, inner.calls, "distinct video IDs should each cause a fetch")
}

func TestCachingClient_ExtractVideoIDDelegates(t *testing.T) {
	inner := &fakeYouTubeClient{}
	client := youtube.NewCachingClient(inner, time.Minute)

	id, err := client.ExtractVideoID("https://youtu.be/xyz")
	require.NoError(t, err)
	assert.Equal(t, "https://youtu.be/xyz", id)
}

// fakeTrendingClient is a YouTubeClient that also serves the trending chart,
// counting trending calls separately from metadata calls.
type fakeTrendingClient struct {
	fakeYouTubeClient
	trendingCalls int
	err           error
}

func (f *fakeTrendingClient) GetTrending(ctx context.Context, regionCode, pageToken string) (*services.TrendingPage, error) {
	f.trendingCalls++
	if f.err != nil {
		return nil, f.err
	}
	return &services.TrendingPage{
		Items:         []services.TrendingVideo{{ID: regionCode + pageToken, Title: "call " + string(rune('0'+f.trendingCalls))}},
		NextPageToken: "next",
	}, nil
}

func TestCachingClient_Trending_CachesPerRegionAndPage(t *testing.T) {
	inner := &fakeTrendingClient{}
	client := youtube.NewCachingClient(inner, time.Minute)
	ctx := context.Background()

	first, err := client.GetTrending(ctx, "US", "")
	require.NoError(t, err)
	again, err := client.GetTrending(ctx, "US", "")
	require.NoError(t, err)
	assert.Equal(t, 1, inner.trendingCalls, "same region + page should be served from cache")
	assert.Same(t, first, again)

	_, err = client.GetTrending(ctx, "US", "page2")
	require.NoError(t, err)
	_, err = client.GetTrending(ctx, "GB", "")
	require.NoError(t, err)
	assert.Equal(t, 3, inner.trendingCalls, "a different page token or region is a different cache entry")
	assert.Equal(t, 0, inner.calls, "trending must not touch the metadata path")
}

func TestCachingClient_Trending_RefetchesAfterExpiry(t *testing.T) {
	inner := &fakeTrendingClient{}
	client := youtube.NewCachingClient(inner, time.Hour, youtube.WithTrendingTTL(time.Millisecond))

	_, err := client.GetTrending(context.Background(), "US", "")
	require.NoError(t, err)
	time.Sleep(5 * time.Millisecond)
	_, err = client.GetTrending(context.Background(), "US", "")
	require.NoError(t, err)

	assert.Equal(t, 2, inner.trendingCalls, "expired trending page should trigger a fresh fetch")
}

func TestCachingClient_Trending_TTLIsIndependentOfMetadataTTL(t *testing.T) {
	inner := &fakeTrendingClient{}
	// Metadata caching off, trending caching on.
	client := youtube.NewCachingClient(inner, 0, youtube.WithTrendingTTL(time.Minute))

	for i := 0; i < 3; i++ {
		_, err := client.GetTrending(context.Background(), "US", "")
		require.NoError(t, err)
		_, err = client.GetVideoMetadata(context.Background(), "abc")
		require.NoError(t, err)
	}
	assert.Equal(t, 1, inner.trendingCalls)
	assert.Equal(t, 3, inner.calls)
}

func TestCachingClient_Trending_DisabledPassesThrough(t *testing.T) {
	inner := &fakeTrendingClient{}
	client := youtube.NewCachingClient(inner, time.Minute, youtube.WithTrendingTTL(0))

	for i := 0; i < 2; i++ {
		_, err := client.GetTrending(context.Background(), "US", "")
		require.NoError(t, err)
	}
	assert.Equal(t, 2, inner.trendingCalls)
}

func TestCachingClient_Trending_DoesNotCacheErrors(t *testing.T) {
	inner := &fakeTrendingClient{err: assert.AnError}
	client := youtube.NewCachingClient(inner, time.Minute)

	_, err := client.GetTrending(context.Background(), "US", "")
	require.ErrorIs(t, err, assert.AnError)

	inner.err = nil
	page, err := client.GetTrending(context.Background(), "US", "")
	require.NoError(t, err)
	require.NotNil(t, page)
	assert.Equal(t, 2, inner.trendingCalls, "a failed fetch must not be cached")
}

func TestCachingClient_Trending_UnsupportedInner(t *testing.T) {
	client := youtube.NewCachingClient(&fakeYouTubeClient{}, time.Minute)

	_, err := client.GetTrending(context.Background(), "US", "")
	require.ErrorIs(t, err, youtube.ErrTrendingUnsupported)
}
