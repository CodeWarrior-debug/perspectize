package cached

import (
	"context"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// DefaultTodoActionTTL bounds how long a todo action lookup is reused. Presets
// never change at runtime; user-entered actions only change through Create,
// on this instance or another. Staleness across instances is therefore
// bounded by the TTL and only affects newly entered actions.
const DefaultTodoActionTTL = 10 * time.Minute

type todoActionEntry struct {
	action  *domain.TodoAction
	expires time.Time
}

// TodoActionRepository caches todo actions by id. Every row of the Plan grid
// resolves its action through GetByIDs; with the table small and rarely
// written, that lookup is otherwise a round trip on every page load.
//
// Create refreshes the entry it wrote from the RETURNING row, so this instance
// never serves its own stale action. ReassignByUser clears the cache, because
// the rows it moves change owner.
//
// GetByKey and ListForUser pass straight through to the inner repository:
// ListForUser is per-user and small, and GetByKey is only used on writes.
type TodoActionRepository struct {
	repositories.TodoActionRepository

	ttl time.Duration
	now func() time.Time

	mu      sync.Mutex
	entries map[int]todoActionEntry
	gen     uint64 // bumped on every write; see UserRepository.gen
}

var _ repositories.TodoActionRepository = (*TodoActionRepository)(nil)

// NewTodoActionRepository wraps inner with an id cache of the given TTL.
func NewTodoActionRepository(inner repositories.TodoActionRepository, ttl time.Duration) *TodoActionRepository {
	return &TodoActionRepository{
		TodoActionRepository: inner,
		ttl:                  ttl,
		now:                  time.Now,
		entries:              make(map[int]todoActionEntry),
	}
}

// GetByID serves a fresh cached action or reads through.
func (r *TodoActionRepository) GetByID(ctx context.Context, id int) (*domain.TodoAction, error) {
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
func (r *TodoActionRepository) GetByIDs(ctx context.Context, ids []int) ([]*domain.TodoAction, error) {
	out := make([]*domain.TodoAction, 0, len(ids))
	var missing []int

	r.mu.Lock()
	gen := r.gen
	now := r.now()
	for _, id := range ids {
		if e, ok := r.entries[id]; ok && now.Before(e.expires) {
			out = append(out, copyTodoAction(e.action))
		} else {
			missing = append(missing, id)
		}
	}
	r.mu.Unlock()

	if len(missing) == 0 {
		return out, nil
	}
	fetched, err := r.TodoActionRepository.GetByIDs(ctx, missing)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	if r.gen == gen {
		if len(r.entries) >= maxUserEntries {
			r.entries = make(map[int]todoActionEntry)
		}
		expires := r.now().Add(r.ttl)
		for _, a := range fetched {
			if a != nil {
				r.entries[a.ID] = todoActionEntry{action: copyTodoAction(a), expires: expires}
			}
		}
	}
	r.mu.Unlock()

	return append(out, fetched...), nil
}

// Create writes through and caches the returned row.
func (r *TodoActionRepository) Create(ctx context.Context, action *domain.TodoAction) (*domain.TodoAction, error) {
	written, err := r.TodoActionRepository.Create(ctx, action)

	r.mu.Lock()
	defer r.mu.Unlock()
	r.gen++
	if err != nil || written == nil {
		r.entries = make(map[int]todoActionEntry)
		return written, err
	}
	r.entries[written.ID] = todoActionEntry{action: copyTodoAction(written), expires: r.now().Add(r.ttl)}
	return written, nil
}

// ReassignByUser writes through and clears the cache, since the moved rows now
// have a different owner. The cache is cleared even when the write fails,
// because a failed UPDATE may still have partially applied.
func (r *TodoActionRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	err := r.TodoActionRepository.ReassignByUser(ctx, fromUserID, toUserID)

	r.mu.Lock()
	defer r.mu.Unlock()
	r.gen++
	r.entries = make(map[int]todoActionEntry)
	return err
}

// copyTodoAction returns a deep copy, so callers can't mutate cached state
// through the pointer fields either.
func copyTodoAction(a *domain.TodoAction) *domain.TodoAction {
	cp := *a
	if a.TypicalSequence != nil {
		v := *a.TypicalSequence
		cp.TypicalSequence = &v
	}
	if a.UserID != nil {
		v := *a.UserID
		cp.UserID = &v
	}
	return &cp
}
