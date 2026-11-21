package repositories

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/99designs/gqlgen/graphql/handler"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/dataloader"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

var contentRowColumns = []string{"id", "name", "url", "content_type", "added_by_user_id", "privacy", "parent_content_id", "created_at", "updated_at"}

// pagesUnderOneWebsite is a page of n webpage rows that all sit under website 9.
func pagesUnderOneWebsite(n int) *sqlmock.Rows {
	now := time.Now()
	rows := sqlmock.NewRows(contentRowColumns)
	for i := 1; i <= n; i++ {
		rows.AddRow(100+i, "post", "https://example.com/p", "web_page", 1, "public", 9, now, now)
	}
	return rows
}

// listRequestStatements runs one GraphQL content list over the real repository and
// service (SQL mocked, every statement counted) and returns how many statements the
// whole request issued. The dataloader middleware is installed, as in the server.
func listRequestStatements(t *testing.T, selection string, pages int) int {
	t.Helper()
	db, mock, _ := newCapturingContentDB(t)
	counter := querycount.Attach(t, db)

	mock.ExpectQuery("FROM").WillReturnRows(pagesUnderOneWebsite(pages))
	now := time.Now()
	mock.ExpectQuery("FROM").WillReturnRows(sqlmock.NewRows(contentRowColumns).
		AddRow(9, "example.com", "https://example.com/", "website", 1, "public", nil, now, now))

	contentService := services.NewContentService(postgres.NewGormContentRepository(db), nil, nil)
	resolver := resolvers.NewResolver(contentService, nil, nil, nil, nil, nil, nil, nil)
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{Resolvers: resolver}))
	h := dataloader.Middleware(dataloader.Services{Content: contentService})(srv)

	query := `{"query":"query { content(first: 20) { items { id ` + selection + ` } } }"}`
	req := httptest.NewRequest(http.MethodPost, "/", strings.NewReader(query))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	h.ServeHTTP(rec, req.WithContext(context.Background()))

	var out struct {
		Data struct {
			Content struct {
				Items []struct {
					ID            string `json:"id"`
					ParentContent *struct {
						ID string `json:"id"`
					} `json:"parentContent"`
				} `json:"items"`
			} `json:"content"`
		} `json:"data"`
		Errors []json.RawMessage `json:"errors"`
	}
	require.NoError(t, json.Unmarshal(rec.Body.Bytes(), &out), rec.Body.String())
	require.Empty(t, out.Errors, rec.Body.String())
	require.Len(t, out.Data.Content.Items, pages)
	if strings.Contains(selection, "parentContent") {
		for _, item := range out.Data.Content.Items {
			require.NotNil(t, item.ParentContent, "every page resolves its website")
			assert.Equal(t, "9", item.ParentContent.ID)
		}
	}
	return counter.Count()
}

// Listing 20 pages and selecting parentContent costs exactly one more statement than
// the same list without it: the parents load once, in one batch, however many pages
// share (or differ in) their website.
func TestQueryBudget_ListWithParentContentIsOneStatementMore(t *testing.T) {
	without := listRequestStatements(t, "name", 20)
	with := listRequestStatements(t, "parentContentID parentContent { id }", 20)

	assert.Equal(t, 1, without, "the list alone is one statement")
	assert.Equal(t, without+1, with, "parentContent adds exactly one batched statement")
}
