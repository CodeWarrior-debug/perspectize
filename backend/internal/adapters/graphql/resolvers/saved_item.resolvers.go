package resolvers

// Saved item resolvers: the saved formula reads and writes, plus the shared
// operations on any saved item (delete, restore, privacy, copy, link). Split out
// of the single gqlgen-generated schema.resolvers.go, see resolver.go. Mapping
// lives in helpers.go; this file only authenticates, calls SavedItemService and
// maps the result.
//
// Identity: writes take the actor from auth.RequireAuth (never a client id), and
// reads take the optional viewer from auth.ForContext. Ownership and privacy are
// decided by SavedItemService and the owner-scoped SQL under it.

import (
	"context"
	"errors"
	"fmt"
	"log/slog"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// MySavedFormulas is the resolver for the mySavedFormulas field. The list is
// always the caller's own, so an anonymous caller is refused.
func (r *queryResolver) MySavedFormulas(ctx context.Context, first *int, after *string, includeTotalCount *bool) (*model.PaginatedSavedFormulas, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}

	page, err := r.SavedItemService.ListMine(ctx, authUser.ID, savedFormulaListParams(first, after, includeTotalCount))
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}
	return savedItemPageToModel(page), nil
}

// SharedFormulas is the resolver for the sharedFormulas field: public formulas
// plus the caller's own. Anonymous callers see only the public ones.
func (r *queryResolver) SharedFormulas(ctx context.Context, first *int, after *string, includeTotalCount *bool) (*model.PaginatedSavedFormulas, error) {
	page, err := r.SavedItemService.ListShared(ctx, optionalID(callerID(ctx)), savedFormulaListParams(first, after, includeTotalCount))
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}
	return savedItemPageToModel(page), nil
}

// SavedItem is the resolver for the savedItem field. It answers null for a
// missing or deleted item and for someone else's PRIVATE item, so the id isn't
// confirmed.
func (r *queryResolver) SavedItem(ctx context.Context, id string) (model.SavedItem, error) {
	intID, err := parseIntID("id", id)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}

	item, err := r.SavedItemService.GetSavedItem(ctx, intID, optionalID(callerID(ctx)))
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}
	return savedItemDomainToModel(item), nil
}

// CreateSavedFormula is the resolver for the createSavedFormula field. The new
// formula is PRIVATE unless the input says otherwise.
func (r *mutationResolver) CreateSavedFormula(ctx context.Context, input model.CreateSavedFormulaInput) (*model.SavedFormula, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	in, err := modelToCreateSavedFormulaInput(input)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}

	item, err := r.SavedItemService.CreateSavedItem(ctx, authUser.ID, in)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}
	return savedFormulaDomainToModel(item), nil
}

// UpdateSavedFormula is the resolver for the updateSavedFormula field. A non-owner
// gets forbidden for a PUBLIC formula and not-found for a PRIVATE one (see the
// service).
func (r *mutationResolver) UpdateSavedFormula(ctx context.Context, input model.UpdateSavedFormulaInput) (*model.SavedFormula, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	in, err := modelToUpdateSavedFormulaInput(input)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}

	item, err := r.SavedItemService.UpdateSavedItem(ctx, authUser.ID, in)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}
	return savedFormulaDomainToModel(item), nil
}

// DeleteSavedItem is the resolver for the deleteSavedItem field. The delete is
// soft: a restore can undo it.
func (r *mutationResolver) DeleteSavedItem(ctx context.Context, id string) (bool, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return false, fmt.Errorf("access denied: authentication required")
	}
	intID, err := parseIntID("id", id)
	if err != nil {
		return false, savedItemError(err, "saved item")
	}

	if err := r.SavedItemService.DeleteSavedItem(ctx, authUser.ID, intID); err != nil {
		return false, savedItemError(err, "saved item")
	}
	return true, nil
}

// RestoreSavedItem is the resolver for the restoreSavedItem field.
func (r *mutationResolver) RestoreSavedItem(ctx context.Context, id string) (model.SavedItem, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	intID, err := parseIntID("id", id)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}

	item, err := r.SavedItemService.RestoreSavedItem(ctx, authUser.ID, intID)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}
	return savedItemDomainToModel(item), nil
}

// SetSavedItemPrivacy is the resolver for the setSavedItemPrivacy field.
func (r *mutationResolver) SetSavedItemPrivacy(ctx context.Context, id string, privacy domain.Privacy) (model.SavedItem, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	intID, err := parseIntID("id", id)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}

	item, err := r.SavedItemService.SetSavedItemPrivacy(ctx, authUser.ID, intID, privacy)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}
	return savedItemDomainToModel(item), nil
}

// CopySavedItem is the resolver for the copySavedItem field. The copy is a new
// PRIVATE item the caller owns and keeps credit to the source.
func (r *mutationResolver) CopySavedItem(ctx context.Context, id string) (model.SavedItem, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	intID, err := parseIntID("id", id)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}

	item, err := r.SavedItemService.CopySavedItem(ctx, authUser.ID, intID)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}
	return savedItemDomainToModel(item), nil
}

// LinkSavedItem is the resolver for the linkSavedItem field. The link stores no
// payload and reads its source's.
func (r *mutationResolver) LinkSavedItem(ctx context.Context, id string) (model.SavedItem, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	intID, err := parseIntID("id", id)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}

	item, err := r.SavedItemService.LinkSavedItem(ctx, authUser.ID, intID)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}
	return savedItemDomainToModel(item), nil
}

// ConvertLinkToCopy is the resolver for the convertLinkToCopy field.
func (r *mutationResolver) ConvertLinkToCopy(ctx context.Context, id string) (model.SavedItem, error) {
	authUser, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	intID, err := parseIntID("id", id)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}

	item, err := r.SavedItemService.ConvertLinkToCopy(ctx, authUser.ID, intID)
	if err != nil {
		return nil, savedItemError(err, "saved item")
	}
	return savedItemDomainToModel(item), nil
}

// User is the resolver for the user field of a saved formula: batched through the
// user loader.
func (r *savedFormulaResolver) User(ctx context.Context, obj *model.SavedFormula) (*model.User, error) {
	u, err := r.userByID(ctx, obj.UserID)
	if err != nil {
		return nil, err
	}
	return userDomainToModel(u), nil
}

// SavedFormula returns generated.SavedFormulaResolver implementation.
func (r *Resolver) SavedFormula() generated.SavedFormulaResolver {
	return &savedFormulaResolver{r}
}

type savedFormulaResolver struct{ *Resolver }

// savedItemError maps a service or input error to the client-facing error. what
// names the thing the operation was about, the same way userTodoError does.
func savedItemError(err error, what string) error {
	switch {
	case errors.Is(err, domain.ErrForbidden):
		return fmt.Errorf("access denied: you can only modify your own %ss", what)
	case errors.Is(err, domain.ErrNotFound):
		return fmt.Errorf("%s not found", what)
	case errors.Is(err, domain.ErrAlreadyExists):
		return fmt.Errorf("already exists: %w", err)
	case errors.Is(err, domain.ErrInvalidInput):
		return fmt.Errorf("invalid input: %w", err)
	}
	slog.Error("saved item operation failed", "what", what, "error", err)
	return fmt.Errorf("failed to process %s", what)
}
