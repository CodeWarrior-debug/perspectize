package wikidata

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestClient_Search(t *testing.T) {
	tests := []struct {
		name           string
		query          string
		language       string
		limit          int
		serverResponse string
		serverStatus   int
		wantResults    int
		wantErr        bool
		checkUserAgent bool
	}{
		{
			name:     "successful search returns results",
			query:    "Douglas Adams",
			language: "en",
			limit:    5,
			serverResponse: `{
				"search": [
					{"id": "Q42", "label": "Douglas Adams", "description": "English author and humourist"},
					{"id": "Q73", "label": "Douglas Adams Jr", "description": "fictional character"}
				]
			}`,
			serverStatus: http.StatusOK,
			wantResults:  2,
			wantErr:      false,
		},
		{
			name:           "empty search returns empty slice",
			query:          "xyznonexistent",
			language:       "en",
			limit:          10,
			serverResponse: `{"search": []}`,
			serverStatus:   http.StatusOK,
			wantResults:    0,
			wantErr:        false,
		},
		{
			name:           "HTTP error returns error",
			query:          "test",
			language:       "en",
			limit:          10,
			serverResponse: `{"error": "bad request"}`,
			serverStatus:   http.StatusBadRequest,
			wantResults:    0,
			wantErr:        true,
		},
		{
			name:     "defaults language to en when empty",
			query:    "Berlin",
			language: "",
			limit:    3,
			serverResponse: `{
				"search": [
					{"id": "Q64", "label": "Berlin", "description": "capital of Germany"}
				]
			}`,
			serverStatus: http.StatusOK,
			wantResults:  1,
			wantErr:      false,
		},
		{
			name:     "defaults limit to 10 when zero or negative",
			query:    "Paris",
			language: "en",
			limit:    0,
			serverResponse: `{
				"search": [
					{"id": "Q90", "label": "Paris", "description": "capital of France"}
				]
			}`,
			serverStatus: http.StatusOK,
			wantResults:  1,
			wantErr:      false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				// Verify User-Agent header is always set
				ua := r.Header.Get("User-Agent")
				assert.Equal(t, userAgent, ua, "User-Agent header must be set per Wikidata policy")

				// Verify Accept header
				accept := r.Header.Get("Accept")
				assert.Equal(t, "application/json", accept)

				// Verify query parameters
				assert.Equal(t, "wbsearchentities", r.URL.Query().Get("action"))
				assert.Equal(t, "json", r.URL.Query().Get("format"))
				assert.Equal(t, "item", r.URL.Query().Get("type"))

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tt.serverStatus)
				w.Write([]byte(tt.serverResponse))
			}))
			defer server.Close()

			client := NewClient()
			client.baseURL = server.URL

			results, err := client.Search(context.Background(), tt.query, tt.language, tt.limit)

			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Len(t, results, tt.wantResults)

			if tt.wantResults > 0 {
				// Verify first result has expected fields
				assert.NotEmpty(t, results[0].QID)
				assert.NotEmpty(t, results[0].Label)
				assert.Equal(t, "item", results[0].EntityType)
			}
		})
	}
}

func TestClient_Search_UserAgentHeader(t *testing.T) {
	var receivedUserAgent string
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		receivedUserAgent = r.Header.Get("User-Agent")
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"search": []}`))
	}))
	defer server.Close()

	client := NewClient()
	client.baseURL = server.URL

	_, err := client.Search(context.Background(), "test", "en", 5)
	require.NoError(t, err)

	assert.Equal(t, userAgent, receivedUserAgent, "User-Agent header must match Wikidata policy requirement")
	assert.Contains(t, receivedUserAgent, "Perspectize", "User-Agent should identify the application")
}

func TestClient_Search_RetryOn5xx(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		if attempts <= 2 {
			w.WriteHeader(http.StatusServiceUnavailable)
			w.Write([]byte(`{"error": "service unavailable"}`))
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"search": [{"id": "Q42", "label": "Douglas Adams", "description": "author"}]}`))
	}))
	defer server.Close()

	client := NewClient()
	client.baseURL = server.URL

	results, err := client.Search(context.Background(), "Douglas Adams", "en", 5)
	require.NoError(t, err)
	assert.Len(t, results, 1)
	assert.Equal(t, 3, attempts, "should have retried twice before succeeding")
}

func TestClient_Search_ExhaustsRetries(t *testing.T) {
	attempts := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		attempts++
		w.WriteHeader(http.StatusServiceUnavailable)
		w.Write([]byte(`{"error": "service unavailable"}`))
	}))
	defer server.Close()

	client := NewClient()
	client.baseURL = server.URL

	_, err := client.Search(context.Background(), "test", "en", 5)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed after")
	assert.Equal(t, maxRetries+1, attempts, "should have attempted initial + retries")
}

func TestClient_GetWikipediaURL(t *testing.T) {
	tests := []struct {
		name           string
		qid            string
		serverResponse string
		serverStatus   int
		wantURL        string
		wantErr        bool
	}{
		{
			name: "resolves enwiki sitelink to a URL",
			qid:  "Q42",
			serverResponse: `{
				"entities": {
					"Q42": {
						"sitelinks": {
							"enwiki": {"title": "Douglas Adams"}
						}
					}
				}
			}`,
			serverStatus: http.StatusOK,
			wantURL:      "https://en.wikipedia.org/wiki/Douglas_Adams",
		},
		{
			name: "no enwiki sitelink returns empty string, no error",
			qid:  "Q999999",
			serverResponse: `{
				"entities": {
					"Q999999": {
						"sitelinks": {}
					}
				}
			}`,
			serverStatus: http.StatusOK,
			wantURL:      "",
		},
		{
			name:           "entity missing entirely returns empty string, no error",
			qid:            "Q1",
			serverResponse: `{"entities": {}}`,
			serverStatus:   http.StatusOK,
			wantURL:        "",
		},
		{
			name:           "HTTP error returns error",
			qid:            "Q42",
			serverResponse: `{"error": "bad request"}`,
			serverStatus:   http.StatusBadRequest,
			wantErr:        true,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				assert.Equal(t, "wbgetentities", r.URL.Query().Get("action"))
				assert.Equal(t, "sitelinks", r.URL.Query().Get("props"))
				assert.Equal(t, "enwiki", r.URL.Query().Get("sitefilter"))
				assert.Equal(t, tt.qid, r.URL.Query().Get("ids"))

				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(tt.serverStatus)
				w.Write([]byte(tt.serverResponse))
			}))
			defer server.Close()

			client := NewClient()
			client.baseURL = server.URL

			got, err := client.GetWikipediaURL(context.Background(), tt.qid)

			if tt.wantErr {
				require.Error(t, err)
				return
			}

			require.NoError(t, err)
			assert.Equal(t, tt.wantURL, got)
		})
	}
}

func TestClient_GetWikipediaURL_EmptyQID(t *testing.T) {
	client := NewClient()
	_, err := client.GetWikipediaURL(context.Background(), "")
	require.Error(t, err)
}

func TestAPIError(t *testing.T) {
	err := &APIError{
		StatusCode: 429,
		Body:       "rate limited",
	}
	assert.Contains(t, err.Error(), "429")
	assert.Contains(t, err.Error(), "rate limited")
}

func TestIsRetryable(t *testing.T) {
	tests := []struct {
		name     string
		err      error
		expected bool
	}{
		{
			name:     "429 is retryable",
			err:      &APIError{StatusCode: 429},
			expected: true,
		},
		{
			name:     "500 is retryable",
			err:      &APIError{StatusCode: 500},
			expected: true,
		},
		{
			name:     "503 is retryable",
			err:      &APIError{StatusCode: 503},
			expected: true,
		},
		{
			name:     "400 is not retryable",
			err:      &APIError{StatusCode: 400},
			expected: false,
		},
		{
			name:     "non-APIError is not retryable",
			err:      assert.AnError,
			expected: false,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.expected, isRetryable(tt.err))
		})
	}
}
