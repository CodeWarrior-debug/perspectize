package messaging_test

import (
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http/httptest"
	"os"
	"testing"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/stretchr/testify/require"
	"github.com/vektah/gqlparser/v2/ast"
	"gorm.io/gorm"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
)

// testTimeout is the per-assertion channel/read wait. Raised locally in a test
// only if it proves flaky under load.
const testTimeout = 3 * time.Second

// testServer is one fully wired messaging backend instance backed by a real
// Postgres and a real WebSocket transport, fronted by httptest.
type testServer struct {
	url         string
	db          *gorm.DB
	threadRepo  *postgres.GormThreadRepository
	messageRepo *postgres.GormMessageRepository
	userRepo    *postgres.GormUserRepository
	messaging   portservices.MessagingService
	hub         *realtime.Hub

	// tracked rows for cleanup
	userIDs   []int
	threadIDs []int
}

// newServer builds a messaging instance: GORM -> Postgres, thread/message repos,
// Hub + PresenceTracker + sliding-window limiter + MessagingService, a
// realtime.Listener on a cancel-on-cleanup context, and a gqlgen handler with
// the WebSocket + POST transports wrapped in httptest. The WebSocket InitFunc
// trusts initPayload["testUserId"] ONLY when APP_ENV=test.
//
// Skips the test when DATABASE_URL is empty.
func newServer(t *testing.T) *testServer {
	t.Helper()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping messaging e2e integration test")
	}
	t.Setenv("APP_ENV", "test")

	db, err := database.ConnectGORM(dsn, database.DefaultPoolConfig())
	require.NoError(t, err, "connect gorm")

	ts := &testServer{
		db:          db,
		threadRepo:  postgres.NewGormThreadRepository(db),
		messageRepo: postgres.NewGormMessageRepository(db),
		userRepo:    postgres.NewGormUserRepository(db),
	}
	contentRepo := postgres.NewGormContentRepository(db)
	perspectiveRepo := postgres.NewGormPerspectiveRepository(db)

	notifier, err := realtime.NewPgNotifier(context.Background(), dsn)
	require.NoError(t, err, "create notifier")
	t.Cleanup(notifier.Close)

	ts.hub = realtime.NewHub(ts.messageRepo, ts.threadRepo, notifier)
	presence := realtime.NewPresenceTracker()
	limiter := services.NewSlidingWindowLimiter(10, 10*time.Second)
	ts.messaging = services.NewMessagingService(ts.threadRepo, ts.messageRepo, ts.hub, limiter)

	userService := services.NewUserService(ts.userRepo, contentRepo, perspectiveRepo)

	listenerCtx, cancelListener := context.WithCancel(context.Background())
	listener := realtime.NewListener(dsn, ts.hub)
	go listener.Run(listenerCtx)

	// Cleanup order (LIFO): delete rows first (conn still open), then stop the
	// listener, then close the pool.
	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})
	t.Cleanup(cancelListener)
	t.Cleanup(func() { ts.cleanupRows(t) })

	resolver := resolvers.NewResolver(nil, userService, nil, nil, ts.messaging, ts.hub, presence)
	directiveRoot := directives.NewDirectiveRoot(nil, nil)
	gqlConfig := generated.Config{
		Resolvers: resolver,
		Directives: generated.DirectiveRoot{
			Auth:  directiveRoot.Auth,
			Owner: directiveRoot.Owner,
		},
	}

	srv := handler.New(generated.NewExecutableSchema(gqlConfig))
	srv.SetQueryCache(lru.New[*ast.QueryDocument](200))
	srv.AddTransport(transport.POST{})
	srv.AddTransport(transport.Websocket{
		KeepAlivePingInterval: 10 * time.Second,
		InitFunc: func(ctx context.Context, initPayload transport.InitPayload) (context.Context, *transport.InitPayload, error) {
			if os.Getenv("APP_ENV") != "test" {
				return ctx, nil, fmt.Errorf("test auth bypass disabled outside APP_ENV=test")
			}
			raw, ok := initPayload["testUserId"]
			if !ok {
				return ctx, nil, fmt.Errorf("missing testUserId in connection_init payload")
			}
			var uid int
			switch v := raw.(type) {
			case float64:
				uid = int(v)
			case json.Number:
				n, err := v.Int64()
				if err != nil {
					return ctx, nil, fmt.Errorf("bad testUserId: %w", err)
				}
				uid = int(n)
			default:
				return ctx, nil, fmt.Errorf("bad testUserId type %T", raw)
			}
			u, err := ts.userRepo.GetByID(ctx, uid)
			if err != nil || u == nil {
				return ctx, nil, fmt.Errorf("unknown testUserId %d: %v", uid, err)
			}
			authUser := &domain.AuthenticatedUser{
				ID:       u.ID,
				ClerkID:  u.ClerkUserID,
				Username: u.Username,
				Email:    u.Email,
				Role:     u.Role,
			}
			return auth.WithAuthenticatedUser(ctx, authUser), &initPayload, nil
		},
	})

	httpSrv := httptest.NewServer(srv)
	t.Cleanup(httpSrv.Close)
	ts.url = httpSrv.URL

	return ts
}

func (ts *testServer) cleanupRows(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	for _, tid := range ts.threadIDs {
		ts.db.WithContext(ctx).Exec("DELETE FROM messages WHERE thread_id = ?", tid)
		ts.db.WithContext(ctx).Exec("DELETE FROM thread_participants WHERE thread_id = ?", tid)
		ts.db.WithContext(ctx).Exec("DELETE FROM thread_sequences WHERE thread_id = ?", tid)
		ts.db.WithContext(ctx).Exec("DELETE FROM message_threads WHERE id = ?", tid)
	}
	for _, uid := range ts.userIDs {
		ts.db.WithContext(ctx).Exec("DELETE FROM users WHERE id = ?", uid)
	}
}

// mkUser inserts a fresh user and tracks it for cleanup.
func mkUser(t *testing.T, ts *testServer, name string) int {
	t.Helper()
	uname := fmt.Sprintf("%s_%06d", name, rand.Intn(1_000_000))
	if len(uname) > 24 {
		uname = uname[:24]
	}
	u, err := ts.userRepo.Create(context.Background(), &domain.User{
		Username: uname,
		Email:    fmt.Sprintf("%s@e2e.test", uname),
		Role:     domain.UserRoleDefault,
		Active:   true,
	})
	require.NoError(t, err, "create user")
	ts.userIDs = append(ts.userIDs, u.ID)
	return u.ID
}

// mustCreateThread creates a thread as actorID with the given participants
// (actor is added automatically by the service). Setup path — direct service
// call, not GraphQL.
func mustCreateThread(t *testing.T, ts *testServer, actorID int, participantIDs []int) int {
	t.Helper()
	thread, err := ts.messaging.CreateThread(context.Background(), actorID, participantIDs, nil)
	require.NoError(t, err, "create thread")
	ts.threadIDs = append(ts.threadIDs, thread.ID)
	return thread.ID
}

// mustSendMessage sends a message as actorID via the MessagingService (which
// performs the real DB insert -> trigger -> NOTIFY that the subscription path
// under assertion consumes). Returns the resulting seq.
func mustSendMessage(t *testing.T, ts *testServer, actorID, threadID int, body, nonce string) int64 {
	t.Helper()
	msg, err := ts.messaging.SendMessage(context.Background(), actorID, portservices.SendMessageInput{
		ThreadID:    threadID,
		Body:        body,
		ClientNonce: nonce,
	})
	require.NoError(t, err, "send message")
	return msg.Seq
}

// threadEventsQuery is the subscription used across the e2e tests. It selects
// every union member the tests care about plus StreamReset (used as a
// subscription-readiness barrier).
const threadEventsQuery = `subscription($t: ID!, $since: IntID) {
  threadEvents(threadId: $t, sinceSeq: $since) {
    __typename
    ... on MessagePosted { message { seq body threadId sender { id } } }
    ... on ReadReceiptChanged { threadId userId lastReadSeq }
    ... on StreamReset { threadId }
  }
}`

// decoded shapes for threadEventsQuery payload.data

type threadEventData struct {
	ThreadEvents struct {
		Typename string `json:"__typename"`
		Message  *struct {
			Seq      string `json:"seq"`
			Body     string `json:"body"`
			ThreadID string `json:"threadId"`
			Sender   struct {
				ID string `json:"id"`
			} `json:"sender"`
		} `json:"message"`
		ThreadID    string `json:"threadId"`
		UserID      string `json:"userId"`
		LastReadSeq string `json:"lastReadSeq"`
	} `json:"threadEvents"`
}

func decodeThreadEvent(t *testing.T, raw json.RawMessage) threadEventData {
	t.Helper()
	var d threadEventData
	require.NoErrorf(t, json.Unmarshal(raw, &d), "decode threadEvents data: %s", string(raw))
	return d
}

// waitSubscribed blocks until the given ws subscription is registered on the
// hub, proven by round-tripping a StreamReset broadcast through it. No sleeps:
// it re-broadcasts on a ticker until the client reads the event back.
func waitSubscribed(t *testing.T, ts *testServer, c *wsClient, id string, threadID int) {
	t.Helper()
	done := make(chan struct{})
	go func() {
		tk := time.NewTicker(40 * time.Millisecond)
		defer tk.Stop()
		ts.hub.Broadcast(threadID, domain.StreamResetEvent{ThreadID: threadID})
		for {
			select {
			case <-done:
				return
			case <-tk.C:
				ts.hub.Broadcast(threadID, domain.StreamResetEvent{ThreadID: threadID})
			}
		}
	}()
	defer close(done)

	ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
	defer cancel()
	for {
		raw, err := c.Next(ctx, id)
		require.NoError(t, err, "waiting for subscription readiness")
		if decodeThreadEvent(t, raw).ThreadEvents.Typename == "StreamReset" {
			return
		}
	}
}

// nextThreadEvent reads events for id, skipping StreamReset frames (which may
// still be buffered from the readiness barrier), until a non-reset event
// arrives or the timeout elapses.
func nextThreadEvent(t *testing.T, c *wsClient, id string) threadEventData {
	t.Helper()
	ctx, cancel := context.WithTimeout(context.Background(), testTimeout)
	defer cancel()
	for {
		raw, err := c.Next(ctx, id)
		require.NoError(t, err, "waiting for thread event")
		d := decodeThreadEvent(t, raw)
		if d.ThreadEvents.Typename == "StreamReset" {
			continue
		}
		return d
	}
}
