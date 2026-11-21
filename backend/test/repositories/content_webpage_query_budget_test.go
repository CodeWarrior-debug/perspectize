package repositories

import (
	"context"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/repositories/postgres"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
)

// budgetPages is a no-network webpage client that counts its fetches.
type budgetPages struct {
	meta  domain.WebPageMeta
	calls int
}

func (b *budgetPages) Fetch(_ context.Context, _ string) (domain.WebPageMeta, error) {
	b.calls++
	return b.meta, nil
}

func okPage(final string, declared string) domain.WebPageMeta {
	return domain.WebPageMeta{
		SchemaVersion:     domain.WebPageSchemaVersion,
		FinalURL:          final,
		Domain:            "example.com",
		DeclaredCanonical: declared,
		Fetch:             domain.WebPageFetch{Status: domain.FetchStatusOK},
	}
}

// budgetService wires the real GORM content repository over sqlmock, so the
// statement count is the one the repository actually issues.
func budgetService(t *testing.T, pages *budgetPages) (*services.ContentService, sqlmock.Sqlmock, *querycount.Counter) {
	t.Helper()
	db, mock, _ := newCapturingContentDB(t)
	counter := querycount.Attach(t, db)
	svc := services.NewContentService(postgres.NewGormContentRepository(db), nil, nil, services.WithWebPageClient(pages))
	return svc, mock, counter
}

// A new webpage costs two statements: the dedupe lookup, then one INSERT ... ON
// CONFLICT DO NOTHING ... RETURNING. The fetch is not a database statement.
func TestQueryBudget_CreateFromWebPageNewRowIsTwoStatements(t *testing.T) {
	pages := &budgetPages{meta: okPage("https://example.com/a", "")}
	svc, mock, counter := budgetService(t, pages)
	now := time.Now()

	mock.ExpectQuery("FROM").WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery("INSERT").WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(7, now, now))

	_, err := svc.CreateFromWebPage(context.Background(), portservices.CreateWebPageInput{URL: "https://example.com/a"}, 1)
	require.NoError(t, err)
	counter.AssertExactly(t, 2)
	assert.Equal(t, 1, pages.calls)
	require.NoError(t, mock.ExpectationsWereMet())
}

// A saved URL is one lookup and no fetch or insert.
func TestQueryBudget_CreateFromWebPageExistingRowIsOneStatement(t *testing.T) {
	pages := &budgetPages{meta: okPage("https://example.com/a", "")}
	svc, mock, counter := budgetService(t, pages)

	mock.ExpectQuery("FROM").WillReturnRows(sqlmock.NewRows([]string{"id", "url", "content_type"}).
		AddRow(42, "https://example.com/a", "WEB_PAGE"))

	_, err := svc.CreateFromWebPage(context.Background(), portservices.CreateWebPageInput{URL: "https://example.com/a"}, 1)
	require.ErrorIs(t, err, domain.ErrAlreadyExists)
	counter.AssertExactly(t, 1)
	assert.Equal(t, 0, pages.calls)
	require.NoError(t, mock.ExpectationsWereMet())
}

// A preview with no declared canonical checks one key: one lookup, no write.
func TestQueryBudget_PreviewWebPageIsOneStatement(t *testing.T) {
	pages := &budgetPages{meta: okPage("https://example.com/a", "")}
	svc, mock, counter := budgetService(t, pages)

	mock.ExpectQuery("FROM").WillReturnRows(sqlmock.NewRows([]string{"id"}))

	preview, err := svc.PreviewWebPage(context.Background(), "https://example.com/a")
	require.NoError(t, err)
	assert.Nil(t, preview.AlreadyExistsContentID)
	counter.AssertExactly(t, 1)
	require.NoError(t, mock.ExpectationsWereMet())
}

// A declared canonical that changes the key checks both keys when neither is
// saved: two lookups. This is the preview's worst case and is pinned as today's cost.
func TestQueryBudget_PreviewWebPageWithDifferentDeclaredKeyIsTwoStatements(t *testing.T) {
	pages := &budgetPages{meta: okPage("https://example.com/a?ref=x", "https://example.com/canonical")}
	svc, mock, counter := budgetService(t, pages)

	mock.ExpectQuery("FROM").WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery("FROM").WillReturnRows(sqlmock.NewRows([]string{"id"}))

	_, err := svc.PreviewWebPage(context.Background(), "https://example.com/a")
	require.NoError(t, err)
	counter.AssertExactly(t, 2)
	require.NoError(t, mock.ExpectationsWereMet())
}

// Filing a webpage under a website adds exactly one statement, the parent's GetByID:
// dedupe lookup, parent lookup, INSERT. The fetch is not a database statement.
func TestQueryBudget_CreateFromWebPageWithParentIsThreeStatements(t *testing.T) {
	pages := &budgetPages{meta: okPage("https://example.com/a", "")}
	svc, mock, counter := budgetService(t, pages)
	now := time.Now()

	mock.ExpectQuery("FROM").WillReturnRows(sqlmock.NewRows([]string{"id"}))
	mock.ExpectQuery("FROM").WillReturnRows(sqlmock.NewRows([]string{"id", "url", "content_type"}).
		AddRow(9, "https://example.com/", "WEBSITE"))
	mock.ExpectQuery("INSERT").WillReturnRows(sqlmock.NewRows([]string{"id", "created_at", "updated_at"}).AddRow(7, now, now))

	parent := 9
	_, err := svc.CreateFromWebPage(context.Background(), portservices.CreateWebPageInput{URL: "https://example.com/a", ParentContentID: &parent}, 1)
	require.NoError(t, err)
	counter.AssertExactly(t, 3)
	require.NoError(t, mock.ExpectationsWereMet())
}
