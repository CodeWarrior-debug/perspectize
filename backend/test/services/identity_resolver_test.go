package services_test

import (
	"context"
	"errors"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// identityUsers is an in-memory UserRepository that enforces the users table's
// unique constraints and reports them with the identity sentinels. Methods the
// resolver never calls are left nil and panic if reached.
type identityUsers struct {
	repositories.UserRepository
	rows    []*domain.User
	nextID  int
	creates int
	updates int
	// beforeCreate runs at the start of each CreateFromClerk, to simulate a
	// concurrent insert that wins the race.
	beforeCreate func()
}

func newIdentityUsers(rows ...*domain.User) *identityUsers {
	return &identityUsers{rows: rows, nextID: 100}
}

func copyUser(u *domain.User) *domain.User {
	c := *u
	return &c
}

func (f *identityUsers) GetByClerkID(_ context.Context, clerkID string) (*domain.User, error) {
	for _, r := range f.rows {
		if r.ClerkUserID != "" && r.ClerkUserID == clerkID {
			return copyUser(r), nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *identityUsers) GetByEmail(_ context.Context, email string) (*domain.User, error) {
	for _, r := range f.rows {
		if r.Email != "" && r.Email == email {
			return copyUser(r), nil
		}
	}
	return nil, domain.ErrNotFound
}

func (f *identityUsers) CreateFromClerk(_ context.Context, clerkID, username, email string) (*domain.User, error) {
	f.creates++
	if f.beforeCreate != nil {
		f.beforeCreate()
	}
	for _, r := range f.rows {
		if clerkID != "" && r.ClerkUserID == clerkID {
			return nil, domain.ErrClerkIDTaken
		}
	}
	for _, r := range f.rows {
		if r.Username == username {
			return nil, domain.ErrUsernameTaken
		}
	}
	if email != "" {
		for _, r := range f.rows {
			if r.Email == email {
				return nil, domain.ErrEmailTaken
			}
		}
	}
	f.nextID++
	row := &domain.User{ID: f.nextID, ClerkUserID: clerkID, Username: username, Email: email, Role: domain.UserRoleDefault, Active: true}
	f.rows = append(f.rows, row)
	return copyUser(row), nil
}

func (f *identityUsers) Update(_ context.Context, user *domain.User) (*domain.User, error) {
	f.updates++
	for i, r := range f.rows {
		if r.ID == user.ID {
			f.rows[i] = copyUser(user)
			return copyUser(user), nil
		}
	}
	return nil, domain.ErrNotFound
}

// fakeDirectory is the Clerk-side profile source; it counts calls so tests can
// assert the directory is only consulted on a miss.
type fakeDirectory struct {
	profiles map[string]domain.ClerkProfile
	calls    int
}

func (d *fakeDirectory) Profile(_ context.Context, clerkID string) (domain.ClerkProfile, error) {
	d.calls++
	p, ok := d.profiles[clerkID]
	if !ok {
		return domain.ClerkProfile{}, domain.ErrNotFound
	}
	return p, nil
}

func aliceProfile() domain.ClerkProfile {
	return domain.ClerkProfile{
		ClerkID:        "user_alice",
		Username:       "alice",
		PrimaryEmailID: "e1",
		Emails:         []domain.ClerkEmail{{ID: "e1", Address: "alice@example.com"}},
	}
}

func newDirectory(profiles ...domain.ClerkProfile) *fakeDirectory {
	d := &fakeDirectory{profiles: map[string]domain.ClerkProfile{}}
	for _, p := range profiles {
		d.profiles[p.ClerkID] = p
	}
	return d
}

func newResolver(users *identityUsers, dir *fakeDirectory) portservices.IdentityResolver {
	return services.NewIdentityResolver(users, dir)
}

func TestResolve_NewUserProvisionedFromProfile(t *testing.T) {
	users := newIdentityUsers()
	dir := newDirectory(aliceProfile())

	got, err := newResolver(users, dir).Resolve(context.Background(), "user_alice")
	require.NoError(t, err)
	assert.Equal(t, "user_alice", got.ClerkUserID)
	assert.Equal(t, "alice", got.Username)
	assert.Equal(t, "alice@example.com", got.Email)
	assert.Equal(t, 1, dir.calls)
	assert.Equal(t, 1, users.creates)
}

func TestResolve_ExistingUserNoDirectoryCall(t *testing.T) {
	users := newIdentityUsers(&domain.User{ID: 1, ClerkUserID: "user_alice", Username: "alice", Active: true})
	dir := newDirectory()

	got, err := newResolver(users, dir).Resolve(context.Background(), "user_alice")
	require.NoError(t, err)
	assert.Equal(t, 1, got.ID)
	assert.Equal(t, 0, dir.calls)
	assert.Equal(t, 0, users.creates)
}

func TestProvision_ExistingRowIsSuccess(t *testing.T) {
	users := newIdentityUsers(&domain.User{ID: 1, ClerkUserID: "user_alice", Username: "alice", Email: "alice@example.com", Active: true})
	dir := newDirectory()

	got, err := newResolver(users, dir).Provision(context.Background(), aliceProfile())
	require.NoError(t, err)
	assert.Equal(t, 1, got.ID)
	assert.Equal(t, 0, users.creates)
	assert.Equal(t, 0, dir.calls)
}

func TestProvision_ConcurrentClerkIDConflictReReads(t *testing.T) {
	users := newIdentityUsers()
	users.beforeCreate = func() {
		if len(users.rows) == 0 {
			users.rows = append(users.rows, &domain.User{ID: 7, ClerkUserID: "user_alice", Username: "alice", Active: true})
		}
	}

	got, err := newResolver(users, newDirectory()).Provision(context.Background(), aliceProfile())
	require.NoError(t, err)
	assert.Equal(t, 7, got.ID)
}

func TestResolve_EmailLinkSetsClerkID(t *testing.T) {
	users := newIdentityUsers(&domain.User{ID: 3, Username: "legacy", Email: "alice@example.com", Active: true})

	got, err := newResolver(users, newDirectory(aliceProfile())).Resolve(context.Background(), "user_alice")
	require.NoError(t, err)
	assert.Equal(t, 3, got.ID)
	assert.Equal(t, "user_alice", got.ClerkUserID)
	assert.Equal(t, 1, users.updates)
}

func TestResolve_EmailLinkRefusedWhenRowLinkedElsewhere(t *testing.T) {
	users := newIdentityUsers(&domain.User{ID: 3, ClerkUserID: "user_other", Username: "legacy", Email: "alice@example.com", Active: true})

	_, err := newResolver(users, newDirectory(aliceProfile())).Resolve(context.Background(), "user_alice")
	assert.True(t, errors.Is(err, domain.ErrEmailTaken), "expected ErrEmailTaken, got %v", err)
	assert.Equal(t, 0, users.updates)
	assert.Equal(t, "user_other", users.rows[0].ClerkUserID)
}

func TestResolve_EmailLinkRefusedForSentinel(t *testing.T) {
	users := newIdentityUsers(&domain.User{ID: 3, Username: "[deleted]", Email: "alice@example.com", Role: domain.UserRoleSentinel, Active: true})

	_, err := newResolver(users, newDirectory(aliceProfile())).Resolve(context.Background(), "user_alice")
	assert.True(t, errors.Is(err, domain.ErrEmailTaken), "expected ErrEmailTaken, got %v", err)
	assert.Equal(t, 0, users.updates)
}

func TestResolve_UsernameCollisionRetriesWithSuffix(t *testing.T) {
	users := newIdentityUsers(&domain.User{ID: 2, ClerkUserID: "user_other", Username: "alice", Email: "other@example.com", Active: true})
	profile := aliceProfile()
	dir := newDirectory(profile)

	got, err := newResolver(users, dir).Resolve(context.Background(), "user_alice")
	require.NoError(t, err)
	assert.Equal(t, profile.DisambiguatedUsername(), got.Username)
	assert.NotEqual(t, "alice", got.Username)
	assert.Equal(t, 1, dir.calls)
	assert.Equal(t, 2, users.creates)
}

func TestResolve_UsernameAndEmailTakenEndsInError(t *testing.T) {
	users := newIdentityUsers(
		&domain.User{ID: 2, ClerkUserID: "user_other", Username: "alice", Email: "other@example.com", Active: true},
		&domain.User{ID: 3, ClerkUserID: "user_third", Username: "third", Email: "alice@example.com", Active: true},
	)

	_, err := newResolver(users, newDirectory(aliceProfile())).Resolve(context.Background(), "user_alice")
	assert.True(t, errors.Is(err, domain.ErrEmailTaken), "expected ErrEmailTaken, got %v", err)
	assert.LessOrEqual(t, users.creates, 3, "the create loop is bounded")
}

func TestResolve_NoEmailNeverLinks(t *testing.T) {
	users := newIdentityUsers(&domain.User{ID: 2, ClerkUserID: "user_other", Username: "alice", Active: true})
	profile := domain.ClerkProfile{ClerkID: "user_alice", Username: "alice"}

	got, err := newResolver(users, newDirectory(profile)).Resolve(context.Background(), "user_alice")
	require.NoError(t, err)
	assert.Equal(t, "", got.Email)
	assert.Equal(t, 0, users.updates)
}

func TestResolve_OverlongClerkUsernameIsTruncated(t *testing.T) {
	long := strings.Repeat("x", 30)
	profile := domain.ClerkProfile{ClerkID: "user_alice", Username: long}

	got, err := newResolver(newIdentityUsers(), newDirectory(profile)).Resolve(context.Background(), "user_alice")
	require.NoError(t, err)
	assert.Equal(t, strings.Repeat("x", 24), got.Username)
}

func TestResolve_InactiveUserRejected(t *testing.T) {
	users := newIdentityUsers(&domain.User{ID: 1, ClerkUserID: "user_alice", Username: "alice", Active: false})

	got, err := newResolver(users, newDirectory()).Resolve(context.Background(), "user_alice")
	assert.Nil(t, got)
	assert.True(t, errors.Is(err, domain.ErrUserInactive), "expected ErrUserInactive, got %v", err)
}

func TestResolve_InactiveRowLinkedByEmailRejected(t *testing.T) {
	users := newIdentityUsers(&domain.User{ID: 3, Username: "legacy", Email: "alice@example.com", Active: false})

	_, err := newResolver(users, newDirectory(aliceProfile())).Resolve(context.Background(), "user_alice")
	assert.True(t, errors.Is(err, domain.ErrUserInactive), "expected ErrUserInactive, got %v", err)
	assert.Equal(t, 1, users.updates, "the link still happens; the user is then refused")
}

func TestProvision_InactiveUserReturnedNotRejected(t *testing.T) {
	users := newIdentityUsers(&domain.User{ID: 1, ClerkUserID: "user_alice", Username: "alice", Active: false})

	got, err := newResolver(users, newDirectory()).Provision(context.Background(), aliceProfile())
	require.NoError(t, err)
	assert.Equal(t, 1, got.ID)
}

func TestResolve_DirectoryNotFoundPropagates(t *testing.T) {
	users := newIdentityUsers()

	_, err := newResolver(users, newDirectory()).Resolve(context.Background(), "user_ghost")
	assert.True(t, errors.Is(err, domain.ErrNotFound), "expected ErrNotFound, got %v", err)
	assert.Equal(t, 0, users.creates)
}
