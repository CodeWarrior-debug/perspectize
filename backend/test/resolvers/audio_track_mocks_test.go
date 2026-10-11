package resolvers_test

import (
	"context"
	"slices"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

type mockAudioTrackRepository struct {
	createWithLinkFn      func(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error)
	findSameSongFn        func(ctx context.Context, title, artist string, limit int) ([]*domain.Content, error)
	linksByContentIDsFn   func(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error)
	markLinkUnavailableFn func(ctx context.Context, id int) (*domain.TrackLink, error)
	linksCalls            int
}

func (m *mockAudioTrackRepository) CreateWithLink(ctx context.Context, c *domain.Content, link domain.TrackLink) (*domain.Content, bool, error) {
	if m.createWithLinkFn != nil {
		return m.createWithLinkFn(ctx, c, link)
	}
	c.ID = 1
	return c, false, nil
}
func (m *mockAudioTrackRepository) AddLink(context.Context, domain.TrackLink) (bool, error) {
	return true, nil
}
func (m *mockAudioTrackRepository) GetByLink(context.Context, domain.TrackProvider, string) (*domain.Content, error) {
	return nil, domain.ErrNotFound
}
func (m *mockAudioTrackRepository) GetByMusicBrainzID(context.Context, string) (*domain.Content, error) {
	return nil, domain.ErrNotFound
}
func (m *mockAudioTrackRepository) FindSameSongCandidates(ctx context.Context, title, artist string, limit int) ([]*domain.Content, error) {
	if m.findSameSongFn != nil {
		return m.findSameSongFn(ctx, title, artist, limit)
	}
	return nil, nil
}
func (m *mockAudioTrackRepository) ContentByURLs(context.Context, []string) (map[string]*domain.Content, error) {
	return map[string]*domain.Content{}, nil
}
func (m *mockAudioTrackRepository) LinksByContentIDs(ctx context.Context, ids []int) (map[int][]domain.TrackLink, error) {
	m.linksCalls++
	if m.linksByContentIDsFn != nil {
		return m.linksByContentIDsFn(ctx, ids)
	}
	return map[int][]domain.TrackLink{}, nil
}
func (m *mockAudioTrackRepository) MarkLinkUnavailable(ctx context.Context, id int) (*domain.TrackLink, error) {
	if m.markLinkUnavailableFn != nil {
		return m.markLinkUnavailableFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

type mockMusicGenreRepository struct {
	list  []domain.MusicGenre
	setFn func(ctx context.Context, contentID, genreID, userID, windowDays int) (*domain.Content, error)
}

func newMockGenres() *mockMusicGenreRepository {
	parent := 19
	return &mockMusicGenreRepository{list: []domain.MusicGenre{
		{ID: 21, Name: "Rock", AppleName: "Rock"},
		{ID: 19, Name: "Regional & Cultural", AppleName: "Worldwide"},
		{ID: 1188, Name: "Polka", AppleName: "Polka", ParentID: &parent},
	}}
}

func (m *mockMusicGenreRepository) List(context.Context) ([]domain.MusicGenre, error) {
	return slices.Clone(m.list), nil
}
func (m *mockMusicGenreRepository) SetContentGenre(ctx context.Context, contentID, genreID, userID, windowDays int) (*domain.Content, error) {
	if m.setFn != nil {
		return m.setFn(ctx, contentID, genreID, userID, windowDays)
	}
	return &domain.Content{ID: contentID, ContentType: domain.ContentTypeAudioTrack, GenreID: &genreID}, nil
}
