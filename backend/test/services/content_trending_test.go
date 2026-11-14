package services_test

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// recordingTrendingClient records the arguments the service passes through.
type recordingTrendingClient struct {
	region, token string
	calls         int
}

func (r *recordingTrendingClient) GetTrending(ctx context.Context, regionCode, pageToken string) (*portservices.TrendingPage, error) {
	r.calls++
	r.region, r.token = regionCode, pageToken
	return &portservices.TrendingPage{Items: []portservices.TrendingVideo{{ID: "v1"}}}, nil
}

func TestYouTubeTrending_NormalisesRegion(t *testing.T) {
	tests := []struct {
		name, in, want string
	}{
		{"empty defaults to US", "", "US"},
		{"lowercase is upper-cased", "gb", "GB"},
		{"whitespace is trimmed", "  de ", "DE"},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			client := &recordingTrendingClient{}
			svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil, services.WithYouTubeTrending(client))

			page, err := svc.YouTubeTrending(context.Background(), tc.in, " tok ")
			require.NoError(t, err)
			require.Len(t, page.Items, 1)
			assert.Equal(t, tc.want, client.region)
			assert.Equal(t, "tok", client.token)
		})
	}
}

func TestYouTubeTrending_RejectsInvalidInput(t *testing.T) {
	tests := []struct {
		name, region, token string
	}{
		{"three letters", "USA", ""},
		{"digits", "U1", ""},
		{"non-ASCII", "ÜS", ""},
		{"oversized page token", "US", string(make([]byte, 129))},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			client := &recordingTrendingClient{}
			svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil, services.WithYouTubeTrending(client))

			_, err := svc.YouTubeTrending(context.Background(), tc.region, tc.token)
			require.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Equal(t, 0, client.calls, "invalid input must not reach the YouTube API")
		})
	}
}

func TestYouTubeTrending_NotConfigured(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil)

	_, err := svc.YouTubeTrending(context.Background(), "US", "")
	require.ErrorIs(t, err, domain.ErrYouTubeAPI)
}
