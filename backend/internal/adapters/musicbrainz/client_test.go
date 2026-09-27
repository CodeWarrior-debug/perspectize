package musicbrainz

import (
	"context"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Fixtures are real MusicBrainz responses captured 2026-09-27.
func fixtureServer(t *testing.T, lookups map[string]string) (*Client, *int32) {
	t.Helper()
	var calls int32
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		atomic.AddInt32(&calls, 1)
		assert.Contains(t, r.Header.Get("User-Agent"), "Perspectize/")
		if r.URL.Path == "/recording" {
			q := r.URL.Query().Get("query")
			assert.Contains(t, q, `recording:"Bohemian Rhapsody"`)
			assert.Contains(t, q, "dur:[352000 TO 358000]")
			_, _ = w.Write(mustRead(t, "testdata/search_bohemian_dur.json"))
			return
		}
		id := strings.TrimPrefix(r.URL.Path, "/recording/")
		file, ok := lookups[id]
		if !ok {
			file = "testdata/lookup_noisrc.json"
		}
		_, _ = w.Write(mustRead(t, file))
	}))
	t.Cleanup(srv.Close)
	c := NewClient()
	c.baseURL = srv.URL
	c.interval = 0
	return c, &calls
}

func mustRead(t *testing.T, p string) []byte {
	b, err := os.ReadFile(p)
	require.NoError(t, err)
	return b
}

func TestFindRecording_PicksFirstCandidateWithISRC(t *testing.T) {
	// 356000ms (41371bec, no ISRC) and 354000ms (e53edec4, has one) are both 1s from
	// 355s; stable sort keeps search order, so 41371bec is tried first and skipped.
	c, calls := fixtureServer(t, map[string]string{"e53edec4-4e56-4543-8737-2a25be46ba2d": "testdata/lookup_isrc.json"})

	rec, err := c.FindRecording(context.Background(), "Queen", "Bohemian Rhapsody", 355)
	require.NoError(t, err)
	assert.Equal(t, "GBCEE0500364", rec.ISRC)
	assert.Equal(t, "2005-11-18", rec.ReleaseDate)
	assert.NotEmpty(t, rec.Genre)
	assert.True(t, strings.HasPrefix(rec.CoverImageURL, "https://coverartarchive.org/release/"))
	assert.EqualValues(t, 3, *calls, "one search plus two lookups")
}

func TestFindRecording_NoISRCWithinLookupCap(t *testing.T) {
	c, calls := fixtureServer(t, nil)

	_, err := c.FindRecording(context.Background(), "Queen", "Bohemian Rhapsody", 355)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.EqualValues(t, 1+maxLookups, *calls)
}

func TestFindRecording_MissingInputs(t *testing.T) {
	c := NewClient()
	for _, tc := range []struct {
		artist, title string
		dur           int
	}{{"", "t", 1}, {"a", "", 1}, {"a", "t", 0}} {
		_, err := c.FindRecording(context.Background(), tc.artist, tc.title, tc.dur)
		assert.ErrorIs(t, err, domain.ErrNotFound)
	}
}

func TestFindRecording_ServerBusy(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer srv.Close()
	c := NewClient()
	c.baseURL, c.interval = srv.URL, 0
	_, err := c.FindRecording(context.Background(), "Queen", "Bohemian Rhapsody", 355)
	require.Error(t, err)
	assert.NotErrorIs(t, err, domain.ErrNotFound)
}

func TestWait_SpacesRequests(t *testing.T) {
	c := NewClient()
	c.interval = 50 * time.Millisecond
	start := time.Now()
	for i := 0; i < 3; i++ {
		require.NoError(t, c.wait(context.Background()))
	}
	assert.GreaterOrEqual(t, time.Since(start), 100*time.Millisecond)
}

func TestLuceneEscape(t *testing.T) {
	assert.Equal(t, `say \"hi\"`, luceneEscape(`say "hi"`))
}
