package services

import (
	"context"
	"encoding/json"
)

// VideoMetadata contains extracted information from YouTube API response
type VideoMetadata struct {
	Title       string
	Description string
	Duration    int // Duration in seconds
	ChannelName string
	Response    json.RawMessage // Raw API response for storage
}

// YouTubeClient defines the contract for YouTube API interactions
type YouTubeClient interface {
	// GetVideoMetadata fetches video metadata from YouTube API
	GetVideoMetadata(ctx context.Context, videoID string) (*VideoMetadata, error)

	// ExtractVideoID extracts the video ID from a YouTube URL
	ExtractVideoID(url string) (string, error)
}

// TrendingVideo is one entry of YouTube's most-popular chart, trimmed to what
// the Discover page renders.
type TrendingVideo struct {
	ID           string
	Title        string
	ChannelTitle string
	Description  string
	PublishedAt  string
	ThumbnailURL string
	// Duration is the raw ISO 8601 value (e.g. "PT4M13S"); the frontend
	// formats it for the card's duration badge.
	Duration string
}

// TrendingPage is one page of the most-popular chart.
type TrendingPage struct {
	Items         []TrendingVideo
	NextPageToken string
}

// YouTubeTrendingClient fetches YouTube's most-popular chart (videos.list
// chart=mostPopular, 1 quota unit per call). It is a separate port from
// YouTubeClient so existing YouTubeClient implementations and mocks are
// unaffected.
type YouTubeTrendingClient interface {
	GetTrending(ctx context.Context, regionCode, pageToken string) (*TrendingPage, error)
}
