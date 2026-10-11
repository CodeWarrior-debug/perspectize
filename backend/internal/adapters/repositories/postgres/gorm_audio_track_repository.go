package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"gorm.io/gorm"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// TrackLinkModel is a track_links row. kind and source are stored lowercase.
type TrackLinkModel struct {
	ID              int        `gorm:"primaryKey;autoIncrement"`
	ContentID       int        `gorm:"column:content_id"`
	Provider        string     `gorm:"column:provider"`
	ProviderTrackID string     `gorm:"column:provider_track_id"`
	URL             string     `gorm:"column:url"`
	Kind            string     `gorm:"column:kind"`
	Source          string     `gorm:"column:source"`
	UnavailableAt   *time.Time `gorm:"column:unavailable_at"`
	CreatedAt       time.Time  `gorm:"column:created_at"`
}

func (TrackLinkModel) TableName() string { return "track_links" }

func trackLinkModelToDomain(m *TrackLinkModel) domain.TrackLink {
	return domain.TrackLink{
		ID: m.ID, ContentID: m.ContentID, Provider: domain.TrackProvider(m.Provider), ProviderTrackID: m.ProviderTrackID,
		URL: m.URL, Kind: domain.TrackLinkKind(strings.ToUpper(m.Kind)), Source: domain.TrackLinkSource(strings.ToUpper(m.Source)),
		UnavailableAt: m.UnavailableAt, CreatedAt: m.CreatedAt,
	}
}

// GormAudioTrackRepository implements repositories.AudioTrackRepository.
type GormAudioTrackRepository struct {
	db *gorm.DB
}

var _ repositories.AudioTrackRepository = (*GormAudioTrackRepository)(nil)

func NewGormAudioTrackRepository(db *gorm.DB) *GormAudioTrackRepository {
	return &GormAudioTrackRepository{db: db}
}

const createWithLinkSQL = `WITH new_content AS (
	INSERT INTO content (name, url, content_type, added_by_user_id, length, length_units, response, genre_id, created_at, updated_at)
	VALUES (?, ?, 'audio_track', ?, ?, ?, CAST(? AS jsonb), ?, NOW(), NOW())
	ON CONFLICT (url) DO NOTHING RETURNING * ), new_link AS (
	INSERT INTO track_links (content_id, provider, provider_track_id, url, kind, source)
	SELECT id, ?, ?, ?, ?, ? FROM new_content
	ON CONFLICT (provider, provider_track_id) DO NOTHING RETURNING id ) SELECT * FROM new_content`

func (r *GormAudioTrackRepository) CreateWithLink(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error) {
	if c.URL == nil {
		return nil, false, fmt.Errorf("%w: track url is required", domain.ErrInvalidInput)
	}
	response := "{}"
	if len(c.Response) > 0 {
		response = string(c.Response)
	}
	var m ContentModel
	err := r.db.WithContext(ctx).Raw(createWithLinkSQL,
		c.Name, *c.URL, c.AddedByUserID, c.Length, c.LengthUnits, response, c.GenreID,
		string(link.Provider), link.ProviderTrackID, link.URL, strings.ToLower(string(link.Kind)), strings.ToLower(string(link.Source)),
	).Scan(&m).Error
	if err != nil {
		return nil, false, fmt.Errorf("failed to create audio track: %w", err)
	}
	if m.ID != 0 {
		return contentModelToDomain(&m), false, nil
	}
	var existing ContentModel
	if err := r.db.WithContext(ctx).Where("url = ?", *c.URL).First(&existing).Error; err != nil {
		return nil, false, fmt.Errorf("failed to read existing track after url conflict: %w", err)
	}
	return contentModelToDomain(&existing), true, nil
}

func (r *GormAudioTrackRepository) AddLink(ctx context.Context, link domain.TrackLink) (bool, error) {
	var id int
	err := r.db.WithContext(ctx).Raw(
		`INSERT INTO track_links (content_id, provider, provider_track_id, url, kind, source) VALUES (?,?,?,?,?,?) `+
			`ON CONFLICT (provider, provider_track_id) DO NOTHING RETURNING id`,
		link.ContentID, string(link.Provider), link.ProviderTrackID, link.URL,
		strings.ToLower(string(link.Kind)), strings.ToLower(string(link.Source)),
	).Scan(&id).Error
	if err != nil {
		return false, fmt.Errorf("failed to add track link: %w", err)
	}
	return id != 0, nil
}

func (r *GormAudioTrackRepository) GetByLink(ctx context.Context, provider domain.TrackProvider, providerTrackID string) (*domain.Content, error) {
	var m ContentModel
	err := r.db.WithContext(ctx).Raw(
		`SELECT content.* FROM content JOIN track_links tl ON tl.content_id = content.id WHERE tl.provider = ? AND tl.provider_track_id = ? LIMIT 1`,
		string(provider), providerTrackID,
	).Scan(&m).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get track by link: %w", err)
	}
	if m.ID == 0 {
		return nil, domain.ErrNotFound
	}
	return contentModelToDomain(&m), nil
}

func (r *GormAudioTrackRepository) GetByMusicBrainzID(ctx context.Context, mbid string) (*domain.Content, error) {
	var m ContentModel
	err := r.db.WithContext(ctx).
		Where("content_type = ? AND response->'music'->>'musicbrainzId' = ?", "audio_track", mbid).
		Order("id").First(&m).Error
	if errors.Is(err, gorm.ErrRecordNotFound) {
		return nil, domain.ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("failed to get track by musicbrainz id: %w", err)
	}
	return contentModelToDomain(&m), nil
}

func (r *GormAudioTrackRepository) FindSameSongCandidates(ctx context.Context, title, artist string, limit int) ([]*domain.Content, error) {
	cond := "content_type = ? AND lower(name) = lower(?)"
	args := []any{"audio_track", title}
	if artist != "" {
		cond += " AND lower(response->'music'->>'artist') = lower(?)"
		args = append(args, artist)
	}
	cond += " AND COALESCE(response->'music'->>'videoType', '') <> 'other'"
	var models []ContentModel
	err := r.db.WithContext(ctx).Where(cond, args...).Order("id").Limit(limit).Find(&models).Error
	if err != nil {
		return nil, fmt.Errorf("failed to find same-song candidates: %w", err)
	}
	out := make([]*domain.Content, len(models))
	for i := range models {
		out[i] = contentModelToDomain(&models[i])
	}
	return out, nil
}

func (r *GormAudioTrackRepository) ContentByURLs(ctx context.Context, urls []string) (map[string]*domain.Content, error) {
	out := make(map[string]*domain.Content, len(urls))
	if len(urls) == 0 {
		return out, nil
	}
	var models []ContentModel
	if err := r.db.WithContext(ctx).Where("url IN ?", urls).Find(&models).Error; err != nil {
		return nil, fmt.Errorf("failed to get content by urls: %w", err)
	}
	for i := range models {
		if models[i].URL != nil {
			out[*models[i].URL] = contentModelToDomain(&models[i])
		}
	}
	return out, nil
}

func (r *GormAudioTrackRepository) LinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	out := make(map[int][]domain.TrackLink, len(ids))
	if len(ids) == 0 {
		return out, nil
	}
	var models []TrackLinkModel
	err := r.db.WithContext(ctx).Where("content_id = ANY(CAST(? AS bigint[]))", intsToArray(ids)).Order("content_id, id").Find(&models).Error
	if err != nil {
		return nil, fmt.Errorf("failed to get track links: %w", err)
	}
	for i := range models {
		out[models[i].ContentID] = append(out[models[i].ContentID], trackLinkModelToDomain(&models[i]))
	}
	return out, nil
}

func (r *GormAudioTrackRepository) MarkLinkUnavailable(ctx context.Context, linkID int) (*domain.TrackLink, error) {
	var m TrackLinkModel
	err := r.db.WithContext(ctx).Raw(
		`UPDATE track_links SET unavailable_at = COALESCE(unavailable_at, NOW()) WHERE id = ? AND kind = 'embed' RETURNING *`, linkID,
	).Scan(&m).Error
	if err != nil {
		return nil, fmt.Errorf("failed to mark track link unavailable: %w", err)
	}
	if m.ID == 0 {
		return nil, domain.ErrNotFound
	}
	l := trackLinkModelToDomain(&m)
	return &l, nil
}
