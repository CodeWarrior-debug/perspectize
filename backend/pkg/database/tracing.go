package database

import (
	"context"
	"errors"
	"strings"
	"unicode"

	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/codes"
	semconv "go.opentelemetry.io/otel/semconv/v1.30.0"
	"go.opentelemetry.io/otel/trace"
	"gorm.io/gorm"
)

// tracerName is used both as the instrumentation-scope name passed to
// TracerProvider.Tracer and as the fallback otel.Tracer(...) name when no
// provider is supplied to RegisterTracing.
const tracerName = "github.com/CodeWarrior-debug/perspectize/backend/pkg/database"

// dbResponseRowsAffected is not part of semconv v1.30.0 (only
// db.response.returned_rows exists, which is read-oriented); Task 5 asks for
// this exact attribute name to cover writes (INSERT/UPDATE/DELETE) too.
var dbResponseRowsAffected = attribute.Key("db.response.rows_affected")

// spanContextKey is the key the before-callback uses to stash the in-flight
// span on db.Statement.Context so the matching after-callback can find it.
// It's a distinct type from RegisterSlowQueryLogger's queryStartKey so both
// callback sets can coexist on the same Statement.Context.
type spanContextKey struct{}

// RegisterTracing adds GORM callbacks that create one OpenTelemetry client
// span per SQL statement (Create, Query, Update, Delete, Row, Raw).
//
// tp is resolved lazily, per call, inside the before-callback rather than
// once at registration time: if tp is nil, otel.Tracer(tracerName) is used
// so a global TracerProvider installed after RegisterTracing (e.g. by
// telemetry.Setup running later, or in tests) still takes effect. If tp is
// non-nil, tp.Tracer(tracerName) is called each time for the same reason.
//
// The span is never recorded with SQL bind values: db.query.text is always
// db.Statement.SQL.String(), the parameterized form (e.g. "$1"), never the
// Dialector.Explain()-substituted string.
func RegisterTracing(db *gorm.DB, tp trace.TracerProvider) error {
	tracer := func() trace.Tracer {
		if tp != nil {
			return tp.Tracer(tracerName)
		}
		return otel.Tracer(tracerName)
	}

	before := func(op string) func(*gorm.DB) {
		return func(tx *gorm.DB) {
			if tx.Statement == nil || tx.Statement.Context == nil {
				return
			}
			ctx, span := tracer().Start(tx.Statement.Context, "gorm."+op, trace.WithSpanKind(trace.SpanKindClient))
			span.SetAttributes(semconv.DBSystemNamePostgreSQL)
			ctx = context.WithValue(ctx, spanContextKey{}, span)
			tx.Statement.Context = ctx
		}
	}

	after := func(op string) func(*gorm.DB) {
		return func(tx *gorm.DB) {
			if tx.Statement == nil || tx.Statement.Context == nil {
				return
			}
			spanVal := tx.Statement.Context.Value(spanContextKey{})
			span, ok := spanVal.(trace.Span)
			if !ok || span == nil {
				return
			}
			defer span.End()

			if !span.IsRecording() {
				return
			}

			attrs := make([]attribute.KeyValue, 0, 4)
			if tx.Statement.SQL.Len() > 0 {
				attrs = append(attrs, semconv.DBQueryText(tx.Statement.SQL.String()))
			}
			if tx.Statement.Table != "" {
				attrs = append(attrs, semconv.DBCollectionName(tx.Statement.Table))
				span.SetName(spanSummary(op, tx.Statement.SQL.String(), tx.Statement.Table))
			}
			attrs = append(attrs, dbResponseRowsAffected.Int(int(tx.Statement.RowsAffected)))
			span.SetAttributes(attrs...)

			if tx.Error != nil && !errors.Is(tx.Error, gorm.ErrRecordNotFound) {
				span.RecordError(tx.Error)
				span.SetStatus(codes.Error, tx.Error.Error())
			}
		}
	}

	type registration struct {
		reg interface {
			Register(name string, fn func(*gorm.DB)) error
		}
		name string
		fn   func(*gorm.DB)
	}

	cb := db.Callback()
	regs := []registration{
		{cb.Create().Before("gorm:create"), "otel:before_create", before("create")},
		{cb.Create().After("gorm:create"), "otel:after_create", after("create")},

		{cb.Query().Before("gorm:query"), "otel:before_query", before("query")},
		{cb.Query().After("gorm:query"), "otel:after_query", after("query")},

		{cb.Update().Before("gorm:update"), "otel:before_update", before("update")},
		{cb.Update().After("gorm:update"), "otel:after_update", after("update")},

		{cb.Delete().Before("gorm:delete"), "otel:before_delete", before("delete")},
		{cb.Delete().After("gorm:delete"), "otel:after_delete", after("delete")},

		{cb.Row().Before("gorm:row"), "otel:before_row", before("row")},
		{cb.Row().After("gorm:row"), "otel:after_row", after("row")},

		{cb.Raw().Before("gorm:raw"), "otel:before_raw", before("raw")},
		{cb.Raw().After("gorm:raw"), "otel:after_raw", after("raw")},
	}

	for _, r := range regs {
		if err := r.reg.Register(r.name, r.fn); err != nil {
			return err
		}
	}

	return nil
}

// spanSummary mirrors the semconv db.query.summary convention: an
// upper-cased SQL operation keyword followed by the table name, e.g.
// "SELECT content" / "INSERT users". For the fixed-purpose callbacks
// (create/query/update/delete) the operation is implied by the callback
// itself. For row/raw — which can carry arbitrary hand-written SQL — the
// first keyword of the actual statement is used instead, falling back to
// SELECT (the common case for .Row()/.Raw() reads) when it can't be parsed.
func spanSummary(op, sql, table string) string {
	var verb string
	switch op {
	case "create":
		verb = "INSERT"
	case "query":
		verb = "SELECT"
	case "update":
		verb = "UPDATE"
	case "delete":
		verb = "DELETE"
	case "row", "raw":
		verb = firstSQLKeyword(sql)
	default:
		verb = op
	}
	return verb + " " + table
}

// firstSQLKeyword returns the upper-cased leading keyword of a SQL
// statement (e.g. "select ... " -> "SELECT"), defaulting to "SELECT" when
// the statement is empty or doesn't start with a recognizable word.
func firstSQLKeyword(sql string) string {
	sql = strings.TrimSpace(sql)
	end := strings.IndexFunc(sql, func(r rune) bool { return !unicode.IsLetter(r) })
	var word string
	if end == -1 {
		word = sql
	} else {
		word = sql[:end]
	}
	if word == "" {
		return "SELECT"
	}
	return strings.ToUpper(word)
}
