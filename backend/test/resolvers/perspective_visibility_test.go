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
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// setupPerspectiveVisibilityServer mirrors setupTestServerWithUserRepo but lets
// the caller supply the mockPerspectiveRepository (so getByIDFn / listFn can be
// controlled) and choose whether the auth-injecting middleware is wired in.
func setupPerspectiveVisibilityServer(perspectiveRepo *mockPerspectiveRepository, withAuth bool) *httptest.Server {
	userRepo := &mockUserRepository{}
	contentRepo := &mockContentRepository{}
	contentService := services.NewContentService(contentRepo, &mockYouTubeClient{})
	userService := services.NewUserService(userRepo, contentRepo, perspectiveRepo)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(&mockCategoryRepository{}, contentRepo, &mockWikidataClient{})
	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
	gqlConfig := generated.Config{
		Resolvers: resolver,
		Directives: generated.DirectiveRoot{
			Auth:  directiveRoot.Auth,
			Owner: directiveRoot.Owner,
		},
	}
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(gqlConfig))
	if withAuth {
		return httptest.NewServer(injectAuthMiddleware(srv))
	}
	return httptest.NewServer(srv)
}

func TestPerspectiveByID_Visibility(t *testing.T) {
	t.Run("owner sees their own private perspective", func(t *testing.T) {
		repo := &mockPerspectiveRepository{
			getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
				return &domain.Perspective{ID: 100, UserID: 1, Privacy: domain.PrivacyPrivate}, nil
			},
		}
		server := setupPerspectiveVisibilityServer(repo, true)
		defer server.Close()

		result := executeGraphQL(t, server, `{ perspectiveByID(id: "100") { id privacy } }`)
		assert.Empty(t, result.Errors)

		var data struct {
			PerspectiveByID *struct {
				ID      string `json:"id"`
				Privacy string `json:"privacy"`
			} `json:"perspectiveByID"`
		}
		require.NoError(t, json.Unmarshal(result.Data, &data))
		require.NotNil(t, data.PerspectiveByID)
		assert.Equal(t, "100", data.PerspectiveByID.ID)
	})

	t.Run("a different user gets nil for a private perspective", func(t *testing.T) {
		repo := &mockPerspectiveRepository{
			getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
				return &domain.Perspective{ID: 100, UserID: 2, Privacy: domain.PrivacyPrivate}, nil
			},
		}
		server := setupPerspectiveVisibilityServer(repo, true)
		defer server.Close()

		result := executeGraphQL(t, server, `{ perspectiveByID(id: "100") { id privacy } }`)
		assert.Empty(t, result.Errors)

		var data struct {
			PerspectiveByID *json.RawMessage `json:"perspectiveByID"`
		}
		require.NoError(t, json.Unmarshal(result.Data, &data))
		assert.Nil(t, data.PerspectiveByID)
	})

	t.Run("anonymous gets nil for a private perspective", func(t *testing.T) {
		repo := &mockPerspectiveRepository{
			getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
				return &domain.Perspective{ID: 100, UserID: 2, Privacy: domain.PrivacyPrivate}, nil
			},
		}
		server := setupPerspectiveVisibilityServer(repo, false)
		defer server.Close()

		result := executeGraphQL(t, server, `{ perspectiveByID(id: "100") { id privacy } }`)
		assert.Empty(t, result.Errors)

		var data struct {
			PerspectiveByID *json.RawMessage `json:"perspectiveByID"`
		}
		require.NoError(t, json.Unmarshal(result.Data, &data))
		assert.Nil(t, data.PerspectiveByID)
	})

	t.Run("public perspective is returned to anonymous", func(t *testing.T) {
		repo := &mockPerspectiveRepository{
			getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
				return &domain.Perspective{ID: 101, UserID: 2, Privacy: domain.PrivacyPublic}, nil
			},
		}
		server := setupPerspectiveVisibilityServer(repo, false)
		defer server.Close()

		result := executeGraphQL(t, server, `{ perspectiveByID(id: "101") { id privacy } }`)
		assert.Empty(t, result.Errors)

		var data struct {
			PerspectiveByID *struct {
				ID      string `json:"id"`
				Privacy string `json:"privacy"`
			} `json:"perspectiveByID"`
		}
		require.NoError(t, json.Unmarshal(result.Data, &data))
		require.NotNil(t, data.PerspectiveByID)
		assert.Equal(t, "101", data.PerspectiveByID.ID)
	})
}

func TestPerspectives_PassesViewerID(t *testing.T) {
	t.Run("authenticated caller propagates viewer id", func(t *testing.T) {
		var captured domain.PerspectiveListParams
		repo := &mockPerspectiveRepository{
			listFn: func(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
				captured = params
				return &domain.PaginatedPerspectives{Items: []*domain.Perspective{}}, nil
			},
		}
		server := setupPerspectiveVisibilityServer(repo, true)
		defer server.Close()

		result := executeGraphQL(t, server, `{ perspectives { items { id privacy } } }`)
		assert.Empty(t, result.Errors)

		require.NotNil(t, captured.ViewerID)
		assert.Equal(t, 1, *captured.ViewerID)
	})

	t.Run("anonymous caller leaves viewer id nil", func(t *testing.T) {
		var captured domain.PerspectiveListParams
		repo := &mockPerspectiveRepository{
			listFn: func(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
				captured = params
				return &domain.PaginatedPerspectives{Items: []*domain.Perspective{}}, nil
			},
		}
		server := setupPerspectiveVisibilityServer(repo, false)
		defer server.Close()

		result := executeGraphQL(t, server, `{ perspectives { items { id privacy } } }`)
		assert.Empty(t, result.Errors)

		assert.Nil(t, captured.ViewerID)
	})
}
