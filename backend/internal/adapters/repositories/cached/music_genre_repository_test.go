package cached

import (
	"context"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

type countingGenres struct {
	calls int
	sets  int
}

func (c *countingGenres) List(context.Context) ([]domain.MusicGenre, error) {
	c.calls++
	return []domain.MusicGenre{{ID: 21, Name: "Rock", AppleName: "Rock"}}, nil
}

func (c *countingGenres) SetContentGenre(_ context.Context, contentID, genreID, _, _ int) (*domain.Content, error) {
	c.sets++
	return &domain.Content{ID: contentID, GenreID: &genreID}, nil
}

func TestMusicGenreRepository_ListIsCachedForTTL(t *testing.T) {
	inner := &countingGenres{}
	r := NewMusicGenreRepository(inner, time.Hour)
	now := time.Date(2026, 10, 11, 12, 0, 0, 0, time.UTC)
	r.now = func() time.Time { return now }

	_, err := r.List(context.Background())
	require.NoError(t, err)
	got, err := r.List(context.Background())
	require.NoError(t, err)
	assert.Equal(t, 1, inner.calls)

	got[0].Name = "poisoned"
	again, _ := r.List(context.Background())
	assert.Equal(t, "Rock", again[0].Name, "callers get a copy")

	now = now.Add(time.Hour + time.Second)
	_, _ = r.List(context.Background())
	assert.Equal(t, 2, inner.calls)
}

func TestMusicGenreRepository_SetPassesThrough(t *testing.T) {
	inner := &countingGenres{}
	r := NewMusicGenreRepository(inner, time.Hour)
	_, err := r.SetContentGenre(context.Background(), 5, 21, 7, 30)
	require.NoError(t, err)
	assert.Equal(t, 1, inner.sets)
}
