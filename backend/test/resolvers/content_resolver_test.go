package resolvers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/99designs/gqlgen/graphql/handler"
	auth "github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockContentRepository implements repositories.ContentRepository for testing
type mockContentRepository struct {
	createFn           func(ctx context.Context, content *domain.Content) (*domain.Content, error)
	getByIDFn          func(ctx context.Context, id int) (*domain.Content, error)
	getByURLFn         func(ctx context.Context, url string) (*domain.Content, error)
	getOrCreateByURLFn func(ctx context.Context, content *domain.Content) (*domain.Content, bool, error)
	updateMetadataFn   func(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error)
	listFn             func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error)
}

func (m *mockContentRepository) Create(ctx context.Context, content *domain.Content) (*domain.Content, error) {
	if m.createFn != nil {
		return m.createFn(ctx, content)
	}
	return content, nil
}

func (m *mockContentRepository) GetByID(ctx context.Context, id int) (*domain.Content, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockContentRepository) GetByURL(ctx context.Context, url string) (*domain.Content, error) {
	if m.getByURLFn != nil {
		return m.getByURLFn(ctx, url)
	}
	return nil, domain.ErrNotFound
}

func (m *mockContentRepository) GetOrCreateByURL(ctx context.Context, content *domain.Content, refreshOnConflict bool) (*domain.Content, bool, error) {
	if m.getOrCreateByURLFn != nil {
		return m.getOrCreateByURLFn(ctx, content)
	}
	return content, false, nil
}

func (m *mockContentRepository) UpdateMetadata(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error) {
	if m.updateMetadataFn != nil {
		return m.updateMetadataFn(ctx, id, name, response, length)
	}
	return nil, domain.ErrNotFound
}

func (m *mockContentRepository) List(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
	if m.listFn != nil {
		return m.listFn(ctx, params)
	}
	return &domain.PaginatedContent{Items: []*domain.Content{}}, nil
}

func (m *mockContentRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	return nil
}

func (m *mockContentRepository) UpdatePrimaryCategoryID(ctx context.Context, contentID int, categoryID *int) error {
	return nil
}

// mockYouTubeClient implements services.YouTubeClient for testing
type mockYouTubeClient struct {
	getVideoMetadataFn func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error)
	extractVideoIDFn   func(url string) (string, error)
}

func (m *mockYouTubeClient) GetVideoMetadata(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
	if m.getVideoMetadataFn != nil {
		return m.getVideoMetadataFn(ctx, videoID)
	}
	return nil, fmt.Errorf("not implemented")
}

func (m *mockYouTubeClient) ExtractVideoID(url string) (string, error) {
	if m.extractVideoIDFn != nil {
		return m.extractVideoIDFn(url)
	}
	// Default implementation for common test case
	return "dQw4w9WgXcQ", nil
}

// mockUserRepository implements repositories.UserRepository for testing
type mockUserRepository struct {
	createFn        func(ctx context.Context, user *domain.User) (*domain.User, error)
	getByIDFn       func(ctx context.Context, id int) (*domain.User, error)
	getByUsernameFn func(ctx context.Context, username string) (*domain.User, error)
	getByEmailFn    func(ctx context.Context, email string) (*domain.User, error)
	listAllFn       func(ctx context.Context) ([]*domain.User, error)
}

func (m *mockUserRepository) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	if m.createFn != nil {
		return m.createFn(ctx, user)
	}
	user.ID = 1
	return user, nil
}

func (m *mockUserRepository) GetByID(ctx context.Context, id int) (*domain.User, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockUserRepository) GetByClerkID(ctx context.Context, clerkID string) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func (m *mockUserRepository) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	if m.getByUsernameFn != nil {
		return m.getByUsernameFn(ctx, username)
	}
	return nil, domain.ErrNotFound
}

func (m *mockUserRepository) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	if m.getByEmailFn != nil {
		return m.getByEmailFn(ctx, email)
	}
	return nil, domain.ErrNotFound
}

func (m *mockUserRepository) ListAll(ctx context.Context) ([]*domain.User, error) {
	if m.listAllFn != nil {
		return m.listAllFn(ctx)
	}
	return []*domain.User{}, nil
}

func (m *mockUserRepository) Update(ctx context.Context, user *domain.User) (*domain.User, error) {
	return user, nil
}

func (m *mockUserRepository) Delete(ctx context.Context, id int) error {
	return nil
}

func (m *mockUserRepository) CreateFromClerk(ctx context.Context, clerkID string, username string, email string) (*domain.User, error) {
	return nil, domain.ErrNotFound
}

func (m *mockUserRepository) UpdateByClerkID(ctx context.Context, clerkID string, username string, email string) error {
	return domain.ErrNotFound
}

func (m *mockUserRepository) DeactivateByClerkID(ctx context.Context, clerkID string) error {
	return domain.ErrNotFound
}

func (m *mockUserRepository) UpdateOnboarding(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error) {
	return &domain.User{ID: userID, Onboarding: onboarding}, nil
}

// mockPerspectiveRepository implements repositories.PerspectiveRepository for testing
type mockPerspectiveRepository struct {
	createFn  func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error)
	getByIDFn func(ctx context.Context, id int) (*domain.Perspective, error)
	updateFn  func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error)
	deleteFn  func(ctx context.Context, id int) error
	listFn    func(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error)
}

func (m *mockPerspectiveRepository) Create(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
	if m.createFn != nil {
		return m.createFn(ctx, p)
	}
	p.ID = 1
	return p, nil
}

func (m *mockPerspectiveRepository) GetByID(ctx context.Context, id int) (*domain.Perspective, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockPerspectiveRepository) Update(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
	if m.updateFn != nil {
		return m.updateFn(ctx, p)
	}
	return p, nil
}

func (m *mockPerspectiveRepository) Delete(ctx context.Context, id int) error {
	if m.deleteFn != nil {
		return m.deleteFn(ctx, id)
	}
	return nil
}

func (m *mockPerspectiveRepository) List(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
	if m.listFn != nil {
		return m.listFn(ctx, params)
	}
	return &domain.PaginatedPerspectives{Items: []*domain.Perspective{}}, nil
}

func (m *mockPerspectiveRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	return nil
}

// mockCategoryRepository implements repositories.CategoryRepository for testing
type mockCategoryRepository struct{}

func (m *mockCategoryRepository) Upsert(ctx context.Context, category *domain.Category) (*domain.Category, error) {
	category.ID = 1
	return category, nil
}

func (m *mockCategoryRepository) GetByID(ctx context.Context, id int) (*domain.Category, error) {
	return nil, domain.ErrNotFound
}

func (m *mockCategoryRepository) GetByIDs(ctx context.Context, ids []int) ([]*domain.Category, error) {
	return []*domain.Category{}, nil
}

// mockWikidataClient implements services.WikidataClient for testing
type mockWikidataClient struct{}

func (m *mockWikidataClient) Search(ctx context.Context, query string, language string, limit int) ([]domain.WikidataSearchResult, error) {
	return []domain.WikidataSearchResult{}, nil
}

// graphqlResponse represents a generic GraphQL JSON response
type graphqlResponse struct {
	Data   json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

// injectAuthMiddleware is a test HTTP middleware that injects an AuthenticatedUser
// into the context, simulating a logged-in user for directive tests.
func injectAuthMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		authUser := &domain.AuthenticatedUser{
			ID:       1,
			ClerkID:  "clerk_test_user",
			Username: "testuser",
			Email:    "test@example.com",
			Role:     domain.UserRoleDefault,
		}
		ctx := auth.WithAuthenticatedUser(r.Context(), authUser)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// setupTestServer creates a test GraphQL server with the given mock dependencies.
// Wires auth directives and injects an authenticated user context via auth middleware
// so mutation tests pass the @auth directive check.
func setupTestServer(repo *mockContentRepository, ytClient *mockYouTubeClient) *httptest.Server {
	return setupTestServerWithRepos(repo, ytClient, &mockPerspectiveRepository{}, &mockUserRepository{})
}

// setupTestServerWithRepos is like setupTestServer but lets the caller supply
// mockPerspectiveRepository/mockUserRepository (e.g. to assert on createPerspective
// calls or stub GetByID for the resolver's post-auth user lookup).
func setupTestServerWithRepos(repo *mockContentRepository, ytClient *mockYouTubeClient, perspectiveRepo *mockPerspectiveRepository, userRepo *mockUserRepository) *httptest.Server {
	categoryRepo := &mockCategoryRepository{}
	wikidataClient := &mockWikidataClient{}
	contentService := services.NewContentService(repo, ytClient)
	userService := services.NewUserService(userRepo, repo, perspectiveRepo)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(categoryRepo, repo, wikidataClient)
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

	// Wrap with test middleware that injects an authenticated user context
	authHandler := injectAuthMiddleware(srv)
	return httptest.NewServer(authHandler)
}

// executeGraphQL sends a GraphQL query to the test server and returns the response.
// Authentication is handled by the injectAuthMiddleware in the test server setup.
func executeGraphQL(t *testing.T, server *httptest.Server, query string) graphqlResponse {
	t.Helper()

	body := fmt.Sprintf(`{"query": %s}`, jsonString(query))
	req, err := http.NewRequest("POST", server.URL, strings.NewReader(body))
	require.NoError(t, err)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	require.NoError(t, err)
	defer resp.Body.Close()

	var result graphqlResponse
	err = json.NewDecoder(resp.Body).Decode(&result)
	require.NoError(t, err)

	return result
}

// jsonString encodes a string as a JSON string value
func jsonString(s string) string {
	b, _ := json.Marshal(s)
	return string(b)
}

// --- Content Query Tests ---

func TestContentQuery_Success(t *testing.T) {
	url := "https://youtube.com/watch?v=abc123"
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{
				ID:          1,
				Name:        "Test Video",
				URL:         &url,
				ContentType: domain.ContentTypeYouTube,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "1") { id name contentType url } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		ContentByID struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			ContentType string `json:"contentType"`
			URL         string `json:"url"`
		} `json:"contentByID"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Equal(t, "1", data.ContentByID.ID)
	assert.Equal(t, "Test Video", data.ContentByID.Name)
	assert.Equal(t, "YOUTUBE", data.ContentByID.ContentType)
	assert.Equal(t, url, data.ContentByID.URL)
}

func TestContentQuery_NotFound_ReturnsError(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "999") { id name } }`)

	// Issue #18 fix: should return an error, not a silent null
	require.NotEmpty(t, result.Errors, "Expected an error when content is not found")
	assert.Contains(t, result.Errors[0].Message, "content not found")
}

func TestContentQuery_InvalidID_NonNumeric(t *testing.T) {
	repo := &mockContentRepository{}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "abc") { id name } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid content ID")
}

func TestContentQuery_InvalidID_Zero(t *testing.T) {
	repo := &mockContentRepository{}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "0") { id name } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid content ID")
}

func TestContentQuery_InvalidID_Negative(t *testing.T) {
	repo := &mockContentRepository{}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "-1") { id name } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid content ID")
}

func TestContentQuery_DatabaseError(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return nil, fmt.Errorf("connection refused")
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ contentByID(id: "1") { id name } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "failed to get content")
}

// --- CreateContentFromYouTube Mutation Tests ---

func TestCreateContentFromYouTube_Success(t *testing.T) {
	metadata := &portservices.VideoMetadata{
		Title:       "Amazing Video",
		Description: "Description",
		Duration:    600,
		ChannelName: "Channel",
		Response:    json.RawMessage(`{"items":[]}`),
	}

	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(ctx context.Context, content *domain.Content) (*domain.Content, bool, error) {
			content.ID = 42
			return content, false, nil
		},
	}

	ytClient := &mockYouTubeClient{
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			return metadata, nil
		},
	}

	server := setupTestServer(repo, ytClient)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromYouTube(input: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", userId: 1 }) { content { id name contentType } alreadyExisted } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		CreateContentFromYouTube struct {
			Content struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				ContentType string `json:"contentType"`
			} `json:"content"`
			AlreadyExisted bool `json:"alreadyExisted"`
		} `json:"createContentFromYouTube"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Equal(t, "42", data.CreateContentFromYouTube.Content.ID)
	assert.Equal(t, "Amazing Video", data.CreateContentFromYouTube.Content.Name)
	assert.Equal(t, "YOUTUBE", data.CreateContentFromYouTube.Content.ContentType)
	assert.False(t, data.CreateContentFromYouTube.AlreadyExisted)
}

func TestCreateContentFromYouTube_DerivesUserIDFromSession_WhenZero(t *testing.T) {
	metadata := &portservices.VideoMetadata{
		Title:       "Amazing Video",
		Description: "Description",
		Duration:    600,
		ChannelName: "Channel",
		Response:    json.RawMessage(`{"items":[]}`),
	}

	var capturedUserID int
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(ctx context.Context, content *domain.Content) (*domain.Content, bool, error) {
			capturedUserID = content.AddedByUserID
			content.ID = 42
			return content, false, nil
		},
	}

	ytClient := &mockYouTubeClient{
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			return metadata, nil
		},
	}

	server := setupTestServer(repo, ytClient)
	defer server.Close()

	// userId: 0 is the "derive from my session" sentinel. setupTestServer's
	// injectAuthMiddleware authenticates as user ID 1.
	result := executeGraphQL(t, server, `mutation { createContentFromYouTube(input: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", userId: 0 }) { content { id } alreadyExisted } }`)

	assert.Empty(t, result.Errors)
	assert.Equal(t, 1, capturedUserID)
}

func TestCreateContentFromYouTube_RejectsSpoofedUserID(t *testing.T) {
	// Issue #246: a non-zero userId that doesn't match the authenticated
	// session must be rejected, not trusted verbatim.
	metadata := &portservices.VideoMetadata{
		Title:    "Amazing Video",
		Duration: 600,
		Response: json.RawMessage(`{"items":[]}`),
	}

	var createCalled bool
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(ctx context.Context, content *domain.Content) (*domain.Content, bool, error) {
			createCalled = true
			content.ID = 42
			return content, false, nil
		},
	}

	ytClient := &mockYouTubeClient{
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			return metadata, nil
		},
	}

	server := setupTestServer(repo, ytClient)
	defer server.Close()

	// injectAuthMiddleware authenticates as user ID 1; userId: 2 attempts to
	// attribute the content to a different user.
	result := executeGraphQL(t, server, `mutation { createContentFromYouTube(input: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", userId: 2 }) { content { id } alreadyExisted } }`)

	require.NotEmpty(t, result.Errors, "Expected an error when userId doesn't match the authenticated session")
	assert.Contains(t, result.Errors[0].Message, "access denied")
	assert.False(t, createCalled, "Content should not be created when userId is spoofed")
}

func TestCreateContentFromYouTube_AlreadyExists(t *testing.T) {
	canonicalURL := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	existing := &domain.Content{ID: 1, Name: "Existing Video", URL: &canonicalURL, ContentType: domain.ContentTypeYouTube}
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			// The canonical URL is found — service returns existing content + ErrAlreadyExists
			return existing, nil
		},
	}

	// extractVideoIDFn default returns "dQw4w9WgXcQ" (see mockYouTubeClient default)
	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	// Duplicate submission returns success (not an error) with alreadyExisted=true (VIDEO-05)
	result := executeGraphQL(t, server, `mutation { createContentFromYouTube(input: { url: "https://www.youtube.com/watch?v=dQw4w9WgXcQ", userId: 1 }) { content { id } alreadyExisted } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		CreateContentFromYouTube struct {
			Content struct {
				ID string `json:"id"`
			} `json:"content"`
			AlreadyExisted bool `json:"alreadyExisted"`
		} `json:"createContentFromYouTube"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Equal(t, "1", data.CreateContentFromYouTube.Content.ID)
	assert.True(t, data.CreateContentFromYouTube.AlreadyExisted)
}

func TestCreateContentFromYouTube_InvalidURL(t *testing.T) {
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
	}

	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(url string) (string, error) {
			return "", fmt.Errorf("could not extract video ID")
		},
	}

	server := setupTestServer(repo, ytClient)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromYouTube(input: { url: "not-a-youtube-url", userId: 1 }) { content { id } alreadyExisted } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid YouTube URL")
}

// --- UpdateContentSourceData Tests ---

func TestUpdateContentSourceData_Success(t *testing.T) {
	url := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	existing := &domain.Content{ID: 5, Name: "Old Title", URL: &url, ContentType: domain.ContentTypeYouTube, AddedByUserID: 1}
	metadata := &portservices.VideoMetadata{
		Title:    "New Title",
		Duration: 600,
		Response: json.RawMessage(`{"items":[]}`),
	}

	var capturedID int
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return existing, nil
		},
		updateMetadataFn: func(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error) {
			capturedID = id
			return &domain.Content{ID: id, Name: name, URL: &url, ContentType: domain.ContentTypeYouTube, AddedByUserID: 1}, nil
		},
	}

	ytClient := &mockYouTubeClient{
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			return metadata, nil
		},
	}

	server := setupTestServer(repo, ytClient)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { updateContentSourceData(contentId: 5) { id name contentType } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		UpdateContentSourceData struct {
			ID          string `json:"id"`
			Name        string `json:"name"`
			ContentType string `json:"contentType"`
		} `json:"updateContentSourceData"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Equal(t, "5", data.UpdateContentSourceData.ID)
	assert.Equal(t, "New Title", data.UpdateContentSourceData.Name)
	assert.Equal(t, 5, capturedID)
}

func TestUpdateContentSourceData_NotFound(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { updateContentSourceData(contentId: 999) { id } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "content not found")
}

func TestUpdateContentSourceData_YouTubeAPIError(t *testing.T) {
	url := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	existing := &domain.Content{ID: 5, Name: "Old Title", URL: &url, ContentType: domain.ContentTypeYouTube}
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return existing, nil
		},
	}

	ytClient := &mockYouTubeClient{
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			return nil, fmt.Errorf("youtube api unavailable")
		},
	}

	server := setupTestServer(repo, ytClient)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { updateContentSourceData(contentId: 5) { id } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "failed to update content source data")
}

// --- Paginated Content Query Tests ---

func TestPaginatedContentQuery_DefaultPagination(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			// Verify default values - GraphQL passes the schema default (10), not nil
			require.NotNil(t, params.First)
			assert.Equal(t, 10, *params.First)
			assert.Equal(t, domain.ContentSortByCreatedAt, params.SortBy)
			assert.Equal(t, domain.SortOrderDesc, params.SortOrder)
			assert.False(t, params.IncludeTotalCount)

			url := "https://youtube.com/watch?v=abc123"
			return &domain.PaginatedContent{
				Items: []*domain.Content{
					{ID: 1, Name: "Video 1", URL: &url, ContentType: domain.ContentTypeYouTube},
					{ID: 2, Name: "Video 2", URL: &url, ContentType: domain.ContentTypeYouTube},
				},
				HasNext: false,
				HasPrev: false,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content { items { id name } pageInfo { hasNextPage hasPreviousPage } } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		Content struct {
			Items []struct {
				ID   string `json:"id"`
				Name string `json:"name"`
			} `json:"items"`
			PageInfo struct {
				HasNextPage     bool `json:"hasNextPage"`
				HasPreviousPage bool `json:"hasPreviousPage"`
			} `json:"pageInfo"`
		} `json:"content"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Len(t, data.Content.Items, 2)
	assert.Equal(t, "1", data.Content.Items[0].ID)
	assert.Equal(t, "Video 1", data.Content.Items[0].Name)
	assert.False(t, data.Content.PageInfo.HasNextPage)
	assert.False(t, data.Content.PageInfo.HasPreviousPage)
}

func TestPaginatedContentQuery_WithFirstParameter(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			require.NotNil(t, params.First)
			assert.Equal(t, 5, *params.First)

			url := "https://youtube.com/watch?v=abc123"
			items := make([]*domain.Content, 5)
			for i := 0; i < 5; i++ {
				items[i] = &domain.Content{ID: i + 1, Name: fmt.Sprintf("Video %d", i+1), URL: &url, ContentType: domain.ContentTypeYouTube}
			}
			endCursor := "cursor123"
			return &domain.PaginatedContent{
				Items:     items,
				HasNext:   true,
				HasPrev:   false,
				EndCursor: &endCursor,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content(first: 5) { items { id } pageInfo { hasNextPage endCursor } } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		Content struct {
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
			PageInfo struct {
				HasNextPage bool    `json:"hasNextPage"`
				EndCursor   *string `json:"endCursor"`
			} `json:"pageInfo"`
		} `json:"content"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Len(t, data.Content.Items, 5)
	assert.True(t, data.Content.PageInfo.HasNextPage)
	assert.NotNil(t, data.Content.PageInfo.EndCursor)
}

func TestPaginatedContentQuery_WithTotalCount(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			assert.True(t, params.IncludeTotalCount)

			totalCount := 42
			return &domain.PaginatedContent{
				Items:      []*domain.Content{},
				HasNext:    false,
				HasPrev:    false,
				TotalCount: &totalCount,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content(includeTotalCount: true) { totalCount items { id } } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		Content struct {
			TotalCount *int `json:"totalCount"`
			Items      []struct {
				ID string `json:"id"`
			} `json:"items"`
		} `json:"content"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	require.NotNil(t, data.Content.TotalCount)
	assert.Equal(t, 42, *data.Content.TotalCount)
}

func TestPaginatedContentQuery_WithSorting(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			assert.Equal(t, domain.ContentSortByName, params.SortBy)
			assert.Equal(t, domain.SortOrderAsc, params.SortOrder)

			return &domain.PaginatedContent{
				Items:   []*domain.Content{},
				HasNext: false,
				HasPrev: false,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content(sortBy: NAME, sortOrder: ASC) { items { id } } }`)

	assert.Empty(t, result.Errors)
}

func TestPaginatedContentQuery_WithAfterCursor(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			require.NotNil(t, params.After)
			assert.Equal(t, "someCursor123", *params.After)

			url := "https://youtube.com/watch?v=abc123"
			return &domain.PaginatedContent{
				Items: []*domain.Content{
					{ID: 11, Name: "Video 11", URL: &url, ContentType: domain.ContentTypeYouTube},
				},
				HasNext: false,
				HasPrev: true,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content(after: "someCursor123") { items { id } pageInfo { hasPreviousPage } } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		Content struct {
			Items []struct {
				ID string `json:"id"`
			} `json:"items"`
			PageInfo struct {
				HasPreviousPage bool `json:"hasPreviousPage"`
			} `json:"pageInfo"`
		} `json:"content"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Len(t, data.Content.Items, 1)
	assert.Equal(t, "11", data.Content.Items[0].ID)
	assert.True(t, data.Content.PageInfo.HasPreviousPage)
}

func TestPaginatedContentQuery_InvalidFirstParameter(t *testing.T) {
	repo := &mockContentRepository{}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	// first: 0 is invalid (must be 1-100)
	result := executeGraphQL(t, server, `{ content(first: 0) { items { id } } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid pagination parameters")
}

func TestPaginatedContentQuery_FirstTooLarge(t *testing.T) {
	repo := &mockContentRepository{}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	// first: 101 exceeds max of 100
	result := executeGraphQL(t, server, `{ content(first: 101) { items { id } } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid pagination parameters")
}

func TestPaginatedContentQuery_RepositoryError(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			return nil, fmt.Errorf("database connection failed")
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content { items { id } } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "failed to list content")
}

func TestPaginatedContentQuery_WithContentTypeFilter(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			require.NotNil(t, params.Filter)
			require.NotNil(t, params.Filter.ContentType)
			assert.Equal(t, domain.ContentTypeYouTube, *params.Filter.ContentType)

			url := "https://youtube.com/watch?v=abc123"
			return &domain.PaginatedContent{
				Items: []*domain.Content{
					{ID: 1, Name: "YouTube Video", URL: &url, ContentType: domain.ContentTypeYouTube},
				},
				HasNext: false,
				HasPrev: false,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content(filter: { contentType: YOUTUBE }) { items { id name contentType } } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		Content struct {
			Items []struct {
				ID          string `json:"id"`
				Name        string `json:"name"`
				ContentType string `json:"contentType"`
			} `json:"items"`
		} `json:"content"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Len(t, data.Content.Items, 1)
	assert.Equal(t, "YouTube Video", data.Content.Items[0].Name)
	assert.Equal(t, "YOUTUBE", data.Content.Items[0].ContentType)
}

func TestPaginatedContentQuery_WithFilterAndTotalCount(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			require.NotNil(t, params.Filter)
			require.NotNil(t, params.Filter.ContentType)
			assert.True(t, params.IncludeTotalCount)

			totalCount := 5
			return &domain.PaginatedContent{
				Items:      []*domain.Content{},
				HasNext:    false,
				HasPrev:    false,
				TotalCount: &totalCount,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content(filter: { contentType: YOUTUBE }, includeTotalCount: true) { totalCount items { id } } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		Content struct {
			TotalCount *int `json:"totalCount"`
			Items      []struct {
				ID string `json:"id"`
			} `json:"items"`
		} `json:"content"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	require.NotNil(t, data.Content.TotalCount)
	assert.Equal(t, 5, *data.Content.TotalCount)
}

func TestPaginatedContentQuery_NoFilter(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			assert.Nil(t, params.Filter)

			return &domain.PaginatedContent{
				Items:   []*domain.Content{},
				HasNext: false,
				HasPrev: false,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content { items { id } } }`)

	assert.Empty(t, result.Errors)
}

func TestPaginatedContentQuery_WithMinLengthFilter(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			require.NotNil(t, params.Filter)
			require.NotNil(t, params.Filter.MinLengthSeconds)
			assert.Equal(t, 300, *params.Filter.MinLengthSeconds)
			assert.Nil(t, params.Filter.MaxLengthSeconds)

			url := "https://youtube.com/watch?v=abc123"
			length := 600
			return &domain.PaginatedContent{
				Items: []*domain.Content{
					{ID: 1, Name: "Long Video", URL: &url, ContentType: domain.ContentTypeYouTube, Length: &length},
				},
				HasNext: false,
				HasPrev: false,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content(filter: { minLengthSeconds: 300 }) { items { id name length } } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		Content struct {
			Items []struct {
				ID     string `json:"id"`
				Name   string `json:"name"`
				Length *int   `json:"length"`
			} `json:"items"`
		} `json:"content"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Len(t, data.Content.Items, 1)
	require.NotNil(t, data.Content.Items[0].Length)
	assert.Equal(t, 600, *data.Content.Items[0].Length)
}

func TestPaginatedContentQuery_WithMaxLengthFilter(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			require.NotNil(t, params.Filter)
			require.NotNil(t, params.Filter.MaxLengthSeconds)
			assert.Equal(t, 180, *params.Filter.MaxLengthSeconds)
			assert.Nil(t, params.Filter.MinLengthSeconds)

			url := "https://youtube.com/watch?v=abc123"
			length := 120
			return &domain.PaginatedContent{
				Items: []*domain.Content{
					{ID: 1, Name: "Short Video", URL: &url, ContentType: domain.ContentTypeYouTube, Length: &length},
				},
				HasNext: false,
				HasPrev: false,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content(filter: { maxLengthSeconds: 180 }) { items { id name length } } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		Content struct {
			Items []struct {
				ID     string `json:"id"`
				Name   string `json:"name"`
				Length *int   `json:"length"`
			} `json:"items"`
		} `json:"content"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Len(t, data.Content.Items, 1)
	require.NotNil(t, data.Content.Items[0].Length)
	assert.Equal(t, 120, *data.Content.Items[0].Length)
}

func TestPaginatedContentQuery_WithMinMaxLengthFilter(t *testing.T) {
	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			require.NotNil(t, params.Filter)
			require.NotNil(t, params.Filter.MinLengthSeconds)
			require.NotNil(t, params.Filter.MaxLengthSeconds)
			assert.Equal(t, 120, *params.Filter.MinLengthSeconds)
			assert.Equal(t, 300, *params.Filter.MaxLengthSeconds)

			url := "https://youtube.com/watch?v=abc123"
			length := 200
			return &domain.PaginatedContent{
				Items: []*domain.Content{
					{ID: 1, Name: "Medium Video", URL: &url, ContentType: domain.ContentTypeYouTube, Length: &length},
				},
				HasNext: false,
				HasPrev: false,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ content(filter: { minLengthSeconds: 120, maxLengthSeconds: 300 }) { items { id length } } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		Content struct {
			Items []struct {
				ID     string `json:"id"`
				Length *int   `json:"length"`
			} `json:"items"`
		} `json:"content"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Len(t, data.Content.Items, 1)
}

// --- SetPrimaryCategory Mutation Tests ---

func TestSetPrimaryCategory_Success(t *testing.T) {
	catID := 42
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{
				ID:                id,
				Name:              "Test Video",
				ContentType:       domain.ContentTypeYouTube,
				PrimaryCategoryID: &catID,
			}, nil
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { setPrimaryCategory(input: { contentId: 1, qid: "Q12345", label: "Science", description: "Natural science", entityType: "item" }) { id name } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		SetPrimaryCategory struct {
			ID   string `json:"id"`
			Name string `json:"name"`
		} `json:"setPrimaryCategory"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)

	assert.Equal(t, "1", data.SetPrimaryCategory.ID)
	assert.Equal(t, "Test Video", data.SetPrimaryCategory.Name)
}

func TestSetPrimaryCategory_ContentNotFound(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
	}

	server := setupTestServer(repo, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { setPrimaryCategory(input: { contentId: 999, qid: "Q12345", label: "Science" }) { id } }`)

	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "content not found")
}

// --- WikidataSearch Query Tests ---

func TestWikidataSearch_Success(t *testing.T) {
	server := setupTestServer(&mockContentRepository{}, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ wikidataSearch(query: "science", language: "en", limit: 5) { qid label description entityType } }`)

	// With mock returning empty results, should succeed with empty array
	assert.Empty(t, result.Errors)

	var data struct {
		WikidataSearch []struct {
			Qid         string  `json:"qid"`
			Label       string  `json:"label"`
			Description *string `json:"description"`
			EntityType  *string `json:"entityType"`
		} `json:"wikidataSearch"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)
	assert.NotNil(t, data.WikidataSearch)
}

func TestWikidataSearch_DefaultParams(t *testing.T) {
	// Query with only required param (query), optional language and limit omitted
	server := setupTestServer(&mockContentRepository{}, &mockYouTubeClient{})
	defer server.Close()

	result := executeGraphQL(t, server, `{ wikidataSearch(query: "test") { qid label } }`)

	assert.Empty(t, result.Errors)

	var data struct {
		WikidataSearch []struct {
			Qid   string `json:"qid"`
			Label string `json:"label"`
		} `json:"wikidataSearch"`
	}
	err := json.Unmarshal(result.Data, &data)
	require.NoError(t, err)
	assert.NotNil(t, data.WikidataSearch)
}

// --- NewResolver Tests ---

func TestNewResolver(t *testing.T) {
	repo := &mockContentRepository{}
	ytClient := &mockYouTubeClient{}
	userRepo := &mockUserRepository{}
	perspectiveRepo := &mockPerspectiveRepository{}
	categoryRepo := &mockCategoryRepository{}
	wikidataClient := &mockWikidataClient{}
	contentService := services.NewContentService(repo, ytClient)
	userService := services.NewUserService(userRepo, repo, perspectiveRepo)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(categoryRepo, repo, wikidataClient)

	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService)

	assert.NotNil(t, resolver)
	assert.Equal(t, contentService, resolver.ContentService)
	assert.Equal(t, userService, resolver.UserService)
	assert.Equal(t, perspectiveService, resolver.PerspectiveService)
	assert.Equal(t, categoryService, resolver.CategoryService)
}
