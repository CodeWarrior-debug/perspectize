package postgres

import (
	"context"
	"fmt"

	"gorm.io/gorm"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// MusicGenreModel is a music_genres row.
type MusicGenreModel struct {
	ID        int    `gorm:"primaryKey"`
	Name      string `gorm:"column:name"`
	AppleName string `gorm:"column:apple_name"`
	ParentID  *int   `gorm:"column:parent_id"`
}

func (MusicGenreModel) TableName() string { return "music_genres" }

// GormMusicGenreRepository implements repositories.MusicGenreRepository.
type GormMusicGenreRepository struct {
	db *gorm.DB
}

var _ repositories.MusicGenreRepository = (*GormMusicGenreRepository)(nil)

func NewGormMusicGenreRepository(db *gorm.DB) *GormMusicGenreRepository {
	return &GormMusicGenreRepository{db: db}
}

func (r *GormMusicGenreRepository) List(ctx context.Context) ([]domain.MusicGenre, error) {
	var models []MusicGenreModel
	if err := r.db.WithContext(ctx).Order("id").Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to list music genres: %w", err)
	}
	out := make([]domain.MusicGenre, len(models))
	for i, m := range models {
		out[i] = domain.MusicGenre{ID: m.ID, Name: m.Name, AppleName: m.AppleName, ParentID: m.ParentID}
	}
	return out, nil
}

// SetContentGenre is one owner-and-window-scoped UPDATE ... RETURNING. Only a
// miss pays a second read, to tell "missing" from "locked".
func (r *GormMusicGenreRepository) SetContentGenre(ctx context.Context, contentID, genreID, userID, windowDays int) (*domain.Content, error) {
	var m ContentModel
	err := r.db.WithContext(ctx).Raw(
		`UPDATE content SET genre_id = ?, updated_at = NOW() WHERE id = ? AND content_type = 'audio_track' `+
			`AND (genre_id IS NULL OR (added_by_user_id = ? AND created_at > NOW() - make_interval(days => ?))) RETURNING *`,
		genreID, contentID, userID, windowDays,
	).Scan(&m).Error
	if err != nil {
		return nil, fmt.Errorf("failed to set track genre: %w", err)
	}
	if m.ID != 0 {
		return contentModelToDomain(&m), nil
	}

	var probe struct{ ID int }
	if err := r.db.WithContext(ctx).Raw(`SELECT id FROM content WHERE id = ? AND content_type = 'audio_track'`, contentID).Scan(&probe).Error; err != nil {
		return nil, fmt.Errorf("failed to read track after genre miss: %w", err)
	}
	if probe.ID == 0 {
		return nil, domain.ErrNotFound
	}
	return nil, domain.ErrGenreLocked
}
