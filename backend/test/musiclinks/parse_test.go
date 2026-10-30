package musiclinks_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/musiclinks"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestParse_Tracks(t *testing.T) {
	cases := []struct {
		in   string
		want musiclinks.Link
	}{
		{"https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
			musiclinks.Link{Provider: domain.ProviderSpotify, ProviderTrackID: "4uLU6hMCjMI75M1A2tKUQC", CanonicalURL: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", Kind: domain.TrackLinkKindListen}},
		{"spotify:track:4uLU6hMCjMI75M1A2tKUQC",
			musiclinks.Link{Provider: domain.ProviderSpotify, ProviderTrackID: "4uLU6hMCjMI75M1A2tKUQC", CanonicalURL: "https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC", Kind: domain.TrackLinkKindListen}},
		{"https://music.apple.com/us/song/bohemian-rhapsody/1440650711",
			musiclinks.Link{Provider: domain.ProviderAppleMusic, ProviderTrackID: "1440650711", CanonicalURL: "https://music.apple.com/us/song/1440650711", Kind: domain.TrackLinkKindListen, SuggestedTitle: "Bohemian Rhapsody"}},
		{"https://music.apple.com/gb/song/1440650711",
			musiclinks.Link{Provider: domain.ProviderAppleMusic, ProviderTrackID: "1440650711", CanonicalURL: "https://music.apple.com/gb/song/1440650711", Kind: domain.TrackLinkKindListen}},
		{"https://music.amazon.com/tracks/B07D5J5QX3",
			musiclinks.Link{Provider: domain.ProviderAmazonMusic, ProviderTrackID: "B07D5J5QX3", CanonicalURL: "https://music.amazon.com/tracks/B07D5J5QX3", Kind: domain.TrackLinkKindListen}},
		{"https://music.amazon.co.uk/albums/B07D5HXYZ1?trackAsin=B07D5J5QX3&ref=dm_sh",
			musiclinks.Link{Provider: domain.ProviderAmazonMusic, ProviderTrackID: "B07D5J5QX3", CanonicalURL: "https://music.amazon.co.uk/tracks/B07D5J5QX3", Kind: domain.TrackLinkKindListen}},
		{"https://music.youtube.com/watch?v=dQw4w9WgXcQ&si=abc",
			musiclinks.Link{Provider: domain.ProviderYouTube, ProviderTrackID: "dQw4w9WgXcQ", CanonicalURL: "https://music.youtube.com/watch?v=dQw4w9WgXcQ", Kind: domain.TrackLinkKindEmbed}},
	}
	for _, tc := range cases {
		got, err := musiclinks.Parse(tc.in)
		require.NoError(t, err, tc.in)
		assert.Equal(t, tc.want, got, tc.in)
	}
}

// Review Focus 1: tracking and locale noise must not create a second identity.
func TestParse_CanonicalisesNoise(t *testing.T) {
	base, err := musiclinks.Parse("https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC")
	require.NoError(t, err)
	for _, in := range []string{
		"https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=1a2b3c4d5e",
		"https://open.spotify.com/intl-de/track/4uLU6hMCjMI75M1A2tKUQC",
		"  HTTPS://OPEN.SPOTIFY.COM/track/4uLU6hMCjMI75M1A2tKUQC/  ",
	} {
		got, err := musiclinks.Parse(in)
		require.NoError(t, err, in)
		assert.Equal(t, base.ProviderTrackID, got.ProviderTrackID, in)
		assert.Equal(t, base.CanonicalURL, got.CanonicalURL, in)
	}
	apple, err := musiclinks.Parse("https://music.apple.com/us/album/a-night-at-the-opera/1440650428?i=1440650711&l=es")
	require.NoError(t, err)
	assert.Equal(t, "1440650711", apple.ProviderTrackID)
	assert.Equal(t, "", apple.SuggestedTitle, "an album slug is not the song title")
}

func TestParse_CollectionsAreNotTracks(t *testing.T) {
	for _, in := range []string{
		"https://open.spotify.com/album/1GbtB4zTqAsyfZEsm1RZfx",
		"https://open.spotify.com/playlist/37i9dQZF1DXcBWIGoYBM5M",
		"https://open.spotify.com/artist/0gxyHStUsqpMadRV0Di1Qt",
		"https://music.apple.com/us/album/a-night-at-the-opera/1440650428",
		"https://music.apple.com/us/playlist/todays-hits/pl.f4d106fed2bd41149aaacabb233eb5eb",
		"https://music.amazon.com/albums/B07D5HXYZ1",
		"https://music.amazon.com/playlists/B01M11SBC8",
		"https://music.youtube.com/playlist?list=OLAK5uy_x",
	} {
		_, err := musiclinks.Parse(in)
		assert.ErrorIs(t, err, domain.ErrNotATrack, in)
	}
}

func TestParse_Unsupported(t *testing.T) {
	for _, in := range []string{
		"",
		"not a url",
		"https://www.youtube.com/watch?v=dQw4w9WgXcQ", // plain YouTube stays a video (ADR 0005)
		"https://soundcloud.com/rick/never",
		"https://open.spotify.com/track/short",
		"https://music.amazon.com/tracks/lowercase1",
		"https://evil.example/open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC",
	} {
		_, err := musiclinks.Parse(in)
		assert.ErrorIs(t, err, domain.ErrInvalidURL, in)
	}
}
