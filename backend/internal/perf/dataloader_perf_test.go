//go:build perf

// Package perf holds opt-in performance harnesses that exercise the real
// resolver chain against a real Postgres database. They are gated behind the
// `perf` build tag so `go test ./...` never runs them.
//
// Run:
//
//	cd backend
//	set -a && . ../.env && set +a
//	go test -tags perf ./internal/perf/ -run TestContentListDataloaderPerf -v -count=1
//
// The harness issues the exact `ListContent` GraphQL query the SvelteKit
// ActivityTable uses (including the `primaryCategory` sub-selection that
// triggers the N+1), 12 times, and reports latency percentiles plus the
// number of SQL statements issued per request (counted via a GORM callback,
// not estimated).
package perf

import (
	"context"
	"fmt"
	"os"
	"sort"
	"sync/atomic"
	"testing"
	"time"

	"github.com/99designs/gqlgen/client"
	"github.com/99designs/gqlgen/graphql"
	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/99designs/gqlgen/graphql/handler/transport"
	"gorm.io/gorm"

	dlmw "github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/dataloader"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/pkg/database"
)

const listContentQuery = `
query ListContent($first: Int, $sortBy: ContentSortBy = UPDATED_AT, $sortOrder: SortOrder = DESC, $includeTotalCount: Boolean = true) {
  content(first: $first, sortBy: $sortBy, sortOrder: $sortOrder, includeTotalCount: $includeTotalCount) {
    items {
      id
      name
      addedByUserID
      url
      contentType
      length
      lengthUnits
      viewCount
      likeCount
      channelTitle
      publishedAt
      tags
      description
      primaryCategory {
        id
        wikidataQid
        label
        description
        entityType
      }
      createdAt
      updatedAt
    }
    pageInfo { hasNextPage hasPreviousPage startCursor endCursor }
    totalCount
  }
}`

// queryCounter counts SQL statements issued on a *gorm.DB via callbacks.
type queryCounter struct{ n int64 }

func (qc *queryCounter) reset()        { atomic.StoreInt64(&qc.n, 0) }
func (qc *queryCounter) count() int64  { return atomic.LoadInt64(&qc.n) }
func (qc *queryCounter) hook(*gorm.DB) { atomic.AddInt64(&qc.n, 1) }

func (qc *queryCounter) register(db *gorm.DB) {
	// Every read path in this project is a SELECT (GORM "query") or a
	// Raw().Scan ("row"). Register on both so nothing is missed.
	_ = db.Callback().Query().After("*").Register("perf:count_query", qc.hook)
	_ = db.Callback().Row().After("*").Register("perf:count_row", qc.hook)
}

func stats(samples []time.Duration) (min, max, mean, median time.Duration) {
	sorted := append([]time.Duration(nil), samples...)
	sort.Slice(sorted, func(i, j int) bool { return sorted[i] < sorted[j] })
	min, max = sorted[0], sorted[len(sorted)-1]
	var total time.Duration
	for _, s := range sorted {
		total += s
	}
	mean = total / time.Duration(len(sorted))
	if len(sorted)%2 == 1 {
		median = sorted[len(sorted)/2]
	} else {
		median = (sorted[len(sorted)/2-1] + sorted[len(sorted)/2]) / 2
	}
	return
}

func passthroughDirective(ctx context.Context, _ any, next graphql.Resolver) (any, error) {
	return next(ctx)
}

func TestContentListDataloaderPerf(t *testing.T) {
	dsn := os.Getenv("DATABASE_URL")
	if dsn == "" {
		t.Skip("DATABASE_URL not set; skipping perf harness")
	}

	db, err := database.ConnectGORM(dsn, database.PoolConfigFromEnv())
	if err != nil {
		t.Fatalf("connect: %v", err)
	}
	sqlDB, _ := db.DB()
	defer sqlDB.Close()

	qc := &queryCounter{}
	qc.register(db)

	contentRepo := postgres.NewGormContentRepository(db)
	userRepo := postgres.NewGormUserRepository(db)
	perspectiveRepo := postgres.NewGormPerspectiveRepository(db)
	categoryRepo := postgres.NewGormCategoryRepository(db)

	contentService := services.NewContentService(contentRepo, nil)
	userService := services.NewUserService(userRepo, contentRepo, perspectiveRepo)
	perspectiveService := services.NewPerspectiveService(perspectiveRepo, userRepo)
	categoryService := services.NewCategoryService(categoryRepo, contentRepo, nil)

	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService)
	execSchema := generated.NewExecutableSchema(generated.Config{
		Resolvers: resolver,
		Directives: generated.DirectiveRoot{
			Auth: passthroughDirective,
			Owner: func(ctx context.Context, obj any, next graphql.Resolver, _ string) (any, error) {
				return next(ctx)
			},
		},
	})

	srv := handler.New(execSchema)
	srv.AddTransport(transport.POST{})

	// Always wire the per-request dataloader exactly as cmd/server/main.go
	// does, so this harness is byte-identical for the before/after runs. In
	// the baseline (pre-fix) state the resolver never touches the loader, so
	// it is simply unused context.
	httpHandler := dlmw.Middleware(categoryService)(srv)

	c := client.New(httpHandler)

	const iterations = 12
	first := 50

	latencies := make([]time.Duration, 0, iterations)
	queryCounts := make([]int64, 0, iterations)

	for i := 0; i < iterations; i++ {
		qc.reset()
		start := time.Now()
		// The gqlgen test client rejects response keys that have no matching
		// struct field, so every selected field must be present here.
		type catNode struct {
			ID          string  `json:"id"`
			WikidataQid string  `json:"wikidataQid"`
			Label       string  `json:"label"`
			Description *string `json:"description"`
			EntityType  *string `json:"entityType"`
		}
		type itemNode struct {
			ID              string   `json:"id"`
			Name            string   `json:"name"`
			AddedByUserID   string   `json:"addedByUserID"`
			URL             *string  `json:"url"`
			ContentType     string   `json:"contentType"`
			Length          *int     `json:"length"`
			LengthUnits     *string  `json:"lengthUnits"`
			ViewCount       *int     `json:"viewCount"`
			LikeCount       *int     `json:"likeCount"`
			ChannelTitle    *string  `json:"channelTitle"`
			PublishedAt     *string  `json:"publishedAt"`
			Tags            []string `json:"tags"`
			Description     *string  `json:"description"`
			PrimaryCategory *catNode `json:"primaryCategory"`
			CreatedAt       string   `json:"createdAt"`
			UpdatedAt       string   `json:"updatedAt"`
		}
		var resp struct {
			Content struct {
				Items    []itemNode `json:"items"`
				PageInfo struct {
					HasNextPage     bool    `json:"hasNextPage"`
					HasPreviousPage bool    `json:"hasPreviousPage"`
					StartCursor     *string `json:"startCursor"`
					EndCursor       *string `json:"endCursor"`
				} `json:"pageInfo"`
				TotalCount *int `json:"totalCount"`
			} `json:"content"`
		}
		err := c.Post(listContentQuery, &resp,
			client.Var("first", first),
		)
		elapsed := time.Since(start)
		if err != nil {
			t.Fatalf("iteration %d: %v", i, err)
		}
		latencies = append(latencies, elapsed)
		queryCounts = append(queryCounts, qc.count())
		t.Logf("iter %2d: %6.1fms  rows=%d  queries=%d",
			i, float64(elapsed.Microseconds())/1000, len(resp.Content.Items), qc.count())
	}

	min, max, mean, median := stats(latencies)
	mode := os.Getenv("PERF_LABEL")
	if mode == "" {
		mode = "RESULT"
	}

	fmt.Printf("\n===== %s =====\n", mode)
	fmt.Printf("iterations : %d\n", iterations)
	fmt.Printf("page size  : first=%d\n", first)
	fmt.Printf("latency min   : %.1fms\n", ms(min))
	fmt.Printf("latency max   : %.1fms\n", ms(max))
	fmt.Printf("latency mean  : %.1fms\n", ms(mean))
	fmt.Printf("latency median: %.1fms\n", ms(median))
	fmt.Printf("queries/request (all iters): %v\n", queryCounts)
	fmt.Printf("queries/request (median): %d\n", medianInt(queryCounts))
	fmt.Printf("=========================================\n")
}

func medianInt(v []int64) int64 {
	s := append([]int64(nil), v...)
	sort.Slice(s, func(i, j int) bool { return s[i] < s[j] })
	return s[len(s)/2]
}

func ms(d time.Duration) float64 { return float64(d.Microseconds()) / 1000 }
