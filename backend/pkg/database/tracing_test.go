package database

import (
	"context"
	"errors"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	"go.opentelemetry.io/otel/codes"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	"go.opentelemetry.io/otel/sdk/trace/tracetest"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// tracingTestRecord is a minimal GORM model used only to exercise
// RegisterTracing's callbacks without a real database.
type tracingTestRecord struct {
	ID   int
	Name string
}

func (tracingTestRecord) TableName() string { return "tracing_test_records" }

// newTracingMockDB mirrors postgres.newMockDB (see
// internal/adapters/repositories/postgres/testsupport_test.go): a *gorm.DB
// backed by go-sqlmock, no real network connection required.
func newTracingMockDB(t *testing.T) (*gorm.DB, sqlmock.Sqlmock) {
	t.Helper()

	sqlDB, mock, err := sqlmock.New(sqlmock.QueryMatcherOption(sqlmock.QueryMatcherRegexp))
	require.NoError(t, err)
	t.Cleanup(func() { _ = sqlDB.Close() })

	gdb, err := gorm.Open(
		gormpg.New(gormpg.Config{Conn: sqlDB}),
		&gorm.Config{
			DisableAutomaticPing:   true,
			SkipDefaultTransaction: true,
			Logger:                 logger.Default.LogMode(logger.Silent),
		},
	)
	require.NoError(t, err)

	return gdb, mock
}

const tracingSecretVar = "zz-secret-var-zz"

func TestRegisterTracing_FindProducesSelectSpanWithoutBindValues(t *testing.T) {
	db, mock := newTracingMockDB(t)
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	require.NoError(t, RegisterTracing(db, tp))

	mock.ExpectQuery(`SELECT \* FROM "tracing_test_records" WHERE name = \$1`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(1, tracingSecretVar))

	var got []tracingTestRecord
	require.NoError(t, db.Where("name = ?", tracingSecretVar).Find(&got).Error)
	require.NoError(t, mock.ExpectationsWereMet())

	spans := recorder.Ended()
	require.Len(t, spans, 1)
	span := spans[0]
	assert.Equal(t, "SELECT tracing_test_records", span.Name())

	var queryText string
	var sawSecret bool
	for _, attr := range span.Attributes() {
		if string(attr.Key) == "db.query.text" {
			queryText = attr.Value.AsString()
		}
		if attr.Value.Emit() == tracingSecretVar {
			sawSecret = true
		}
	}
	assert.Contains(t, queryText, "$1")
	assert.NotContains(t, queryText, tracingSecretVar)
	assert.False(t, sawSecret, "no span attribute should contain the bound secret value")
}

func TestRegisterTracing_PropagatesParentSpan(t *testing.T) {
	db, mock := newTracingMockDB(t)
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	require.NoError(t, RegisterTracing(db, tp))

	mock.ExpectQuery(`SELECT \* FROM "tracing_test_records"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(1, "a"))

	ctx, parentSpan := tp.Tracer("test").Start(context.Background(), "parent")
	var got []tracingTestRecord
	require.NoError(t, db.WithContext(ctx).Find(&got).Error)
	parentSpan.End()
	require.NoError(t, mock.ExpectationsWereMet())

	spans := recorder.Ended()
	require.Len(t, spans, 2)

	var child, parent sdktrace.ReadOnlySpan
	for _, s := range spans {
		if s.Name() == "parent" {
			parent = s
		} else {
			child = s
		}
	}
	require.NotNil(t, child)
	require.NotNil(t, parent)
	assert.Equal(t, parent.SpanContext().SpanID(), child.Parent().SpanID())
	assert.Equal(t, parent.SpanContext().TraceID(), child.SpanContext().TraceID())
}

func TestRegisterTracing_QueryErrorSetsSpanStatusError(t *testing.T) {
	db, mock := newTracingMockDB(t)
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	require.NoError(t, RegisterTracing(db, tp))

	mock.ExpectQuery(`SELECT \* FROM "tracing_test_records"`).WillReturnError(errors.New("boom"))

	var got []tracingTestRecord
	err := db.Find(&got).Error
	require.Error(t, err)

	spans := recorder.Ended()
	require.Len(t, spans, 1)
	assert.Equal(t, codes.Error, spans[0].Status().Code)
}

func TestRegisterTracing_RecordNotFoundDoesNotSetSpanStatusError(t *testing.T) {
	db, mock := newTracingMockDB(t)
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	require.NoError(t, RegisterTracing(db, tp))

	mock.ExpectQuery(`SELECT \* FROM "tracing_test_records"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}))

	var got tracingTestRecord
	err := db.First(&got).Error
	require.ErrorIs(t, err, gorm.ErrRecordNotFound)

	spans := recorder.Ended()
	require.Len(t, spans, 1)
	assert.Equal(t, codes.Unset, spans[0].Status().Code)
}

func TestRegisterTracing_CreateProducesInsertSpan(t *testing.T) {
	db, mock := newTracingMockDB(t)
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))
	require.NoError(t, RegisterTracing(db, tp))

	mock.ExpectQuery(`INSERT INTO "tracing_test_records"`).
		WillReturnRows(sqlmock.NewRows([]string{"id"}).AddRow(1))

	rec := &tracingTestRecord{Name: "new"}
	require.NoError(t, db.Create(rec).Error)
	require.NoError(t, mock.ExpectationsWereMet())

	spans := recorder.Ended()
	require.Len(t, spans, 1)
	assert.Equal(t, "INSERT tracing_test_records", spans[0].Name())
}

func TestRegisterTracing_CoexistsWithSlowQueryLogger(t *testing.T) {
	db, mock := newTracingMockDB(t)
	recorder := tracetest.NewSpanRecorder()
	tp := sdktrace.NewTracerProvider(sdktrace.WithSpanProcessor(recorder))

	// Registration order intentionally matches main.go: slow query logger
	// first, tracing second, proving the two callback sets (which both hang
	// data off db.Statement.Context via distinct context keys) coexist
	// regardless of order.
	RegisterSlowQueryLogger(db)
	require.NoError(t, RegisterTracing(db, tp))

	mock.ExpectQuery(`SELECT \* FROM "tracing_test_records"`).
		WillReturnRows(sqlmock.NewRows([]string{"id", "name"}).AddRow(1, "a"))

	var got []tracingTestRecord
	require.NoError(t, db.Find(&got).Error)
	require.NoError(t, mock.ExpectationsWereMet())

	spans := recorder.Ended()
	require.Len(t, spans, 1)
	assert.Equal(t, "SELECT tracing_test_records", spans[0].Name())
}
