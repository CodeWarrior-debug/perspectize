package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// SetPrimaryCategoryInput contains the data needed to assign a Wikidata category to content
type SetPrimaryCategoryInput struct {
	ContentID   int
	QID         string
	Label       string
	Description string
	EntityType  string
}

// CategoryService defines the contract for category operations
type CategoryService interface {
	// SetPrimaryCategory upserts a category from Wikidata data, then assigns it as the content's primary category
	SetPrimaryCategory(ctx context.Context, input SetPrimaryCategoryInput) (*domain.Content, error)

	// SearchWikidata proxies a search query to the Wikidata Entity Search API
	SearchWikidata(ctx context.Context, query string, language string, limit int) ([]domain.WikidataSearchResult, error)

	// GetCategoryByID fetches a category by its primary key
	GetCategoryByID(ctx context.Context, id int) (*domain.Category, error)

	// GetCategoriesByIDs fetches multiple categories by primary key in a
	// single batched query. Used by the GraphQL category dataloader to
	// collapse per-row Content.primaryCategory lookups into one round-trip.
	// Missing IDs are omitted from the result; order is not guaranteed.
	GetCategoriesByIDs(ctx context.Context, ids []int) ([]*domain.Category, error)
}
