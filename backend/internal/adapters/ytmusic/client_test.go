package ytmusic

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// next_omv.json is a real `next` response (captured 2026-09-27) for a live official music video.
func TestParseNext_RealOfficialVideo(t *testing.T) {
	raw, err := os.ReadFile("testdata/next_omv.json")
	require.NoError(t, err)

	track, err := ParseNext(raw, "fJ9rUzIMcZQ")
	require.NoError(t, err)
	assert.Equal(t, "Bohemian Rhapsody (Live At Milton Keynes Bowl / June 1982)", track.Title)
	assert.Equal(t, []string{"Queen"}, track.Artists, "view/like counts in the byline must not be read as artists")
	assert.Equal(t, 360, track.DurationSec)
	assert.Equal(t, "official_video", track.VideoType)
	assert.Empty(t, track.Counterparts)
}

func renderer(id, title, videoType string, byline []map[string]any) map[string]any {
	return map[string]any{
		"videoId":        id,
		"title":          map[string]any{"runs": []map[string]any{{"text": title}}},
		"longBylineText": map[string]any{"runs": byline},
		"lengthText":     map[string]any{"runs": []map[string]any{{"text": "5:55"}}},
		"navigationEndpoint": map[string]any{"watchEndpoint": map[string]any{
			"videoId": id,
			"watchEndpointMusicSupportedConfigs": map[string]any{"watchEndpointMusicConfig": map[string]any{"musicVideoType": videoType}},
		}},
	}
}

func pageRun(text, pageType string) map[string]any {
	return map[string]any{"text": text, "navigationEndpoint": map[string]any{"browseEndpoint": map[string]any{
		"browseEndpointContextSupportedConfigs": map[string]any{"browseEndpointContextMusicConfig": map[string]any{"pageType": pageType}},
	}}}
}

// Built to ytmusicapi's documented wrapper shape: an audio track with its official video as counterpart.
func wrapperFixture(t *testing.T) []byte {
	byline := []map[string]any{pageRun("Queen", "MUSIC_PAGE_TYPE_ARTIST"), {"text": " • "}, pageRun("A Night at the Opera", "MUSIC_PAGE_TYPE_ALBUM"), {"text": " • 1975"}}
	item := map[string]any{"playlistPanelVideoWrapperRenderer": map[string]any{
		"primaryRenderer": map[string]any{"playlistPanelVideoRenderer": renderer("AUDIOAUDIO1", "Bohemian Rhapsody", "MUSIC_VIDEO_TYPE_ATV", byline)},
		"counterpart": []map[string]any{{"counterpartRenderer": map[string]any{
			"playlistPanelVideoRenderer": renderer("VIDEOVIDEO1", "Bohemian Rhapsody (Official Video)", "MUSIC_VIDEO_TYPE_OMV", byline),
		}}},
	}}
	doc := map[string]any{"contents": map[string]any{"singleColumnMusicWatchNextResultsRenderer": map[string]any{"tabbedRenderer": map[string]any{
		"watchNextTabbedResultsRenderer": map[string]any{"tabs": []map[string]any{{"tabRenderer": map[string]any{"content": map[string]any{
			"musicQueueRenderer": map[string]any{"content": map[string]any{"playlistPanelRenderer": map[string]any{"contents": []any{item}}}},
		}}}}},
	}}}}
	raw, err := json.Marshal(doc)
	require.NoError(t, err)
	return raw
}

func TestParseNext_AudioTrackWithCounterpart(t *testing.T) {
	raw := wrapperFixture(t)

	track, err := ParseNext(raw, "AUDIOAUDIO1")
	require.NoError(t, err)
	assert.Equal(t, "Bohemian Rhapsody", track.Title)
	assert.Equal(t, []string{"Queen"}, track.Artists)
	assert.Equal(t, "A Night at the Opera", track.Album)
	assert.Equal(t, 355, track.DurationSec)
	assert.Equal(t, "audio", track.VideoType)
	require.Len(t, track.Counterparts, 1)
	assert.Equal(t, "VIDEOVIDEO1", track.Counterparts[0].VideoID)
	assert.Equal(t, "official_video", track.Counterparts[0].VideoType)

	// Asking for the counterpart returns the audio track as its counterpart.
	video, err := ParseNext(raw, "VIDEOVIDEO1")
	require.NoError(t, err)
	require.Len(t, video.Counterparts, 1)
	assert.Equal(t, "AUDIOAUDIO1", video.Counterparts[0].VideoID)
	assert.Equal(t, "audio", video.Counterparts[0].VideoType)
}

func TestParseNext_Errors(t *testing.T) {
	_, err := ParseNext([]byte(`not json`), "x")
	assert.Error(t, err)
	_, err = ParseNext(wrapperFixture(t), "MISSINGMISS")
	assert.Error(t, err)
}

func TestGetTrack_RequestShapeAndStatus(t *testing.T) {
	var gotBody map[string]any
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/next", r.URL.Path)
		assert.Equal(t, http.MethodPost, r.Method)
		require.NoError(t, json.NewDecoder(r.Body).Decode(&gotBody))
		if gotBody["videoId"] == "BADBADBADBA" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		_, _ = w.Write(wrapperFixture(t))
	}))
	defer srv.Close()
	c := NewClient()
	c.baseURL = srv.URL

	track, err := c.GetTrack(context.Background(), "AUDIOAUDIO1")
	require.NoError(t, err)
	assert.Equal(t, "A Night at the Opera", track.Album)
	client := gotBody["context"].(map[string]any)["client"].(map[string]any)
	assert.Equal(t, "WEB_REMIX", client["clientName"])

	_, err = c.GetTrack(context.Background(), "BADBADBADBA")
	assert.Error(t, err)
}

func TestParseClock(t *testing.T) {
	assert.Equal(t, 355, parseClock("5:55"))
	assert.Equal(t, 3725, parseClock("1:02:05"))
	assert.Equal(t, 0, parseClock("live"))
}
