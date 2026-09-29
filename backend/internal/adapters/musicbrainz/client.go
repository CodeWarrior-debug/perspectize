// Package musicbrainz resolves a track to its MusicBrainz recording and ISRC.
package musicbrainz

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

const (
	defaultBaseURL = "https://musicbrainz.org/ws/2"
	userAgent      = "Perspectize/1.0 (https://github.com/CodeWarrior-debug/perspectize)"
	durationSlack  = 3 * time.Second
	minScore       = 90
	// Search results never carry ISRCs; each candidate needs a lookup, so cap them.
	maxLookups = 3
)

// Client implements portservices.MusicBrainzClient. MusicBrainz allows one
// request per second per client; every request goes through wait().
type Client struct {
	httpClient *http.Client
	baseURL    string
	interval   time.Duration

	mu   sync.Mutex
	last time.Time
}

func NewClient() *Client {
	return &Client{httpClient: &http.Client{Timeout: 5 * time.Second}, baseURL: defaultBaseURL, interval: time.Second}
}

type searchResponse struct {
	Recordings []struct {
		ID               string `json:"id"`
		Score            int    `json:"score"`
		Length           int    `json:"length"`
		FirstReleaseDate string `json:"first-release-date"`
	} `json:"recordings"`
}

type lookupResponse struct {
	ID               string   `json:"id"`
	ISRCs            []string `json:"isrcs"`
	FirstReleaseDate string   `json:"first-release-date"`
	Genres           []struct {
		Name  string `json:"name"`
		Count int    `json:"count"`
	} `json:"genres"`
	Releases []struct {
		ID string `json:"id"`
	} `json:"releases"`
}

// FindRecording searches for artist + title within ±3s of durationSec and returns
// the first candidate (closest length first) that has an ISRC.
func (c *Client) FindRecording(ctx context.Context, artist, title string, durationSec int) (*portservices.Recording, error) {
	if artist == "" || title == "" || durationSec <= 0 {
		return nil, domain.ErrNotFound
	}
	target := time.Duration(durationSec) * time.Second
	q := fmt.Sprintf(`recording:"%s" AND artist:"%s" AND dur:[%d TO %d]`,
		luceneEscape(title), luceneEscape(artist),
		(target - durationSlack).Milliseconds(), (target + durationSlack).Milliseconds())

	var search searchResponse
	if err := c.get(ctx, "/recording?fmt=json&limit=10&query="+url.QueryEscape(q), &search); err != nil {
		return nil, err
	}

	cands := search.Recordings[:0]
	for _, r := range search.Recordings {
		if r.Score >= minScore && r.Length > 0 {
			cands = append(cands, r)
		}
	}
	targetMs := int(target.Milliseconds())
	sort.SliceStable(cands, func(i, j int) bool {
		return abs(cands[i].Length-targetMs) < abs(cands[j].Length-targetMs)
	})

	for i, cand := range cands {
		if i == maxLookups {
			break
		}
		var rec lookupResponse
		if err := c.get(ctx, "/recording/"+url.PathEscape(cand.ID)+"?fmt=json&inc=isrcs+genres+releases", &rec); err != nil {
			return nil, err
		}
		if len(rec.ISRCs) == 0 {
			continue
		}
		out := &portservices.Recording{MBID: rec.ID, ISRC: rec.ISRCs[0], ReleaseDate: rec.FirstReleaseDate, Genre: topGenre(rec)}
		if len(rec.Releases) > 0 {
			out.ReleaseMBID = rec.Releases[0].ID
			out.CoverImageURL = "https://coverartarchive.org/release/" + rec.Releases[0].ID + "/front-250"
		}
		return out, nil
	}
	return nil, domain.ErrNotFound
}

func (c *Client) get(ctx context.Context, path string, out any) error {
	if err := c.wait(ctx); err != nil {
		return err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+path, nil)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", userAgent)
	req.Header.Set("Accept", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("musicbrainz: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("musicbrainz: status %d", resp.StatusCode)
	}
	if err := json.NewDecoder(resp.Body).Decode(out); err != nil {
		return fmt.Errorf("musicbrainz: decode: %w", err)
	}
	return nil
}

// wait blocks until at least interval has passed since the previous request.
func (c *Client) wait(ctx context.Context) error {
	c.mu.Lock()
	next := c.last.Add(c.interval)
	now := time.Now()
	if next.Before(now) {
		next = now
	}
	c.last = next
	c.mu.Unlock()

	select {
	case <-time.After(time.Until(next)):
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func topGenre(r lookupResponse) string {
	best, bestCount := "", -1
	for _, g := range r.Genres {
		if g.Count > bestCount {
			best, bestCount = g.Name, g.Count
		}
	}
	return best
}

var luceneReplacer = strings.NewReplacer(`\`, `\\`, `"`, `\"`)

func luceneEscape(s string) string { return luceneReplacer.Replace(s) }

func abs(n int) int {
	if n < 0 {
		return -n
	}
	return n
}
