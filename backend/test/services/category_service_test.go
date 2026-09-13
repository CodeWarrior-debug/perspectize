package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockCategoryRepository implements repositories.CategoryRepository for testing
type mockCategoryRepository struct {
	upsertFn   func(ctx context.Context, category *domain.Category) (*domain.Category, error)
	getByIDFn  func(ctx context.Context, id int) (*domain.Category, error)
	getByIDsFn func(ctx context.Context, ids []int) ([]*domain.Category, error)
}

func (m *mockCategoryRepository) Upsert(ctx context.Context, category *domain.Category) (*domain.Category, error) {
	if m.upsertFn != nil {
		return m.upsertFn(ctx, category)
	}
	category.ID = 1
	return category, nil
}

func (m *mockCategoryRepository) GetByID(ctx context.Context, id int) (*domain.Category, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockCategoryRepository) GetByIDs(ctx context.Context, ids []int) ([]*domain.Category, error) {
	if m.getByIDsFn != nil {
		return m.getByIDsFn(ctx, ids)
	}
	return []*domain.Category{}, nil
}

// mockWikidataClient implements services.WikidataClient for testing
type mockWikidataClient struct {
	searchFn func(ctx context.Context, query string, language string, limit int) ([]domain.WikidataSearchResult, error)
}

func (m *mockWikidataClient) Search(ctx context.Context, query string, language string, limit int) ([]domain.WikidataSearchResult, error) {
	if m.searchFn != nil {
		return m.searchFn(ctx, query, language, limit)
	}
	return []domain.WikidataSearchResult{}, nil
}

// mockContentRepoForCategory implements repositories.ContentRepository for category tests
type mockContentRepoForCategory struct {
	getByIDFn               func(ctx context.Context, id int) (*domain.Content, error)
	updatePrimaryCategoryFn func(ctx context.Context, contentID int, categoryID *int) error
}

func (m *mockContentRepoForCategory) Create(ctx context.Context, content *domain.Content) (*domain.Content, error) {
	return content, nil
}
func (m *mockContentRepoForCategory) GetByID(ctx context.Context, id int) (*domain.Content, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return &domain.Content{ID: id, Name: "Test Content"}, nil
}
func (m *mockContentRepoForCategory) GetByURL(ctx context.Context, url string) (*domain.Content, error) {
	return nil, domain.ErrNotFound
}
func (m *mockContentRepoForCategory) UpdateMetadata(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error) {
	return &domain.Content{ID: id, Name: name}, nil
}
func (m *mockContentRepoForCategory) GetOrCreateByURL(ctx context.Context, content *domain.Content, refreshOnConflict bool) (*domain.Content, bool, error) {
	return content, false, nil
}
func (m *mockContentRepoForCategory) List(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
	return &domain.PaginatedContent{Items: []*domain.Content{}}, nil
}
func (m *mockContentRepoForCategory) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	return nil
}
func (m *mockContentRepoForCategory) UpdatePrimaryCategoryID(ctx context.Context, contentID int, categoryID *int) error {
	if m.updatePrimaryCategoryFn != nil {
		return m.updatePrimaryCategoryFn(ctx, contentID, categoryID)
	}
	return nil
}

// --- SetPrimaryCategory Tests ---

func TestSetPrimaryCategory_Success(t *testing.T) {
	upsertedCatID := 42
	categoryRepo := &mockCategoryRepository{
		upsertFn: func(ctx context.Context, category *domain.Category) (*domain.Category, error) {
			category.ID = upsertedCatID
			return category, nil
		},
	}
	contentRepo := &mockContentRepoForCategory{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			catID := upsertedCatID
			return &domain.Content{
				ID:                id,
				Name:              "Test Video",
				ContentType:       domain.ContentTypeYouTube,
				PrimaryCategoryID: &catID,
			}, nil
		},
	}
	wikidataClient := &mockWikidataClient{}
	svc := services.NewCategoryService(categoryRepo, contentRepo, wikidataClient)

	input := portservices.SetPrimaryCategoryInput{
		ContentID:   1,
		QID:         "Q12345",
		Label:       "Science",
		Description: "Natural science",
		EntityType:  "item",
	}

	result, err := svc.SetPrimaryCategory(context.Background(), input)
	require.NoError(t, err)
	assert.Equal(t, 1, result.ID)
	assert.Equal(t, "Test Video", result.Name)
	require.NotNil(t, result.PrimaryCategoryID)
	assert.Equal(t, upsertedCatID, *result.PrimaryCategoryID)
}

func TestSetPrimaryCategory_InvalidContentID(t *testing.T) {
	svc := services.NewCategoryService(
		&mockCategoryRepository{},
		&mockContentRepoForCategory{},
		&mockWikidataClient{},
	)

	input := portservices.SetPrimaryCategoryInput{
		ContentID: 0,
		QID:       "Q12345",
		Label:     "Science",
	}

	_, err := svc.SetPrimaryCategory(context.Background(), input)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestSetPrimaryCategory_EmptyQID(t *testing.T) {
	svc := services.NewCategoryService(
		&mockCategoryRepository{},
		&mockContentRepoForCategory{},
		&mockWikidataClient{},
	)

	input := portservices.SetPrimaryCategoryInput{
		ContentID: 1,
		QID:       "",
		Label:     "Science",
	}

	_, err := svc.SetPrimaryCategory(context.Background(), input)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestSetPrimaryCategory_EmptyLabel(t *testing.T) {
	svc := services.NewCategoryService(
		&mockCategoryRepository{},
		&mockContentRepoForCategory{},
		&mockWikidataClient{},
	)

	input := portservices.SetPrimaryCategoryInput{
		ContentID: 1,
		QID:       "Q12345",
		Label:     "",
	}

	_, err := svc.SetPrimaryCategory(context.Background(), input)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestSetPrimaryCategory_UpsertFails(t *testing.T) {
	categoryRepo := &mockCategoryRepository{
		upsertFn: func(ctx context.Context, category *domain.Category) (*domain.Category, error) {
			return nil, fmt.Errorf("database error")
		},
	}
	svc := services.NewCategoryService(
		categoryRepo,
		&mockContentRepoForCategory{},
		&mockWikidataClient{},
	)

	input := portservices.SetPrimaryCategoryInput{
		ContentID: 1,
		QID:       "Q12345",
		Label:     "Science",
	}

	_, err := svc.SetPrimaryCategory(context.Background(), input)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "upsert category")
}

func TestSetPrimaryCategory_ContentNotFound(t *testing.T) {
	categoryRepo := &mockCategoryRepository{}
	contentRepo := &mockContentRepoForCategory{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
	}
	svc := services.NewCategoryService(categoryRepo, contentRepo, &mockWikidataClient{})

	input := portservices.SetPrimaryCategoryInput{
		ContentID: 999,
		QID:       "Q12345",
		Label:     "Science",
	}

	_, err := svc.SetPrimaryCategory(context.Background(), input)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "get content")
}

func TestSetPrimaryCategory_UpdateFKFails(t *testing.T) {
	categoryRepo := &mockCategoryRepository{}
	contentRepo := &mockContentRepoForCategory{
		updatePrimaryCategoryFn: func(ctx context.Context, contentID int, categoryID *int) error {
			return fmt.Errorf("fk constraint violation")
		},
	}
	svc := services.NewCategoryService(categoryRepo, contentRepo, &mockWikidataClient{})

	input := portservices.SetPrimaryCategoryInput{
		ContentID: 1,
		QID:       "Q12345",
		Label:     "Science",
	}

	_, err := svc.SetPrimaryCategory(context.Background(), input)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "update content primary category")
}

// --- SearchWikidata Tests ---

func TestSearchWikidata_Success(t *testing.T) {
	wikidataClient := &mockWikidataClient{
		searchFn: func(ctx context.Context, query string, language string, limit int) ([]domain.WikidataSearchResult, error) {
			return []domain.WikidataSearchResult{
				{QID: "Q1", Label: "Universe", Description: "totality of everything", EntityType: "item"},
				{QID: "Q2", Label: "Earth", Description: "third planet", EntityType: "item"},
			}, nil
		},
	}
	svc := services.NewCategoryService(
		&mockCategoryRepository{},
		&mockContentRepoForCategory{},
		wikidataClient,
	)

	results, err := svc.SearchWikidata(context.Background(), "earth", "en", 10)
	require.NoError(t, err)
	assert.Len(t, results, 2)
	assert.Equal(t, "Q1", results[0].QID)
	assert.Equal(t, "Q2", results[1].QID)
}

func TestSearchWikidata_DefaultLanguageAndLimit(t *testing.T) {
	wikidataClient := &mockWikidataClient{
		searchFn: func(ctx context.Context, query string, language string, limit int) ([]domain.WikidataSearchResult, error) {
			// Service should have applied defaults
			assert.Equal(t, "en", language)
			assert.Equal(t, 10, limit)
			return []domain.WikidataSearchResult{}, nil
		},
	}
	svc := services.NewCategoryService(
		&mockCategoryRepository{},
		&mockContentRepoForCategory{},
		wikidataClient,
	)

	results, err := svc.SearchWikidata(context.Background(), "test", "", 0)
	require.NoError(t, err)
	assert.Empty(t, results)
}

func TestSearchWikidata_ClientError(t *testing.T) {
	wikidataClient := &mockWikidataClient{
		searchFn: func(ctx context.Context, query string, language string, limit int) ([]domain.WikidataSearchResult, error) {
			return nil, fmt.Errorf("API error")
		},
	}
	svc := services.NewCategoryService(
		&mockCategoryRepository{},
		&mockContentRepoForCategory{},
		wikidataClient,
	)

	_, err := svc.SearchWikidata(context.Background(), "test", "en", 10)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "API error")
}

// --- GetCategoryByID Tests ---

func TestGetCategoryByID_Success(t *testing.T) {
	categoryRepo := &mockCategoryRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Category, error) {
			return &domain.Category{
				ID:          id,
				WikidataQID: "Q12345",
				Label:       "Science",
			}, nil
		},
	}
	svc := services.NewCategoryService(categoryRepo, &mockContentRepoForCategory{}, &mockWikidataClient{})

	result, err := svc.GetCategoryByID(context.Background(), 1)
	require.NoError(t, err)
	assert.Equal(t, 1, result.ID)
	assert.Equal(t, "Q12345", result.WikidataQID)
}

func TestGetCategoryByID_NotFound(t *testing.T) {
	categoryRepo := &mockCategoryRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Category, error) {
			return nil, domain.ErrNotFound
		},
	}
	svc := services.NewCategoryService(categoryRepo, &mockContentRepoForCategory{}, &mockWikidataClient{})

	_, err := svc.GetCategoryByID(context.Background(), 999)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}
