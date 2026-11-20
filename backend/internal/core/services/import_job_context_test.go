package services

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// jobIDRecordingCreator records the import job id each create call's context carries.
type jobIDRecordingCreator struct {
	jobIDs []int
	found  []bool
}

func (c *jobIDRecordingCreator) record(ctx context.Context) (*domain.Content, error) {
	id, ok := importJobIDFrom(ctx)
	c.jobIDs = append(c.jobIDs, id)
	c.found = append(c.found, ok)
	return &domain.Content{ID: 5}, nil
}

func (c *jobIDRecordingCreator) CreateFromYouTube(ctx context.Context, _ string, _ int) (*domain.Content, error) {
	return c.record(ctx)
}

func (c *jobIDRecordingCreator) CreateFromMovie(ctx context.Context, _ string, _ int) (*domain.Content, error) {
	return c.record(ctx)
}

// outcomeOnlyRepo is an ImportJobRepository whose only method importOne uses is RecordOutcome.
type outcomeOnlyRepo struct {
	repositories.ImportJobRepository // nil: any other method panics
}

func (outcomeOnlyRepo) RecordOutcome(context.Context, int, domain.ImportItemStatus, *string, *int) error {
	return nil
}

func TestImportOne_PassesJobIDToContentCreate(t *testing.T) {
	creator := &jobIDRecordingCreator{}
	s := &ImportService{repo: outcomeOnlyRepo{}, content: creator}

	video := &domain.ImportItem{ID: 3, JobID: 42, DestinationType: domain.ContentTypeYouTubeVideo, CanonicalURL: "https://www.youtube.com/watch?v=x"}
	movie := &domain.ImportItem{ID: 4, JobID: 42, DestinationType: domain.ContentTypeMovie, CanonicalURL: "https://www.themoviedb.org/movie/1"}
	_, _ = s.importOne(context.Background(), 9, video)
	_, _ = s.importOne(context.Background(), 9, movie)

	require.Len(t, creator.jobIDs, 2)
	assert.Equal(t, []int{42, 42}, creator.jobIDs, "every create made for a row names the row's import")
	assert.Equal(t, []bool{true, true}, creator.found)
}

func TestImportJobIDFrom_AbsentWithoutContext(t *testing.T) {
	id, ok := importJobIDFrom(context.Background())
	assert.False(t, ok)
	assert.Zero(t, id)
}
