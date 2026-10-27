package youtube

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const testChannelID = "UCL_f53ZEJxp8TtlOkHwMV9Q"

// fakeDataAPI serves the three endpoints the lister calls. Long-form uploads
// come in two pages, the channel has no Shorts playlist (404), one livestream,
// and video "gone" is in the playlist but deleted (absent from videos.list).
func fakeDataAPI(t *testing.T, calls *[]string) http.HandlerFunc {
	t.Helper()
	videos := map[string]string{
		"v1":    `{"id":"v1","snippet":{"title":"Maps of Meaning 1","description":"Lecture one of the 2017 course.\n0:00 Intro\n1:00 Order\n2:00 Chaos\nhttps://www.jordanbpeterson.com","publishedAt":"2017-01-24T00:00:00Z","tags":["psychology"],"categoryId":"27","thumbnails":{"medium":{"url":"https://i.ytimg.com/vi/v1/mqdefault.jpg"}}},"contentDetails":{"duration":"PT2H25M56S","caption":"true"},"statistics":{"viewCount":"836000","likeCount":"12000","commentCount":"900"}}`,
		"v2":    `{"id":"v2","snippet":{"title":"Hidden likes","description":"Second talk.","publishedAt":"2018-02-01T00:00:00Z"},"contentDetails":{"duration":"PT10M","caption":"false"},"statistics":{"viewCount":"5000"}}`,
		"v3":    `{"id":"v3","snippet":{"title":"Page two","description":"Third.","publishedAt":"2019-03-01T00:00:00Z"},"contentDetails":{"duration":"PT1M"},"statistics":{"viewCount":"10","likeCount":"1","commentCount":"0"}}`,
		"live1": `{"id":"live1","snippet":{"title":"Livestream Q&A","description":"Live.","publishedAt":"2020-04-01T00:00:00Z"},"contentDetails":{"duration":"PT1H"},"statistics":{"viewCount":"77","likeCount":"7","commentCount":"3"}}`,
	}
	return func(w http.ResponseWriter, r *http.Request) {
		q := r.URL.Query()
		*calls = append(*calls, r.URL.Path+"?"+q.Get("playlistId")+q.Get("id")+q.Get("forHandle")+q.Get("pageToken"))
		if q.Get("key") != "test-key" {
			w.WriteHeader(http.StatusForbidden)
			return
		}
		switch r.URL.Path {
		case "/channels":
			if q.Get("forHandle") == "@missing" {
				_, _ = w.Write([]byte(`{"items":[]}`))
				return
			}
			fmt.Fprintf(w, `{"items":[{"id":%q,"snippet":{"title":"Jordan B Peterson","customUrl":"@jordanbpeterson"}}]}`, testChannelID)
		case "/playlistItems":
			switch {
			case strings.HasPrefix(q.Get("playlistId"), "UULF") && q.Get("pageToken") == "":
				_, _ = w.Write([]byte(`{"nextPageToken":"p2","items":[{"contentDetails":{"videoId":"v1"}},{"contentDetails":{"videoId":"gone"}},{"contentDetails":{"videoId":"v2"}}]}`))
			case strings.HasPrefix(q.Get("playlistId"), "UULF"):
				_, _ = w.Write([]byte(`{"items":[{"contentDetails":{"videoId":"v3"}},{"contentDetails":{"videoId":"v1"}}]}`))
			case strings.HasPrefix(q.Get("playlistId"), "UULV"):
				_, _ = w.Write([]byte(`{"items":[{"contentDetails":{"videoId":"live1"}}]}`))
			default:
				w.WriteHeader(http.StatusNotFound)
				_, _ = w.Write([]byte(`{"error":{"code":404,"message":"playlistNotFound"}}`))
			}
		case "/videos":
			var items []string
			for _, id := range strings.Split(q.Get("id"), ",") {
				if v, ok := videos[id]; ok {
					items = append(items, v)
				}
			}
			fmt.Fprintf(w, `{"items":[%s]}`, strings.Join(items, ","))
		default:
			w.WriteHeader(http.StatusNotFound)
		}
	}
}

func TestChannelLister_Resolve(t *testing.T) {
	var calls []string
	l := NewChannelLister(newHTTPTestClient(t, fakeDataAPI(t, &calls)))
	ctx := context.Background()

	for _, ref := range []string{
		testChannelID,
		"https://www.youtube.com/channel/" + testChannelID,
	} {
		got, err := l.Resolve(ctx, ref)
		require.NoError(t, err, ref)
		assert.Equal(t, testChannelID, got.ID)
		assert.Equal(t, "Jordan B Peterson", got.Title)
		assert.Equal(t, "https://www.youtube.com/@jordanbpeterson", got.URL)
	}
	for _, ref := range []string{"@JordanBPeterson", "JordanBPeterson", "https://youtube.com/@JordanBPeterson/videos"} {
		_, err := l.Resolve(ctx, ref)
		require.NoError(t, err, ref)
	}
	assert.Contains(t, calls, "/channels?@JordanBPeterson")

	_, err := l.Resolve(ctx, "@missing")
	assert.ErrorIs(t, err, domain.ErrNotFound)
	_, err = l.Resolve(ctx, "not a channel!")
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
	_, err = l.Resolve(ctx, "https://example.com/watch")
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestChannelLister_List(t *testing.T) {
	var calls []string
	l := NewChannelLister(newHTTPTestClient(t, fakeDataAPI(t, &calls)))
	fixed := time.Date(2026, 10, 27, 12, 0, 0, 0, time.UTC)
	l.now = func() time.Time { return fixed }

	var batches [][]*domain.ImportItemWithDetails
	err := l.List(context.Background(), services.ResolvedImportSource{ID: testChannelID}, nil, func(b []*domain.ImportItemWithDetails) error {
		batches = append(batches, b)
		return nil
	})
	require.NoError(t, err)

	// One batch per playlist page with fresh ids: LF page 1, LF page 2, LV. Shorts 404s and is skipped.
	require.Len(t, batches, 3)
	var all []*domain.ImportItemWithDetails
	for _, b := range batches {
		all = append(all, b...)
	}
	ids := make([]string, len(all))
	for i, it := range all {
		ids[i] = it.Item.ExternalID
	}
	assert.Equal(t, []string{"v1", "v2", "v3", "live1"}, ids, "deleted video dropped, duplicate v1 listed once")

	v1 := all[0]
	assert.Equal(t, domain.ImportItemKindVideo, v1.Item.Kind)
	assert.Equal(t, domain.ContentTypeYouTubeVideo, v1.Item.DestinationType)
	assert.Equal(t, "https://www.youtube.com/watch?v=v1", v1.Item.CanonicalURL)
	assert.Equal(t, 8756, *v1.Item.DurationSeconds)
	assert.Equal(t, int64(12000), *v1.Item.LikeCount)
	assert.True(t, *v1.Item.HasCaptions)
	assert.Equal(t, 3, v1.Item.ChapterCount)
	assert.Equal(t, "Lecture one of the 2017 course.", *v1.Item.Summary)
	assert.Equal(t, "https://i.ytimg.com/vi/v1/mqdefault.jpg", *v1.Item.ThumbnailURL)
	assert.Equal(t, fixed, v1.Item.StatsFetchedAt)
	assert.Equal(t, []string{"jordanbpeterson.com"}, v1.Details.Links)
	assert.Equal(t, "27", v1.Details.Category)
	assert.Equal(t, 0, v1.Item.Position)

	v2 := all[1]
	assert.Nil(t, v2.Item.LikeCount, "hidden likes stay nil, not 0")
	assert.Nil(t, v2.Item.CommentCount)
	assert.False(t, *v2.Item.HasCaptions)
	assert.Equal(t, 2, v2.Item.Position, "position counts the deleted video's slot")

	live := all[3]
	assert.Equal(t, domain.ImportItemKindLive, live.Item.Kind)

	videoCalls := 0
	for _, c := range calls {
		if strings.HasPrefix(c, "/videos") {
			videoCalls++
		}
	}
	assert.Equal(t, 3, videoCalls, "one videos.list call per playlist page")
}

func TestChannelLister_ListStopsOnEmitError(t *testing.T) {
	var calls []string
	l := NewChannelLister(newHTTPTestClient(t, fakeDataAPI(t, &calls)))
	stop := errors.New("stop")
	n := 0
	err := l.List(context.Background(), services.ResolvedImportSource{ID: testChannelID}, nil, func([]*domain.ImportItemWithDetails) error {
		n++
		return stop
	})
	assert.ErrorIs(t, err, stop)
	assert.Equal(t, 1, n)
}

func TestChannelLister_ErrorsNeverCarryTheKey(t *testing.T) {
	l := NewChannelLister(newHTTPTestClient(t, func(w http.ResponseWriter, _ *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "quotaExceeded"})
	}))
	_, err := l.Resolve(context.Background(), testChannelID)
	require.Error(t, err)
	assert.ErrorIs(t, err, domain.ErrYouTubeAPI)
	assert.NotContains(t, err.Error(), "test-key")

	err = l.List(context.Background(), services.ResolvedImportSource{ID: "bad"}, nil, nil)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}
