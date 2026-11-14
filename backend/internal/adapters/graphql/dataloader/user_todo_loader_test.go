package dataloader

// Call-count guards for the user todo loaders: N field resolutions in one
// request collapse into ONE service call, and the list loader keeps a PRIVATE
// list hidden from everyone but its owner.

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

// fakeTodoService answers the two batch reads the loaders use. Any other method
// panics (nil embedded interface), which is what we want.
type fakeTodoService struct {
	portservices.UserTodoService
	actionCalls atomic.Int32
	listCalls   atomic.Int32

	mu      sync.Mutex
	viewers []*int // the viewer each list call was made for
}

// Lists: 1 is PUBLIC and owned by user 7; 2 is PRIVATE and owned by user 7.
var fakeLists = map[int]*domain.UserTodoList{
	1: {ID: 1, UserID: 7, Name: "public", Privacy: domain.PrivacyPublic},
	2: {ID: 2, UserID: 7, Name: "private", Privacy: domain.PrivacyPrivate},
}

func (s *fakeTodoService) GetTodoActionsByIDs(_ context.Context, ids []int) ([]*domain.TodoAction, error) {
	s.actionCalls.Add(1)
	out := make([]*domain.TodoAction, 0, len(ids))
	for _, id := range ids {
		out = append(out, &domain.TodoAction{ID: id, Key: "consume", Label: "Consume"})
	}
	return out, nil
}

func (s *fakeTodoService) GetUserTodoListsByIDs(_ context.Context, ids []int, viewerID *int) ([]*domain.UserTodoList, error) {
	s.listCalls.Add(1)
	s.mu.Lock()
	s.viewers = append(s.viewers, viewerID)
	s.mu.Unlock()

	var out []*domain.UserTodoList
	for _, id := range ids {
		l, ok := fakeLists[id]
		if !ok {
			continue
		}
		// Same rule as UserTodoService.GetUserTodoListsByIDs.
		if l.Privacy == domain.PrivacyPublic || (viewerID != nil && *viewerID == l.UserID) {
			out = append(out, l)
		}
	}
	return out, nil
}

func TestTodoActionLoader_BatchesConcurrentLoadsIntoOneServiceCall(t *testing.T) {
	svc := &fakeTodoService{}
	loaders := NewLoaders(Services{UserTodo: svc})

	const n = 50
	var wg sync.WaitGroup
	for id := 1; id <= n; id++ {
		wg.Add(1)
		go func(id int) {
			defer wg.Done()
			action, err := loaders.TodoActionByID.Load(context.Background(), id)
			assert.NoError(t, err)
			if assert.NotNil(t, action) {
				assert.Equal(t, id, action.ID)
			}
		}(id)
	}
	wg.Wait()

	assert.EqualValues(t, 1, svc.actionCalls.Load(), "50 concurrent loads must be one batched call")
}

func TestTodoActionLoader_RepeatedKeyIsFetchedOnce(t *testing.T) {
	svc := &fakeTodoService{}
	loaders := NewLoaders(Services{UserTodo: svc})
	ctx := context.Background()

	for i := 0; i < 5; i++ {
		_, err := loaders.TodoActionByID.Load(ctx, 3)
		require.NoError(t, err)
	}

	assert.EqualValues(t, 1, svc.actionCalls.Load(), "the loader caches per request; the same id must not refetch")
}

func TestUserTodoListLoader_BatchesConcurrentLoadsIntoOneServiceCall(t *testing.T) {
	svc := &fakeTodoService{}
	loaders := NewLoaders(Services{UserTodo: svc})

	// 50 concurrent loads of the same viewer's lists, in one batch.
	const n = 50
	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			key := UserTodoListKey{ViewerID: 7, ListID: 1 + i%2}
			list, err := loaders.UserTodoListByID.Load(context.Background(), key)
			assert.NoError(t, err)
			if assert.NotNil(t, list) {
				assert.Equal(t, key.ListID, list.ID)
			}
		}(i)
	}
	wg.Wait()

	assert.EqualValues(t, 1, svc.listCalls.Load(), "one viewer's lists must be one batched call")
}

func TestUserTodoListLoader_PrivateListHiddenFromNonOwner(t *testing.T) {
	svc := &fakeTodoService{}
	loaders := NewLoaders(Services{UserTodo: svc})
	ctx := context.Background()

	owner, err := loaders.UserTodoListByID.Load(ctx, UserTodoListKey{ViewerID: 7, ListID: 2})
	require.NoError(t, err)
	assert.Equal(t, 2, owner.ID, "the owner sees their private list")

	_, err = loaders.UserTodoListByID.Load(ctx, UserTodoListKey{ViewerID: 3, ListID: 2})
	assert.True(t, IsNotFound(err), "another viewer's private list is not found, got %v", err)

	_, err = loaders.UserTodoListByID.Load(ctx, UserTodoListKey{ViewerID: 0, ListID: 2})
	assert.True(t, IsNotFound(err), "an anonymous caller doesn't see a private list, got %v", err)

	anon, err := loaders.UserTodoListByID.Load(ctx, UserTodoListKey{ViewerID: 0, ListID: 1})
	require.NoError(t, err)
	assert.Equal(t, 1, anon.ID, "a public list is visible to anonymous callers")
}

func TestUserTodoListLoader_PassesEachViewerThrough(t *testing.T) {
	svc := &fakeTodoService{}
	loaders := NewLoaders(Services{UserTodo: svc})
	ctx := context.Background()

	// The viewer rides on the key: a signed-in caller reaches the service as their
	// id, and an anonymous caller as nil (never as 0).
	_, err := loaders.UserTodoListByID.Load(ctx, UserTodoListKey{ViewerID: 7, ListID: 2})
	require.NoError(t, err)
	_, err = loaders.UserTodoListByID.Load(ctx, UserTodoListKey{ViewerID: 0, ListID: 1})
	require.NoError(t, err)

	svc.mu.Lock()
	defer svc.mu.Unlock()
	var sawOwner, sawAnon bool
	for _, v := range svc.viewers {
		if v != nil && *v == 7 {
			sawOwner = true
		}
		if v == nil {
			sawAnon = true
		}
	}
	assert.True(t, sawOwner, "the signed-in viewer's id is passed through")
	assert.True(t, sawAnon, "the anonymous viewer is passed as nil")
}
