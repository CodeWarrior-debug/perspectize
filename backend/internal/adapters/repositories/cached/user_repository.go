// Package cached holds read-through caching decorators for repository ports.
package cached

import (
	"context"
	"sync"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
)

// DefaultUserTTL bounds how long a Clerk ID -> user lookup is reused. It is the
// same order as a Clerk session token's own lifetime (60s), so it adds no
// meaningful window beyond the one a still-valid token already grants.
const DefaultUserTTL = 60 * time.Second

// maxUserEntries caps the cache so a flood of distinct tokens can't grow it
// without bound; hitting the cap just drops everything and starts over.
const maxUserEntries = 10_000

type userEntry struct {
	user    *domain.User
	expires time.Time
}

// UserRepository caches GetByClerkID, which the auth middleware calls on every
// authenticated request — one database round trip per request otherwise.
//
// Every write that goes through this decorator (Update, Delete, the Clerk
// webhook's UpdateByClerkID/DeactivateByClerkID, ...) clears the whole cache,
// so a role change or deactivation is visible immediately on this instance.
// Writes are rare, so clearing everything is simpler than tracking which
// entry a write by numeric ID affects. Other instances converge within the TTL.
type UserRepository struct {
	repositories.UserRepository // reads other than GetByClerkID pass straight through

	ttl time.Duration
	now func() time.Time

	mu      sync.Mutex
	entries map[string]userEntry
	// gen is bumped on every write; a lookup that started before a write
	// must not store what it read, or it could re-cache the pre-write user.
	gen uint64
}

var _ repositories.UserRepository = (*UserRepository)(nil)

// NewUserRepository wraps inner with a GetByClerkID cache of the given TTL.
func NewUserRepository(inner repositories.UserRepository, ttl time.Duration) *UserRepository {
	return &UserRepository{
		UserRepository: inner,
		ttl:            ttl,
		now:            time.Now,
		entries:        make(map[string]userEntry),
	}
}

// GetByClerkID returns a copy of the cached user when fresh, otherwise reads
// through. Misses (including domain.ErrNotFound) are not cached, so a user
// created on demand is found on the very next request.
func (r *UserRepository) GetByClerkID(ctx context.Context, clerkID string) (*domain.User, error) {
	r.mu.Lock()
	e, ok := r.entries[clerkID]
	gen := r.gen
	r.mu.Unlock()
	if ok && r.now().Before(e.expires) {
		u := *e.user
		return &u, nil
	}

	user, err := r.UserRepository.GetByClerkID(ctx, clerkID)
	if err != nil {
		return nil, err
	}

	r.mu.Lock()
	if r.gen == gen {
		if len(r.entries) >= maxUserEntries {
			r.entries = make(map[string]userEntry)
		}
		u := *user
		r.entries[clerkID] = userEntry{user: &u, expires: r.now().Add(r.ttl)}
	}
	r.mu.Unlock()
	return user, nil
}

func (r *UserRepository) invalidate() {
	r.mu.Lock()
	r.gen++
	r.entries = make(map[string]userEntry)
	r.mu.Unlock()
}

// Every write below invalidates after the inner call returns, whether or not
// it succeeded — a failed write may still have partially applied, and a spare
// cache miss is cheap.

func (r *UserRepository) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	defer r.invalidate()
	return r.UserRepository.Create(ctx, user)
}

func (r *UserRepository) Update(ctx context.Context, user *domain.User) (*domain.User, error) {
	defer r.invalidate()
	return r.UserRepository.Update(ctx, user)
}

func (r *UserRepository) Delete(ctx context.Context, id int) error {
	defer r.invalidate()
	return r.UserRepository.Delete(ctx, id)
}

func (r *UserRepository) CreateFromClerk(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
	defer r.invalidate()
	return r.UserRepository.CreateFromClerk(ctx, clerkID, username, email)
}

func (r *UserRepository) UpdateByClerkID(ctx context.Context, clerkID, username, email string) error {
	defer r.invalidate()
	return r.UserRepository.UpdateByClerkID(ctx, clerkID, username, email)
}

func (r *UserRepository) DeactivateByClerkID(ctx context.Context, clerkID string) error {
	defer r.invalidate()
	return r.UserRepository.DeactivateByClerkID(ctx, clerkID)
}

func (r *UserRepository) UpdateOnboarding(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error) {
	defer r.invalidate()
	return r.UserRepository.UpdateOnboarding(ctx, userID, onboarding)
}
