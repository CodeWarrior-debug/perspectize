package cached

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// fakeUserRepo is a hand-written inner repository. All fields are guarded by mu
// so concurrent tests stay race-free.
type fakeUserRepo struct {
	mu sync.Mutex

	users map[string]*domain.User
	err   error
	calls int // GetByClerkID calls

	// beforeReturn, when set, runs inside GetByClerkID after the value is read
	// but before it returns to the decorator (used to simulate a racing write).
	beforeReturn func()

	writeErr error
}

func newFake(users ...*domain.User) *fakeUserRepo {
	f := &fakeUserRepo{users: map[string]*domain.User{}}
	for _, u := range users {
		f.users[u.ClerkUserID] = u
	}
	return f
}

func (f *fakeUserRepo) setUser(u *domain.User) {
	f.mu.Lock()
	defer f.mu.Unlock()
	cp := *u
	f.users[u.ClerkUserID] = &cp
}

func (f *fakeUserRepo) getCalls() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return f.calls
}

func (f *fakeUserRepo) GetByClerkID(ctx context.Context, clerkID string) (*domain.User, error) {
	f.mu.Lock()
	f.calls++
	var out *domain.User
	err := f.err
	if err == nil {
		u, ok := f.users[clerkID]
		if !ok {
			err = domain.ErrNotFound
		} else {
			cp := *u // snapshot at read time
			out = &cp
		}
	}
	hook := f.beforeReturn
	f.mu.Unlock()
	if hook != nil {
		hook()
	}
	return out, err
}

func (f *fakeUserRepo) GetByID(ctx context.Context, id int) (*domain.User, error) {
	return &domain.User{ID: id}, nil
}
func (f *fakeUserRepo) GetByUsername(ctx context.Context, username string) (*domain.User, error) {
	return &domain.User{Username: username}, nil
}
func (f *fakeUserRepo) GetByEmail(ctx context.Context, email string) (*domain.User, error) {
	return &domain.User{Email: email}, nil
}
func (f *fakeUserRepo) ListAll(ctx context.Context) ([]*domain.User, error) { return nil, nil }
func (f *fakeUserRepo) Create(ctx context.Context, user *domain.User) (*domain.User, error) {
	return user, f.writeErr
}
func (f *fakeUserRepo) Update(ctx context.Context, user *domain.User) (*domain.User, error) {
	return user, f.writeErr
}
func (f *fakeUserRepo) Delete(ctx context.Context, id int) error { return f.writeErr }
func (f *fakeUserRepo) CreateFromClerk(ctx context.Context, clerkID, username, email string) (*domain.User, error) {
	return &domain.User{ClerkUserID: clerkID}, f.writeErr
}
func (f *fakeUserRepo) UpdateByClerkID(ctx context.Context, clerkID, username, email string) error {
	return f.writeErr
}
func (f *fakeUserRepo) DeactivateByClerkID(ctx context.Context, clerkID string) error {
	return f.writeErr
}
func (f *fakeUserRepo) UpdateOnboarding(ctx context.Context, userID int, onboarding domain.UserOnboarding) (*domain.User, error) {
	return &domain.User{ID: userID}, f.writeErr
}

// clock is a controllable time source for the decorator's `now` field.
type clock struct {
	mu sync.Mutex
	t  time.Time
}

func (c *clock) now() time.Time {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.t
}

func (c *clock) advance(d time.Duration) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.t = c.t.Add(d)
}

const testTTL = time.Minute

func newRepo(inner *fakeUserRepo) (*UserRepository, *clock) {
	c := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	r := NewUserRepository(inner, testTTL)
	r.now = c.now
	return r, c
}

func alice() *domain.User {
	return &domain.User{ID: 1, ClerkUserID: "clerk_a", Username: "alice", Role: domain.UserRole("admin"), Active: true}
}

func TestUserRepository_HitWithinTTLSkipsInner(t *testing.T) {
	inner := newFake(alice())
	r, c := newRepo(inner)
	ctx := context.Background()

	first, err := r.GetByClerkID(ctx, "clerk_a")
	require.NoError(t, err)
	c.advance(testTTL - time.Second)
	second, err := r.GetByClerkID(ctx, "clerk_a")
	require.NoError(t, err)

	assert.Equal(t, 1, inner.getCalls())
	assert.Equal(t, first, second)
}

func TestUserRepository_ExpiryRereads(t *testing.T) {
	inner := newFake(alice())
	r, c := newRepo(inner)
	ctx := context.Background()

	_, err := r.GetByClerkID(ctx, "clerk_a")
	require.NoError(t, err)

	// Changed behind the cache's back (e.g. another instance): only visible
	// after the TTL elapses.
	changed := alice()
	changed.Username = "alice2"
	inner.setUser(changed)

	got, err := r.GetByClerkID(ctx, "clerk_a")
	require.NoError(t, err)
	assert.Equal(t, "alice", got.Username, "still cached before expiry")

	c.advance(testTTL) // expires exactly at ttl (Before is strict)
	got, err = r.GetByClerkID(ctx, "clerk_a")
	require.NoError(t, err)
	assert.Equal(t, "alice2", got.Username)
	assert.Equal(t, 2, inner.getCalls())
}

func TestUserRepository_ErrorsAndMissesAreNotCached(t *testing.T) {
	boom := errors.New("db down")
	tests := []struct {
		name    string
		setup   func(f *fakeUserRepo)
		wantErr error
	}{
		{"not found", func(f *fakeUserRepo) {}, domain.ErrNotFound},
		{"other error", func(f *fakeUserRepo) { f.err = boom }, boom},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			inner := newFake()
			tt.setup(inner)
			r, _ := newRepo(inner)
			ctx := context.Background()

			got, err := r.GetByClerkID(ctx, "clerk_a")
			assert.Nil(t, got)
			assert.ErrorIs(t, err, tt.wantErr)
			got, err = r.GetByClerkID(ctx, "clerk_a")
			assert.Nil(t, got)
			assert.ErrorIs(t, err, tt.wantErr)
			assert.Equal(t, 2, inner.getCalls(), "each failed lookup must hit the inner repo")

			// Once the inner repo recovers/creates the user, the next call sees it.
			inner.mu.Lock()
			inner.err = nil
			inner.mu.Unlock()
			inner.setUser(alice())
			got, err = r.GetByClerkID(ctx, "clerk_a")
			require.NoError(t, err)
			assert.Equal(t, "alice", got.Username)
		})
	}
}

func TestUserRepository_EveryWriteInvalidates(t *testing.T) {
	ctx := context.Background()
	writes := []struct {
		name string
		call func(r *UserRepository) error
	}{
		{"Create", func(r *UserRepository) error { _, err := r.Create(ctx, alice()); return err }},
		{"Update", func(r *UserRepository) error { _, err := r.Update(ctx, alice()); return err }},
		{"Delete", func(r *UserRepository) error { return r.Delete(ctx, 1) }},
		{"CreateFromClerk", func(r *UserRepository) error { _, err := r.CreateFromClerk(ctx, "c", "u", "e"); return err }},
		{"UpdateByClerkID", func(r *UserRepository) error { return r.UpdateByClerkID(ctx, "clerk_a", "u", "e") }},
		{"DeactivateByClerkID", func(r *UserRepository) error { return r.DeactivateByClerkID(ctx, "clerk_a") }},
		{"UpdateOnboarding", func(r *UserRepository) error {
			_, err := r.UpdateOnboarding(ctx, 1, domain.UserOnboarding{})
			return err
		}},
	}
	for _, w := range writes {
		for _, failing := range []bool{false, true} {
			name := w.name
			if failing {
				name += "/failing write"
			}
			t.Run(name, func(t *testing.T) {
				inner := newFake(alice())
				r, _ := newRepo(inner)
				_, err := r.GetByClerkID(ctx, "clerk_a")
				require.NoError(t, err)
				_, err = r.GetByClerkID(ctx, "clerk_a")
				require.NoError(t, err)
				require.Equal(t, 1, inner.getCalls())

				if failing {
					inner.writeErr = errors.New("write failed")
				}
				werr := w.call(r)
				if failing {
					assert.Error(t, werr, "inner write error must be returned")
				} else {
					assert.NoError(t, werr)
				}

				_, err = r.GetByClerkID(ctx, "clerk_a")
				require.NoError(t, err)
				assert.Equal(t, 2, inner.getCalls(), "write must drop the cached entry")
			})
		}
	}
}

func TestUserRepository_ReadsOtherThanClerkIDPassThrough(t *testing.T) {
	inner := newFake(alice())
	r, _ := newRepo(inner)
	ctx := context.Background()

	u, err := r.GetByID(ctx, 9)
	require.NoError(t, err)
	assert.Equal(t, 9, u.ID)
	assert.Equal(t, 0, inner.getCalls())
}

func TestUserRepository_ReturnsCopies(t *testing.T) {
	inner := newFake(alice())
	r, _ := newRepo(inner)
	ctx := context.Background()

	// Miss path: the returned pointer is not the one stored.
	first, err := r.GetByClerkID(ctx, "clerk_a")
	require.NoError(t, err)
	first.Username = "mutated-after-miss"
	first.Active = false

	// Hit path: mutating a hit must not leak into later hits.
	second, err := r.GetByClerkID(ctx, "clerk_a")
	require.NoError(t, err)
	assert.Equal(t, "alice", second.Username)
	assert.True(t, second.Active)
	second.Username = "mutated-after-hit"

	third, err := r.GetByClerkID(ctx, "clerk_a")
	require.NoError(t, err)
	assert.Equal(t, "alice", third.Username)
	assert.NotSame(t, second, third)
	assert.Equal(t, 1, inner.getCalls())
}

func TestUserRepository_GenerationGuardDropsStaleStore(t *testing.T) {
	ctx := context.Background()
	writes := []struct {
		name string
		call func(r *UserRepository)
	}{
		{"Update", func(r *UserRepository) { _, _ = r.Update(ctx, alice()) }},
		{"DeactivateByClerkID", func(r *UserRepository) { _ = r.DeactivateByClerkID(ctx, "clerk_a") }},
		{"invalidate", func(r *UserRepository) { r.invalidate() }},
	}
	for _, w := range writes {
		t.Run(w.name, func(t *testing.T) {
			inner := newFake(alice())
			r, _ := newRepo(inner)

			// A lookup reads the pre-write user, then a write lands before the
			// lookup stores it. The stale value must not be cached.
			var once sync.Once
			inner.beforeReturn = func() { once.Do(func() { w.call(r) }) }

			stale, err := r.GetByClerkID(ctx, "clerk_a")
			require.NoError(t, err)
			assert.Equal(t, "alice", stale.Username, "the in-flight caller still gets its read")
			require.Equal(t, 1, inner.getCalls())

			// The post-write state is what the next lookup must see.
			fresh := alice()
			fresh.Username = "alice-after-write"
			fresh.Active = false
			inner.setUser(fresh)

			got, err := r.GetByClerkID(ctx, "clerk_a")
			require.NoError(t, err)
			assert.Equal(t, "alice-after-write", got.Username)
			assert.False(t, got.Active)
			assert.Equal(t, 2, inner.getCalls(), "stale result must not have been stored")

			// And the fresh read is cached normally.
			_, err = r.GetByClerkID(ctx, "clerk_a")
			require.NoError(t, err)
			assert.Equal(t, 2, inner.getCalls())
		})
	}
}

func TestUserRepository_CapDropsEverythingAndStartsOver(t *testing.T) {
	inner := newFake()
	for i := 0; i < maxUserEntries+1; i++ {
		id := fmt.Sprintf("c%d", i)
		inner.users[id] = &domain.User{ID: i + 1, ClerkUserID: id}
	}
	r, _ := newRepo(inner)
	ctx := context.Background()

	for i := 0; i < maxUserEntries; i++ {
		_, err := r.GetByClerkID(ctx, fmt.Sprintf("c%d", i))
		require.NoError(t, err)
	}
	r.mu.Lock()
	assert.Len(t, r.entries, maxUserEntries)
	r.mu.Unlock()

	_, err := r.GetByClerkID(ctx, fmt.Sprintf("c%d", maxUserEntries))
	require.NoError(t, err)
	r.mu.Lock()
	defer r.mu.Unlock()
	assert.Len(t, r.entries, 1, "hitting the cap resets the map, then stores the new entry")
	assert.LessOrEqual(t, len(r.entries), maxUserEntries)
}

func TestUserRepository_ConcurrentAccessIsRaceFree(t *testing.T) {
	inner := newFake(alice())
	r, c := newRepo(inner)
	ctx := context.Background()

	var wg sync.WaitGroup
	for g := 0; g < 8; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < 200; i++ {
				switch {
				case g == 0 && i%10 == 0:
					_, _ = r.Update(ctx, alice())
				case g == 1 && i%25 == 0:
					c.advance(time.Second)
				case g == 2 && i%50 == 0:
					_ = r.DeactivateByClerkID(ctx, "clerk_a")
				default:
					u, err := r.GetByClerkID(ctx, "clerk_a")
					if assert.NoError(t, err) {
						assert.Equal(t, "alice", u.Username)
						u.Username = "scribble" // must only touch this caller's copy
					}
				}
			}
		}(g)
	}
	wg.Wait()
}
