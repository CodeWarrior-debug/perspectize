package resolvers

// Perspective domain resolvers: create/update/delete/list perspectives.
// Split out of the single gqlgen-generated schema.resolvers.go for
// navigability — see resolver.go for why this survives `make graphql-gen`.
//
// Field-by-field mapping from the GraphQL input to the service-layer input
// lives in modelToCreatePerspectiveInput / modelToUpdatePerspectiveInput
// (helpers.go), not inline here — adding a perspective field only touches
// the schema, the domain model, the service input struct, and that mapper.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// CreatePerspective is the resolver for the createPerspective field.
func (r *mutationResolver) CreatePerspective(ctx context.Context, input model.CreatePerspectiveInput) (*model.Perspective, error) {
	// Use authenticated user when userID is not provided or zero
	userID := input.UserID
	if userID == 0 {
		authUser, err := auth.RequireAuth(ctx)
		if err != nil {
			return nil, fmt.Errorf("access denied: authentication required")
		}
		userID = authUser.ID
	}

	perspective, err := r.PerspectiveService.Create(ctx, modelToCreatePerspectiveInput(userID, input))
	if err != nil {
		if errors.Is(err, domain.ErrInvalidRating) {
			return nil, fmt.Errorf("invalid rating: %w", err)
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid input: %w", err)
		}
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("user not found: %w", err)
		}
		slog.Error("creating perspective failed", "error", err)
		return nil, fmt.Errorf("failed to create perspective: %v", err)
	}

	return perspectiveDomainToModel(perspective), nil
}

// UpdatePerspective is the resolver for the updatePerspective field.
func (r *mutationResolver) UpdatePerspective(ctx context.Context, input model.UpdatePerspectiveInput) (*model.Perspective, error) {
	perspective, err := r.PerspectiveService.Update(ctx, modelToUpdatePerspectiveInput(input))
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, fmt.Errorf("perspective not found")
		}
		if errors.Is(err, domain.ErrInvalidRating) {
			return nil, fmt.Errorf("invalid rating: %w", err)
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid input: %w", err)
		}
		slog.Error("updating perspective failed", "error", err)
		return nil, fmt.Errorf("failed to update perspective: %v", err)
	}

	return perspectiveDomainToModel(perspective), nil
}

// DeletePerspective is the resolver for the deletePerspective field.
func (r *mutationResolver) DeletePerspective(ctx context.Context, id string) (bool, error) {
	intID, err := strconv.Atoi(id)
	if err != nil {
		return false, fmt.Errorf("invalid perspective ID: %s", id)
	}

	err = r.PerspectiveService.Delete(ctx, intID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return false, fmt.Errorf("perspective not found")
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return false, fmt.Errorf("invalid perspective ID")
		}
		slog.Error("deleting perspective failed", "error", err)
		return false, fmt.Errorf("failed to delete perspective")
	}

	return true, nil
}

// PerspectiveByID is the resolver for the perspectiveByID field.
func (r *queryResolver) PerspectiveByID(ctx context.Context, id string) (*model.Perspective, error) {
	intID, err := strconv.Atoi(id)
	if err != nil {
		return nil, fmt.Errorf("invalid perspective ID: %s", id)
	}

	perspective, err := r.PerspectiveService.GetByID(ctx, intID)
	if err != nil {
		if errors.Is(err, domain.ErrNotFound) {
			return nil, nil // Return null for not found (GraphQL convention)
		}
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid perspective ID: %s", id)
		}
		slog.Error("getting perspective failed", "id", id, "error", err)
		return nil, fmt.Errorf("failed to get perspective")
	}

	// Private perspectives are visible only to their owner; return nil (not an
	// error) so the id's existence isn't disclosed. See
	// docs/superpowers/specs/2026-09-09-perspective-privacy-design.md.
	if perspective.Privacy == domain.PrivacyPrivate {
		viewer, ok := auth.ForContext(ctx)
		if !ok || viewer.ID != perspective.UserID {
			return nil, nil
		}
	}

	return perspectiveDomainToModel(perspective), nil
}

// Perspectives is the resolver for the perspectives field.
func (r *queryResolver) Perspectives(ctx context.Context, first *int, after *string, last *int, before *string, sortBy *domain.PerspectiveSortBy, sortOrder *domain.SortOrder, includeTotalCount *bool, filter *model.PerspectiveFilter) (*model.PaginatedPerspectives, error) {
	params := domain.PerspectiveListParams{
		First:  first,
		After:  after,
		Last:   last,
		Before: before,
	}

	// Map GraphQL enums to domain enums
	if sortBy != nil {
		params.SortBy = *sortBy
	} else {
		params.SortBy = domain.PerspectiveSortByCreatedAt
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
		params.Filter = &domain.PerspectiveFilter{}
		if filter.UserID != nil {
			params.Filter.UserID = filter.UserID
		}
		if filter.ContentID != nil {
			params.Filter.ContentID = filter.ContentID
		}
		if filter.Privacy != nil {
			params.Filter.Privacy = filter.Privacy
		}
	}

	// Scope the listing to what this viewer may see (public rows + their own).
	// See docs/superpowers/specs/2026-09-09-perspective-privacy-design.md.
	if viewer, ok := auth.ForContext(ctx); ok {
		id := viewer.ID
		params.ViewerID = &id
	}

	result, err := r.PerspectiveService.ListPerspectives(ctx, params)
	if err != nil {
		if errors.Is(err, domain.ErrInvalidInput) {
			return nil, fmt.Errorf("invalid pagination parameters: %w", err)
		}
		slog.Error("listing perspectives failed", "error", err)
		return nil, fmt.Errorf("failed to list perspectives")
	}

	// Map domain result to GraphQL model
	items := make([]*model.Perspective, len(result.Items))
	for i, item := range result.Items {
		items[i] = perspectiveDomainToModel(item)
	}

	conn := &model.PaginatedPerspectives{
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
