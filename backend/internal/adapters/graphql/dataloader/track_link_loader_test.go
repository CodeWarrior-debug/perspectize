package dataloader

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

type trackLinkService struct {
	portservices.ContentService
	calls int
}

func (s *trackLinkService) TrackLinksByContentIDs(_ context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	s.calls++
	return map[int][]domain.TrackLink{1: {{ID: 9, ContentID: 1}}}, nil
}

func TestTrackLinksByContentID_BatchesAndFillsMissingKeys(t *testing.T) {
	svc := &trackLinkService{}
	l := NewLoaders(Services{Content: svc})
	got, err := l.TrackLinksByContentID.LoadAll(context.Background(), []int{1, 2, 3})
	require.NoError(t, err, "a track with no links is an empty list, not an error")
	assert.Equal(t, 1, svc.calls)
	assert.Len(t, got[0], 1)
	assert.Empty(t, got[1])
	assert.Empty(t, got[2])
}
