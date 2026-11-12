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

// setupTestServerWithUserRepo mirrors setupTestServer (content_resolver_test.go)
// but takes a caller-configured mockUserRepository, so tests can control what
// UserService.GetByID returns for the authenticated user's ID.
func setupTestServerWithUserRepo(userRepo *mockUserRepository) *httptest.Server {
	contentRepo := &mockContentRepository{}
	perspectiveRepo := &mockPerspectiveRepository{}
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
	authHandler := injectAuthMiddleware(defaultTestAuthUser(), srv)
	return httptest.NewServer(authHandler)
}

// setupTestServerNoAuth mirrors setupTestServer but omits the auth-injecting
// middleware, so requests reach resolvers/directives as truly unauthenticated.
func setupTestServerNoAuth(userRepo *mockUserRepository) *httptest.Server {
	contentRepo := &mockContentRepository{}
	perspectiveRepo := &mockPerspectiveRepository{}
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
	return httptest.NewServer(srv)
}

func TestMeQuery_Success(t *testing.T) {
	userRepo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			assert.Equal(t, 1, id) // injectAuthMiddleware authenticates as user ID 1
			return &domain.User{
				ID:       1,
				Username: "testuser",
				Email:    "test@example.com",
				Active:   true,
				Role:     domain.UserRoleDefault,
			}, nil
		},
	}

	server := setupTestServerWithUserRepo(userRepo)
	defer server.Close()

	result := executeGraphQL(t, server, `{ me { id username email } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		Me struct {
			ID       string `json:"id"`
			Username string `json:"username"`
			Email    string `json:"email"`
		} `json:"me"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Equal(t, "1", data.Me.ID)
	assert.Equal(t, "testuser", data.Me.Username)
	assert.Equal(t, "test@example.com", data.Me.Email)
}

func TestMeQuery_Unauthenticated_ReturnsError(t *testing.T) {
	server := setupTestServerNoAuth(&mockUserRepository{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ me { id username } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "access denied: authentication required")
}

func TestMeQuery_UserNotFound_ReturnsError(t *testing.T) {
	userRepo := &mockUserRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.User, error) {
			return nil, domain.ErrNotFound
		},
	}

	server := setupTestServerWithUserRepo(userRepo)
	defer server.Close()

	result := executeGraphQL(t, server, `{ me { id username } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "user not found")
}
