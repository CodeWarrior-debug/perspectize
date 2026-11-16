package postgres

import (
	"context"
	"database/sql/driver"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestSplitSearchPhrases(t *testing.T) {
	twelve := "a,b,c,d,e,f,g,h,i,j,k,l"
	tests := []struct {
		name string
		in   string
		want []string
	}{
		{"single term", "Gaither", []string{"Gaither"}},
		{"comma space", "Gaither, Old", []string{"Gaither", "Old"}},
		{"comma no space", "Gaither,Old", []string{"Gaither", "Old"}},
		{"multi-word phrase kept intact", "Bill Gloria, Gaither", []string{"Bill Gloria", "Gaither"}},
		{"whitespace only splits nothing", "Gaither Old", []string{"Gaither Old"}},
		{"extra spaces trimmed", "  a  ,   b c  ", []string{"a", "b c"}},
		{"empty middle phrase", "a,,b", []string{"a", "b"}},
		{"leading and trailing commas", ",a,", []string{"a"}},
		{"only commas", ",,,", nil},
		{"capped at 10", twelve, strings.Split("a,b,c,d,e,f,g,h,i,j", ",")},
		{"unicode", "café, 日本語", []string{"café", "日本語"}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, splitSearchPhrases(tt.in))
		})
	}
}

func TestApplyContentSearch_CommaPhrases(t *testing.T) {
	ctx := context.Background()
	tagsOnly := []domain.ContentSearchField{domain.ContentSearchFieldTags}
	titleDesc := []domain.ContentSearchField{domain.ContentSearchFieldTitle, domain.ContentSearchFieldDescription}

	cases := []struct {
		name      string
		search    string
		fields    []domain.ContentSearchField
		wantSQLRe string
		wantArgs  []string
	}{
		{"two phrases AND'd", "Gaither, Old", nil,
			`WHERE name ILIKE \$1 AND name ILIKE \$2`, []string{"%Gaither%", "%Old%"}},
		{"two phrases x two fields", "Gaither, Old", titleDesc,
			`WHERE \(name ILIKE \$1 OR response->'items'->0->'snippet'->>'description' ILIKE \$2\) AND \(name ILIKE \$3 OR response->'items'->0->'snippet'->>'description' ILIKE \$4\)`,
			[]string{"%Gaither%", "%Gaither%", "%Old%", "%Old%"}},
		{"tags scope phrases", "Bill, Gloria", tagsOnly,
			`WHERE \(response->'items'->0->'snippet'->'tags'\)::text ILIKE \$1 AND \(response->'items'->0->'snippet'->'tags'\)::text ILIKE \$2`,
			[]string{"%Bill%", "%Gloria%"}},
		{"multi-word phrase preserved", "Bill Gloria, Gaither", nil,
			`WHERE name ILIKE \$1 AND name ILIKE \$2`, []string{"%Bill Gloria%", "%Gaither%"}},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			args := make([]driver.Value, len(tc.wantArgs)+1)
			args[len(tc.wantArgs)] = int64(11) // LIMIT = default 10 + 1
			for i, a := range tc.wantArgs {
				args[i] = a
			}
			mock.ExpectQuery(tc.wantSQLRe).WithArgs(args...).WillReturnRows(contentRows())

			_, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
				SortBy:    domain.ContentSortByCreatedAt,
				SortOrder: domain.SortOrderDesc,
				Filter:    &domain.ContentFilter{Search: cStr(tc.search), SearchFields: tc.fields},
			})
			require.NoError(t, err)
			assertAllExpectationsMet(t, mock)
		})
	}

	t.Run("only commas applies no search filter", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectQuery(`SELECT \* FROM "content" ORDER BY`).WillReturnRows(contentRows())
		_, err := NewGormContentRepository(db).List(ctx, domain.ContentListParams{
			SortBy:    domain.ContentSortByCreatedAt,
			SortOrder: domain.SortOrderDesc,
			Filter:    &domain.ContentFilter{Search: cStr(",,,")},
		})
		require.NoError(t, err)
		assertAllExpectationsMet(t, mock)
	})
}
