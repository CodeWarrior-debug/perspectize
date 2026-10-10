// Package dataloader wires per-request batching loaders into the request
// context so GraphQL field resolvers can collapse N per-row lookups into a
// single batched query.
//
// Hexagonal boundary: loaders depend only on the service ports in
// internal/core/ports/services. No SQL and no repository types appear here —
// the batch functions call through the same CategoryService the resolvers
// already use.
package dataloader

import (
	"context"
	"errors"
	"net/http"

	"github.com/vikstrous/dataloadgen"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

type ctxKey struct{}

// Loaders holds every per-request loader. One instance lives for the duration
// of a single HTTP request.
type Loaders struct {
	CategoryByID                    *dataloadgen.Loader[int, *domain.Category]
	PerspectiveAggregateByContentID *dataloadgen.Loader[int, *domain.PerspectiveAggregate]
	// ContentByID batches Perspective.content lookups.
	ContentByID *dataloadgen.Loader[int, *domain.Content]
	// UserByID batches Message.sender / ThreadParticipant.user /
	// Perspective.user / Content.addedBy lookups.
	UserByID *dataloadgen.Loader[int, *domain.User]
	// ThreadStats batches MessageThread.latestSeq / unreadCount per viewer.
	ThreadStats *dataloadgen.Loader[ThreadStatsKey, domain.ThreadStats]
	// TodoActionByID batches UserTodo.action lookups.
	TodoActionByID *dataloadgen.Loader[int, *domain.TodoAction]
	// UserTodoListByID batches UserTodo.list lookups. The key carries the
	// viewer, because a PRIVATE list is returned only to its owner.
	UserTodoListByID *dataloadgen.Loader[UserTodoListKey, *domain.UserTodoList]
}

// ThreadStatsKey identifies one viewer's stats for one thread.
type ThreadStatsKey struct {
	ViewerID int
	ThreadID int
}

// UserTodoListKey identifies one list as seen by one viewer. ViewerID 0 is an
// anonymous caller.
type UserTodoListKey struct {
	ViewerID int
	ListID   int
}

// Services are the ports the loaders batch through.
type Services struct {
	Category    portservices.CategoryService
	Perspective portservices.PerspectiveService
	User        portservices.UserService
	Content     portservices.ContentService
	Messaging   portservices.MessagingService
	UserTodo    portservices.UserTodoService
}

// NewLoaders builds a fresh set of loaders backed by the given services.
func NewLoaders(s Services) *Loaders {
	cb := &categoryBatcher{service: s.Category}
	pb := &perspectiveAggregateBatcher{service: s.Perspective}
	ub := &userBatcher{service: s.User}
	tb := &threadStatsBatcher{service: s.Messaging}
	cnb := &contentBatcher{service: s.Content}
	tab := &todoActionBatcher{service: s.UserTodo}
	tlb := &userTodoListBatcher{service: s.UserTodo}
	return &Loaders{
		CategoryByID:                    dataloadgen.NewMappedLoader(cb.byID),
		PerspectiveAggregateByContentID: dataloadgen.NewMappedLoader(pb.byContentID),
		UserByID:                        dataloadgen.NewMappedLoader(ub.byID),
		ThreadStats:                     dataloadgen.NewMappedLoader(tb.byKey),
		ContentByID:                     dataloadgen.NewMappedLoader(cnb.byID),
		TodoActionByID:                  dataloadgen.NewMappedLoader(tab.byID),
		UserTodoListByID:                dataloadgen.NewMappedLoader(tlb.byKey),
	}
}

// Middleware injects a fresh *Loaders into the context of every request. It
// mirrors the chi middleware conventions in internal/server (a
// func(http.Handler) http.Handler).
func Middleware(s Services) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := context.WithValue(r.Context(), ctxKey{}, NewLoaders(s))
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}

// For returns the loaders bound to the current request, or nil if the
// middleware is not installed (callers must handle nil and fall back).
func For(ctx context.Context) *Loaders {
	l, _ := ctx.Value(ctxKey{}).(*Loaders)
	return l
}

// userBatcher resolves a batch of user IDs in one query.
type userBatcher struct {
	service portservices.UserService
}

func (b *userBatcher) byID(ctx context.Context, ids []int) (map[int]*domain.User, error) {
	users, err := b.service.GetByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make(map[int]*domain.User, len(users))
	for _, u := range users {
		if u != nil {
			out[u.ID] = u
		}
	}
	return out, nil
}

// contentBatcher resolves a batch of content IDs in one query.
type contentBatcher struct {
	service portservices.ContentService
}

func (b *contentBatcher) byID(ctx context.Context, ids []int) (map[int]*domain.Content, error) {
	items, err := b.service.GetByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make(map[int]*domain.Content, len(items))
	for _, c := range items {
		if c != nil {
			out[c.ID] = c
		}
	}
	return out, nil
}

// threadStatsBatcher resolves many (viewer, thread) stats in one query per
// viewer — in practice one query, since a request has a single viewer.
type threadStatsBatcher struct {
	service portservices.MessagingService
}

func (b *threadStatsBatcher) byKey(ctx context.Context, keys []ThreadStatsKey) (map[ThreadStatsKey]domain.ThreadStats, error) {
	byViewer := make(map[int][]int)
	for _, k := range keys {
		byViewer[k.ViewerID] = append(byViewer[k.ViewerID], k.ThreadID)
	}
	out := make(map[ThreadStatsKey]domain.ThreadStats, len(keys))
	for viewer, threadIDs := range byViewer {
		stats, err := b.service.ThreadStats(ctx, viewer, threadIDs)
		if err != nil {
			return nil, err
		}
		for tid, st := range stats {
			out[ThreadStatsKey{ViewerID: viewer, ThreadID: tid}] = st
		}
	}
	return out, nil
}

// todoActionBatcher resolves a batch of todo action IDs in one service call.
type todoActionBatcher struct {
	service portservices.UserTodoService
}

func (b *todoActionBatcher) byID(ctx context.Context, ids []int) (map[int]*domain.TodoAction, error) {
	actions, err := b.service.GetTodoActionsByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make(map[int]*domain.TodoAction, len(actions))
	for _, a := range actions {
		if a != nil {
			out[a.ID] = a
		}
	}
	return out, nil
}

// userTodoListBatcher resolves many (viewer, list) keys. Each viewer's lists go
// through GetUserTodoListsByIDs with that viewer, so a PRIVATE list another user
// owns is absent from the map and its key surfaces as not-found.
type userTodoListBatcher struct {
	service portservices.UserTodoService
}

func (b *userTodoListBatcher) byKey(ctx context.Context, keys []UserTodoListKey) (map[UserTodoListKey]*domain.UserTodoList, error) {
	byViewer := make(map[int][]int)
	for _, k := range keys {
		byViewer[k.ViewerID] = append(byViewer[k.ViewerID], k.ListID)
	}
	out := make(map[UserTodoListKey]*domain.UserTodoList, len(keys))
	for viewer, listIDs := range byViewer {
		var viewerID *int
		if viewer != 0 {
			v := viewer
			viewerID = &v
		}
		lists, err := b.service.GetUserTodoListsByIDs(ctx, listIDs, viewerID)
		if err != nil {
			return nil, err
		}
		for _, l := range lists {
			if l != nil {
				out[UserTodoListKey{ViewerID: viewer, ListID: l.ID}] = l
			}
		}
	}
	return out, nil
}

// categoryBatcher adapts CategoryService to a dataloadgen mapped-fetch func.
type categoryBatcher struct {
	service portservices.CategoryService
}

// byID resolves a batch of category IDs to a keyed map. dataloadgen fills in
// dataloadgen.ErrNotFound for any key absent from the returned map; the
// resolver treats that as "no category".
func (b *categoryBatcher) byID(ctx context.Context, ids []int) (map[int]*domain.Category, error) {
	cats, err := b.service.GetCategoriesByIDs(ctx, ids)
	if err != nil {
		return nil, err
	}
	out := make(map[int]*domain.Category, len(cats))
	for _, c := range cats {
		if c != nil {
			out[c.ID] = c
		}
	}
	return out, nil
}

// perspectiveAggregateBatcher adapts PerspectiveService to a dataloadgen
// mapped-fetch func, batching per-content perspective count/average-rating
// lookups across a single GraphQL request into one query.
type perspectiveAggregateBatcher struct {
	service portservices.PerspectiveService
}

// byContentID resolves a batch of content IDs to their perspective aggregate.
// A content ID with no public perspectives is simply absent from the
// returned map; dataloadgen surfaces that as dataloadgen.ErrNotFound, which
// resolvers treat as "count 0 / no average" via IsNotFound.
func (b *perspectiveAggregateBatcher) byContentID(ctx context.Context, contentIDs []int) (map[int]*domain.PerspectiveAggregate, error) {
	return b.service.AggregateByContentIDs(ctx, contentIDs)
}

// IsNotFound reports whether a loader error is just "this key had no row",
// which resolvers should surface as a nil value rather than a GraphQL error.
func IsNotFound(err error) bool {
	return errors.Is(err, dataloadgen.ErrNotFound)
}
