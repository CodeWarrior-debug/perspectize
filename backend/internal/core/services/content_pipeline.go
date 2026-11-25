package services

import (
	"context"
	"errors"
	"fmt"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// contentCreation is one content type's part of a create. The pipeline supplies
// everything shared: the dedupe lookup, the import stamp, the upsert and the
// already-existed outcome. A spec supplies only how its type names a row, how it
// builds the row, and whether it can dedupe before doing any work.
type contentCreation struct {
	// precheck reads the row by URL before build runs, so a URL already saved
	// costs no fetch. A type with nothing to fetch (passage) leaves it false and
	// relies on the upsert to report the duplicate.
	precheck bool
	// refreshOnConflict makes the upsert refresh the stored row's metadata when
	// it loses a race with a concurrent create of the same URL.
	refreshOnConflict bool
	// canonical parses the input and returns the URL the row is stored under.
	// Errors wrap the domain sentinels the resolver maps to error kinds.
	canonical func(ctx context.Context) (string, error)
	// build fetches and shapes the unsaved row for canonical. Policy checks run
	// here, before any write.
	build func(ctx context.Context, canonical string) (*domain.Content, error)
}

// createContent runs one content create. It returns the stored row with
// domain.ErrAlreadyExists when the URL was already saved, so callers that only
// need the row keep working; the resolver turns that pair into the
// alreadyExisted outcome.
func (s *ContentService) createContent(ctx context.Context, spec contentCreation) (*domain.Content, error) {
	canonical, err := spec.canonical(ctx)
	if err != nil {
		return nil, err
	}
	if spec.precheck {
		existing, err := s.existingByURL(ctx, canonical)
		if err != nil {
			return nil, err
		}
		if existing != nil {
			return existing, domain.ErrAlreadyExists
		}
	}

	content, err := spec.build(ctx, canonical)
	if err != nil {
		return nil, err
	}
	if jobID, ok := importJobIDFrom(ctx); ok {
		content.ImportJobID = &jobID
	}

	created, alreadyExisted, err := s.repo.GetOrCreateByURL(ctx, content, spec.refreshOnConflict)
	if err != nil {
		return nil, fmt.Errorf("failed to save content: %w", err)
	}
	if alreadyExisted {
		return created, domain.ErrAlreadyExists
	}
	return created, nil
}

// existingByURL returns the saved row for a canonical URL, or (nil, nil) when
// there is none.
func (s *ContentService) existingByURL(ctx context.Context, canonical string) (*domain.Content, error) {
	existing, err := s.repo.GetByURL(ctx, canonical)
	if err == nil && existing != nil {
		return existing, nil
	}
	if err != nil && !errors.Is(err, domain.ErrNotFound) {
		return nil, fmt.Errorf("failed to check existing content: %w", err)
	}
	return nil, nil
}
