package repositories

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// MusicGenreRepository reads the seeded genre tree and sets a track's genre.
type MusicGenreRepository interface {
	// List returns every genre, ordered by id.
	List(ctx context.Context) ([]domain.MusicGenre, error)
	// SetContentGenre sets an AUDIO_TRACK's genre when it is unset, or when
	// userID added the track less than windowDays ago. ErrNotFound when the row
	// is missing or not a track; ErrGenreLocked otherwise.
	SetContentGenre(ctx context.Context, contentID, genreID, userID, windowDays int) (*domain.Content, error)
}

// AudioTrackRepository holds the AUDIO_TRACK queries that touch track_links or
// response.music. It is separate from ContentRepository so the existing
// ContentRepository mocks are unchanged.
type AudioTrackRepository interface {
	// CreateWithLink inserts the content row and its first link in one
	// statement. On a URL conflict it returns the existing row and true.
	CreateWithLink(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error)
	// AddLink attaches a link to link.ContentID. False when (provider, id) is
	// already linked to some track.
	AddLink(ctx context.Context, link domain.TrackLink) (bool, error)
	GetByLink(ctx context.Context, provider domain.TrackProvider, providerTrackID string) (*domain.Content, error)
	GetByMusicBrainzID(ctx context.Context, mbid string) (*domain.Content, error)
	// FindSameSongCandidates: AUDIO_TRACK rows whose title (and artist, when
	// given) match case-insensitively, excluding unofficial uploads.
	FindSameSongCandidates(ctx context.Context, title, artist string, limit int) ([]*domain.Content, error)
	// ContentByURLs returns existing rows keyed by url; absent urls are absent.
	ContentByURLs(ctx context.Context, urls []string) (map[string]*domain.Content, error)
	// LinksByContentIDs returns links grouped by content id, ordered by id.
	LinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error)
	// MarkLinkUnavailable stamps unavailable_at on an EMBED link (first time
	// only). ErrNotFound for unknown or LISTEN links.
	MarkLinkUnavailable(ctx context.Context, linkID int) (*domain.TrackLink, error)
}
