package domain

import (
	"encoding/json"
	"time"
)

// TrackProvider is where a track link points. Stored lowercase.
type TrackProvider string

const (
	ProviderYouTube     TrackProvider = "youtube"
	ProviderSpotify     TrackProvider = "spotify"
	ProviderAppleMusic  TrackProvider = "apple_music"
	ProviderAmazonMusic TrackProvider = "amazon_music"
)

// ResponseKeyMusic is the response key holding MusicFields (old-spec decisions 12/13).
const ResponseKeyMusic = "music"

// MusicFields is response.music on an AUDIO_TRACK row.
type MusicFields struct {
	Provider          TrackProvider `json:"provider"`
	VideoID           string        `json:"videoId,omitempty"`
	Artist            string        `json:"artist,omitempty"`
	Artists           []string      `json:"artists,omitempty"`
	Album             string        `json:"album,omitempty"`
	VideoType         string        `json:"videoType,omitempty"`
	ISRC              string        `json:"isrc,omitempty"`
	ReleaseDate       string        `json:"releaseDate,omitempty"`
	Genre             string        `json:"genre,omitempty"`
	MusicBrainzID     string        `json:"musicbrainzId,omitempty"`
	CoverImageURL     string        `json:"coverImageUrl,omitempty"`
	EnrichmentPending bool          `json:"enrichmentPending,omitempty"`
	Explicit          bool          `json:"explicit,omitempty"`
	SuggestedGenreID  *int          `json:"suggestedGenreId,omitempty"`
}

// ReadMusic returns response.music, or the zero value when absent or malformed.
func ReadMusic(raw json.RawMessage) MusicFields {
	var wrap struct {
		Music json.RawMessage `json:"music"`
	}
	if len(raw) == 0 || json.Unmarshal(raw, &wrap) != nil || len(wrap.Music) == 0 {
		return MusicFields{}
	}
	var m MusicFields
	if json.Unmarshal(wrap.Music, &m) != nil {
		return MusicFields{}
	}
	return m
}

// IsUnofficialUpload reports a YouTube Music user upload (InnerTube type other).
// ADR 0005: it is its own track, never merged with the official recording.
func IsUnofficialUpload(m MusicFields) bool {
	return m.Provider == ProviderYouTube && m.VideoType == "other"
}

// TrackLinkKind says whether a link plays in-page (EMBED) or opens the provider (LISTEN).
type TrackLinkKind string

const (
	TrackLinkKindListen TrackLinkKind = "LISTEN"
	TrackLinkKindEmbed  TrackLinkKind = "EMBED"
)

// TrackLinkSource says how a link got onto the track.
type TrackLinkSource string

const (
	TrackLinkSourcePasted  TrackLinkSource = "PASTED"
	TrackLinkSourceMatched TrackLinkSource = "MATCHED" // reserved for the matcher (ticket 02); unused in v1
)

// TrackLink is one track_links row.
type TrackLink struct {
	ID              int
	ContentID       int
	Provider        TrackProvider
	ProviderTrackID string
	URL             string
	Kind            TrackLinkKind
	Source          TrackLinkSource
	UnavailableAt   *time.Time
	CreatedAt       time.Time
}
