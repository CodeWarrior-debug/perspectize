package domain_test

import (
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

func TestReadMusic_ReadsNestedObject(t *testing.T) {
	raw := json.RawMessage(`{"items":[],"music":{"provider":"youtube","artist":"Queen","isrc":"GBUM71029604","explicit":true,"suggestedGenreId":21}}`)
	m := domain.ReadMusic(raw)
	assert.Equal(t, domain.ProviderYouTube, m.Provider)
	assert.Equal(t, "Queen", m.Artist)
	assert.Equal(t, "GBUM71029604", m.ISRC)
	assert.True(t, m.Explicit)
	if assert.NotNil(t, m.SuggestedGenreID) {
		assert.Equal(t, 21, *m.SuggestedGenreID)
	}
}

func TestReadMusic_EmptyOrMalformedIsZero(t *testing.T) {
	assert.Equal(t, domain.MusicFields{}, domain.ReadMusic(nil))
	assert.Equal(t, domain.MusicFields{}, domain.ReadMusic(json.RawMessage(`{"music":"nope"}`)))
}

func TestIsUnofficialUpload(t *testing.T) {
	assert.True(t, domain.IsUnofficialUpload(domain.MusicFields{Provider: domain.ProviderYouTube, VideoType: "other"}))
	assert.False(t, domain.IsUnofficialUpload(domain.MusicFields{Provider: domain.ProviderYouTube, VideoType: "audio"}))
	assert.False(t, domain.IsUnofficialUpload(domain.MusicFields{Provider: domain.ProviderSpotify}))
}
