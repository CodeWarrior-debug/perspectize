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

const movieResultMutation = `mutation { createContentResultFromMovie(input: { url: "https://www.themoviedb.org/movie/603" }) { alreadyExisted content { id name } } }`

// A duplicate movie reports alreadyExisted on the additive mutation and returns the stored row.
func TestCreateContentResultFromMovie_DuplicateReportsAlreadyExisted(t *testing.T) {
	existing := &domain.Content{ID: 7, Name: "The Matrix", ContentType: domain.ContentTypeMovie}
	repo := &mockContentRepository{getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
		return existing, nil
	}}
	mc := stubMovieClient{get: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		t.Fatal("must not fetch metadata for an existing movie")
		return nil, nil
	}}
	server := setupMovieServer(repo, mc)
	defer server.Close()

	result := executeGraphQL(t, server, movieResultMutation)
	require.Empty(t, result.Errors)
	var data struct {
		CreateContentResultFromMovie struct {
			AlreadyExisted bool `json:"alreadyExisted"`
			Content        struct {
				Name string `json:"name"`
			} `json:"content"`
		} `json:"createContentResultFromMovie"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	assert.True(t, data.CreateContentResultFromMovie.AlreadyExisted)
	assert.Equal(t, "The Matrix", data.CreateContentResultFromMovie.Content.Name)
}

// The deprecated mutation keeps returning the bare Content for a duplicate, as before.
func TestCreateContentFromMovie_DeprecatedDuplicateStillReturnsContent(t *testing.T) {
	existing := &domain.Content{ID: 7, Name: "The Matrix", ContentType: domain.ContentTypeMovie}
	repo := &mockContentRepository{getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
		return existing, nil
	}}
	mc := stubMovieClient{get: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return nil, nil
	}}
	server := setupMovieServer(repo, mc)
	defer server.Close()

	result := executeGraphQL(t, server, movieMutation)
	require.Empty(t, result.Errors)
	var data struct {
		CreateContentFromMovie struct {
			Name string `json:"name"`
		} `json:"createContentFromMovie"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	assert.Equal(t, "The Matrix", data.CreateContentFromMovie.Name)
}
