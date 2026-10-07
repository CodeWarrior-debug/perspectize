package resolvers_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// The test server's session user is ID 1 (injectAuthMiddleware).

func claimRow(id, owner int, privacy domain.Privacy) *domain.Content {
	return &domain.Content{
		ID: id, Name: "A private claim", ContentType: domain.ContentTypeClaim,
		AddedByUserID: owner, Privacy: privacy,
	}
}

func TestContentByID_PrivateVisibleToOwner(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return claimRow(id, 1, domain.PrivacyPrivate), nil
		},
	}
	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "5") { id privacy } }`)
	require.Empty(t, result.Errors)
	var data struct {
		ContentByID *struct {
			ID      string `json:"id"`
			Privacy string `json:"privacy"`
		} `json:"contentByID"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	require.NotNil(t, data.ContentByID)
	assert.Equal(t, "PRIVATE", data.ContentByID.Privacy)
}

func TestContentByID_PrivateHiddenFromOthers(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return claimRow(id, 2, domain.PrivacyPrivate), nil
		},
	}
	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "5") { id name } }`)
	require.Empty(t, result.Errors)
	assert.JSONEq(t, `{"contentByID": null}`, string(result.Data))
}

// The id/aggregates-only fast path skips reading the content row; the
// aggregate query carries privacy + owner so it still hides private rows.
func TestContentByID_AggregatesOnly_PrivateHiddenFromOthers(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{
		aggregateFn: func(ctx context.Context, ids []int) (map[int]*domain.PerspectiveAggregate, error) {
			return map[int]*domain.PerspectiveAggregate{
				5: {ContentID: 5, Count: 3, ContentPrivacy: domain.PrivacyPrivate, ContentOwnerID: 2},
			}, nil
		},
	}
	server := setupTestServerWithRepos(&mockContentRepository{}, &mockYouTubeClient{}, perspectiveRepo, &mockUserRepository{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "5") { id perspectiveCount } }`)
	require.Empty(t, result.Errors)
	assert.JSONEq(t, `{"contentByID": null}`, string(result.Data))
}

func TestContentByID_AggregatesOnly_PrivateVisibleToOwner(t *testing.T) {
	perspectiveRepo := &mockPerspectiveRepository{
		aggregateFn: func(ctx context.Context, ids []int) (map[int]*domain.PerspectiveAggregate, error) {
			return map[int]*domain.PerspectiveAggregate{
				5: {ContentID: 5, Count: 3, ContentPrivacy: domain.PrivacyPrivate, ContentOwnerID: 1},
			}, nil
		},
	}
	server := setupTestServerWithRepos(&mockContentRepository{}, &mockYouTubeClient{}, perspectiveRepo, &mockUserRepository{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "5") { id perspectiveCount } }`)
	require.Empty(t, result.Errors)
	assert.JSONEq(t, `{"contentByID": {"id": "5", "perspectiveCount": 3}}`, string(result.Data))
}

func TestContentByID_UnsetPrivacyReadsAsPublic(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return claimRow(id, 2, ""), nil
		},
	}
	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "5") { privacy } }`)
	require.Empty(t, result.Errors)
	assert.JSONEq(t, `{"contentByID": {"privacy": "PUBLIC"}}`, string(result.Data))
}

func TestContentList_PassesViewerID(t *testing.T) {
	var got domain.ContentListParams
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			got = params
			return &domain.PaginatedContent{}, nil
		},
	}
	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content { items { id } } }`)
	require.Empty(t, result.Errors)
	require.NotNil(t, got.ViewerID)
	assert.Equal(t, 1, *got.ViewerID)
}

func TestCreateClaim_DerivesOwnerAndIsPrivate(t *testing.T) {
	var saved *domain.Content
	repo := &mockContentRepository{
		createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
			c.ID = 9
			saved = c
			return c, nil
		},
	}
	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createClaim(input: { text: "Water is wet", userID: 0 }) { id contentType privacy } }`)
	require.Empty(t, result.Errors)
	assert.JSONEq(t, `{"createClaim": {"id": "9", "contentType": "CLAIM", "privacy": "PRIVATE"}}`, string(result.Data))
	require.NotNil(t, saved)
	assert.Equal(t, 1, saved.AddedByUserID)
}

func TestCreateClaim_RejectsOtherUserID(t *testing.T) {
	server := setupTestServer(&mockContentRepository{}, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createClaim(input: { text: "Water is wet", userID: 5 }) { id } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "cannot create content for another user")
}
