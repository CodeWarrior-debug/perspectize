package lrclib

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

// search_bohemian.json is a real LRCLIB response (captured 2026-09-27), trimmed to
// six entries with the lyrics text swapped for placeholders.
func server(t *testing.T, body []byte) *Client {
	t.Helper()
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		assert.Equal(t, "/search", r.URL.Path)
		assert.Equal(t, "Bohemian Rhapsody", r.URL.Query().Get("track_name"))
		assert.Equal(t, "Queen", r.URL.Query().Get("artist_name"))
		assert.Contains(t, r.Header.Get("User-Agent"), "Perspectize/")
		_, _ = w.Write(body)
	}))
	t.Cleanup(srv.Close)
	c := NewClient()
	c.baseURL = srv.URL
	return c
}

func fixture(t *testing.T) []byte {
	b, err := os.ReadFile("testdata/search_bohemian.json")
	require.NoError(t, err)
	return b
}

func TestCheck(t *testing.T) {
	tests := []struct {
		name      string
		duration  int
		available bool
		id        int
	}{
		// Entries at 351, 354, 358, 359s; 354 is closest to 355.
		{"closest duration within ±3s", 355, true, 36978827},
		{"exact duration", 358, true, 37482678},
		{"nothing within ±3s", 300, false, 0},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m, err := server(t, fixture(t)).Check(context.Background(), "Queen", "Bohemian Rhapsody", tt.duration)
			require.NoError(t, err)
			assert.Equal(t, tt.available, m.Available)
			assert.Equal(t, tt.id, m.LRCLibID)
			if tt.available {
				assert.True(t, m.HasSynced)
			}
		})
	}
}

func TestCheck_NoLyricsTextLeaves(t *testing.T) {
	m, err := server(t, fixture(t)).Check(context.Background(), "Queen", "Bohemian Rhapsody", 355)
	require.NoError(t, err)
	out, err := json.Marshal(m)
	require.NoError(t, err)
	assert.NotContains(t, string(out), "PLACEHOLDER")
}

func TestCheck_SkipsInstrumentalAndEmpty(t *testing.T) {
	body := []byte(`[
		{"id":1,"trackName":"Bohemian Rhapsody","artistName":"Queen","duration":355,"instrumental":true,"plainLyrics":null,"syncedLyrics":null},
		{"id":2,"trackName":"Bohemian Rhapsody","artistName":"Queen","duration":355,"instrumental":false,"plainLyrics":"  ","syncedLyrics":null},
		{"id":3,"trackName":"Bohemian Rhapsody","artistName":"Bohemian Rhapsody - Queen","duration":355,"instrumental":false,"plainLyrics":"x","syncedLyrics":null}
	]`)
	m, err := server(t, body).Check(context.Background(), "Queen", "Bohemian Rhapsody", 355)
	require.NoError(t, err)
	assert.False(t, m.Available, "instrumental, blank, and mismatched-artist entries must not count")
}

func TestCheck_PrefersSyncedWhenClose(t *testing.T) {
	body := []byte(`[
		{"id":1,"trackName":"Bohemian Rhapsody","artistName":"Queen","duration":355,"instrumental":false,"plainLyrics":"x","syncedLyrics":null},
		{"id":2,"trackName":"Bohemian Rhapsody","artistName":"Queen","duration":355.2,"instrumental":false,"plainLyrics":"x","syncedLyrics":"[00:00.00] x"}
	]`)
	m, err := server(t, body).Check(context.Background(), "Queen", "Bohemian Rhapsody", 355)
	require.NoError(t, err)
	assert.Equal(t, 2, m.LRCLibID)
	assert.True(t, m.HasSynced)
}

func TestCheck_ServerError(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { w.WriteHeader(http.StatusBadGateway) }))
	defer srv.Close()
	c := NewClient()
	c.baseURL = srv.URL
	_, err := c.Check(context.Background(), "Queen", "Bohemian Rhapsody", 355)
	assert.Error(t, err)
}
