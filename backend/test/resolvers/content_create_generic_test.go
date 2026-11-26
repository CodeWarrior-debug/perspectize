package resolvers_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

const createContentOperation = `mutation($input: CreateContentInput!) { createContent(input: $input) { alreadyExisted content { name } } }`

// duplicateCreateRepo makes every URL and every upsert resolve to one saved row,
// so each variant takes its duplicate path and returns that row with alreadyExisted.
// The duplicate path needs no upstream client, so the variant tests stay offline.
func duplicateCreateRepo() *mockContentRepository {
	existing := &domain.Content{ID: 7, Name: "Existing", ContentType: domain.ContentTypeMovie}
	return &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			return existing, nil
		},
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
			return existing, true, nil
		},
	}
}

// executeGraphQLVars sends an operation with variables. executeGraphQL cannot
// send variables, and variables are the path that skips gqlparser's one-field check.
func executeGraphQLVars(t *testing.T, server *httptest.Server, query string, vars map[string]any) graphqlResponse {
	t.Helper()

	payload, err := json.Marshal(map[string]any{"query": query, "variables": vars})
	require.NoError(t, err)
	req, err := http.NewRequest(http.MethodPost, server.URL, strings.NewReader(string(payload)))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	var result graphqlResponse
	require.NoError(t, json.NewDecoder(resp.Body).Decode(&result))
	return result
}

// Each CreateContentInput field routes to its own content type. The duplicate
// fixture proves the route: a variant that dispatched elsewhere would not return
// the saved row.
func TestCreateContent_EachVariantRoutesToItsType(t *testing.T) {
	cases := []struct {
		name   string
		input  map[string]any
		server func(repo *mockContentRepository) *httptest.Server
	}{
		{
			name:  "youtube",
			input: map[string]any{"youtube": map[string]any{"url": "https://www.youtube.com/watch?v=abc123", "userId": 1}},
			server: func(repo *mockContentRepository) *httptest.Server {
				return setupTestServer(repo, &mockYouTubeClient{})
			},
		},
		{
			name:  "webPage",
			input: map[string]any{"webPage": map[string]any{"url": "https://example.com/post"}},
			server: func(repo *mockContentRepository) *httptest.Server {
				return setupWebPageServer(repo, stubWebPageClient{})
			},
		},
		{
			name:  "website",
			input: map[string]any{"website": map[string]any{"url": "https://example.com/about"}},
			server: func(repo *mockContentRepository) *httptest.Server {
				return setupWebPageServer(repo, stubWebPageClient{})
			},
		},
		{
			name:  "movie",
			input: map[string]any{"movie": map[string]any{"url": "https://www.themoviedb.org/movie/603"}},
			server: func(repo *mockContentRepository) *httptest.Server {
				return setupMovieServer(repo, stubMovieClient{})
			},
		},
		{
			name:  "book",
			input: map[string]any{"book": map[string]any{"url": "https://openlibrary.org/works/OL23166W"}},
			server: func(repo *mockContentRepository) *httptest.Server {
				return setupBookServer(repo, stubBookSearchClient{}, nil)
			},
		},
		{
			name:  "passage",
			input: map[string]any{"passage": map[string]any{"bookID": 1, "startChapter": 1, "startVerse": 1, "endChapter": 1, "endVerse": 3, "userID": 1}},
			server: func(repo *mockContentRepository) *httptest.Server {
				return setupPassageTestServer(repo, domain.UserRoleDefault)
			},
		},
	}

	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			server := tc.server(duplicateCreateRepo())
			defer server.Close()

			result := executeGraphQLVars(t, server, createContentOperation, map[string]any{"input": tc.input})
			require.Empty(t, result.Errors)
			var data struct {
				CreateContent struct {
					AlreadyExisted bool `json:"alreadyExisted"`
					Content        struct {
						Name string `json:"name"`
					} `json:"content"`
				} `json:"createContent"`
			}
			require.NoError(t, json.Unmarshal(result.Data, &data))
			assert.True(t, data.CreateContent.AlreadyExisted)
			assert.Equal(t, "Existing", data.CreateContent.Content.Name)
		})
	}
}

// A CreateContentInput with no field set is refused with INVALID_INPUT.
func TestCreateContent_ZeroFieldsRejected(t *testing.T) {
	server := setupMovieServer(duplicateCreateRepo(), stubMovieClient{})
	defer server.Close()

	result := executeGraphQLVars(t, server, createContentOperation, map[string]any{"input": map[string]any{}})
	require.Len(t, result.Errors, 1)
	assert.Equal(t, "INVALID_INPUT", result.Errors[0].Extensions["code"])
	assert.Contains(t, result.Errors[0].Message, "got 0")
}

// A CreateContentInput with two fields set is refused with INVALID_INPUT.
func TestCreateContent_TwoFieldsRejected(t *testing.T) {
	server := setupMovieServer(duplicateCreateRepo(), stubMovieClient{})
	defer server.Close()

	input := map[string]any{
		"movie": map[string]any{"url": "https://www.themoviedb.org/movie/603"},
		"book":  map[string]any{"url": "https://openlibrary.org/works/OL45804W"},
	}
	result := executeGraphQLVars(t, server, createContentOperation, map[string]any{"input": input})
	require.Len(t, result.Errors, 1)
	assert.Equal(t, "INVALID_INPUT", result.Errors[0].Extensions["code"])
	assert.Contains(t, result.Errors[0].Message, "got 2")
}
