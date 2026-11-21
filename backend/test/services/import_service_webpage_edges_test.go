package services_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// A website create that reports success but returns no row must fail the
// source, not file every page under a missing parent.
func TestImportWebPage_WebsiteCreateReturningNothingFailsTheSource(t *testing.T) {
	repo := newFakeImportRepo()
	creator := &pageCreator{fakeCreator: &fakeCreator{}}
	creator.website = func(_ int, _ string) (*domain.Content, error) { return nil, nil }
	job, ids := stagePages(t, repo, []*string{strPtr("https://sitea.com/")}, 2)
	svc := newPageImportService(repo, creator)

	_, err := svc.ImportItems(context.Background(), importAdmin, job.ID, ids[0])
	require.NoError(t, err)

	for _, id := range ids[0] {
		item := repo.items[id].Item
		assert.Equal(t, domain.ImportItemStatusFailed, *item.ImportStatus)
		assert.Equal(t, "couldn't create the website", *item.ImportError)
	}
	_, pages := creator.calls()
	assert.Empty(t, pages, "no page is filed without a website row")
}
