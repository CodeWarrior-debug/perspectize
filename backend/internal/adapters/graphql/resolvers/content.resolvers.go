package resolvers

// Content domain resolvers: content fields, YouTube ingestion, claims.
// Split out of the single gqlgen-generated schema.resolvers.go for
// navigability — see resolver.go for why this survives `make graphql-gen`.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/dataloader"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// PrimaryCategory is the resolver for the primaryCategory field.
//
// The primary_category_id FK is already loaded by the content list/detail query
// and carried on model.Content.PrimaryCategoryID (a non-schema field), so this
// resolver never re-fetches the content row. The category itself is fetched via
// a per-request dataloader that batches every row's lookup on a page into one
// `WHERE id IN (...)` query. If the dataloader middleware is not installed
// (e.g. a direct resolver unit test), it falls back to a single-row service call.
func (r *contentResolver) PrimaryCategory(ctx context.Context, obj *model.Content) (*model.Category, error) {
	if obj.PrimaryCategoryID == nil {
		return nil, nil
	}
	categoryID := *obj.PrimaryCategoryID

	if loaders := dataloader.For(ctx); loaders != nil {
		category, err := loaders.CategoryByID.Load(ctx, categoryID)
		if err != nil {
			if dataloader.IsNotFound(err) {
				return nil, nil
			}
			slog.Error("resolving primary category via dataloader failed", "contentID", obj.ID, "categoryID", categoryID, "error", err)
			return nil, nil
		}
		return categoryDomainToModel(category), nil
	}

	category, err := r.CategoryService.GetCategoryByID(ctx, categoryID)
	if err != nil {
		slog.Error("resolving primary category failed", "contentID", obj.ID, "categoryID", categoryID, "error", err)
		return nil, nil
	}
	return categoryDomainToModel(category), nil
}

// CreateContentFromYouTube is the resolver for the createContentFromYouTube field.
func (r *mutationResolver) CreateContentFromYouTube(ctx context.Context, input model.CreateContentFromYouTubeInput) (*model.CreateContentResult, error) {
	// Always derive identity from the authenticated session (mirrors CreatePerspective).
	// A client-supplied userID is only accepted if it matches the session; anything
	// else is an attempt to attribute content to another user.
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	if input.UserID != 0 && input.UserID != authUser.ID {
		return nil, fmt.Errorf("access denied: cannot create content for another user")
	}
	userID := authUser.ID

	content, err := r.ContentService.CreateFromYouTube(ctx, input.URL, userID)

	// Handle idempotent duplicate: service returns (content, ErrAlreadyExists)
	if errors.Is(err, domain.ErrAlreadyExists) && content != nil {
		return &model.CreateContentResult{
			Content:        domainToModel(content),
			AlreadyExisted: true,
		}, nil
	}

	if err != nil {
		if errors.Is(err, domain.ErrInvalidURL) {
			return nil, fmt.Errorf("invalid YouTube URL")
		}

		// Generic error for any other failure (including YouTube API errors)
		// Details are already logged server-side by service layer
		return nil, fmt.Errorf("failed to create content from YouTube")
	}

	return &model.CreateContentResult{
		Content:        domainToModel(content),
		AlreadyExisted: false,
	}, nil
}

// UpdateContentSourceData is the resolver for the updateContentSourceData field.
func (r *mutationResolver) UpdateContentSourceData(ctx context.Context, contentID int) (*model.Content, error) {
	content, err := r.ContentService.UpdateSourceData(ctx, contentID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("content not found")
		}
		if errors.Is(err, domain.ErrInvalidInput) || errors.Is(err, domain.ErrInvalidURL) {
			return nil, fmt.Errorf("invalid content: %w", err)
		}

		// Generic error for any other failure (including YouTube API errors)
		// Details are already logged server-side by service layer
		return nil, fmt.Errorf("failed to update content source data")
	}

	return domainToModel(content), nil
}

// CreateClaim is the resolver for the createClaim field.
func (r *mutationResolver) CreateClaim(ctx context.Context, input model.CreateClaimInput) (*model.Content, error) {
	content, err := r.ContentService.CreateClaim(ctx, portservices.CreateClaimInput{
		Text:            input.Text,
		UserID:          input.UserID,
		ParentContentID: input.ParentContentID,
	})
	if err != nil {
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid input: %w", err)
		}
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("parent content not found")
		}
		slog.Error("creating claim failed",
			"error", err,
			"userID", input.UserID,
			"parentContentID", input.ParentContentID,
		)
		return nil, fmt.Errorf("failed to create claim: %v", err)
	}

	return domainToModel(content), nil
}

// ContentByID is the resolver for the contentByID field.
func (r *queryResolver) ContentByID(ctx context.Context, id string) (*model.Content, error) {
	intID, err := strconv.Atoi(id)
	if err != nil {
		return nil, fmt.Errorf("invalid content ID: %s", id)
	}

	content, err := r.ContentService.GetByID(ctx, intID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("content not found with ID: %s", id)
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid content ID: %s", id)
		}
		slog.Error("getting content failed", "id", id, "error", err)
		return nil, fmt.Errorf("failed to get content")
	}

	return domainToModel(content), nil
}

// Content is the resolver for the content field.
func (r *queryResolver) Content(ctx context.Context, first *int, after *string, last *int, before *string, sortBy *domain.ContentSortBy, sortOrder *domain.SortOrder, includeTotalCount *bool, filter *model.ContentFilter) (*model.PaginatedContent, error) {
	params := domain.ContentListParams{
		First:  first,
		After:  after,
		Last:   last,
		Before: before,
	}

	// Map GraphQL enums to domain enums
	if sortBy != nil {
		params.SortBy = *sortBy
	} else {
		params.SortBy = domain.ContentSortByCreatedAt
	}

	if sortOrder != nil {
		params.SortOrder = *sortOrder
	} else {
		params.SortOrder = domain.SortOrderDesc
	}

	if includeTotalCount != nil {
		params.IncludeTotalCount = *includeTotalCount
	}

	// Map filter
	if filter != nil {
		params.Filter = &domain.ContentFilter{}
		if filter.ContentType != nil {
			params.Filter.ContentType = filter.ContentType
		}
		params.Filter.MinLengthSeconds = filter.MinLengthSeconds
		params.Filter.MaxLengthSeconds = filter.MaxLengthSeconds
		params.Filter.Search = filter.Search
		params.Filter.MinViewCount = filter.MinViewCount
		params.Filter.MaxViewCount = filter.MaxViewCount
		params.Filter.MinLikeCount = filter.MinLikeCount
		params.Filter.MaxLikeCount = filter.MaxLikeCount
		params.Filter.PublishedAfter = filter.PublishedAfter
		params.Filter.PublishedBefore = filter.PublishedBefore
		params.Filter.ChannelTitle = filter.ChannelTitle
		params.Filter.TagContains = filter.TagContains
		params.Filter.DescriptionSearch = filter.DescriptionSearch
		params.Filter.CreatedAfter = filter.CreatedAfter
		params.Filter.CreatedBefore = filter.CreatedBefore
		params.Filter.UpdatedAfter = filter.UpdatedAfter
		params.Filter.UpdatedBefore = filter.UpdatedBefore
	}

	result, err := r.ContentService.ListContent(ctx, params)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid pagination parameters: %w", err)
		}
		slog.Error("listing content failed", "error", err)
		return nil, fmt.Errorf("failed to list content")
	}

	// Map domain result to GraphQL model
	items := make([]*model.Content, len(result.Items))
	for i, item := range result.Items {
		items[i] = domainToModel(item)
	}

	conn := &model.PaginatedContent{
		Items: items,
		PageInfo: &model.PageInfo{
			HasNextPage:     result.HasNext,
			HasPreviousPage: result.HasPrev,
			StartCursor:     result.StartCursor,
			EndCursor:       result.EndCursor,
		},
		TotalCount: result.TotalCount,
	}

	return conn, nil
}
