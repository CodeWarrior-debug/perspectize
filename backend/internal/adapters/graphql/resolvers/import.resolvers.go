package resolvers

import (
	"context"
	"errors"
	"fmt"
	"log/slog"
	"strconv"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// errImportsNotConfigured is returned when the server was started without an ImportService.
var errImportsNotConfigured = errors.New("imports are not configured on this server")

func (r *Resolver) imports() (portservices.ImportService, error) {
	if r.ImportService == nil {
		return nil, errImportsNotConfigured
	}
	return r.ImportService, nil
}

// Items is the resolver for the items field: every staged row in one query.
func (r *importJobResolver) Items(ctx context.Context, obj *model.ImportJob) ([]*model.ImportItem, error) {
	svc, err := r.imports()
	if err != nil {
		return nil, err
	}
	jobID, err := strconv.Atoi(obj.ID)
	if err != nil {
		return nil, fmt.Errorf("invalid import id: %s", obj.ID)
	}
	items, err := svc.ListImportItems(ctx, jobID)
	if err != nil {
		return nil, importError(err)
	}
	out := make([]*model.ImportItem, len(items))
	for i, it := range items {
		out[i] = importItemToModel(it)
	}
	return out, nil
}

// CreateImportJob is the resolver for the createImportJob field. Admin only (enforced in the service).
func (r *mutationResolver) CreateImportJob(ctx context.Context, input model.CreateImportJobInput) (*model.ImportJob, error) {
	svc, err := r.imports()
	if err != nil {
		return nil, err
	}
	actor, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	job, err := svc.CreateImportJob(ctx, actor, modelToCreateImportJobInput(input))
	if err != nil {
		return nil, importError(err)
	}
	return importJobToModel(job), nil
}

// ImportItems is the resolver for the importItems field.
func (r *mutationResolver) ImportItems(ctx context.Context, input model.ImportItemsInput) (*model.ImportItemsResult, error) {
	svc, err := r.imports()
	if err != nil {
		return nil, err
	}
	actor, err := auth.RequireAuth(ctx)
	if err != nil {
		return nil, fmt.Errorf("access denied: authentication required")
	}
	res, err := svc.ImportItems(ctx, actor, input.JobID, input.ItemIds)
	if err != nil {
		return nil, importError(err)
	}
	return &model.ImportItemsResult{
		Queued:           res.Queued,
		AlreadyInLibrary: res.AlreadyInLibrary,
		AlreadyQueued:    res.AlreadyQueued,
		NotFound:         res.NotFound,
	}, nil
}

// ImportJobs is the resolver for the importJobs field.
func (r *queryResolver) ImportJobs(ctx context.Context) ([]*model.ImportJob, error) {
	svc, err := r.imports()
	if err != nil {
		return nil, err
	}
	jobs, err := svc.ListImportJobs(ctx)
	if err != nil {
		return nil, importError(err)
	}
	out := make([]*model.ImportJob, len(jobs))
	for i, j := range jobs {
		out[i] = importJobToModel(j)
	}
	return out, nil
}

// ImportJob is the resolver for the importJob field. Null for an unknown id.
func (r *queryResolver) ImportJob(ctx context.Context, id string) (*model.ImportJob, error) {
	svc, err := r.imports()
	if err != nil {
		return nil, err
	}
	jobID, err := strconv.Atoi(id)
	if err != nil {
		return nil, nil
	}
	job, err := svc.GetImportJob(ctx, jobID)
	if err != nil {
		return nil, importError(err)
	}
	if job == nil {
		return nil, nil
	}
	return importJobToModel(job), nil
}

// ImportItemDetails is the resolver for the importItemDetails field. Null for an unknown id.
func (r *queryResolver) ImportItemDetails(ctx context.Context, id string) (*model.ImportItemDetails, error) {
	svc, err := r.imports()
	if err != nil {
		return nil, err
	}
	itemID, err := strconv.Atoi(id)
	if err != nil {
		return nil, nil
	}
	d, err := svc.GetImportItemDetails(ctx, itemID)
	if err != nil {
		return nil, importError(err)
	}
	if d == nil {
		return nil, nil
	}
	return importItemDetailsToModel(d), nil
}

// importError maps service errors to client messages. Input and not-found
// messages are written for users; anything else is logged and hidden.
func importError(err error) error {
	switch {
	case errors.Is(err, domain.ErrForbidden), errors.Is(err, domain.ErrInvalidInput), errors.Is(err, domain.ErrNotFound):
		return err
	case errors.Is(err, domain.ErrYouTubeAPI):
		return fmt.Errorf("YouTube refused the request; check the channel and try again later")
	}
	slog.Error("import operation failed", "error", err)
	return fmt.Errorf("failed to process import")
}
