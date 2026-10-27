package services

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// ResolvedImportSource is a source reference checked against its API: the
// stable id to list from, and how to show and link it.
type ResolvedImportSource struct {
	// ID is the source's stable id (a UC… channel id, a TMDB person id).
	ID    string
	Title string
	URL   string
}

// ImportBatchFunc receives candidates as a lister produces them, at most 50 at
// a time. Returning an error stops the listing with that error.
type ImportBatchFunc func(batch []*domain.ImportItemWithDetails) error

// ImportSourceLister lists one kind of import source into staged candidates.
// Candidates come back with every decision field filled in (the expensive
// enrichment happens here, in batches), but without JobID or SourceID: the
// import service sets those.
type ImportSourceLister interface {
	// Resolve checks a reference as entered (an id, a handle or a URL) and
	// returns the stable id plus display data. domain.ErrNotFound when the
	// source doesn't exist; domain.ErrInvalidInput when ref can't be parsed.
	Resolve(ctx context.Context, ref string) (*ResolvedImportSource, error)

	// List pages through the resolved source and calls emit with each batch,
	// in listing order. role narrows a person's credits (nil = every credit
	// the source type supports). It returns after the last batch, or with the
	// first error from the API or from emit.
	List(ctx context.Context, source ResolvedImportSource, role *domain.ImportPersonRole, emit ImportBatchFunc) error
}
