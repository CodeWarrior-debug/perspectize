package main

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"math/rand"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/lru"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"github.com/go-chi/chi/v5"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"github.com/vektah/gqlparser/v2/ast"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	"gorm.io/gorm"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
	gqltiming "github.com/CodeWarrior-debug/perspectize/backend/pkg/graphql"
)

// distinctSearchTerm is a literal that must never appear in any span or
// event attribute value, proving GraphQL variables and SQL bind values are
// never recorded even though it flows through both.
const distinctSearchTerm = "zz-secret-var-zz"

const contentSearchQuery = `query ContentSearch($q: String) {
  content(first: 25, filter: { search: $q }) {
    items { id name }
    totalCount
  }
}`

// tracingHarness is a minimal, fully-wired GraphQL + GORM stack (real
// Postgres, real otelgqlgen + in-house GORM tracing (pkg/database) wiring
// via instrumentGraphQL/instrumentDB) fronted by the same withTracing(router)
// wrapper main() uses.
type tracingHarness struct {
	router     http.Handler
	db         *gorm.DB
	userID     int
	contentIDs []int
}

func newTracingHarness(t *testing.T) *tracingHarness {
	t.Helper()

	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping GraphQL tracing integration test")
	}

	db, err := database.ConnectGORM(dsn, database.DefaultPoolConfig())
	require.NoError(t, err, "connect gorm")
	t.Cleanup(func() {
		sqlDB, err := db.DB()
		if err == nil {
			_ = sqlDB.Close()
		}
	})

	// Exercise the same instrumentation main() wires up.
	require.NoError(t, instrumentDB(db), "instrument gorm db")

	contentRepo := postgres.NewGormContentRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	perspectiveRepo := postgres.NewGormPerspectiveRepository(db)

	contentService := services.NewContentService(contentRepo, nil)
	userService := services.NewUserService(userRepo, contentRepo, perspectiveRepo)

	h := &tracingHarness{db: db}

	uname := fmt.Sprintf("otel_tracing_%06d", rand.Intn(1_000_000))
	user, err := userRepo.Create(context.Background(), &domain.User{
		Username: uname,
		Email:    uname + "@e2e.test",
		Role:     domain.UserRoleDefault,
		Active:   true,
	})
	require.NoError(t, err, "create seed user")
	h.userID = user.ID
	t.Cleanup(func() { h.cleanup(t) })

	// Seed two content rows whose name contains the distinct search literal,
	// so the GraphQL search filter (bound as a SQL parameter) actually
	// matches, exercising the real query path end to end.
	for i := 0; i < 2; i++ {
		name := fmt.Sprintf("%s content %d %06d", distinctSearchTerm, i, rand.Intn(1_000_000))
		c, err := contentRepo.Create(context.Background(), &domain.Content{
			Name:          name,
			ContentType:   domain.ContentTypeYouTube,
			AddedByUserID: h.userID,
		})
		require.NoError(t, err, "create seed content")
		h.contentIDs = append(h.contentIDs, c.ID)
	}

	resolver := resolvers.NewResolver(contentService, userService, nil, nil, nil, nil, nil)
	directiveRoot := directives.NewDirectiveRoot(contentService, nil)
	gqlConfig := generated.Config{
		Resolvers: resolver,
		Directives: generated.DirectiveRoot{
			Auth:  directiveRoot.Auth,
			Owner: directiveRoot.Owner,
		},
	}

	srv := handler.New(generated.NewExecutableSchema(gqlConfig))
	srv.AddTransport(transport.POST{})
	srv.SetQueryCache(lru.New[*ast.QueryDocument](100))
	instrumentGraphQL(srv)
	srv.AroundOperations(gqltiming.OperationTimer())

	r := chi.NewRouter()
	r.Handle("/graphql", srv)

	h.router = withTracing(r)
	return h
}

func (h *tracingHarness) cleanup(t *testing.T) {
	t.Helper()
	ctx := context.Background()
	for _, id := range h.contentIDs {
		h.db.WithContext(ctx).Exec("DELETE FROM content WHERE id = ?", id)
	}
	h.db.WithContext(ctx).Exec("DELETE FROM users WHERE id = ?", h.userID)
}

func (h *tracingHarness) post(t *testing.T, query string, variables map[string]any) *httptest.ResponseRecorder {
	t.Helper()
	body, err := json.Marshal(map[string]any{
		"query":         query,
		"operationName": "ContentSearch",
		"variables":     variables,
	})
	require.NoError(t, err)

	req := httptest.NewRequest(http.MethodPost, "/graphql", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.router.ServeHTTP(rec, req)
	return rec
}

// TestGraphQLTracing_OneTraceSpansHTTPGraphQLAndGORM_NoSensitiveValues drives
// a real GraphQL request (POST /graphql -> chi -> gqlgen(otelgqlgen) ->
// content resolver -> GORM(otel plugin) -> Postgres) through the exact
// wiring main() uses (instrumentGraphQL, instrumentDB, withTracing) and
// asserts:
//   - every span produced by the request shares one trace ID
//   - there is a root HTTP server span named "POST /graphql"
//   - there is a GraphQL operation span whose name contains "ContentSearch"
//   - there is at least one GORM/SQL span (query text present in the
//     span's db.query.text attribute — database.RegisterTracing renames the
//     span from "gorm.query" to "<OPERATION> <table>" once the target table
//     is known, see pkg/database/tracing.go)
//   - the distinct search-variable literal appears in NO span/event
//     attribute value, even though it round-trips through both the
//     GraphQL variable and the SQL bind parameter
func TestGraphQLTracing_OneTraceSpansHTTPGraphQLAndGORM_NoSensitiveValues(t *testing.T) {
	h := newTracingHarness(t)

	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	withTestTracerProvider(t, tp)

	rec := h.post(t, contentSearchQuery, map[string]any{"q": distinctSearchTerm})
	require.NoError(t, tp.ForceFlush(context.Background()))

	require.Equal(t, http.StatusOK, rec.Code, "response body: %s", rec.Body.String())

	var resp struct {
		Data struct {
			Content struct {
				Items      []struct{ ID, Name string } `json:"items"`
				TotalCount *int                        `json:"totalCount"`
			} `json:"content"`
		} `json:"data"`
		Errors []struct{ Message string } `json:"errors"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &resp))
	require.Empty(t, resp.Errors, "graphql errors: %+v", resp.Errors)
	require.Len(t, resp.Data.Content.Items, 2, "expected both seeded rows to match the search filter")

	spans := recorder.Ended()
	require.NotEmpty(t, spans, "expected at least one span")
	t.Logf("span count for ContentSearch (page size 25): %d", len(spans))
	if len(spans) > 150 {
		t.Errorf("span count %d exceeds the ~150 budget for a 25-item page; narrow the otelgqlgen field-span predicate", len(spans))
	}

	traceID := spans[0].SpanContext().TraceID()
	for _, s := range spans {
		assert.Equal(t, traceID, s.SpanContext().TraceID(), "span %q is not part of the single request trace", s.Name())
	}

	var httpRoot, gqlOperation, gormQuery bool
	for _, s := range spans {
		if s.Name() == "POST /graphql" {
			httpRoot = true
		}
		if strings.Contains(s.Name(), "ContentSearch") {
			gqlOperation = true
		}
		for _, attr := range s.Attributes() {
			if string(attr.Key) == "db.query.text" {
				gormQuery = true
			}
		}
	}
	assert.True(t, httpRoot, "expected a root HTTP server span named \"POST /graphql\"")
	assert.True(t, gqlOperation, "expected a GraphQL operation span whose name contains \"ContentSearch\"")
	assert.True(t, gormQuery, "expected at least one GORM/SQL span (db.query.text attribute)")

	for _, s := range spans {
		for _, attr := range s.Attributes() {
			assert.NotContains(t, attr.Value.Emit(), distinctSearchTerm,
				"span %q attribute %s leaked the search variable value", s.Name(), attr.Key)
		}
		for _, ev := range s.Events() {
			for _, attr := range ev.Attributes {
				assert.NotContains(t, attr.Value.Emit(), distinctSearchTerm,
					"span %q event %q attribute %s leaked the search variable value", s.Name(), ev.Name, attr.Key)
			}
		}
	}
}
