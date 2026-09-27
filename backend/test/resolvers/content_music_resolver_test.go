package resolvers_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const trackURL = "https://music.youtube.com/watch?v=dQw4w9WgXcQ"

func musicYT() *mockYouTubeClient {
	return &mockYouTubeClient{getVideoMetadataFn: func(context.Context, string) (*portservices.VideoMetadata, error) {
		return &portservices.VideoMetadata{Title: "Song", Duration: 200, ChannelName: "Artist - Topic", Response: json.RawMessage(`{"items":[]}`)}, nil
	}}
}

func TestCreateContentFromYouTubeMusic_Success(t *testing.T) {
	repo := &mockContentRepository{
		getOrCreateByURLFn: func(_ context.Context, c *domain.Content) (*domain.Content, bool, error) {
			c.ID = 5
			return c, false, nil
		},
	}
	server := setupTestServer(repo, musicYT())
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromYouTubeMusic(input: { url: "`+trackURL+`", userId: 0 }) {
		content { id contentType url relatedMedia { videoId } lyrics { available } } alreadyExisted } }`)
	require.Empty(t, result.Errors)

	var data struct {
		Create struct {
			Content struct {
				ID           string            `json:"id"`
				ContentType  string            `json:"contentType"`
				URL          string            `json:"url"`
				RelatedMedia []json.RawMessage `json:"relatedMedia"`
				Lyrics       *json.RawMessage  `json:"lyrics"`
			} `json:"content"`
			AlreadyExisted bool `json:"alreadyExisted"`
		} `json:"createContentFromYouTubeMusic"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	assert.Equal(t, "5", data.Create.Content.ID)
	assert.Equal(t, "YOUTUBE_MUSIC", data.Create.Content.ContentType)
	assert.Equal(t, trackURL, data.Create.Content.URL)
	assert.NotNil(t, data.Create.Content.RelatedMedia, "relatedMedia is a non-null list")
	assert.Empty(t, data.Create.Content.RelatedMedia)
	assert.Nil(t, data.Create.Content.Lyrics, "lyrics is null until checked")
	assert.False(t, data.Create.AlreadyExisted)
}

func TestCreateContentFromYouTubeMusic_ErrorMessages(t *testing.T) {
	server := setupTestServer(&mockContentRepository{}, musicYT())
	defer server.Close()

	tests := map[string]string{
		"https://music.youtube.com/playlist?list=OLAK5uy_x": "paste a song link, not an album, playlist, or artist",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ":       "invalid YouTube Music URL",
	}
	for url, want := range tests {
		result := executeGraphQL(t, server, `mutation { createContentFromYouTubeMusic(input: { url: "`+url+`", userId: 0 }) { alreadyExisted } }`)
		require.NotEmpty(t, result.Errors, url)
		assert.Contains(t, result.Errors[0].Message, want)
	}
}

func TestRefreshLyricsAvailability_MapsStoredFields(t *testing.T) {
	checked := time.Date(2026, 9, 27, 12, 0, 0, 0, time.UTC)
	u := trackURL
	resp, _ := json.Marshal(map[string]any{
		"relatedMedia": []domain.RelatedMedia{{Provider: "youtube", VideoID: "VIDEOVIDEO1", Kind: domain.RelatedMediaKindOfficialVideo, Title: "Official Video"}},
		"lyrics":       domain.LyricsAvailability{Available: true, LRCLibID: intPtr(36978827), HasSynced: true, CheckedAt: checked},
	})
	repo := &mockContentRepository{
		getByIDFn: func(_ context.Context, id int) (*domain.Content, error) {
			return &domain.Content{ID: id, Name: "Song", URL: &u, ContentType: domain.ContentTypeYouTubeMusic, Response: resp}, nil
		},
	}
	server := setupTestServer(repo, musicYT())
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { refreshLyricsAvailability(contentId: 5) {
		relatedMedia { provider videoId kind title contentId unavailable }
		lyrics { available lrclibId hasSynced checkedAt } } }`)
	require.Empty(t, result.Errors)

	var data struct {
		Refresh struct {
			RelatedMedia []struct {
				Provider    string  `json:"provider"`
				VideoID     string  `json:"videoId"`
				Kind        string  `json:"kind"`
				Title       string  `json:"title"`
				ContentID   *string `json:"contentId"`
				Unavailable bool    `json:"unavailable"`
			} `json:"relatedMedia"`
			Lyrics struct {
				Available bool   `json:"available"`
				LrclibID  int    `json:"lrclibId"`
				HasSynced bool   `json:"hasSynced"`
				CheckedAt string `json:"checkedAt"`
			} `json:"lyrics"`
		} `json:"refreshLyricsAvailability"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	require.Len(t, data.Refresh.RelatedMedia, 1)
	assert.Equal(t, "official_video", data.Refresh.RelatedMedia[0].Kind)
	assert.Equal(t, "Official Video", data.Refresh.RelatedMedia[0].Title)
	assert.Nil(t, data.Refresh.RelatedMedia[0].ContentID)
	assert.True(t, data.Refresh.Lyrics.Available)
	assert.Equal(t, 36978827, data.Refresh.Lyrics.LrclibID)
	assert.Equal(t, "2026-09-27T12:00:00Z", data.Refresh.Lyrics.CheckedAt)
}

func TestRefreshLyricsAvailability_RejectsNonMusic(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(_ context.Context, id int) (*domain.Content, error) {
			return &domain.Content{ID: id, ContentType: domain.ContentTypeYouTube}, nil
		},
	}
	server := setupTestServer(repo, musicYT())
	defer server.Close()
	result := executeGraphQL(t, server, `mutation { refreshLyricsAvailability(contentId: 5) { id } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "only available for music tracks")
}

func TestMarkRelatedMediaUnavailable_UnknownVideo(t *testing.T) {
	u := trackURL
	repo := &mockContentRepository{
		getByIDFn: func(_ context.Context, id int) (*domain.Content, error) {
			return &domain.Content{ID: id, URL: &u, ContentType: domain.ContentTypeYouTubeMusic, Response: json.RawMessage(`{"relatedMedia":[]}`)}, nil
		},
	}
	server := setupTestServer(repo, musicYT())
	defer server.Close()
	result := executeGraphQL(t, server, `mutation { markRelatedMediaUnavailable(contentId: 5, videoId: "NOTRELATED1") { id } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "related video not found")
}

func intPtr(n int) *int { return &n }
