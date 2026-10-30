package cached

import (
	"context"
	"sort"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

type fakeTodoActionRepo struct {
	actions map[int]*domain.TodoAction
	calls   [][]int // ids requested per GetByIDs call
	onFetch func()
}

func (f *fakeTodoActionRepo) GetByID(ctx context.Context, id int) (*domain.TodoAction, error) {
	got, _ := f.GetByIDs(ctx, []int{id})
	if len(got) == 0 {
		return nil, domain.ErrNotFound
	}
	return got[0], nil
}

func (f *fakeTodoActionRepo) GetByIDs(_ context.Context, ids []int) ([]*domain.TodoAction, error) {
	f.calls = append(f.calls, append([]int(nil), ids...))
	var out []*domain.TodoAction
	for _, id := range ids {
		if a, ok := f.actions[id]; ok {
			out = append(out, copyTodoAction(a))
		}
	}
	if f.onFetch != nil {
		f.onFetch()
	}
	return out, nil
}

func (f *fakeTodoActionRepo) ListForUser(_ context.Context, _ int) ([]*domain.TodoAction, error) {
	return nil, nil
}

func (f *fakeTodoActionRepo) GetByKey(_ context.Context, _ *int, _ string) (*domain.TodoAction, error) {
	return nil, domain.ErrNotFound
}

func (f *fakeTodoActionRepo) Create(_ context.Context, a *domain.TodoAction) (*domain.TodoAction, error) {
	cp := copyTodoAction(a)
	f.actions[a.ID] = cp
	return copyTodoAction(cp), nil
}

func (f *fakeTodoActionRepo) ReassignByUser(_ context.Context, from, to int) error {
	for _, a := range f.actions {
		if a.UserID != nil && *a.UserID == from {
			owner := to
			a.UserID = &owner
		}
	}
	return nil
}

func intPtr(v int) *int { return &v }

func newTodoActions() (*fakeTodoActionRepo, *TodoActionRepository, *clock) {
	inner := &fakeTodoActionRepo{actions: map[int]*domain.TodoAction{
		1: {ID: 1, Key: "consume", Label: "one", TypicalSequence: intPtr(1)},
		2: {ID: 2, Key: "mine", Label: "two", UserID: intPtr(7)},
		3: {ID: 3, Key: "share", Label: "three", TypicalSequence: intPtr(3)},
	}}
	c := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	r := NewTodoActionRepository(inner, time.Minute)
	r.now = c.now
	return inner, r, c
}

func actionIDs(as []*domain.TodoAction) []int {
	out := make([]int, len(as))
	for i, a := range as {
		out[i] = a.ID
	}
	sort.Ints(out)
	return out
}

func TestTodoActionRepository_CacheHitAvoidsInner(t *testing.T) {
	inner, r, _ := newTodoActions()
	ctx := context.Background()

	_, err := r.GetByIDs(ctx, []int{1, 2})
	require.NoError(t, err)

	got, err := r.GetByID(ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, "one", got.Label)
	assert.Len(t, inner.calls, 1, "fresh hit: no inner call")
}

func TestTodoActionRepository_MixedHitMissReadsOnlyMissing(t *testing.T) {
	inner, r, _ := newTodoActions()
	ctx := context.Background()

	_, err := r.GetByIDs(ctx, []int{1})
	require.NoError(t, err)

	got, err := r.GetByIDs(ctx, []int{1, 2, 3, 99})
	require.NoError(t, err)
	assert.Equal(t, []int{1, 2, 3}, actionIDs(got), "missing ids are absent, like the inner repo")
	require.Len(t, inner.calls, 2)
	assert.Equal(t, []int{2, 3, 99}, inner.calls[1], "one inner call with only the missing ids")
}

func TestTodoActionRepository_Expiry(t *testing.T) {
	inner, r, c := newTodoActions()
	ctx := context.Background()

	_, _ = r.GetByIDs(ctx, []int{1})
	c.advance(time.Minute - time.Second)
	_, _ = r.GetByIDs(ctx, []int{1})
	assert.Len(t, inner.calls, 1, "still fresh just before the TTL")

	c.advance(2 * time.Second)
	_, _ = r.GetByIDs(ctx, []int{1})
	assert.Len(t, inner.calls, 2, "expired after the TTL")
}

func TestTodoActionRepository_CreateRefreshesEntry(t *testing.T) {
	inner, r, _ := newTodoActions()
	ctx := context.Background()
	_, _ = r.GetByIDs(ctx, []int{1})

	created, err := r.Create(ctx, &domain.TodoAction{ID: 1, Key: "consume", Label: "renamed", TypicalSequence: intPtr(1)})
	require.NoError(t, err)
	assert.Equal(t, "renamed", created.Label)

	got, err := r.GetByID(ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, "renamed", got.Label)

	created2, err := r.Create(ctx, &domain.TodoAction{ID: 4, Key: "custom", Label: "four", UserID: intPtr(9)})
	require.NoError(t, err)
	got2, err := r.GetByID(ctx, created2.ID)
	require.NoError(t, err)
	assert.Equal(t, "four", got2.Label)

	assert.Len(t, inner.calls, 1, "Create stored its returned rows; no read-back")
}

func TestTodoActionRepository_ReassignByUserClears(t *testing.T) {
	inner, r, _ := newTodoActions()
	ctx := context.Background()
	_, _ = r.GetByIDs(ctx, []int{1, 2})

	require.NoError(t, r.ReassignByUser(ctx, 7, 8))

	got, err := r.GetByID(ctx, 2)
	require.NoError(t, err)
	require.NotNil(t, got.UserID)
	assert.Equal(t, 8, *got.UserID, "rows changed owner, so the cache must not serve the old owner")
	assert.Len(t, inner.calls, 2)
	assert.Equal(t, []int{2}, inner.calls[1], "cache cleared: the entry is re-read")
}

// A read that raced a write must not cache what it read before the write.
func TestTodoActionRepository_WriteDuringReadIsNotStored(t *testing.T) {
	inner, r, _ := newTodoActions()
	ctx := context.Background()
	inner.onFetch = func() {
		inner.onFetch = nil
		// The stale read below still carries owner 7; this write moves it to 8.
		require.NoError(t, r.ReassignByUser(ctx, 7, 8))
	}

	stale, err := r.GetByIDs(ctx, []int{2}) // read sees owner 7, then the reassign lands
	require.NoError(t, err)
	require.Len(t, stale, 1)

	got, err := r.GetByID(ctx, 2)
	require.NoError(t, err)
	require.NotNil(t, got.UserID)
	assert.Equal(t, 8, *got.UserID, "the pre-write read was not cached")
	assert.Len(t, inner.calls, 2, "entry was not stored, so the next read hits inner")
}

func TestTodoActionRepository_ReturnsCopies(t *testing.T) {
	_, r, _ := newTodoActions()
	ctx := context.Background()

	got, _ := r.GetByID(ctx, 1)
	got.Label = "mutated"
	*got.TypicalSequence = 99

	again, _ := r.GetByID(ctx, 1)
	assert.Equal(t, "one", again.Label)
	require.NotNil(t, again.TypicalSequence)
	assert.Equal(t, 1, *again.TypicalSequence, "pointer fields are copied too")
}
