package postgres

import (
	"context"
	"fmt"
	"os"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/perf/querycount"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
	gormpg "gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
)

// The audience rule has two forms: domain.Audience (Go) and the SQL renderers
// in audience_sql.go. These tests check that they agree on every combination
// of viewer, row privacy, row owner and content state.

// audienceCase is one perspective row in the agreement matrix. contentPrivacy is
// empty when the perspective has no content.
type audienceCase struct {
	id             int
	rowPrivacy     domain.Privacy
	rowOwner       int
	contentPrivacy domain.Privacy
	hasContent     bool
}

const (
	audienceOwner        = 7
	audienceOther        = 8
	audienceContentOwner = 9
)

// audienceMatrix enumerates every row shape: both row privacies, owner and
// non-owner, and no content, public content or private content.
func audienceMatrix() []audienceCase {
	var cases []audienceCase
	id := 0
	for _, rowPriv := range []domain.Privacy{domain.PrivacyPublic, domain.PrivacyPrivate} {
		for _, owner := range []int{audienceOwner, audienceOther} {
			for _, content := range []struct {
				has  bool
				priv domain.Privacy
			}{
				{false, ""},
				{true, domain.PrivacyPublic},
				{true, domain.PrivacyPrivate},
			} {
				id++
				cases = append(cases, audienceCase{
					id: id, rowPrivacy: rowPriv, rowOwner: owner,
					contentPrivacy: content.priv, hasContent: content.has,
				})
			}
		}
	}
	return cases
}

// audienceViewers covers anonymous (nil), the row owner, a stranger, and the
// content owner.
func audienceViewers() []*int {
	owner, other, contentOwner := audienceOwner, audienceOther, audienceContentOwner
	return []*int{nil, &owner, &other, &contentOwner}
}

func viewerID(v *int) int {
	if v == nil {
		return 0
	}
	return *v
}

// goReadable is the Go side of the agreement: the perspective's own rule and
// its content rule, both from the domain.
func goReadable(c audienceCase, viewer *int) bool {
	v := viewerID(viewer)
	if !(domain.Audience{Privacy: c.rowPrivacy, OwnerID: c.rowOwner}).ReadableBy(v) {
		return false
	}
	if !c.hasContent {
		return true
	}
	return domain.ContentAudience(c.contentPrivacy, audienceContentOwner).ReadableBy(v)
}

func TestAudienceSQL_RenderedShape(t *testing.T) {
	viewer := 7

	t.Run("anonymous reads public rows only", func(t *testing.T) {
		cond, args := perspectiveAudience.readableSQL("", nil)
		assert.Equal(t, "privacy = ?", cond)
		assert.Equal(t, []any{"public"}, args)
	})

	t.Run("a viewer reads public rows or their own", func(t *testing.T) {
		cond, args := perspectiveAudience.readableSQL("", &viewer)
		assert.Equal(t, "privacy = ? OR user_id = ?", cond)
		assert.Equal(t, []any{"public", 7}, args)
	})

	t.Run("content uses its own owner column with the table prefix", func(t *testing.T) {
		cond, _ := contentAudience.readableSQL("content.", &viewer)
		assert.Equal(t, "content.privacy = ? OR content.added_by_user_id = ?", cond)
	})

	t.Run("aggregates count public rows only, whoever asks", func(t *testing.T) {
		cond, args := perspectiveAudience.aggregateSQL("p.")
		assert.Equal(t, "p.privacy = ?", cond)
		assert.Equal(t, []any{"public"}, args)
	})

	t.Run("a perspective with no content passes the content check", func(t *testing.T) {
		cond, _ := perspectiveContentSQL("perspectives", nil)
		assert.True(t, strings.HasPrefix(cond, "(perspectives.content_id IS NULL OR EXISTS"), cond)
	})
}

func TestAudience_GoRuleMatrix(t *testing.T) {
	// The Go side alone, so the matrix is checked without a database. The
	// expectation is written out from the rule: a row is readable when it is
	// public or the viewer owns it, and its content (if any) is readable when it
	// is public or the viewer owns the content. Aggregates count public rows only.
	for _, c := range audienceMatrix() {
		for _, v := range audienceViewers() {
			t.Run(fmt.Sprintf("row=%s/owner=%d/content=%v:%s/viewer=%d", c.rowPrivacy, c.rowOwner, c.hasContent, c.contentPrivacy, viewerID(v)), func(t *testing.T) {
				id := viewerID(v)
				rowOK := c.rowPrivacy == domain.PrivacyPublic || (id > 0 && id == c.rowOwner)
				contentOK := !c.hasContent || c.contentPrivacy == domain.PrivacyPublic || (id > 0 && id == audienceContentOwner)
				assert.Equal(t, rowOK && contentOK, goReadable(c, v))
			})
		}
	}
}

// openAudienceTestDB connects only to the local testdb, as the other
// integration tests do, and skips everywhere else.
func openAudienceTestDB(t *testing.T) *gorm.DB {
	t.Helper()
	dsn := os.Getenv("DATABASE_URL")
	local := strings.Contains(dsn, "localhost") || strings.Contains(dsn, "127.0.0.1")
	if dsn == "" || !local || !strings.Contains(dsn, "/testdb") {
		t.Skip("DATABASE_URL is not the local testdb; skipping audience SQL agreement test")
	}
	db, err := gorm.Open(gormpg.Open(dsn), &gorm.Config{
		SkipDefaultTransaction: true,
		Logger:                 logger.Default.LogMode(logger.Silent),
	})
	require.NoError(t, err)
	return db
}

// TestAudience_SQLAgreesWithGo runs the rendered SQL predicates over in-query
// rows (CTEs, so no schema or migration is needed) and compares the surviving
// ids with the Go rule for every case in the matrix.
func TestAudience_SQLAgreesWithGo(t *testing.T) {
	db := openAudienceTestDB(t)
	cases := audienceMatrix()

	var contentVals, perspectiveVals []string
	contentIDs := map[domain.Privacy]int{domain.PrivacyPublic: 1001, domain.PrivacyPrivate: 1002}
	for priv, id := range contentIDs {
		contentVals = append(contentVals, fmt.Sprintf("(%d, '%s', %d)", id, strings.ToLower(string(priv)), audienceContentOwner))
	}
	for _, c := range cases {
		contentID := "NULL::int"
		if c.hasContent {
			contentID = fmt.Sprintf("%d", contentIDs[c.contentPrivacy])
		}
		perspectiveVals = append(perspectiveVals, fmt.Sprintf("(%d, '%s', %d, %s)",
			c.id, strings.ToLower(string(c.rowPrivacy)), c.rowOwner, contentID))
	}
	ctes := fmt.Sprintf("WITH content(id, privacy, added_by_user_id) AS (VALUES %s), perspectives(id, privacy, user_id, content_id) AS (VALUES %s)",
		strings.Join(contentVals, ", "), strings.Join(perspectiveVals, ", "))

	for _, v := range audienceViewers() {
		readable, args := perspectiveAudience.readableSQL("", v)
		contentCond, contentArgs := perspectiveContentSQL("perspectives", v)
		query := ctes + " SELECT id FROM perspectives WHERE (" + readable + ") AND " + contentCond + " ORDER BY id"
		allArgs := append(args, contentArgs...)

		var gotIDs []int
		require.NoError(t, db.Raw(query, allArgs...).Scan(&gotIDs).Error)

		var wantIDs []int
		for _, c := range cases {
			if goReadable(c, v) {
				wantIDs = append(wantIDs, c.id)
			}
		}
		assert.Equal(t, wantIDs, gotIDs, "viewer=%v", viewerID(v))
	}

	// Aggregates: the SQL counts public rows only, as CountsInAggregates says.
	aggCond, aggArgs := perspectiveAudience.aggregateSQL("")
	var gotAgg []int
	require.NoError(t, db.Raw(ctes+" SELECT id FROM perspectives WHERE "+aggCond+" ORDER BY id", aggArgs...).Scan(&gotAgg).Error)
	var wantAgg []int
	for _, c := range cases {
		if (domain.Audience{Privacy: c.rowPrivacy, OwnerID: c.rowOwner}).CountsInAggregates() {
			wantAgg = append(wantAgg, c.id)
		}
	}
	assert.Equal(t, wantAgg, gotAgg)
}

// TestStats_NonOwnerOnPrivateContentCountsNothing is the regression for the
// stats leak: a stranger asking for feeling stats on another user's private
// content gets the same zero answer as for a content id that does not exist,
// from the same two statements. The scope (public perspectives on readable
// content) is bound as arguments, so the SQL must carry it for every caller.
func TestStats_NonOwnerOnPrivateContentCountsNothing(t *testing.T) {
	ctx := context.Background()
	stranger := 8
	contentID := 11

	db, mock := newMockDB(t)
	mock.ExpectQuery(`(?s)FROM perspectives p.*p\.privacy = \$2.*c\.privacy = \$3 OR c\.added_by_user_id = \$4.*AND p\.content_id = \$5`).
		WithArgs("🥰", "public", "public", stranger, contentID).
		WillReturnRows(sqlmock.NewRows([]string{"count", "avg_intensity", "stddev_intensity"}).AddRow(0, nil, nil))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "perspectives" WHERE content_id = \$1`).
		WithArgs(contentID, "public", "public", stranger).
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	c := querycount.Attach(t, db)
	got, err := NewGormPerspectiveRepository(db).FeelingStats(ctx, &contentID, "🥰", nil, &stranger)
	require.NoError(t, err)
	c.AssertExactly(t, 2)
	assert.Equal(t, 0, got.Count)
	assert.Equal(t, 0, got.TotalPerspectives)
	assert.Nil(t, got.PercentOfPerspectives())
	assertAllExpectationsMet(t, mock)
}

// TestStats_CustomFieldCountsStayInScope checks the same scope on the custom
// field stats, including the global (no content id) form, which is scoped the
// same way.
func TestStats_CustomFieldCountsStayInScope(t *testing.T) {
	ctx := context.Background()

	db, mock := newMockDB(t)
	mock.ExpectQuery(`(?s)SELECT COUNT\(\*\) AS count.*FROM perspectives p.*jsonb_exists\(p\.custom_fields, \$1\).*p\.privacy = \$2.*c\.privacy = \$3`).
		WithArgs("mood", "public", "public").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))
	mock.ExpectQuery(`SELECT count\(\*\) FROM "perspectives" WHERE`).
		WithArgs("public", "public").
		WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(0))

	c := querycount.Attach(t, db)
	got, err := NewGormPerspectiveRepository(db).CustomFieldStats(ctx, nil, "mood", nil)
	require.NoError(t, err)
	c.AssertExactly(t, 2)
	assert.Equal(t, 0, got.Count)
	assert.Equal(t, 0, got.TotalPerspectives)
	assertAllExpectationsMet(t, mock)
}
