package youtube

import (
	"context"
	"encoding/json"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/demo"
)

// FixtureClient is an offline services.YouTubeClient for demo mode. Known
// demo video IDs return their canned metadata; any other well-formed ID gets a
// synthetic placeholder, so the "add a video" flow works for any URL without a
// YOUTUBE_API_KEY or network access. URL parsing is the real client's.
type FixtureClient struct {
	parser *Client
}

var _ services.YouTubeClient = (*FixtureClient)(nil)

// NewFixtureClient builds the offline demo client.
func NewFixtureClient() *FixtureClient {
	return &FixtureClient{parser: NewClient("")}
}

// ExtractVideoID delegates to the real client's URL parsing.
func (c *FixtureClient) ExtractVideoID(url string) (string, error) {
	return c.parser.ExtractVideoID(url)
}

// GetVideoMetadata returns fixture metadata shaped exactly like the trimmed
// response the live client stores, so the frontend can't tell the difference.
func (c *FixtureClient) GetVideoMetadata(_ context.Context, videoID string) (*services.VideoMetadata, error) {
	v, ok := demo.VideoByID(videoID)
	if !ok {
		v = demo.Video{
			ID:           videoID,
			Title:        fmt.Sprintf("Demo video %s", videoID),
			Description:  "Placeholder metadata served by demo mode's offline YouTube fixtures.",
			ChannelTitle: "Perspectize Demo",
			PublishedAt:  "2024-01-01T00:00:00Z",
			DurationISO:  "PT5M",
			Seconds:      300,
			Views:        "0",
			Likes:        "0",
			Comments:     "0",
		}
	}
	return FixtureMetadata(v)
}

// FixtureMetadata converts a demo video into stored-response metadata. Shared
// with cmd/seed-demo so seeded rows match rows added through the UI.
func FixtureMetadata(v demo.Video) (*services.VideoMetadata, error) {
	var item YouTubeAPIItem
	item.Snippet.Title = v.Title
	item.Snippet.Description = v.Description
	item.Snippet.ChannelTitle = v.ChannelTitle
	item.Snippet.PublishedAt = v.PublishedAt
	item.Snippet.Tags = v.Tags
	item.ContentDetails.Duration = v.DurationISO
	item.Statistics.ViewCount = v.Views
	item.Statistics.LikeCount = v.Likes
	item.Statistics.CommentCount = v.Comments

	raw, err := json.Marshal(YouTubeAPIResponse{Items: []YouTubeAPIItem{item}})
	if err != nil {
		return nil, fmt.Errorf("marshal fixture response: %w", err)
	}
	return &services.VideoMetadata{
		Title:       v.Title,
		Description: v.Description,
		Duration:    v.Seconds,
		ChannelName: v.ChannelTitle,
		Response:    raw,
	}, nil
}
