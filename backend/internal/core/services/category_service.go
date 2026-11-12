package services

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// CategoryServiceImpl implements the CategoryService port interface
type CategoryServiceImpl struct {
	categoryRepo   repositories.CategoryRepository
	contentRepo    repositories.ContentRepository
	wikidataClient portservices.WikidataClient
}

// Compile-time interface check
var _ portservices.CategoryService = (*CategoryServiceImpl)(nil)

// NewCategoryService creates a new CategoryService with its dependencies
func NewCategoryService(
	categoryRepo repositories.CategoryRepository,
	contentRepo repositories.ContentRepository,
	wikidataClient portservices.WikidataClient,
) *CategoryServiceImpl {
	return &CategoryServiceImpl{
		categoryRepo:   categoryRepo,
		contentRepo:    contentRepo,
		wikidataClient: wikidataClient,
	}
}

// SetPrimaryCategory upserts a category from Wikidata data, then assigns it as the content's primary category.
func (s *CategoryServiceImpl) SetPrimaryCategory(ctx context.Context, input portservices.SetPrimaryCategoryInput) (*domain.Content, error) {
	// Validate input
	if input.ContentID <= 0 {
		return nil, fmt.Errorf("%w: content id must be a positive integer", domain.ErrInvalidInput)
	}
	if input.QID == "" {
		return nil, fmt.Errorf("%w: qid must not be empty", domain.ErrInvalidInput)
	}
	if input.Label == "" {
		return nil, fmt.Errorf("%w: label must not be empty", domain.ErrInvalidInput)
	}

	// Look up the English Wikipedia sitelink for this QID. Most Wikidata items
	// don't have one — that's a normal case (empty string), not a failure —
	// and a Wikidata API hiccup here shouldn't block setting the category, so
	// this is logged and swallowed rather than returned as an error.
	wikipediaURL, err := s.wikidataClient.GetWikipediaURL(ctx, input.QID)
	if err != nil {
		slog.Warn("looking up wikipedia sitelink failed, continuing without it", "error", err, "qid", input.QID)
		wikipediaURL = ""
	}

	// Build domain category from input
	category := &domain.Category{
		WikidataQID:  input.QID,
		Label:        input.Label,
		Description:  input.Description,
		EntityType:   input.EntityType,
		WikipediaURL: wikipediaURL,
	}

	// Upsert category (insert or update by wikidata_qid)
	upserted, err := s.categoryRepo.Upsert(ctx, category)
	if err != nil {
		return nil, fmt.Errorf("failed to upsert category: %w", err)
	}

	// Verify content exists
	_, err = s.contentRepo.GetByID(ctx, input.ContentID)
	if err != nil {
		return nil, fmt.Errorf("failed to get content: %w", err)
	}

	// Update the content's primary category FK
	err = s.contentRepo.UpdatePrimaryCategoryID(ctx, input.ContentID, &upserted.ID)
	if err != nil {
		return nil, fmt.Errorf("failed to update content primary category: %w", err)
	}

	// Fetch updated content
	content, err := s.contentRepo.GetByID(ctx, input.ContentID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated content: %w", err)
	}

	return content, nil
}

// RemovePrimaryCategory clears a content item's primary category back to unset/null.
func (s *CategoryServiceImpl) RemovePrimaryCategory(ctx context.Context, contentID int) (*domain.Content, error) {
	if contentID <= 0 {
		return nil, fmt.Errorf("%w: content id must be a positive integer", domain.ErrInvalidInput)
	}

	// Verify content exists
	_, err := s.contentRepo.GetByID(ctx, contentID)
	if err != nil {
		return nil, fmt.Errorf("failed to get content: %w", err)
	}

	if err := s.contentRepo.UpdatePrimaryCategoryID(ctx, contentID, nil); err != nil {
		return nil, fmt.Errorf("failed to clear content primary category: %w", err)
	}

	content, err := s.contentRepo.GetByID(ctx, contentID)
	if err != nil {
		return nil, fmt.Errorf("failed to fetch updated content: %w", err)
	}

	return content, nil
}

// SearchWikidata proxies a search query to the Wikidata Entity Search API.
func (s *CategoryServiceImpl) SearchWikidata(ctx context.Context, query string, language string, limit int) ([]domain.WikidataSearchResult, error) {
	if language == "" {
		language = "en"
	}
	if limit <= 0 {
		limit = 10
	}

	return s.wikidataClient.Search(ctx, query, language, limit)
}

// GetCategoryByID fetches a category by its primary key.
func (s *CategoryServiceImpl) GetCategoryByID(ctx context.Context, id int) (*domain.Category, error) {
	return s.categoryRepo.GetByID(ctx, id)
}
