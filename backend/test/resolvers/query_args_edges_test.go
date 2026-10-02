package resolvers_test

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- content(sorts:) mapping ---

func TestContentQuery_SortsArgument(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		wantSorts []domain.ContentSortRule
	}{
		{
			name:      "omitted sorts leave Sorts nil",
			query:     `{ content { items { id } } }`,
			wantSorts: nil,
		},
		{
			name:      "empty sorts list leaves Sorts nil",
			query:     `{ content(sorts: []) { items { id } } }`,
			wantSorts: nil,
		},
		{
			name:  "multi-column sorts are mapped in order",
			query: `{ content(sorts: [{field: NAME, order: ASC}, {field: CREATED_AT, order: DESC}]) { items { id } } }`,
			wantSorts: []domain.ContentSortRule{
				{Field: domain.ContentSortByName, Order: domain.SortOrderAsc},
				{Field: domain.ContentSortByCreatedAt, Order: domain.SortOrderDesc},
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got domain.ContentListParams
			repo := &mockContentRepository{
				listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
					got = params
					return &domain.PaginatedContent{Items: []*domain.Content{}}, nil
				},
			}
			server := setupTestServer(repo, &mockYouTubeClient{})
			defer server.Close()

			result := executeGraphQL(t, server, tt.query)
			require.Empty(t, result.Errors)
			assert.Equal(t, tt.wantSorts, got.Sorts)
		})
	}
}

// --- perspectives(sortBy/sortOrder/includeTotalCount) mapping ---

func TestPerspectivesQuery_EnumAndTotalCountArgs(t *testing.T) {
	tests := []struct {
		name      string
		query     string
		wantSort  domain.PerspectiveSortBy
		wantOrder domain.SortOrder
		wantTotal bool
	}{
		{
			name:      "defaults when omitted",
			query:     `{ perspectives { items { id } } }`,
			wantSort:  domain.PerspectiveSortByCreatedAt,
			wantOrder: domain.SortOrderDesc,
			wantTotal: false,
		},
		{
			name:      "explicit values are honoured",
			query:     `{ perspectives(sortBy: UPDATED_AT, sortOrder: ASC, includeTotalCount: true) { items { id } } }`,
			wantSort:  domain.PerspectiveSortByUpdatedAt,
			wantOrder: domain.SortOrderAsc,
			wantTotal: true,
		},
		{
			name:      "explicit false total count stays false",
			query:     `{ perspectives(sortBy: CREATED_AT, sortOrder: DESC, includeTotalCount: false) { items { id } } }`,
			wantSort:  domain.PerspectiveSortByCreatedAt,
			wantOrder: domain.SortOrderDesc,
			wantTotal: false,
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			var got domain.PerspectiveListParams
			repo := &mockPerspectiveRepository{
				listFn: func(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
					got = params
					return &domain.PaginatedPerspectives{Items: []*domain.Perspective{}}, nil
				},
			}
			server := setupPerspectiveVisibilityServer(repo, true)
			defer server.Close()

			result := executeGraphQL(t, server, tt.query)
			require.Empty(t, result.Errors)
			assert.Equal(t, tt.wantSort, got.SortBy)
			assert.Equal(t, tt.wantOrder, got.SortOrder)
			assert.Equal(t, tt.wantTotal, got.IncludeTotalCount)
		})
	}
}

// --- threadEvents replay cursor edges ---

func TestThreadEventsSubscription_SinceZeroNeverEmitsStreamReset(t *testing.T) {
	// sinceSeq 0 means "from the beginning": the first surviving message being
	// seq 5 is not a pruned gap the client can be told about.
	fake := &fakeMessaging{
		listSinceFn: func(_ context.Context, _, _ int, sinceSeq int64) ([]domain.Message, error) {
			assert.Equal(t, int64(0), sinceSeq)
			return []domain.Message{{ID: 50, ThreadID: 2, SenderID: 1, Seq: 5, Body: "first-surviving"}}, nil
		},
	}
	r := &resolvers.Resolver{Messaging: fake, Hub: realtime.NewHub(nil, nil, nil)}

	ctx, cancel := context.WithCancel(authedCtx(1))
	defer cancel()
	since := 0
	ch, err := r.Subscription().ThreadEvents(ctx, "2", &since)
	require.NoError(t, err)

	select {
	case evt := <-ch:
		mp, ok := evt.(model.MessagePosted)
		require.Truef(t, ok, "expected the replayed message with no reset, got %T", evt)
		assert.Equal(t, "first-surviving", mp.Message.Body)
	case <-time.After(2 * time.Second):
		t.Fatal("no replayed event")
	}
}

func TestThreadEventsSubscription_EmptyReplayEmitsNothingAndClosesOnCancel(t *testing.T) {
	var once sync.Once
	called := make(chan struct{})
	fake := &fakeMessaging{
		listSinceFn: func(_ context.Context, _, _ int, _ int64) ([]domain.Message, error) {
			once.Do(func() { close(called) })
			return nil, nil
		},
	}
	r := &resolvers.Resolver{Messaging: fake, Hub: realtime.NewHub(nil, nil, nil)}

	ctx, cancel := context.WithCancel(authedCtx(1))
	defer cancel()
	since := 3
	ch, err := r.Subscription().ThreadEvents(ctx, "2", &since)
	require.NoError(t, err)

	select {
	case <-called:
	case <-time.After(2 * time.Second):
		t.Fatal("replay was never requested")
	}
	cancel()

	select {
	case evt, open := <-ch:
		assert.Falsef(t, open, "expected the stream to close with no events, got %T", evt)
	case <-time.After(2 * time.Second):
		t.Fatal("stream did not close after cancel")
	}
}
