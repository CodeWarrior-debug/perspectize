// Package lrclib checks whether LRCLIB has lyrics for a track. Lyrics text is
// never decoded, so it cannot leave this package.
package lrclib

import (
	"context"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"net/url"
	"strings"
	"time"

	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

const (
	defaultBaseURL = "https://lrclib.net/api"
	userAgent      = "Perspectize/1.0 (https://github.com/CodeWarrior-debug/perspectize)"
	durationSlack  = 3.0
)

type Client struct {
	httpClient *http.Client
	baseURL    string
}

func NewClient() *Client {
	return &Client{httpClient: &http.Client{Timeout: 5 * time.Second}, baseURL: defaultBaseURL}
}

// entry has no lyrics fields on purpose; only their presence is read, via hasText.
type entry struct {
	ID           int      `json:"id"`
	TrackName    string   `json:"trackName"`
	ArtistName   string   `json:"artistName"`
	Duration     float64  `json:"duration"`
	Instrumental bool     `json:"instrumental"`
	PlainLyrics  *hasText `json:"plainLyrics"`
	SyncedLyrics *hasText `json:"syncedLyrics"`
}

// hasText records whether a JSON string was non-empty and discards the string.
type hasText bool

func (h *hasText) UnmarshalJSON(b []byte) error {
	var s *string
	if err := json.Unmarshal(b, &s); err != nil {
		return err
	}
	*h = hasText(s != nil && strings.TrimSpace(*s) != "")
	return nil
}

func (h *hasText) present() bool { return h != nil && bool(*h) }

// Check searches by title and artist and requires the duration to be within ±3s.
func (c *Client) Check(ctx context.Context, artist, title string, durationSec int) (*portservices.LyricsMatch, error) {
	q := url.Values{"track_name": {title}, "artist_name": {artist}}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/search?"+q.Encode(), nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", userAgent)
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("lrclib: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("lrclib: status %d", resp.StatusCode)
	}
	var entries []entry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return nil, fmt.Errorf("lrclib: decode: %w", err)
	}

	var best *entry
	bestScore := math.Inf(1)
	for i := range entries {
		e := &entries[i]
		if e.Instrumental || !e.PlainLyrics.present() || !sameText(e.TrackName, title) || !sameText(e.ArtistName, artist) {
			continue
		}
		diff := math.Abs(e.Duration - float64(durationSec))
		if diff > durationSlack {
			continue
		}
		score := diff
		if !e.SyncedLyrics.present() {
			score += 0.5 // prefer a synced copy when durations are close
		}
		if score < bestScore {
			best, bestScore = e, score
		}
	}
	if best == nil {
		return &portservices.LyricsMatch{Available: false}, nil
	}
	return &portservices.LyricsMatch{Available: true, LRCLibID: best.ID, HasSynced: best.SyncedLyrics.present()}, nil
}

func sameText(a, b string) bool {
	return strings.EqualFold(strings.TrimSpace(a), strings.TrimSpace(b))
}
