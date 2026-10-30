package resolvers_test

import (
	"context"
	"encoding/json"
	"net/http/httptest"
	"testing"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubTrending struct {
	page   *portservices.TrendingPage
	err    error
	region string
}

func (s *stubTrending) GetTrending(ctx context.Context, regionCode, pageToken string) (*portservices.TrendingPage, error) {
	s.region = regionCode
	return s.page, s.err
}

func setupTrendingServer(trending *stubTrending) *httptest.Server {
	repo := &mockContentRepository{}
	contentService := services.NewContentService(repo, &mockYouTubeClient{}, nil, services.WithYouTubeTrending(trending))
	userService := services.NewUserService(&mockUserRepository{}, repo, &mockPerspectiveRepository{}, nil, nil, nil)
	perspectiveService := services.NewPerspectiveService(&mockPerspectiveRepository{}, &mockUserRepository{})
	categoryService := services.NewCategoryService(&mockCategoryRepository{}, repo, &mockWikidataClient{})
	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService, nil, nil, nil, nil)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{
		Resolvers:  resolver,
		Directives: generated.DirectiveRoot{Auth: directiveRoot.Auth, Owner: directiveRoot.Owner},
	}))
	return httptest.NewServer(srv) // no auth middleware: the query is public
}

func TestYoutubeTrending_MapsPageAndDefaultsRegion(t *testing.T) {
	trending := &stubTrending{page: &portservices.TrendingPage{
		Items: []portservices.TrendingVideo{{
			ID: "vid1", Title: "First", ChannelTitle: "Chan", Description: "d",
			PublishedAt: "2026-09-26T12:00:00Z", ThumbnailURL: "https://i.ytimg.com/vi/vid1/mqdefault.jpg", Duration: "PT4M13S",
		}},
		NextPageToken: "CBkQAA",
	}}
	server := setupTrendingServer(trending)
	defer server.Close()

	resp := executeGraphQL(t, server, `{ youtubeTrending { items { id title channelTitle description publishedAt thumbnailUrl duration } nextPageToken } }`)
	require.Empty(t, resp.Errors)

	var data struct {
		YoutubeTrending struct {
			Items []struct {
				ID, Title, ChannelTitle, Description, PublishedAt, ThumbnailURL, Duration string
			}
			NextPageToken *string
		}
	}
	require.NoError(t, json.Unmarshal(resp.Data, &data))
	assert.Equal(t, "US", trending.region, "regionCode defaults to US")
	require.Len(t, data.YoutubeTrending.Items, 1)
	item := data.YoutubeTrending.Items[0]
	assert.Equal(t, "vid1", item.ID)
	assert.Equal(t, "https://i.ytimg.com/vi/vid1/mqdefault.jpg", item.ThumbnailURL)
	assert.Equal(t, "PT4M13S", item.Duration)
	require.NotNil(t, data.YoutubeTrending.NextPageToken)
	assert.Equal(t, "CBkQAA", *data.YoutubeTrending.NextPageToken)
}

func TestYoutubeTrending_LastPageHasNullToken(t *testing.T) {
	server := setupTrendingServer(&stubTrending{page: &portservices.TrendingPage{}})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ youtubeTrending(regionCode: "gb") { items { id } nextPageToken } }`)
	require.Empty(t, resp.Errors)
	assert.JSONEq(t, `{"youtubeTrending": {"items": [], "nextPageToken": null}}`, string(resp.Data))
}

func TestYoutubeTrending_InvalidRegionIsAClientError(t *testing.T) {
	server := setupTrendingServer(&stubTrending{page: &portservices.TrendingPage{}})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ youtubeTrending(regionCode: "USA") { items { id } } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Contains(t, resp.Errors[0].Message, "two-letter")
}

func TestYoutubeTrending_UpstreamFailureIsGeneric(t *testing.T) {
	server := setupTrendingServer(&stubTrending{err: assert.AnError})
	defer server.Close()

	resp := executeGraphQL(t, server, `{ youtubeTrending { items { id } } }`)
	require.NotEmpty(t, resp.Errors)
	assert.Equal(t, "trending is unavailable right now", resp.Errors[0].Message)
}
