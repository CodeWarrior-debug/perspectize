package resolvers

// Category domain resolvers: Wikidata search and setting a content item's
// primary category. Split out of the single gqlgen-generated
// schema.resolvers.go for navigability — see resolver.go for why this
// survives `make graphql-gen`.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// SetPrimaryCategory is the resolver for the setPrimaryCategory field.
func (r *mutationResolver) SetPrimaryCategory(ctx context.Context, input model.SetPrimaryCategoryInput) (*model.Content, error) {
	description := ""
	if input.Description != nil {
		description = *input.Description
	}
	entityType := ""
	if input.EntityType != nil {
		entityType = *input.EntityType
	}

	serviceInput := portservices.SetPrimaryCategoryInput{
		ContentID:   input.ContentID,
		QID:         input.Qid,
		Label:       input.Label,
		Description: description,
		EntityType:  entityType,
	}

	content, err := r.CategoryService.SetPrimaryCategory(ctx, serviceInput)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid input: %w", err)
		}
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("content not found")
		}
		slog.Error("setting primary category failed", "error", err, "contentID", input.ContentID)
		return nil, fmt.Errorf("failed to set primary category: %v", err)
	}

	return domainToModel(content), nil
}

// WikidataSearch is the resolver for the wikidataSearch field.
func (r *queryResolver) WikidataSearch(ctx context.Context, query string, language *string, limit *int) ([]*model.WikidataSearchResult, error) {
	lang := ""
	if language != nil {
		lang = *language
	}
	lim := 0
	if limit != nil {
		lim = *limit
	}

	results, err := r.CategoryService.SearchWikidata(ctx, query, lang, lim)
	if err != nil {
		slog.Error("wikidata search failed", "error", err, "query", query)
		return nil, fmt.Errorf("wikidata search failed: %v", err)
	}

	models := make([]*model.WikidataSearchResult, len(results))
	for i, r := range results {
		models[i] = &model.WikidataSearchResult{
			Qid:         r.QID,
			Label:       r.Label,
			Description: &r.Description,
			EntityType:  &r.EntityType,
		}
	}

	return models, nil
}
