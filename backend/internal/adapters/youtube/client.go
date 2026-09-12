package youtube

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// Client implements the YouTubeClient interface for YouTube Data API v3
type Client struct {
	apiKey     string
	httpClient *http.Client
	baseURL    string
}

// NewClient creates a new YouTube API client
func NewClient(apiKey string) *Client {
	return &Client{
		apiKey:     apiKey,
		httpClient: &http.Client{},
		baseURL:    "https://www.googleapis.com/youtube/v3",
	}
}

// YouTubeAPIResponse represents the trimmed response stored in the database.
// Only fields the app actually reads are included — everything else
// (items[].id, thumbnails, etag, status, topicDetails, etc.) is stripped on
// ingest. See FEATURE_BACKLOG.md "YouTube JSONB Storage" for the sizing
// analysis behind this trim.
type YouTubeAPIResponse struct {
	Items []struct {
		Snippet struct {
			Title        string   `json:"title"`
			Description  string   `json:"description"`
			ChannelTitle string   `json:"channelTitle"`
			PublishedAt  string   `json:"publishedAt"`
			Tags         []string `json:"tags"`
		} `json:"snippet"`
		ContentDetails struct {
			Duration string `json:"duration"`
		} `json:"contentDetails"`
		Statistics struct {
			ViewCount    string `json:"viewCount"`
			LikeCount    string `json:"likeCount"`
			CommentCount string `json:"commentCount"`
		} `json:"statistics"`
	} `json:"items"`
}

// sanitizeYouTubeError removes sensitive information from YouTube API errors.
// YouTube API errors may contain the full request URL including the API key
// as a query parameter. This function strips any googleapis.com URLs to prevent
// API key leakage in logs or error responses.
func sanitizeYouTubeError(err error) string {
	if err == nil {
		return ""
	}

	errMsg := err.Error()

	// Remove URLs that might contain API keys
	// Pattern: https://www.googleapis.com/youtube/v3/videos?key=xxx&...
	if strings.Contains(errMsg, "googleapis.com") {
		// Extract just the HTTP status and generic message
		if strings.Contains(errMsg, "status code") {
			// Keep status code, discard URL
			parts := strings.Split(errMsg, ":")
			if len(parts) > 0 {
				return "YouTube API error:" + strings.TrimSpace(parts[len(parts)-1])
			}
		}
		return "YouTube API request failed"
	}

	return errMsg
}

// GetVideoMetadata fetches video metadata from YouTube Data API
func (c *Client) GetVideoMetadata(ctx context.Context, videoID string) (*services.VideoMetadata, error) {
	endpoint := fmt.Sprintf("%s/videos?part=snippet,statistics,contentDetails&id=%s&key=%s",
		c.baseURL,
		url.QueryEscape(videoID),
		url.QueryEscape(c.apiKey),
	)

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("failed to create request: %w", err)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		sanitized := sanitizeYouTubeError(err)
		slog.Error("YouTube API request failed", "error", sanitized, "videoID", videoID)
		return nil, fmt.Errorf("failed to fetch video metadata: %s", sanitized)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		slog.Error("YouTube API returned error", "status", resp.StatusCode, "videoID", videoID)
		return nil, fmt.Errorf("%w: status %d", domain.ErrYouTubeAPI, resp.StatusCode)
	}

	var apiResponse YouTubeAPIResponse
	if err := json.Unmarshal(body, &apiResponse); err != nil {
		return nil, fmt.Errorf("failed to parse YouTube API response: %w", err)
	}

	if len(apiResponse.Items) == 0 {
		return nil, fmt.Errorf("%w: video not found: %s", domain.ErrNotFound, videoID)
	}

	item := apiResponse.Items[0]

	duration, err := ParseISO8601Duration(item.ContentDetails.Duration)
	if err != nil {
		slog.Warn("failed to parse duration", "duration", item.ContentDetails.Duration, "videoID", videoID, "error", err)
		duration = 0
	}

	// Re-marshal from parsed struct to strip unused fields
	trimmed, err := json.Marshal(apiResponse)
	if err != nil {
		return nil, fmt.Errorf("failed to marshal trimmed response: %w", err)
	}

	return &services.VideoMetadata{
		Title:       item.Snippet.Title,
		Description: item.Snippet.Description,
		Duration:    duration,
		ChannelName: item.Snippet.ChannelTitle,
		Response:    trimmed,
	}, nil
}

// ExtractVideoID extracts the video ID from a YouTube URL
func (c *Client) ExtractVideoID(url string) (string, error) {
	return ExtractVideoID(url)
}
