package resolvers_test

import (
	"context"
	"encoding/json"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- userDomainToModel Tests ---
// Note: userDomainToModel is unexported, so it's tested indirectly via integration tests

func TestUserDomainToModel(t *testing.T) {
	t.Skip("userDomainToModel is unexported - tested via integration tests")
}

// --- domainToModel Tests ---

func TestDomainToModel_BasicFields(t *testing.T) {
	t.Skip("domainToModel is unexported - tested via integration tests")
}

func TestDomainToModel_WithResponse(t *testing.T) {
	t.Skip("domainToModel is unexported - tested via integration tests")
}

func TestDomainToModel_WithInvalidJSON(t *testing.T) {
	t.Skip("domainToModel is unexported - tested via integration tests")
}

func TestDomainToModel_WithStatistics(t *testing.T) {
	t.Skip("domainToModel is unexported - tested via integration tests")
}

// --- perspectiveDomainToModel Tests ---

func TestPerspectiveDomainToModel_BasicFields(t *testing.T) {
	t.Skip("perspectiveDomainToModel is unexported - tested via integration tests")
}

func TestPerspectiveDomainToModel_WithOptionalFields(t *testing.T) {
	t.Skip("perspectiveDomainToModel is unexported - tested via integration tests")
}

func TestPerspectiveDomainToModel_WithCategorizedRatings(t *testing.T) {
	t.Skip("perspectiveDomainToModel is unexported - tested via integration tests")
}

// --- Integration Tests for Helpers (via ContentByID resolver) ---

func TestContentByID_ResponseParsing(t *testing.T) {
	url := "https://youtube.com/watch?v=test123"

	// Test with valid YouTube statistics in Response
	responseJSON := json.RawMessage(`{
		"items": [{
			"statistics": {
				"viewCount": "1000000",
				"likeCount": "50000",
				"commentCount": "1500"
			}
		}]
	}`)

	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{
				ID:          1,
				Name:        "Test Video",
				URL:         &url,
				ContentType: domain.ContentTypeYouTubeVideo,
				Response:    responseJSON,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "1") { id name viewCount likeCount commentCount } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		ContentByID struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			ViewCount    *int   `json:"viewCount"`
			LikeCount    *int   `json:"likeCount"`
			CommentCount *int   `json:"commentCount"`
		} `json:"contentByID"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Equal(t, "1", data.ContentByID.ID)
	assert.Equal(t, "Test Video", data.ContentByID.Name)
	require.NotNil(t, data.ContentByID.ViewCount)
	assert.Equal(t, 1000000, *data.ContentByID.ViewCount)
	require.NotNil(t, data.ContentByID.LikeCount)
	assert.Equal(t, 50000, *data.ContentByID.LikeCount)
	require.NotNil(t, data.ContentByID.CommentCount)
	assert.Equal(t, 1500, *data.ContentByID.CommentCount)
}

func TestContentByID_InvalidStatistics(t *testing.T) {
	url := "https://youtube.com/watch?v=test123"

	// Test with invalid statistics (non-numeric strings)
	responseJSON := json.RawMessage(`{
		"items": [{
			"statistics": {
				"viewCount": "not-a-number",
				"likeCount": "50000",
				"commentCount": "1500"
			}
		}]
	}`)

	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{
				ID:          1,
				Name:        "Test Video",
				URL:         &url,
				ContentType: domain.ContentTypeYouTubeVideo,
				Response:    responseJSON,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "1") { id name viewCount likeCount commentCount } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		ContentByID struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			ViewCount    *int   `json:"viewCount"`
			LikeCount    *int   `json:"likeCount"`
			CommentCount *int   `json:"commentCount"`
		} `json:"contentByID"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	// ViewCount should be nil due to parse error, but others should succeed
	assert.Nil(t, data.ContentByID.ViewCount)
	require.NotNil(t, data.ContentByID.LikeCount)
	assert.Equal(t, 50000, *data.ContentByID.LikeCount)
	require.NotNil(t, data.ContentByID.CommentCount)
	assert.Equal(t, 1500, *data.ContentByID.CommentCount)
}

func TestContentByID_EmptyResponse(t *testing.T) {
	url := "https://youtube.com/watch?v=test123"

	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{
				ID:          1,
				Name:        "Test Video",
				URL:         &url,
				ContentType: domain.ContentTypeYouTubeVideo,
				Response:    nil, // No response
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "1") { id name viewCount likeCount commentCount response } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		ContentByID struct {
			ID           string         `json:"id"`
			Name         string         `json:"name"`
			ViewCount    *int           `json:"viewCount"`
			LikeCount    *int           `json:"likeCount"`
			CommentCount *int           `json:"commentCount"`
			Response     map[string]any `json:"response"`
		} `json:"contentByID"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Equal(t, "1", data.ContentByID.ID)
	assert.Nil(t, data.ContentByID.ViewCount)
	assert.Nil(t, data.ContentByID.LikeCount)
	assert.Nil(t, data.ContentByID.CommentCount)
	assert.Nil(t, data.ContentByID.Response)
}

func TestContentByID_InvalidResponseJSON(t *testing.T) {
	url := "https://youtube.com/watch?v=test123"

	// Invalid JSON
	responseJSON := json.RawMessage(`{invalid json}`)

	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{
				ID:          1,
				Name:        "Test Video",
				URL:         &url,
				ContentType: domain.ContentTypeYouTubeVideo,
				Response:    responseJSON,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "1") { id name response } }`)

	// Should not error on invalid JSON, just skip it
	assert.Empty(t, result.Errors)

	var data struct {
		ContentByID struct {
			ID       string         `json:"id"`
			Name     string         `json:"name"`
			Response map[string]any `json:"response"`
		} `json:"contentByID"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Equal(t, "1", data.ContentByID.ID)
	assert.Nil(t, data.ContentByID.Response) // Invalid JSON results in nil
}

func TestContentByID_NoStatisticsInResponse(t *testing.T) {
	url := "https://youtube.com/watch?v=test123"

	// Valid JSON but no statistics field
	responseJSON := json.RawMessage(`{
		"items": [{
			"snippet": {
				"title": "Some Title"
			}
		}]
	}`)

	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{
				ID:          1,
				Name:        "Test Video",
				URL:         &url,
				ContentType: domain.ContentTypeYouTubeVideo,
				Response:    responseJSON,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "1") { id name viewCount likeCount commentCount } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		ContentByID struct {
			ID           string `json:"id"`
			Name         string `json:"name"`
			ViewCount    *int   `json:"viewCount"`
			LikeCount    *int   `json:"likeCount"`
			CommentCount *int   `json:"commentCount"`
		} `json:"contentByID"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	// Empty stat strings default to 0
	require.NotNil(t, data.ContentByID.ViewCount)
	assert.Equal(t, 0, *data.ContentByID.ViewCount)
	require.NotNil(t, data.ContentByID.LikeCount)
	assert.Equal(t, 0, *data.ContentByID.LikeCount)
	require.NotNil(t, data.ContentByID.CommentCount)
	assert.Equal(t, 0, *data.ContentByID.CommentCount)
}

func TestContentByID_EmptyStatisticStrings(t *testing.T) {
	url := "https://youtube.com/watch?v=test123"

	// YouTube API sometimes returns empty strings for statistics
	responseJSON := json.RawMessage(`{
		"items": [{
			"statistics": {
				"viewCount": "",
				"likeCount": "",
				"commentCount": ""
			}
		}]
	}`)

	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{
				ID:          1,
				Name:        "Test Video",
				URL:         &url,
				ContentType: domain.ContentTypeYouTubeVideo,
				Response:    responseJSON,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "1") { id viewCount likeCount commentCount } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		ContentByID struct {
			ID           string `json:"id"`
			ViewCount    *int   `json:"viewCount"`
			LikeCount    *int   `json:"likeCount"`
			CommentCount *int   `json:"commentCount"`
		} `json:"contentByID"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	// Empty strings should default to 0, not cause parse errors
	require.NotNil(t, data.ContentByID.ViewCount)
	assert.Equal(t, 0, *data.ContentByID.ViewCount)
	require.NotNil(t, data.ContentByID.LikeCount)
	assert.Equal(t, 0, *data.ContentByID.LikeCount)
	require.NotNil(t, data.ContentByID.CommentCount)
	assert.Equal(t, 0, *data.ContentByID.CommentCount)
}

func TestContentByID_EmptyItemsArray(t *testing.T) {
	url := "https://youtube.com/watch?v=test123"

	// Valid JSON but empty items array
	responseJSON := json.RawMessage(`{"items": []}`)

	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{
				ID:          1,
				Name:        "Test Video",
				URL:         &url,
				ContentType: domain.ContentTypeYouTubeVideo,
				Response:    responseJSON,
				CreatedAt:   time.Now(),
				UpdatedAt:   time.Now(),
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "1") { id name viewCount likeCount commentCount response } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		ContentByID struct {
			ID           string         `json:"id"`
			Name         string         `json:"name"`
			ViewCount    *int           `json:"viewCount"`
			LikeCount    *int           `json:"likeCount"`
			CommentCount *int           `json:"commentCount"`
			Response     map[string]any `json:"response"`
		} `json:"contentByID"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	// Statistics should be nil when items array is empty
	assert.Nil(t, data.ContentByID.ViewCount)
	assert.Nil(t, data.ContentByID.LikeCount)
	assert.Nil(t, data.ContentByID.CommentCount)
	// Response map should still be populated
	require.NotNil(t, data.ContentByID.Response)
	items, ok := data.ContentByID.Response["items"].([]interface{})
	assert.True(t, ok)
	assert.Empty(t, items)
}
