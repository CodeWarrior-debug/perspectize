package roundtrips

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/require"
	"gorm.io/gorm"
)

// The hot read paths must be servable from an index (migration 000030). Test
// tables are tiny, so the planner would pick a seq scan anyway; disabling
// seq scans for the check asks "can an index serve this at all?".
func TestHotQueriesUseIndexes(t *testing.T) {
	h := newHarness(t)
	// index names the one index that must serve the query. "" means any index
	// will do (no Seq Scan): which of several covering indexes the planner
	// picks depends on table statistics, and differs between Postgres versions
	// on the near-empty test tables.
	cases := []struct {
		name, index, sql string
	}{
		{"perspectives by content", "idx_perspectives_content_id",
			`SELECT content_id, COUNT(*) FROM perspectives WHERE content_id IN (1, 2, 3) GROUP BY content_id`},
		{"my perspectives, newest first", "idx_perspectives_user_created",
			`SELECT * FROM perspectives WHERE user_id = 1 ORDER BY created_at DESC, id DESC LIMIT 100`},
		{"content grid default sort", "idx_content_updated_at_id",
			`SELECT * FROM content ORDER BY content.updated_at DESC, content.id DESC LIMIT 100`},
		{"message history (dropped duplicate still covered)", "",
			`SELECT * FROM messages WHERE thread_id = 1 ORDER BY seq DESC LIMIT 50`},
		{"auth lookup (dropped duplicate still covered)", "users_clerk_user_id_key",
			`SELECT * FROM users WHERE clerk_user_id = 'x' LIMIT 1`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			var plan []string
			err := h.db.Transaction(func(tx *gorm.DB) error {
				if err := tx.Exec("SET LOCAL enable_seqscan = off").Error; err != nil {
					return err
				}
				return tx.Raw("EXPLAIN " + tc.sql).Scan(&plan).Error
			})
			require.NoError(t, err)
			p := strings.Join(plan, "\n")
			if tc.index == "" {
				require.NotContains(t, p, "Seq Scan", "some index must serve this query")
				return
			}
			require.Contains(t, p, tc.index)
		})
	}
}
