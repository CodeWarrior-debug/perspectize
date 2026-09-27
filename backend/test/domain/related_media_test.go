package domain_test

import (
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestAddRelatedMedia(t *testing.T) {
	base := []domain.RelatedMedia{{Provider: "youtube", VideoID: "aaaaaaaaaaa", Kind: domain.RelatedMediaKindAudio}}

	tests := []struct {
		name    string
		ref     domain.RelatedMedia
		changed bool
		wantLen int
	}{
		{"new video is appended", domain.RelatedMedia{Provider: "youtube", VideoID: "bbbbbbbbbbb", Kind: domain.RelatedMediaKindOfficialVideo}, true, 2},
		{"same provider and video is ignored", domain.RelatedMedia{Provider: "youtube", VideoID: "aaaaaaaaaaa", Kind: domain.RelatedMediaKindLive}, false, 1},
		{"same video from another provider is appended", domain.RelatedMedia{Provider: "other", VideoID: "aaaaaaaaaaa"}, true, 2},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			start := append([]domain.RelatedMedia(nil), base...)
			got, changed := domain.AddRelatedMedia(start, tt.ref)
			assert.Equal(t, tt.changed, changed)
			assert.Len(t, got, tt.wantLen)
		})
	}
}

func TestLinkAndMarkRelatedMedia(t *testing.T) {
	list := []domain.RelatedMedia{{Provider: "youtube", VideoID: "aaaaaaaaaaa"}}

	assert.False(t, domain.LinkRelatedMedia(list, "youtube", "zzzzzzzzzzz", 9))
	require.True(t, domain.LinkRelatedMedia(list, "youtube", "aaaaaaaaaaa", 9))
	require.NotNil(t, list[0].ContentID)
	assert.Equal(t, 9, *list[0].ContentID)

	assert.False(t, domain.MarkRelatedMediaUnavailable(list, "youtube", "zzzzzzzzzzz"))
	assert.True(t, domain.MarkRelatedMediaUnavailable(list, "youtube", "aaaaaaaaaaa"))
	assert.True(t, list[0].Unavailable)
}

func TestLyricsAvailabilityNeedsRecheck(t *testing.T) {
	now := time.Date(2026, 9, 27, 12, 0, 0, 0, time.UTC)
	old := now.Add(-domain.LyricsRecheckAfter - time.Hour)
	recent := now.Add(-time.Hour)

	tests := []struct {
		name string
		l    *domain.LyricsAvailability
		want bool
	}{
		{"never checked", nil, true},
		{"found long ago is never rechecked", &domain.LyricsAvailability{Available: true, CheckedAt: old}, false},
		{"not found recently is trusted", &domain.LyricsAvailability{Available: false, CheckedAt: recent}, false},
		{"not found long ago is rechecked", &domain.LyricsAvailability{Available: false, CheckedAt: old}, true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.l.NeedsRecheck(now))
		})
	}
}
