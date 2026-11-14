package cached

import (
	"context"
	"errors"
	"sort"
	"testing"
	"time"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

type fakeCategoryRepo struct {
	cats      map[int]*domain.Category
	calls     [][]int // ids requested per GetByIDs call
	upsertErr error
	onFetch   func()
}

func (f *fakeCategoryRepo) Upsert(_ context.Context, c *domain.Category) (*domain.Category, error) {
	if f.upsertErr != nil {
		return nil, f.upsertErr
	}
	cp := *c
	f.cats[c.ID] = &cp
	return &cp, nil
}
func (f *fakeCategoryRepo) GetByID(ctx context.Context, id int) (*domain.Category, error) {
	got, _ := f.GetByIDs(ctx, []int{id})
	if len(got) == 0 {
		return nil, domain.ErrNotFound
	}
	return got[0], nil
}
func (f *fakeCategoryRepo) GetByIDs(_ context.Context, ids []int) ([]*domain.Category, error) {
	f.calls = append(f.calls, append([]int(nil), ids...))
	var out []*domain.Category
	for _, id := range ids {
		if c, ok := f.cats[id]; ok {
			cp := *c
			out = append(out, &cp)
		}
	}
	if f.onFetch != nil {
		f.onFetch()
	}
	return out, nil
}

func newCats() (*fakeCategoryRepo, *CategoryRepository, *clock) {
	inner := &fakeCategoryRepo{cats: map[int]*domain.Category{
		1: {ID: 1, Label: "one"}, 2: {ID: 2, Label: "two"}, 3: {ID: 3, Label: "three"},
	}}
	c := &clock{t: time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)}
	r := NewCategoryRepository(inner, time.Minute)
	r.now = c.now
	return inner, r, c
}

func ids(cs []*domain.Category) []int {
	out := make([]int, len(cs))
	for i, c := range cs {
		out[i] = c.ID
	}
	sort.Ints(out)
	return out
}

func TestCategoryRepository_ReadsOnlyMissingIDs(t *testing.T) {
	inner, r, _ := newCats()
	ctx := context.Background()

	got, err := r.GetByIDs(ctx, []int{1, 2})
	require.NoError(t, err)
	assert.Equal(t, []int{1, 2}, ids(got))

	got, err = r.GetByIDs(ctx, []int{1, 2, 3, 99})
	require.NoError(t, err)
	assert.Equal(t, []int{1, 2, 3}, ids(got), "missing ids are absent, like the inner repo")
	require.Len(t, inner.calls, 2)
	assert.Equal(t, []int{3, 99}, inner.calls[1], "cached ids are not re-read")

	_, err = r.GetByIDs(ctx, []int{1, 2, 3})
	require.NoError(t, err)
	assert.Len(t, inner.calls, 2, "all cached: no query")
}

func TestCategoryRepository_Expiry(t *testing.T) {
	inner, r, c := newCats()
	ctx := context.Background()
	_, _ = r.GetByIDs(ctx, []int{1})
	c.advance(time.Minute + time.Second)
	_, _ = r.GetByIDs(ctx, []int{1})
	assert.Len(t, inner.calls, 2)
}

func TestCategoryRepository_UpsertWritesThrough(t *testing.T) {
	inner, r, _ := newCats()
	ctx := context.Background()
	_, _ = r.GetByIDs(ctx, []int{1, 2})

	_, err := r.Upsert(ctx, &domain.Category{ID: 1, Label: "renamed"})
	require.NoError(t, err)

	got, err := r.GetByID(ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, "renamed", got.Label)
	_, _ = r.GetByIDs(ctx, []int{2})
	assert.Len(t, inner.calls, 1, "the write refreshed its entry in place; others kept")
}

func TestCategoryRepository_UpsertErrorInvalidates(t *testing.T) {
	inner, r, _ := newCats()
	ctx := context.Background()
	_, _ = r.GetByIDs(ctx, []int{1})
	inner.upsertErr = errors.New("boom")

	_, err := r.Upsert(ctx, &domain.Category{ID: 1})
	require.Error(t, err)
	_, _ = r.GetByIDs(ctx, []int{1})
	assert.Len(t, inner.calls, 2)
}

// A read that raced a write must not cache what it read before the write.
func TestCategoryRepository_WriteDuringReadIsNotOverwritten(t *testing.T) {
	inner, r, _ := newCats()
	ctx := context.Background()
	inner.onFetch = func() {
		inner.onFetch = nil
		_, _ = r.Upsert(ctx, &domain.Category{ID: 1, Label: "new"})
	}
	_, _ = r.GetByIDs(ctx, []int{1}) // reads "one", then the upsert lands

	got, err := r.GetByID(ctx, 1)
	require.NoError(t, err)
	assert.Equal(t, "new", got.Label)
}

func TestCategoryRepository_ReturnsCopies(t *testing.T) {
	_, r, _ := newCats()
	ctx := context.Background()
	got, _ := r.GetByID(ctx, 1)
	got.Label = "mutated"
	again, _ := r.GetByID(ctx, 1)
	assert.Equal(t, "one", again.Label)
}
