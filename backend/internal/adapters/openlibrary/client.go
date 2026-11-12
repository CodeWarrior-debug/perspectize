// Package openlibrary is the Open Library adapter for the BookSearchClient
// and BookTrendingClient ports. No API key or auth header is required.
package openlibrary

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// ErrOpenLibraryAPI is returned for any non-404 upstream failure. It never
// carries the upstream URL or body.
var ErrOpenLibraryAPI = errors.New("open library API error")

// maxResponseBytes caps how much of an upstream body is read.
const maxResponseBytes = 5 << 20

// Fields is the exact `fields=` filter requested on every search.json and
// trending.json call, shared with tests so they assert against the same value.
const Fields = "key,title,author_name,author_key,cover_i,first_publish_year,number_of_pages_median,subject,ratings_average,ratings_count,edition_count"

// searchLimit is how many results are requested per page.
const searchLimit = 25

// Client implements services.BookSearchClient and services.BookTrendingClient
// against the Open Library API.
type Client struct {
	httpClient *http.Client
	baseURL    string
}

var (
	_ services.BookSearchClient   = (*Client)(nil)
	_ services.BookTrendingClient = (*Client)(nil)
	_ services.BookISBNClient     = (*Client)(nil)
)

// NewClient creates an Open Library client. No API key is needed.
func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{Timeout: 10 * time.Second, Transport: otelhttp.NewTransport(http.DefaultTransport)},
		baseURL:    "https://openlibrary.org",
	}
}

// get performs a GET and returns the body on 200. Errors are sanitized: no
// URL, no upstream body.
func (c *Client) get(ctx context.Context, path string, query url.Values) ([]byte, error) {
	endpoint := c.baseURL + path
	if len(query) > 0 {
		endpoint += "?" + query.Encode()
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, fmt.Errorf("%w: failed to create request", ErrOpenLibraryAPI)
	}
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			// Preserve cancellation/deadline for callers; never include err (embeds the URL).
			return nil, fmt.Errorf("%w: request aborted: %w", ErrOpenLibraryAPI, ctxErr)
		}
		// *url.Error embeds the full URL; log/return only the cause class, never err itself.
		slog.Error("open library request failed", "path", path, "timeout", isTimeout(err))
		return nil, fmt.Errorf("%w: request failed", ErrOpenLibraryAPI)
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return nil, fmt.Errorf("%w: not found", domain.ErrNotFound)
	}
	if resp.StatusCode != http.StatusOK {
		slog.Error("open library returned error", "status", resp.StatusCode, "path", path)
		return nil, fmt.Errorf("%w: status %d", ErrOpenLibraryAPI, resp.StatusCode)
	}

	body, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes+1))
	if err != nil {
		if ctxErr := ctx.Err(); ctxErr != nil {
			return nil, fmt.Errorf("%w: request aborted: %w", ErrOpenLibraryAPI, ctxErr)
		}
		return nil, fmt.Errorf("%w: failed to read response body", ErrOpenLibraryAPI)
	}
	if len(body) > maxResponseBytes {
		slog.Error("open library response too large", "path", path)
		return nil, fmt.Errorf("%w: response too large", ErrOpenLibraryAPI)
	}
	return body, nil
}

func isTimeout(err error) bool {
	var ne interface{ Timeout() bool }
	return errors.As(err, &ne) && ne.Timeout()
}

// olWork is one work entry, shared between search.json's docs[] and
// trending.json's works[] (same field shapes).
type olWork struct {
	Key                 string   `json:"key"`
	Title               string   `json:"title"`
	AuthorName          []string `json:"author_name"`
	AuthorKey           []string `json:"author_key"`
	CoverI              *int     `json:"cover_i"`
	FirstPublishYear    *int     `json:"first_publish_year"`
	NumberOfPagesMedian *int     `json:"number_of_pages_median"`
	Subject             []string `json:"subject"`
	RatingsAverage      *float64 `json:"ratings_average"`
	RatingsCount        *int     `json:"ratings_count"`
	EditionCount        *int     `json:"edition_count"`
}

// worksPrefix is stripped from a work's "key" field (e.g. "/works/OL23166W").
const worksPrefix = "/works/"

func (w olWork) toSearchResult() services.BookSearchResult {
	key := w.Key
	if len(key) > len(worksPrefix) && key[:len(worksPrefix)] == worksPrefix {
		key = key[len(worksPrefix):]
	}
	return services.BookSearchResult{
		WorkKey:          key,
		Title:            w.Title,
		AuthorName:       w.AuthorName,
		AuthorKey:        w.AuthorKey,
		CoverID:          w.CoverI,
		FirstPublishYear: w.FirstPublishYear,
		PageCountMedian:  w.NumberOfPagesMedian,
		Subjects:         w.Subject,
		RatingsAverage:   w.RatingsAverage,
		RatingsCount:     w.RatingsCount,
		EditionCount:     w.EditionCount,
	}
}

// SearchBooks runs an Open Library work search.
func (c *Client) SearchBooks(ctx context.Context, query string, page int) (*services.BookSearchPage, error) {
	q := url.Values{}
	q.Set("q", query)
	q.Set("limit", strconv.Itoa(searchLimit))
	q.Set("page", strconv.Itoa(page))
	q.Set("fields", Fields)
	body, err := c.get(ctx, "/search.json", q)
	if err != nil {
		return nil, err
	}
	return parseSearch(body, page)
}

// parseSearch shapes a raw search.json payload. Open Library's search.json
// does not return a page/total_pages field like TMDB; TotalResults comes
// from numFound and TotalPages is derived from the requested page size.
func parseSearch(raw []byte, page int) (*services.BookSearchPage, error) {
	var body struct {
		NumFound int      `json:"numFound"`
		Docs     []olWork `json:"docs"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		// Deliberately not wrapping err: decoder errors can echo upstream content.
		return nil, fmt.Errorf("%w: failed to parse search response", ErrOpenLibraryAPI)
	}
	items := make([]services.BookSearchResult, 0, len(body.Docs))
	for _, d := range body.Docs {
		items = append(items, d.toSearchResult())
	}
	totalPages := 0
	if body.NumFound > 0 {
		totalPages = (body.NumFound + searchLimit - 1) / searchLimit
	}
	return &services.BookSearchPage{
		Items:        items,
		Page:         page,
		TotalPages:   totalPages,
		TotalResults: body.NumFound,
	}, nil
}

// trendingPath maps a domain.TrendingWindow to Open Library's trending path
// segment. Anything other than DAY or WEEK is rejected before it can shape
// the URL.
func trendingPath(window domain.TrendingWindow) (string, error) {
	switch window {
	case domain.TrendingWindowDay:
		return "daily", nil
	case domain.TrendingWindowWeek:
		return "weekly", nil
	default:
		return "", fmt.Errorf("%w: unknown trending window", domain.ErrInvalidInput)
	}
}

// TrendingBooks fetches Open Library's trending works for a day or week
// window.
//
// Open Library's trending.json has no total/numFound field at all (unlike
// search.json or TMDB's trending endpoint), so TotalPages/TotalResults are
// always 0 here: upstream gives no basis to compute them.
func (c *Client) TrendingBooks(ctx context.Context, window domain.TrendingWindow, page int) (*services.BookSearchPage, error) {
	seg, err := trendingPath(window)
	if err != nil {
		return nil, err
	}
	q := url.Values{}
	q.Set("limit", strconv.Itoa(searchLimit))
	q.Set("page", strconv.Itoa(page))
	q.Set("fields", Fields)
	body, err := c.get(ctx, "/trending/"+seg+".json", q)
	if err != nil {
		return nil, err
	}
	return parseTrending(body, page)
}

// ResolveISBN looks up the edition for an ISBN and returns the bare work key
// it belongs to. Open Library's /isbn/{isbn}.json 302s to the edition
// record; http.Client follows that redirect by default (NewClient never sets
// CheckRedirect), so get() already returns the edition body.
func (c *Client) ResolveISBN(ctx context.Context, isbn string) (string, error) {
	body, err := c.get(ctx, "/isbn/"+url.PathEscape(isbn)+".json", nil)
	if err != nil {
		return "", err
	}
	var edition struct {
		Works []struct {
			Key string `json:"key"`
		} `json:"works"`
	}
	if err := json.Unmarshal(body, &edition); err != nil {
		// Deliberately not wrapping err: decoder errors can echo upstream content.
		return "", fmt.Errorf("%w: failed to parse isbn response", ErrOpenLibraryAPI)
	}
	if len(edition.Works) == 0 {
		return "", fmt.Errorf("%w: edition has no work reference", ErrOpenLibraryAPI)
	}
	key := edition.Works[0].Key
	if len(key) > len(worksPrefix) && key[:len(worksPrefix)] == worksPrefix {
		key = key[len(worksPrefix):]
	}
	return key, nil
}

func parseTrending(raw []byte, page int) (*services.BookSearchPage, error) {
	var body struct {
		Works []olWork `json:"works"`
	}
	if err := json.Unmarshal(raw, &body); err != nil {
		// Deliberately not wrapping err: decoder errors can echo upstream content.
		return nil, fmt.Errorf("%w: failed to parse trending response", ErrOpenLibraryAPI)
	}
	items := make([]services.BookSearchResult, 0, len(body.Works))
	for _, w := range body.Works {
		items = append(items, w.toSearchResult())
	}
	return &services.BookSearchPage{
		Items: items,
		Page:  page,
	}, nil
}
