// Package dataloader wires per-request batching loaders into the request
// context so GraphQL field resolvers can collapse N per-row lookups into a
// single batched query.
//
// Hexagonal boundary: loaders depend only on the service ports in
// internal/core/ports/services. No SQL and no repository types appear here —
// the batch functions call through the same CategoryService the resolvers
// already use.
package dataloader

import (
	"context"
	"errors"
	"net/http"

	"github.com/vikstrous/dataloadgen"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

type ctxKey struct{}

// Loaders holds every per-request loader. One instance lives for the duration
// of a single HTTP request.
type Loaders struct {
	CategoryByID                    *dataloadgen.Loader[int, *domain.Category]
	PerspectiveAggregateByContentID *dataloadgen.Loader[int, *domain.PerspectiveAggregate]
}

// NewLoaders builds a fresh set of loaders backed by the given services.
func NewLoaders(categoryService portservices.CategoryService, perspectiveService portservices.PerspectiveService) *Loaders {
	cb := &categoryBatcher{service: categoryService}
	pb := &perspectiveAggregateBatcher{service: perspectiveService}
	return &Loaders{
		CategoryByID:                    dataloadgen.NewMappedLoader(cb.byID),
		PerspectiveAggregateByContentID: dataloadgen.NewMappedLoader(pb.byContentID),
	}
}

// Middleware injects a fresh *Loaders into the context of every request. It
// mirrors the chi middleware conventions in cmd/server/main.go (a
// func(http.Handler) http.Handler).
func Middleware(categoryService portservices.CategoryService, perspectiveService portservices.PerspectiveService) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), ctxKey{}, NewLoaders(categoryService, perspectiveService))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// For returns the loaders bound to the current request, or nil if the
// middleware is not installed (callers must handle nil and fall back).
func For(ctx context.Context) *Loaders {
	l, _ := ctx.Value(ctxKey{}).(*Loaders)
	return l
}

// categoryBatcher adapts CategoryService to a dataloadgen mapped-fetch func.
type categoryBatcher struct {
	service portservices.CategoryService
}

// byID resolves a batch of category IDs to a keyed map. dataloadgen fills in
// dataloadgen.ErrNotFound for any key absent from the returned map; the
// resolver treats that as "no category".
func (b *categoryBatcher) byID(ctx context.Context, ids []int) (map[int]*domain.Category, error) {
	cats, err := b.service.GetCategoriesByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make(map[int]*domain.Category, len(cats))
	for _, c := range cats {
		if c != nil {
			out[c.ID] = c
		}
	}
	return out, nil
}

// perspectiveAggregateBatcher adapts PerspectiveService to a dataloadgen
// mapped-fetch func, batching per-content perspective count/average-rating
// lookups across a single GraphQL request into one query.
type perspectiveAggregateBatcher struct {
	service portservices.PerspectiveService
}

// byContentID resolves a batch of content IDs to their perspective aggregate.
// A content ID with no public perspectives is simply absent from the
// returned map; dataloadgen surfaces that as dataloadgen.ErrNotFound, which
// resolvers treat as "count 0 / no average" via IsNotFound.
func (b *perspectiveAggregateBatcher) byContentID(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error) {
	return b.service.AggregateByContentIDs(ctx, contentIDs)
}

// IsNotFound reports whether a loader error is just "this key had no row",
// which resolvers should surface as a nil value rather than a GraphQL error.
func IsNotFound(err error) bool {
	return errors.Is(err, dataloadgen.ErrNotFound)
}
