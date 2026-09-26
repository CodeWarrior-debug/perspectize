package wikidata

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
)

const (
	defaultBaseURL  = "https://www.wikidata.org/w/api.php"
	defaultLanguage = "en"
	defaultLimit    = 10
	maxRetries      = 2
	userAgent       = "Perspectize/1.0 (https://github.com/CodeWarrior-debug/perspectize)"
)

// searchResponse matches the Wikidata wbsearchentities JSON response shape
type searchResponse struct {
	Search []searchResult `json:"search"`
}

// searchResult represents a single entity from the wbsearchentities response.
// Uses flat label and description fields (not the display object).
type searchResult struct {
	ID          string `json:"id"`
	Label       string `json:"label"`
	Description string `json:"description"`
}

// Client is an HTTP client adapter for the Wikidata API.
// It implements the WikidataClient port interface.
type Client struct {
	httpClient *http.Client
	baseURL    string
	userAgent  string
}

// NewClient creates a new Wikidata API client with sensible defaults.
// No API key is needed — Wikidata is a free public API.
func NewClient() *Client {
	return &Client{
		httpClient: &http.Client{
			Timeout:   10 * time.Second,
			Transport: otelhttp.NewTransport(http.DefaultTransport),
		},
		baseURL:   defaultBaseURL,
		userAgent: userAgent,
	}
}

// Search queries the Wikidata Entity Search API (wbsearchentities).
// It returns matching entities as WikidataSearchResult slices.
// Includes simple retry logic for transient failures (HTTP 429, 5xx).
func (c *Client) Search(ctx context.Context, query, language string, limit int) ([]domain.WikidataSearchResult, error) {
	if language == "" {
		language = defaultLanguage
	}
	if limit <= 0 {
		limit = defaultLimit
	}

	params := url.Values{}
	params.Set("action", "wbsearchentities")
	params.Set("search", query)
	params.Set("language", language)
	params.Set("format", "json")
	params.Set("type", "item")
	params.Set("limit", strconv.Itoa(limit))

	reqURL := c.baseURL + "?" + params.Encode()

	var lastErr error
	for attempt := 0; attempt <= maxRetries; attempt++ {
		if attempt > 0 {
			// Exponential backoff: 1s, 2s
			backoff := time.Duration(attempt) * time.Second
			select {
			case <-ctx.Done():
				return nil, ctx.Err()
			case <-time.After(backoff):
			}
		}

		results, err := c.doSearch(ctx, reqURL)
		if err == nil {
			return results, nil
		}

		lastErr = err

		// Only retry on retryable errors
		if !isRetryable(err) {
			return nil, err
		}
	}

	return nil, fmt.Errorf("wikidata search failed after %d retries: %w", maxRetries, lastErr)
}

// doSearch performs a single HTTP request to the Wikidata API
func (c *Client) doSearch(ctx context.Context, reqURL string) ([]domain.WikidataSearchResult, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, reqURL, nil)
	if err != nil {
		return nil, fmt.Errorf("creating request: %w", err)
	}

	req.Header.Set("User-Agent", c.userAgent)
	req.Header.Set("Accept", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("executing request: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, &APIError{
			StatusCode: resp.StatusCode,
			Body:       string(body),
		}
	}

	var searchResp searchResponse
	if err := json.NewDecoder(resp.Body).Decode(&searchResp); err != nil {
		return nil, fmt.Errorf("decoding response: %w", err)
	}

	results := make([]domain.WikidataSearchResult, len(searchResp.Search))
	for i, r := range searchResp.Search {
		results[i] = domain.WikidataSearchResult{
			QID:         r.ID,
			Label:       r.Label,
			Description: r.Description,
			EntityType:  "item",
		}
	}

	return results, nil
}

// APIError represents an HTTP error from the Wikidata API
type APIError struct {
	StatusCode int
	Body       string
}

func (e *APIError) Error() string {
	return fmt.Sprintf("wikidata API error (status %d): %s", e.StatusCode, e.Body)
}

// isRetryable returns true for HTTP 429 (rate limit) and 5xx (server errors)
func isRetryable(err error) bool {
	apiErr, ok := err.(*APIError)
	if !ok {
		return false
	}
	return apiErr.StatusCode == http.StatusTooManyRequests || apiErr.StatusCode >= 500
}
