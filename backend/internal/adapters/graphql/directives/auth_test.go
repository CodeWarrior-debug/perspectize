package directives_test

import (
	"context"
	"fmt"
	"testing"

	"github.com/99designs/gqlgen/graphql"
	auth "github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/vektah/gqlparser/v2/ast"
)

// mockContentService implements portservices.ContentService for testing
type mockContentService struct {
	getByIDFn func(ctx context.Context, id int) (*domain.Content, error)
}

func (m *mockContentService) CreateFromYouTube(ctx context.Context, url string, userID int) (*domain.Content, error) {
	return nil, nil
}

func (m *mockContentService) GetByID(ctx context.Context, id int) (*domain.Content, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockContentService) ListContent(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
	return nil, nil
}

func (m *mockContentService) CreateClaim(ctx context.Context, input portservices.CreateClaimInput) (*domain.Content, error) {
	return nil, nil
}

func (m *mockContentService) UpdateSourceData(ctx context.Context, contentID int) (*domain.Content, error) {
	return nil, nil
}

// mockPerspectiveService implements portservices.PerspectiveService for testing
type mockPerspectiveService struct {
	getByIDFn func(ctx context.Context, id int) (*domain.Perspective, error)
}

func (m *mockPerspectiveService) Create(ctx context.Context, input portservices.CreatePerspectiveInput) (*domain.Perspective, error) {
	return nil, nil
}

func (m *mockPerspectiveService) GetByID(ctx context.Context, id int) (*domain.Perspective, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockPerspectiveService) Update(ctx context.Context, input portservices.UpdatePerspectiveInput) (*domain.Perspective, error) {
	return nil, nil
}

func (m *mockPerspectiveService) Delete(ctx context.Context, id int) error {
	return nil
}

func (m *mockPerspectiveService) ListPerspectives(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
	return nil, nil
}

func (m *mockPerspectiveService) AggregateByContentIDs(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error) {
	return map[int]*domain.PerspectiveAggregate{}, nil
}

// withFieldContext creates a context with a gqlgen FieldContext
func withFieldContext(ctx context.Context, fieldName string, args map[string]interface{}) context.Context {
	fc := &graphql.FieldContext{
		Field: graphql.CollectedField{
			Field: &ast.Field{
				Name: fieldName,
			},
		},
		Args: args,
	}
	return graphql.WithFieldContext(ctx, fc)
}

// successResolver always returns "success"
func successResolver(ctx context.Context) (interface{}, error) {
	return "success", nil
}

// withUserID creates a context with an authenticated user by ID (test helper)
func withUserID(ctx context.Context, userID int) context.Context {
	return auth.WithAuthenticatedUser(ctx, &domain.AuthenticatedUser{ID: userID})
}

func TestAuth_Authenticated(t *testing.T) {
	d := directives.NewDirectiveRoot(nil, nil)
	ctx := withUserID(context.Background(), 1)

	result, err := d.Auth(ctx, nil, successResolver)
	require.NoError(t, err)
	assert.Equal(t, "success", result)
}

func TestAuth_Unauthenticated(t *testing.T) {
	d := directives.NewDirectiveRoot(nil, nil)
	ctx := context.Background()

	_, err := d.Auth(ctx, nil, successResolver)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "access denied: authentication required")
}

func TestOwner_Unauthenticated(t *testing.T) {
	d := directives.NewDirectiveRoot(nil, nil)
	ctx := context.Background()
	ctx = withFieldContext(ctx, "deletePerspective", map[string]interface{}{"id": "1"})

	_, err := d.Owner(ctx, nil, successResolver, "id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "access denied: authentication required")
}

func TestOwner_PerspectiveOwnerAllowed(t *testing.T) {
	mockPersp := &mockPerspectiveService{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return &domain.Perspective{ID: 10, UserID: 42}, nil
		},
	}
	d := directives.NewDirectiveRoot(nil, mockPersp)

	ctx := withUserID(context.Background(), 42)
	ctx = withFieldContext(ctx, "deletePerspective", map[string]interface{}{"id": "10"})

	result, err := d.Owner(ctx, nil, successResolver, "id")
	require.NoError(t, err)
	assert.Equal(t, "success", result)
}

func TestOwner_PerspectiveNonOwnerDenied(t *testing.T) {
	mockPersp := &mockPerspectiveService{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return &domain.Perspective{ID: 10, UserID: 99}, nil
		},
	}
	d := directives.NewDirectiveRoot(nil, mockPersp)

	ctx := withUserID(context.Background(), 42)
	ctx = withFieldContext(ctx, "updatePerspective", map[string]interface{}{
		"input": map[string]interface{}{"id": 10},
	})

	_, err := d.Owner(ctx, nil, successResolver, "id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "access denied: you can only modify your own perspectives")
}

// updatePerspective takes `input: UpdatePerspectiveInput!`; gqlgen binds that
// to the typed struct, not a map. These two cover the real production shape.
func TestOwner_PerspectiveOwnerAllowed_TypedInput(t *testing.T) {
	mockPersp := &mockPerspectiveService{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			assert.Equal(t, 10, id)
			return &domain.Perspective{ID: 10, UserID: 42}, nil
		},
	}
	d := directives.NewDirectiveRoot(nil, mockPersp)

	ctx := withUserID(context.Background(), 42)
	ctx = withFieldContext(ctx, "updatePerspective", map[string]interface{}{
		"input": model.UpdatePerspectiveInput{ID: 10},
	})

	result, err := d.Owner(ctx, nil, successResolver, "id")
	require.NoError(t, err)
	assert.Equal(t, "success", result)
}

func TestOwner_PerspectiveNonOwnerDenied_TypedInput(t *testing.T) {
	mockPersp := &mockPerspectiveService{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return &domain.Perspective{ID: 10, UserID: 99}, nil
		},
	}
	d := directives.NewDirectiveRoot(nil, mockPersp)

	ctx := withUserID(context.Background(), 42)
	ctx = withFieldContext(ctx, "updatePerspective", map[string]interface{}{
		"input": model.UpdatePerspectiveInput{ID: 10},
	})

	_, err := d.Owner(ctx, nil, successResolver, "id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "access denied: you can only modify your own perspectives")
}

func TestOwner_ContentOwnerAllowed(t *testing.T) {
	mockContent := &mockContentService{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{ID: 5, AddedByUserID: 42}, nil
		},
	}
	d := directives.NewDirectiveRoot(mockContent, nil)

	ctx := withUserID(context.Background(), 42)
	ctx = withFieldContext(ctx, "deleteContent", map[string]interface{}{"id": "5"})

	result, err := d.Owner(ctx, nil, successResolver, "id")
	require.NoError(t, err)
	assert.Equal(t, "success", result)
}

func TestOwner_ContentNonOwnerDenied(t *testing.T) {
	mockContent := &mockContentService{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{ID: 5, AddedByUserID: 99}, nil
		},
	}
	d := directives.NewDirectiveRoot(mockContent, nil)

	ctx := withUserID(context.Background(), 42)
	ctx = withFieldContext(ctx, "deleteContent", map[string]interface{}{"id": "5"})

	_, err := d.Owner(ctx, nil, successResolver, "id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "access denied: you can only modify your own content")
}

func TestOwner_MissingIDArg(t *testing.T) {
	d := directives.NewDirectiveRoot(nil, nil)

	ctx := withUserID(context.Background(), 42)
	ctx = withFieldContext(ctx, "deletePerspective", map[string]interface{}{})

	_, err := d.Owner(ctx, nil, successResolver, "id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing id argument")
}

func TestOwner_ResourceNotFound(t *testing.T) {
	mockPersp := &mockPerspectiveService{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return nil, fmt.Errorf("not found: %w", domain.ErrNotFound)
		},
	}
	d := directives.NewDirectiveRoot(nil, mockPersp)

	ctx := withUserID(context.Background(), 42)
	ctx = withFieldContext(ctx, "deletePerspective", map[string]interface{}{"id": "999"})

	_, err := d.Owner(ctx, nil, successResolver, "id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "resource not found")
}
