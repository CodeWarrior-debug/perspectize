package services_test

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

func TestClientUnavailableSentinelsCarryKind(t *testing.T) {
	for _, sentinel := range []error{
		services.ErrMovieClientUnavailable,
		services.ErrBookClientUnavailable,
		services.ErrWebPageClientUnavailable,
	} {
		assert.True(t, errors.Is(sentinel, domain.ErrUnavailable), sentinel.Error())
		assert.Equal(t, domain.KindUnavailable, domain.KindOf(sentinel))
	}
}

func TestCreateFromYouTube_MetadataFailureIsUnavailable(t *testing.T) {
	yt := &mockYouTubeClient{
		extractVideoIDFn: func(url string) (string, error) { return "abc123", nil },
		getVideoMetadataFn: func(ctx context.Context, id string) (*portservices.VideoMetadata, error) {
			return nil, errors.New("upstream 500")
		},
	}
	svc := services.NewContentService(&mockContentRepository{}, yt, nil)
	_, err := svc.CreateFromYouTube(context.Background(), "https://youtu.be/abc123", 1)
	require.Error(t, err)
	assert.EqualError(t, err, "failed to fetch video metadata")
	assert.Equal(t, domain.KindUnavailable, domain.KindOf(err))
}
