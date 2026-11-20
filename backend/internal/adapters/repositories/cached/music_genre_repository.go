package cached

import (
	"context"
	"slices"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// DefaultMusicGenreTTL bounds reuse of the genre list. The table only changes
// through a migration, so an hour is generous.
const DefaultMusicGenreTTL = time.Hour

// MusicGenreRepository caches List. The picker, the grid's genre column and the
// service's id validation all read it, so it is otherwise a query per request.
// SetContentGenre passes straight through.
type MusicGenreRepository struct {
	repositories.MusicGenreRepository

	ttl time.Duration
	now func() time.Time

	mu      sync.Mutex
	list    []domain.MusicGenre
	expires time.Time
}

var _ repositories.MusicGenreRepository = (*MusicGenreRepository)(nil)

func NewMusicGenreRepository(inner repositories.MusicGenreRepository, ttl time.Duration) *MusicGenreRepository {
	return &MusicGenreRepository{MusicGenreRepository: inner, ttl: ttl, now: time.Now}
}

// List serves a copy of the cached list, or reads through once it expires.
func (r *MusicGenreRepository) List(ctx context.Context) ([]domain.MusicGenre, error) {
	r.mu.Lock()
	if r.list != nil && r.now().Before(r.expires) {
		out := slices.Clone(r.list)
		r.mu.Unlock()
		return out, nil
	}
	r.mu.Unlock()

	got, err := r.MusicGenreRepository.List(ctx)
	if err != nil {
		return nil, err
	}
	r.mu.Lock()
	r.list, r.expires = slices.Clone(got), r.now().Add(r.ttl)
	r.mu.Unlock()
	return got, nil
}
