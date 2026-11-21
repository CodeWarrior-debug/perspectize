package services_test

import (
	"bytes"
	"context"
	"errors"
	"log/slog"
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// Each limit on a staged file is pinned at its exact edge: the value on the
// limit is accepted and the value one past it is refused. A test that only
// sends a far-too-long value cannot tell `>` from `>=`.
func TestStageImportFromFile_EachLimitAcceptsItsEdgeAndRefusesOnePast(t *testing.T) {
	long := func(n int) string { return strings.Repeat("a", n) }
	oneRow := func(mutate func(*domain.StageImportFileItem)) []domain.StageImportFileItem {
		rows := fileRows(1)
		mutate(&rows[0])
		return rows
	}

	cases := []struct {
		name    string
		atEdge  domain.StageImportFileInput
		pastIt  domain.StageImportFileInput
		mention string
	}{
		{
			name:    "import name 120 characters",
			atEdge:  domain.StageImportFileInput{Name: long(120), Items: fileRows(1)},
			pastIt:  domain.StageImportFileInput{Name: long(121), Items: fileRows(1)},
			mention: "import name",
		},
		{
			name:    "source title 200 characters",
			atEdge:  domain.StageImportFileInput{Name: "x", SourceTitle: strPtr(long(200)), Items: fileRows(1)},
			pastIt:  domain.StageImportFileInput{Name: "x", SourceTitle: strPtr(long(201)), Items: fileRows(1)},
			mention: "sourceTitle",
		},
		{
			name:    "5000 rows",
			atEdge:  domain.StageImportFileInput{Name: "x", Items: fileRows(domain.MaxStagedFileItems)},
			pastIt:  domain.StageImportFileInput{Name: "x", Items: fileRows(domain.MaxStagedFileItems + 1)},
			mention: "1 to",
		},
		{
			name:    "externalId 64 characters",
			atEdge:  domain.StageImportFileInput{Name: "x", Items: oneRow(func(r *domain.StageImportFileItem) { r.ExternalID = long(64) })},
			pastIt:  domain.StageImportFileInput{Name: "x", Items: oneRow(func(r *domain.StageImportFileItem) { r.ExternalID = long(65) })},
			mention: "externalId",
		},
		{
			name:    "row title 300 characters",
			atEdge:  domain.StageImportFileInput{Name: "x", Items: oneRow(func(r *domain.StageImportFileItem) { r.Title = long(300) })},
			pastIt:  domain.StageImportFileInput{Name: "x", Items: oneRow(func(r *domain.StageImportFileItem) { r.Title = long(301) })},
			mention: "title",
		},
		{
			name:    "summary 600 characters",
			atEdge:  domain.StageImportFileInput{Name: "x", Items: oneRow(func(r *domain.StageImportFileItem) { r.Facts.Summary = strPtr(long(600)) })},
			pastIt:  domain.StageImportFileInput{Name: "x", Items: oneRow(func(r *domain.StageImportFileItem) { r.Facts.Summary = strPtr(long(601)) })},
			mention: "summary",
		},
		{
			name: "20 tags",
			atEdge: domain.StageImportFileInput{Name: "x", Items: oneRow(func(r *domain.StageImportFileItem) {
				r.Details.Tags = make([]string, 20)
			})},
			pastIt: domain.StageImportFileInput{Name: "x", Items: oneRow(func(r *domain.StageImportFileItem) {
				r.Details.Tags = make([]string, 21)
			})},
			mention: "tags",
		},
		{
			name: "person name 200 characters",
			atEdge: domain.StageImportFileInput{Name: "x", Items: oneRow(func(r *domain.StageImportFileItem) {
				r.Details.People = []domain.ImportPerson{{Name: long(200), Role: "author"}}
			})},
			pastIt: domain.StageImportFileInput{Name: "x", Items: oneRow(func(r *domain.StageImportFileItem) {
				r.Details.People = []domain.ImportPerson{{Name: long(201), Role: "author"}}
			})},
			mention: "person",
		},
	}

	for _, tc := range cases {
		t.Run(tc.name+" is accepted", func(t *testing.T) {
			svc, repo := newFileStagingService()
			job, err := svc.StageImportFromFile(context.Background(), importAdmin, tc.atEdge)
			require.NoError(t, err)
			assert.Equal(t, len(tc.atEdge.Items), job.Sources[0].ItemCount)
			assert.Equal(t, 1, repo.createJobs)
		})
		t.Run(tc.name+" one past is refused", func(t *testing.T) {
			svc, repo := newFileStagingService()
			_, err := svc.StageImportFromFile(context.Background(), importAdmin, tc.pastIt)
			require.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Contains(t, err.Error(), tc.mention)
			assert.Zero(t, repo.createJobs, "nothing is saved")
		})
	}
}

// newFileStagingServiceWith builds the staging service over a caller-supplied repository.
func newFileStagingServiceWith(repo repositories.ImportJobRepository) *services.ImportService {
	return services.NewImportService(repo, map[domain.ImportSourceType]portservices.ImportSourceLister{}, &fakeCreator{}, inline, fixedNow)
}

// failingUpdateRepo makes the source update fail too, as it does when the
// database itself is down.
type failingUpdateRepo struct {
	*countingImportRepo
	updateErr error
}

func (r *failingUpdateRepo) UpdateSource(ctx context.Context, id int, u repositories.ImportSourceUpdate) error {
	r.countingImportRepo.sourceUpdates++
	return r.updateErr
}

func TestStageImportFromFile_RowWriteFailureMarksTheSourceFailed(t *testing.T) {
	svc, repo := newFileStagingService()
	writeErr := errors.New("write failed")
	repo.upsertErr = writeErr

	_, err := svc.StageImportFromFile(context.Background(), importAdmin, domain.StageImportFileInput{Name: "x", Items: fileRows(2)})

	require.ErrorIs(t, err, writeErr)
	assert.Contains(t, err.Error(), "staging file rows")
	require.Len(t, repo.updates, 1, "one update: the failure marker, no ready count")
	assert.Equal(t, domain.ImportSourceStatusFailed, repo.updates[0].Status)
	require.NotNil(t, repo.updates[0].StatusDetail)
	assert.Contains(t, *repo.updates[0].StatusDetail, "Stage it again")
	assert.Nil(t, repo.updates[0].ItemCount)
}

func TestStageImportFromFile_RowWriteFailureSurvivesAFailedMarkerAndLogsIt(t *testing.T) {
	var logs bytes.Buffer
	previous := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(&logs, nil)))
	t.Cleanup(func() { slog.SetDefault(previous) })

	base := &countingImportRepo{fakeImportRepo: newFakeImportRepo()}
	base.upsertErr = errors.New("write failed")
	repo := &failingUpdateRepo{countingImportRepo: base, updateErr: errors.New("update failed")}
	svc := newFileStagingServiceWith(repo)

	_, err := svc.StageImportFromFile(context.Background(), importAdmin, domain.StageImportFileInput{Name: "x", Items: fileRows(1)})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "write failed", "the caller sees the row-write error, not the marker's")
	assert.NotContains(t, err.Error(), "update failed")
	assert.Contains(t, logs.String(), "staged file failure not saved")
	assert.Equal(t, 1, base.sourceUpdates)
}

func TestStageImportFromFile_CountSaveFailureIsReported(t *testing.T) {
	base := &countingImportRepo{fakeImportRepo: newFakeImportRepo()}
	repo := &failingUpdateRepo{countingImportRepo: base, updateErr: errors.New("update failed")}
	svc := newFileStagingServiceWith(repo)

	_, err := svc.StageImportFromFile(context.Background(), importAdmin, domain.StageImportFileInput{Name: "x", Items: fileRows(1)})

	require.Error(t, err)
	assert.Contains(t, err.Error(), "saving the staged row count")
}
