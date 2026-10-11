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
