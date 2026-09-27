package services

import "context"

// YTMusicTrack is metadata YouTube Music (InnerTube) reports for a video ID.
type YTMusicTrack struct {
	Title        string
	Artists      []string
	Album        string
	DurationSec  int
	VideoType    string // audio | official_video | other
	Counterparts []YTMusicCounterpart
}

// YTMusicCounterpart is another upload of the same song (e.g. the official video for an audio track).
type YTMusicCounterpart struct {
	VideoID   string
	Title     string
	VideoType string
}

// YTMusicClient reads track metadata from YouTube Music's unofficial InnerTube API.
// Every error is non-fatal to callers.
type YTMusicClient interface {
	GetTrack(ctx context.Context, videoID string) (*YTMusicTrack, error)
}

// Recording is a MusicBrainz recording match.
type Recording struct {
	MBID          string
	ISRC          string
	ReleaseDate   string
	Genre         string
	ReleaseMBID   string
	CoverImageURL string
}

// MusicBrainzClient finds the MusicBrainz recording for a track.
// It returns domain.ErrNotFound when no confident match exists.
type MusicBrainzClient interface {
	FindRecording(ctx context.Context, artist, title string, durationSec int) (*Recording, error)
}

// LyricsMatch says whether LRCLIB has lyrics for a track. It deliberately
// carries no lyrics text.
type LyricsMatch struct {
	Available bool
	LRCLibID  int
	HasSynced bool
}

// LyricsClient checks LRCLIB for lyrics availability.
type LyricsClient interface {
	Check(ctx context.Context, artist, title string, durationSec int) (*LyricsMatch, error)
}
