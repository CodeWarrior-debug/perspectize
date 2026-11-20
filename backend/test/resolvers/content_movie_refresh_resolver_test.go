package resolvers_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// A movie refreshed into a disallowed payload (NC-17 or adult) reports the same
// CONTENT_NOT_ALLOWED error as the create path, and nothing is written.
func TestUpdateContentSourceData_MovieNowNC17MapsToContentNotAllowed(t *testing.T) {
	url := "https://www.themoviedb.org/movie/603"
	existing := &domain.Content{ID: 5, Name: "Old", URL: &url, ContentType: domain.ContentTypeMovie, AddedByUserID: 1}
	writes := 0
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return existing, nil
		},
		updateMetadataFn: func(ctx context.Context, id int, name string, response json.RawMessage, length *int, lengthUnits *string, lengthDisplay *domain.LengthDisplay) (*domain.Content, error) {
			writes++
			return nil, nil
		},
	}
	mc := stubMovieClient{get: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return &portservices.MovieMetadata{TMDBID: 603, Title: "Now NC-17", Response: json.RawMessage(`{"certification":"NC-17"}`)}, nil
	}}
	server := setupMovieServer(repo, mc)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { updateContentSourceData(contentId: 5) { id } }`)
	require.Len(t, result.Errors, 1)
	assert.Equal(t, domain.ErrContentNotAllowed.Error(), result.Errors[0].Message)
	assert.Equal(t, "CONTENT_NOT_ALLOWED", result.Errors[0].Extensions["code"])
	assert.Equal(t, 0, writes, "a disallowed refresh must not write")
}
