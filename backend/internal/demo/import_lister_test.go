package demo

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestImportLister_ResolvesFixtureSourcesByRefTitleOrURL(t *testing.T) {
	ctx := context.Background()
	yt := NewImportLister(domain.ImportSourceYouTubeChannel)
	for _, ref := range []string{"@JordanBPeterson", "jordanbpeterson", "Jordan B Peterson", "https://www.youtube.com/@JordanBPeterson"} {
		got, err := yt.Resolve(ctx, ref)
		require.NoError(t, err, ref)
		assert.Equal(t, "Jordan B Peterson", got.Title, ref)
	}

	people := NewImportLister(domain.ImportSourceTMDBPerson)
	for _, ref := range []string{"525", "Christopher Nolan"} {
		got, err := people.Resolve(ctx, ref)
		require.NoError(t, err, ref)
		assert.Equal(t, "Christopher Nolan", got.Title)
	}

	_, err := yt.Resolve(ctx, "@GaitherMusic")
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.Contains(t, err.Error(), "Grace to You", "the error names the sample sources demo mode has")
	_, err = people.Resolve(ctx, "@JordanBPeterson")
	assert.ErrorIs(t, err, domain.ErrNotFound, "each lister only knows its own source type")
}

func TestImportLister_ListsInBatches(t *testing.T) {
	ctx := context.Background()
	yt := NewImportLister(domain.ImportSourceYouTubeChannel)
	src, err := yt.Resolve(ctx, "Grace to You")
	require.NoError(t, err)
	var batches, rows int
	require.NoError(t, yt.List(ctx, *src, nil, func(b []*domain.ImportItemWithDetails) error {
		batches++
		rows += len(b)
		assert.LessOrEqual(t, len(b), fixtureBatchSize)
		return nil
	}))
	assert.Equal(t, 27, rows)
	assert.Equal(t, 1, batches)
}
