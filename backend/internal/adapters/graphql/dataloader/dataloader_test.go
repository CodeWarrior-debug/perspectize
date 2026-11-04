package dataloader

// Call-count guards for the per-request loaders: N field resolutions in one
// request must collapse into ONE service call, and a repeated key must not be
// fetched twice. If a resolver stops going through the loader (or a loader
// stops batching) the N+1 comes back and these fail.

import (
	"context"
	"sync"
	"sync/atomic"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

type countingCategoryService struct {
	portservices.CategoryService // nil: any other method panics, which is what we want
	calls                        atomic.Int32
	lastIDs                      []int
	mu                           sync.Mutex
}

func (s *countingCategoryService) GetCategoriesByIDs(_ context.Context, ids []int) ([]*domain.Category, error) {
	s.calls.Add(1)
	s.mu.Lock()
	s.lastIDs = append([]int(nil), ids...)
	s.mu.Unlock()
	out := make([]*domain.Category, 0, len(ids))
	for _, id := range ids {
		out = append(out, &domain.Category{ID: id, Label: "c"})
	}
	return out, nil
}

func TestCategoryLoader_BatchesConcurrentLoadsIntoOneServiceCall(t *testing.T) {
	svc := &countingCategoryService{}
	loaders := NewLoaders(Services{Category: svc})

	const n = 50
	var wg sync.WaitGroup
	for id := 1; id <= n; id++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			cat, err := loaders.CategoryByID.Load(context.Background(), id)
			assert.NoError(t, err)
			if assert.NotNil(t, cat) {
				assert.Equal(t, id, cat.ID)
			}
		}(id)
	}
	wg.Wait()

	assert.EqualValues(t, 1, svc.calls.Load(), "50 concurrent loads must be one batched call")
	assert.Len(t, svc.lastIDs, n)
}

func TestCategoryLoader_RepeatedKeyIsFetchedOnce(t *testing.T) {
	svc := &countingCategoryService{}
	loaders := NewLoaders(Services{Category: svc})
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		_, err := loaders.CategoryByID.Load(ctx, 7)
		require.NoError(t, err)
	}

	assert.EqualValues(t, 1, svc.calls.Load(), "the loader caches per request; the same id must not refetch")
}

type countingPerspectiveService struct {
	portservices.PerspectiveService // nil: any other method panics
	calls                           atomic.Int32
	mu                              sync.Mutex
	viewers                         []*int
}

func (s *countingPerspectiveService) CountVisibleByContentIDs(_ context.Context, ids []int, viewerID *int) (map[int]int, error) {
	s.calls.Add(1)
	s.mu.Lock()
	s.viewers = append(s.viewers, viewerID)
	s.mu.Unlock()
	out := make(map[int]int, len(ids))
	for _, id := range ids {
		if id%2 == 1 { // even ids have none visible: absent, like the repository
			out[id] = id
		}
	}
	return out, nil
}

func TestVisiblePerspectiveCountLoader_BatchesOneViewerIntoOneServiceCall(t *testing.T) {
	svc := &countingPerspectiveService{}
	loaders := NewLoaders(Services{Perspective: svc})

	const n = 50
	var wg sync.WaitGroup
	for id := 1; id <= n; id++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			got, err := loaders.VisiblePerspectiveCount.Load(context.Background(), VisiblePerspectiveKey{ViewerID: 7, ContentID: id})
			if id%2 == 1 {
				assert.NoError(t, err)
				assert.Equal(t, id, got)
			} else {
				assert.True(t, IsNotFound(err), "no visible perspectives is absent, got %v", err)
			}
		}(id)
	}
	wg.Wait()

	assert.EqualValues(t, 1, svc.calls.Load(), "50 concurrent loads for one viewer must be one batched call")
	require.Len(t, svc.viewers, 1)
	require.NotNil(t, svc.viewers[0])
	assert.Equal(t, 7, *svc.viewers[0])
}

func TestVisiblePerspectiveCountLoader_AnonymousViewerReachesTheServiceAsNil(t *testing.T) {
	svc := &countingPerspectiveService{}
	loaders := NewLoaders(Services{Perspective: svc})

	_, err := loaders.VisiblePerspectiveCount.Load(context.Background(), VisiblePerspectiveKey{ViewerID: 0, ContentID: 1})
	require.NoError(t, err)

	require.Len(t, svc.viewers, 1)
	assert.Nil(t, svc.viewers[0], "anonymous is nil, never 0")
}
