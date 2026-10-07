package tmdb

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"regexp"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// ErrTMDBAPI is returned for any non-404 upstream failure. It never carries the
// token or the upstream body.
var ErrTMDBAPI = errors.New("tmdb API error")

var imdbPathRe = regexp.MustCompile(`^tt\d+$`)

// Client implements services.MovieClient against the TMDB v3 API.
type Client struct {
	token      string
	httpClient *http.Client
	baseURL    string
}

var _ services.MovieClient = (*Client)(nil)

// NewClient creates a TMDB client authenticated with a v4 read-access bearer token.
func NewClient(token string) *Client {
	return &Client{
		token:      token,
		httpClient: &http.Client{Timeout: 10 * time.Second},
		baseURL:    "https://api.themoviedb.org/3",
	}
}

// get performs an authenticated GET and returns the body on 200.
// Errors are sanitized: no token, no URL, no upstream body.
func (c *Client) get(ctx context.Context, path string, query url.Values) ([]byte, error) {
	endpoint := c.baseURL + path
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: failed to create request", ErrTMDBAPI)
	}
	req.Header.Set("Authorization", "Bearer "+c.token)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		// *url.Error embeds the full URL; log/return only the cause class, never err itself.
		slog.Error("TMDB request failed", "path", path, "timeout", isTimeout(err))
		return nil, fmt.Errorf("%w: request failed", ErrTMDBAPI)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("%w: movie not found", domain.ErrNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		slog.Error("TMDB returned error", "status", resp.StatusCode, "path", path)
		return nil, fmt.Errorf("%w: status %d", ErrTMDBAPI, resp.StatusCode)
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("%w: failed to read response body", ErrTMDBAPI)
	}
	return body, nil
}

func isTimeout(err error) bool {
	var ne interface{ Timeout() bool }
	return errors.As(err, &ne) && ne.Timeout()
}

// GetMovie fetches a movie with credits, release dates, external ids and keywords, shaped for storage.
func (c *Client) GetMovie(ctx context.Context, tmdbID int) (*services.MovieMetadata, error) {
	q := url.Values{}
	q.Set("append_to_response", "credits,release_dates,external_ids,keywords")
	body, err := c.get(ctx, fmt.Sprintf("/movie/%d", tmdbID), q)
	if err != nil {
		return nil, err
	}
	meta, err := ShapeMovie(body)
	if err != nil {
		return nil, err
	}
	if meta.TMDBID == 0 {
		meta.TMDBID = tmdbID
	}
	return meta, nil
}

// FindMovieByIMDbID resolves an IMDb id to a TMDB movie id.
func (c *Client) FindMovieByIMDbID(ctx context.Context, imdbID string) (int, error) {
	if !imdbPathRe.MatchString(imdbID) {
		return 0, fmt.Errorf("%w: invalid IMDb id", ErrInvalidMovieInput)
	}
	q := url.Values{}
	q.Set("external_source", "imdb_id")
	body, err := c.get(ctx, "/find/"+imdbID, q)
	if err != nil {
		return 0, err
	}
	var res struct {
		MovieResults []struct {
			ID int `json:"id"`
		} `json:"movie_results"`
	}
	if err := json.Unmarshal(body, &res); err != nil {
		return 0, fmt.Errorf("%w: failed to parse find response", ErrTMDBAPI)
	}
	if len(res.MovieResults) == 0 {
		return 0, fmt.Errorf("%w: no movie for IMDb id %s", domain.ErrNotFound, imdbID)
	}
	return res.MovieResults[0].ID, nil
}
