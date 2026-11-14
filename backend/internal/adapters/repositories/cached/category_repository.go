package cached

import (
	"context"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// DefaultCategoryTTL bounds how long another instance's category upsert can
// take to show up here. Categories only change through that upsert (a
// relabel of the same Wikidata QID), so staleness is cosmetic.
const DefaultCategoryTTL = 5 * time.Minute

type categoryEntry struct {
	category *domain.Category
	expires  time.Time
}

// CategoryRepository caches categories by id. The content grid resolves
// Content.primaryCategory for every row through GetByIDs; with the table
// small and rarely written, that lookup is otherwise a round trip on every
// home-page load.
//
// Upsert refreshes the entry it wrote from the RETURNING row, so this
// instance never serves its own stale category.
type CategoryRepository struct {
	repositories.CategoryRepository

	ttl time.Duration
	now func() time.Time

	mu      sync.Mutex
	entries map[int]categoryEntry
	gen     uint64 // bumped on every write; see UserRepository.gen
}

var _ repositories.CategoryRepository = (*CategoryRepository)(nil)

// NewCategoryRepository wraps inner with an id cache of the given TTL.
func NewCategoryRepository(inner repositories.CategoryRepository, ttl time.Duration) *CategoryRepository {
	return &CategoryRepository{
		CategoryRepository: inner,
		ttl:                ttl,
		now:                time.Now,
		entries:            make(map[int]categoryEntry),
	}
}

// GetByID serves a fresh cached category or reads through.
func (r *CategoryRepository) GetByID(ctx context.Context, id int) (*domain.Category, error) {
	got, err := r.GetByIDs(ctx, []int{id})
	if err != nil {
		return nil, err
	}
	if len(got) == 0 {
		return nil, domain.ErrNotFound
	}
	return got[0], nil
}

// GetByIDs serves every fresh id from the cache and reads only the rest, in
// one query. Missing ids are absent from the result, as with the inner repo.
func (r *CategoryRepository) GetByIDs(ctx context.Context, ids []int) ([]*domain.Category, error) {
	out := make([]*domain.Category, 0, len(ids))
	var missing []int

	r.mu.Lock()
	gen := r.gen
	now := r.now()
	for _, id := range ids {
		if e, ok := r.entries[id]; ok && now.Before(e.expires) {
			c := *e.category
			out = append(out, &c)
		} else {
			missing = append(missing, id)
		}
	}
	r.mu.Unlock()

	if len(missing) == 0 {
		return out, nil
	}
	fetched, err := r.CategoryRepository.GetByIDs(ctx, missing)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	if r.gen == gen {
		if len(r.entries) >= maxUserEntries {
			r.entries = make(map[int]categoryEntry)
		}
		expires := r.now().Add(r.ttl)
		for _, c := range fetched {
			if c != nil {
				cp := *c
				r.entries[c.ID] = categoryEntry{category: &cp, expires: expires}
			}
		}
	}
	r.mu.Unlock()

	return append(out, fetched...), nil
}

// Upsert writes through and caches the returned row.
func (r *CategoryRepository) Upsert(ctx context.Context, category *domain.Category) (*domain.Category, error) {
	written, err := r.CategoryRepository.Upsert(ctx, category)

	r.mu.Lock()
	defer r.mu.Unlock()
	r.gen++
	if err != nil || written == nil {
		r.entries = make(map[int]categoryEntry)
		return written, err
	}
	cp := *written
	r.entries[written.ID] = categoryEntry{category: &cp, expires: r.now().Add(r.ttl)}
	return written, nil
}
