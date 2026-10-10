// Package roundtrips pins how many database statements (= network round trips
// to Postgres) each GraphQL operation costs, end to end: the real middleware
// chain (auth user lookup included), gqlgen, directives, services and GORM
// repositories from internal/server, against a real migrated Postgres.
//
// Production reaches Postgres through a remote proxy, so every sequential
// statement costs ~100-250ms of user-visible latency. A test failing here
// means a change added (or removed) round trips: if it removed some, lower the
// expected count; if it added some, justify it or fix it.
//
// Set RT_MEASURE=1 to log every operation's statements instead of failing
// on a count mismatch (handy for recording a before/after when optimizing).
//
// Requires DATABASE_URL pointing at a migrated, disposable database (CI's
// Postgres service). Skips otherwise. Never point it at a shared database.
package roundtrips

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/require"
	"gorm.io/gorm"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/realtime"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/cached"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/tmdb"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/youtube"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/server"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
)

// tokenPrefix marks a harness bearer token: "rt.<clerkID>".
const tokenPrefix = "rt."

// tokenVerifier maps "rt.<clerkID>" straight to that Clerk ID. Clerk's own
// header middleware passes a non-JWT token through untouched, exactly as it
// does for demo-mode tokens, so this exercises the production auth path from
// there on.
type tokenVerifier struct{}

func (tokenVerifier) Verify(_ context.Context, token string) (domain.Identity, error) {
	id, ok := strings.CutPrefix(token, tokenPrefix)
	if !ok || id == "" {
		return domain.Identity{}, fmt.Errorf("not a round-trip test token")
	}
	return domain.Identity{ClerkID: id}, nil
}

// noWikidata keeps category tests off the network.
type noWikidata struct{}

func (noWikidata) Search(context.Context, string, string, int) ([]domain.WikidataSearchResult, error) {
	return nil, nil
}
func (noWikidata) GetWikipediaURL(context.Context, string) (string, error) { return "", nil }

type harness struct {
	t       *testing.T
	db      *gorm.DB
	counter *database.StatementCounter
	handler http.Handler

	userRepo    *postgres.GormUserRepository
	contentRepo *postgres.GormContentRepository

	userIDs    []int
	contentIDs []int
}

var saltSeq atomic.Int64

func newHarness(t *testing.T) *harness {
	t.Helper()
	return newHarnessWithPool(t, database.DefaultPoolConfig())
}

// newHarnessWithPool is newHarness with an explicit pool (e.g. one connection,
// to make prepared-statement cache behaviour deterministic).
func newHarnessWithPool(t *testing.T, pool database.PoolConfig) *harness {
	t.Helper()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping round-trip tests")
	}

	counter := &database.StatementCounter{}
	db, err := database.ConnectGORM(dsn, pool, database.WithTracer(counter))
	require.NoError(t, err)
	require.NoError(t, database.PingGORM(context.Background(), db))

	h := &harness{
		t:           t,
		db:          db,
		counter:     counter,
		userRepo:    postgres.NewGormUserRepository(db),
		contentRepo: postgres.NewGormContentRepository(db),
	}

	// Same wiring as cmd/server/main.go.
	userRepo := cached.NewUserRepository(h.userRepo, cached.DefaultUserTTL)
	perspectiveRepo := postgres.NewGormPerspectiveRepository(db)
	// Cached: the content grid resolves every row's primaryCategory through it.
	categoryRepo := cached.NewCategoryRepository(postgres.NewGormCategoryRepository(db), cached.DefaultCategoryTTL)
	threadRepo := postgres.NewGormMessageThreadRepository(db)
	messageRepo := postgres.NewGormMessageRepository(db)
	bibleReferenceRepo := postgres.NewGormBibleReferenceRepository(db)

	notifier, err := realtime.NewPgNotifier(context.Background(), dsn, counter)
	require.NoError(t, err)
	hub := realtime.NewHub(messageRepo, threadRepo, notifier)

	todoRepo := postgres.NewGormUserTodoRepository(db)
	todoListRepo := postgres.NewGormUserTodoListRepository(db)
	todoActionRepo := cached.NewTodoActionRepository(postgres.NewGormTodoActionRepository(db), cached.DefaultTodoActionTTL)

	deps := server.Deps{
		ContentService:     services.NewContentService(h.contentRepo, youtube.NewFixtureClient(), tmdb.NewFixtureClient(), services.WithBibleReference(bibleReferenceRepo)),
		UserService:        services.NewUserService(userRepo, h.contentRepo, perspectiveRepo, todoRepo, todoListRepo, todoActionRepo),
		PerspectiveService: services.NewPerspectiveService(perspectiveRepo, userRepo),
		CategoryService:    services.NewCategoryService(categoryRepo, h.contentRepo, noWikidata{}),
		UserTodoService:    services.NewUserTodoService(todoRepo, todoListRepo, todoActionRepo),
		MessagingService:   services.NewMessagingService(threadRepo, messageRepo, hub, services.NewSlidingWindowLimiter(1000, time.Second)),
		UserRepo:           userRepo,
		ThreadRepo:         threadRepo,
		Hub:                hub,
		Presence:           realtime.NewPresenceTracker(),
		TokenVerifier:      tokenVerifier{},
		CORSOrigins:        []string{"*"},
		RateLimitPerMin:    100000,
	}
	r := chi.NewRouter()
	for _, mw := range server.Middleware(deps) {
		r.Use(mw)
	}
	r.Handle("/graphql", server.NewGraphQLServer(deps))
	h.handler = r

	t.Cleanup(func() {
		h.cleanup()
		notifier.Close()
		if sqlDB, err := db.DB(); err == nil {
			_ = sqlDB.Close()
		}
	})
	return h
}

// user creates a user and returns its id and bearer token.
func (h *harness) user(name string) (int, string) {
	h.t.Helper()
	salt := fmt.Sprintf("%x%x", time.Now().UnixNano()&0xFFFFFFF, saltSeq.Add(1))
	clerkID := "rt" + salt
	u, err := h.userRepo.CreateFromClerk(context.Background(), clerkID, name+"-"+salt, "")
	require.NoError(h.t, err)
	h.userIDs = append(h.userIDs, u.ID)
	return u.ID, tokenPrefix + clerkID
}

// content creates a content row owned by userID.
func (h *harness) content(userID int, name string) int {
	h.t.Helper()
	url := fmt.Sprintf("https://example.test/%s/%d", name, time.Now().UnixNano())
	c, err := h.contentRepo.Create(context.Background(), &domain.Content{
		Name: name, URL: &url, ContentType: domain.ContentTypeYouTubeVideo, AddedByUserID: userID,
	})
	require.NoError(h.t, err)
	h.contentIDs = append(h.contentIDs, c.ID)
	return c.ID
}

// trackContent registers a content row created through the API for cleanup.
func (h *harness) trackContent(id string) {
	h.t.Helper()
	n, err := strconv.Atoi(id)
	require.NoError(h.t, err)
	h.contentIDs = append(h.contentIDs, n)
}

// warm makes one authenticated request so the Clerk ID -> user cache is
// populated, the way it is for every request after a user's first.
func (h *harness) warm(token string) {
	h.t.Helper()
	h.gql(token, `{ __typename }`, nil)
}

type gqlResponse struct {
	Data   map[string]json.RawMessage `json:"data"`
	Errors []struct {
		Message string `json:"message"`
	} `json:"errors"`
}

// gql performs one GraphQL request and fails the test on GraphQL errors.
func (h *harness) gql(token, query string, vars map[string]any) map[string]json.RawMessage {
	h.t.Helper()
	body, err := json.Marshal(map[string]any{"query": query, "variables": vars})
	require.NoError(h.t, err)
	req := httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	if token != "" {
		req.Header.Set("Authorization", "Bearer "+token)
	}
	rec := httptest.NewRecorder()
	h.handler.ServeHTTP(rec, req)
	require.Equal(h.t, http.StatusOK, rec.Code, rec.Body.String())

	var resp gqlResponse
	require.NoError(h.t, json.Unmarshal(rec.Body.Bytes(), &resp), rec.Body.String())
	require.Empty(h.t, resp.Errors, rec.Body.String())
	return resp.Data
}

// gqlError performs a request that must fail and returns its first error
// message.
func (h *harness) gqlError(token, query string, vars map[string]any) string {
	h.t.Helper()
	body, err := json.Marshal(map[string]any{"query": query, "variables": vars})
	require.NoError(h.t, err)
	req := httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+token)
	rec := httptest.NewRecorder()
	h.handler.ServeHTTP(rec, req)

	var resp gqlResponse
	require.NoError(h.t, json.Unmarshal(rec.Body.Bytes(), &resp), rec.Body.String())
	require.NotEmpty(h.t, resp.Errors, rec.Body.String())
	return resp.Errors[0].Message
}

// roundTrips performs the request and asserts it sent exactly want statements
// to Postgres, printing them on mismatch.
func (h *harness) roundTrips(want int, token, query string, vars map[string]any) map[string]json.RawMessage {
	h.t.Helper()
	h.counter.Reset()
	data := h.gql(token, query, vars)
	got := h.counter.Statements()
	if len(got) != want || os.Getenv("RT_MEASURE") != "" {
		var b strings.Builder
		for i, s := range got {
			fmt.Fprintf(&b, "  %2d. %s\n", i+1, truncate(s, 160))
		}
		msg := fmt.Sprintf("round trips: want %d, got %d:\n%s", want, len(got), b.String())
		if os.Getenv("RT_MEASURE") != "" {
			h.t.Log(msg)
		} else {
			h.t.Fatal(msg)
		}
	}
	return data
}

func truncate(s string, n int) string {
	if len(s) <= n {
		return s
	}
	return s[:n] + "…"
}

func (h *harness) cleanup() {
	ctx := context.Background()
	db := h.db.WithContext(ctx)
	if len(h.userIDs) > 0 {
		_ = db.Exec("DELETE FROM perspectives WHERE user_id IN ?", h.userIDs).Error
		// Todos reference content, lists and actions with RESTRICT, so they go first.
		_ = db.Exec("DELETE FROM user_todos WHERE user_id IN ?", h.userIDs).Error
		_ = db.Exec("DELETE FROM user_todo_lists WHERE user_id IN ?", h.userIDs).Error
		_ = db.Exec("DELETE FROM todo_actions WHERE user_id IN ?", h.userIDs).Error
		_ = db.Exec("DELETE FROM message_threads WHERE created_by IN ?", h.userIDs).Error
		_ = db.Exec("DELETE FROM messages WHERE sender_id IN ?", h.userIDs).Error
		_ = db.Exec("DELETE FROM thread_participants WHERE user_id IN ?", h.userIDs).Error
	}
	if len(h.contentIDs) > 0 {
		_ = db.Exec("DELETE FROM perspectives WHERE content_id IN ?", h.contentIDs).Error
		_ = db.Exec("DELETE FROM content WHERE id IN ?", h.contentIDs).Error
	}
	if len(h.userIDs) > 0 {
		_ = db.Exec("DELETE FROM users WHERE id IN ?", h.userIDs).Error
	}
}

// decode unmarshals one top-level field of a response.
func decode[T any](t *testing.T, data map[string]json.RawMessage, field string) T {
	t.Helper()
	var v T
	require.NoError(t, json.Unmarshal(data[field], &v))
	return v
}
