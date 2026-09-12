package postgres

import (
	"database/sql"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	paginator "github.com/pilagod/gorm-cursor-paginator/v2/paginator"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestJSONBArray_Scan(t *testing.T) {
	t.Run("nil source yields nil slice", func(t *testing.T) {
		got := JSONBArray{"pre-existing"}
		require.NoError(t, got.Scan(nil))
		assert.Nil(t, got)
	})

	t.Run("empty array literal", func(t *testing.T) {
		var got JSONBArray
		require.NoError(t, got.Scan("{}"))
		assert.Equal(t, JSONBArray{}, got)
	})

	t.Run("single quoted json object", func(t *testing.T) {
		var got JSONBArray
		require.NoError(t, got.Scan(`{"{\"category\": \"acting\", \"rating\": 5}"}`))
		assert.Equal(t, JSONBArray{`{"category": "acting", "rating": 5}`}, got)
	})

	t.Run("propagates StringArray scan error", func(t *testing.T) {
		var got JSONBArray
		err := got.Scan(42)
		require.Error(t, err)
		assert.Equal(t, "StringArray.Scan: expected []byte or string, got int", err.Error())
	})
}

func TestJSONBArray_Value(t *testing.T) {
	t.Run("nil slice yields nil driver value", func(t *testing.T) {
		var a JSONBArray
		v, err := a.Value()
		require.NoError(t, err)
		assert.Nil(t, v)
	})

	t.Run("empty non-nil slice also yields nil driver value", func(t *testing.T) {
		v, err := JSONBArray{}.Value()
		require.NoError(t, err)
		assert.Nil(t, v)
	})

	t.Run("json object is quoted and escaped", func(t *testing.T) {
		v, err := JSONBArray{`{"a":1}`}.Value()
		require.NoError(t, err)
		assert.Equal(t, `{"{\"a\":1}"}`, v)
	})
}

func TestContentTypeDBValueConversion(t *testing.T) {
	assert.Equal(t, "youtube", contentTypeToDBValue(domain.ContentTypeYouTube))
	assert.Equal(t, "claim", contentTypeToDBValue(domain.ContentTypeClaim))
	assert.Equal(t, "", contentTypeToDBValue(domain.ContentType("")))

	assert.Equal(t, domain.ContentTypeYouTube, contentTypeFromDBValue("youtube"))
	assert.Equal(t, domain.ContentTypeClaim, contentTypeFromDBValue("claim"))
	assert.Equal(t, domain.ContentTypeYouTube, contentTypeFromDBValue("YouTube"))
	assert.Equal(t, domain.ContentType(""), contentTypeFromDBValue(""))
}

func TestPrivacyDBValueConversion(t *testing.T) {
	assert.Equal(t, "public", privacyToDBValue(domain.PrivacyPublic))
	assert.Equal(t, domain.PrivacyPublic, privacyFromDBValue("public"))
	assert.Equal(t, domain.PrivacyPublic, privacyFromDBValue("PuBLic"))
	assert.Equal(t, domain.Privacy(""), privacyFromDBValue(""))
}

func TestReviewStatusToDBValue(t *testing.T) {
	t.Run("nil pointer yields invalid NullString", func(t *testing.T) {
		got := reviewStatusToDBValue(nil)
		assert.False(t, got.Valid)
		assert.Equal(t, "", got.String)
	})

	t.Run("approved yields lowercase valid NullString", func(t *testing.T) {
		rs := domain.ReviewStatusApproved
		got := reviewStatusToDBValue(&rs)
		assert.True(t, got.Valid)
		assert.Equal(t, "approved", got.String)
	})

	t.Run("pending yields lowercase valid NullString", func(t *testing.T) {
		rs := domain.ReviewStatusPending
		got := reviewStatusToDBValue(&rs)
		assert.True(t, got.Valid)
		assert.Equal(t, "pending", got.String)
	})
}

func TestReviewStatusFromDBValue(t *testing.T) {
	t.Run("invalid NullString yields nil", func(t *testing.T) {
		assert.Nil(t, reviewStatusFromDBValue(sql.NullString{}))
	})

	t.Run("valid NullString is uppercased", func(t *testing.T) {
		got := reviewStatusFromDBValue(sql.NullString{String: "rejected", Valid: true})
		require.NotNil(t, got)
		assert.Equal(t, domain.ReviewStatusRejected, *got)
	})
}

func TestIntSliceToInt64Array(t *testing.T) {
	assert.Nil(t, intSliceToInt64Array(nil))

	empty := intSliceToInt64Array([]int{})
	require.NotNil(t, empty)
	assert.Len(t, empty, 0)

	assert.Equal(t, Int64Array{1, -2, 3}, intSliceToInt64Array([]int{1, -2, 3}))
}

func TestBuildContentSortRules(t *testing.T) {
	tests := []struct {
		name         string
		sortBy       domain.ContentSortBy
		order        domain.SortOrder
		wantPrimary  paginator.Rule
		wantTieOrder paginator.Order
	}{
		{
			name:   "view count ascending uses JSONB SQLRepr with int64 null replacement",
			sortBy: domain.ContentSortByViewCount,
			order:  domain.SortOrderAsc,
			wantPrimary: paginator.Rule{
				Key:             "ViewCount",
				Order:           paginator.ASC,
				SQLRepr:         "(response->'items'->0->'statistics'->>'viewCount')::BIGINT",
				NULLReplacement: int64(0),
			},
			wantTieOrder: paginator.ASC,
		},
		{
			name:   "like count descending",
			sortBy: domain.ContentSortByLikeCount,
			order:  domain.SortOrderDesc,
			wantPrimary: paginator.Rule{
				Key:             "LikeCount",
				Order:           paginator.DESC,
				SQLRepr:         "(response->'items'->0->'statistics'->>'likeCount')::BIGINT",
				NULLReplacement: int64(0),
			},
			wantTieOrder: paginator.DESC,
		},
		{
			name:   "published at uses string null replacement",
			sortBy: domain.ContentSortByPublishedAt,
			order:  domain.SortOrderAsc,
			wantPrimary: paginator.Rule{
				Key:             "PublishedAt",
				Order:           paginator.ASC,
				SQLRepr:         "response->'items'->0->'snippet'->>'publishedAt'",
				NULLReplacement: "",
			},
			wantTieOrder: paginator.ASC,
		},
		{
			name:   "channel title uses string null replacement",
			sortBy: domain.ContentSortByChannelTitle,
			order:  domain.SortOrderDesc,
			wantPrimary: paginator.Rule{
				Key:             "ChannelTitle",
				Order:           paginator.DESC,
				SQLRepr:         "response->'items'->0->'snippet'->>'channelTitle'",
				NULLReplacement: "",
			},
			wantTieOrder: paginator.DESC,
		},
		{
			name:         "length has no SQLRepr but has int64 null replacement",
			sortBy:       domain.ContentSortByLength,
			order:        domain.SortOrderAsc,
			wantPrimary:  paginator.Rule{Key: "Length", Order: paginator.ASC, NULLReplacement: int64(0)},
			wantTieOrder: paginator.ASC,
		},
		{
			name:         "updated at is a plain column rule",
			sortBy:       domain.ContentSortByUpdatedAt,
			order:        domain.SortOrderDesc,
			wantPrimary:  paginator.Rule{Key: "UpdatedAt", Order: paginator.DESC},
			wantTieOrder: paginator.DESC,
		},
		{
			name:         "name is a plain column rule",
			sortBy:       domain.ContentSortByName,
			order:        domain.SortOrderAsc,
			wantPrimary:  paginator.Rule{Key: "Name", Order: paginator.ASC},
			wantTieOrder: paginator.ASC,
		},
		{
			name:         "created at is a plain column rule",
			sortBy:       domain.ContentSortByCreatedAt,
			order:        domain.SortOrderAsc,
			wantPrimary:  paginator.Rule{Key: "CreatedAt", Order: paginator.ASC},
			wantTieOrder: paginator.ASC,
		},
		{
			// Regression guard: the default branch hard-codes DESC on the primary rule
			// but the tie-breaker still follows the requested order.
			name:         "unknown sort key falls back to CreatedAt DESC with requested tie-breaker order",
			sortBy:       domain.ContentSortBy("NOT_A_REAL_SORT_KEY"),
			order:        domain.SortOrderAsc,
			wantPrimary:  paginator.Rule{Key: "CreatedAt", Order: paginator.DESC},
			wantTieOrder: paginator.ASC,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rules := buildContentSortRules(tt.sortBy, tt.order)
			require.Len(t, rules, 2)
			assert.Equal(t, tt.wantPrimary, rules[0])
			assert.Equal(t, paginator.Rule{Key: "ID", Order: tt.wantTieOrder}, rules[1])
		})
	}
}

func TestBuildContentSortRulesMulti(t *testing.T) {
	t.Run("empty sorts falls back to CreatedAt DESC", func(t *testing.T) {
		rules := buildContentSortRulesMulti(nil)
		assert.Equal(t, buildContentSortRules(domain.ContentSortByCreatedAt, domain.SortOrderDesc), rules)
	})

	t.Run("multiple columns produce one rule per column plus a final ID tie-breaker", func(t *testing.T) {
		rules := buildContentSortRulesMulti([]domain.ContentSortRule{
			{Field: domain.ContentSortByViewCount, Order: domain.SortOrderDesc},
			{Field: domain.ContentSortByName, Order: domain.SortOrderAsc},
		})
		require.Len(t, rules, 3)
		assert.Equal(t, "ViewCount", rules[0].Key)
		assert.Equal(t, paginator.DESC, rules[0].Order)
		assert.Equal(t, "Name", rules[1].Key)
		assert.Equal(t, paginator.ASC, rules[1].Order)
		// ID tie-breaker follows the last column's direction
		assert.Equal(t, paginator.Rule{Key: "ID", Order: paginator.ASC}, rules[2])
	})

	t.Run("duplicate fields collapse to their first occurrence", func(t *testing.T) {
		rules := buildContentSortRulesMulti([]domain.ContentSortRule{
			{Field: domain.ContentSortByName, Order: domain.SortOrderAsc},
			{Field: domain.ContentSortByName, Order: domain.SortOrderDesc},
		})
		require.Len(t, rules, 2)
		assert.Equal(t, paginator.Rule{Key: "Name", Order: paginator.ASC}, rules[0])
		assert.Equal(t, paginator.Rule{Key: "ID", Order: paginator.ASC}, rules[1])
	})
}

func TestBuildPerspectiveSortRules(t *testing.T) {
	tests := []struct {
		name         string
		sortBy       domain.PerspectiveSortBy
		order        domain.SortOrder
		wantPrimary  paginator.Rule
		wantTieOrder paginator.Order
	}{
		{
			name:         "updated at ascending",
			sortBy:       domain.PerspectiveSortByUpdatedAt,
			order:        domain.SortOrderAsc,
			wantPrimary:  paginator.Rule{Key: "UpdatedAt", Order: paginator.ASC},
			wantTieOrder: paginator.ASC,
		},
		{
			name:         "created at descending",
			sortBy:       domain.PerspectiveSortByCreatedAt,
			order:        domain.SortOrderDesc,
			wantPrimary:  paginator.Rule{Key: "CreatedAt", Order: paginator.DESC},
			wantTieOrder: paginator.DESC,
		},
		{
			name:         "unknown sort key falls back to CreatedAt DESC with requested tie-breaker order",
			sortBy:       domain.PerspectiveSortBy("NOT_A_REAL_SORT_KEY"),
			order:        domain.SortOrderAsc,
			wantPrimary:  paginator.Rule{Key: "CreatedAt", Order: paginator.DESC},
			wantTieOrder: paginator.ASC,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			rules := buildPerspectiveSortRules(tt.sortBy, tt.order)
			require.Len(t, rules, 2)
			assert.Equal(t, tt.wantPrimary, rules[0])
			assert.Equal(t, paginator.Rule{Key: "ID", Order: tt.wantTieOrder}, rules[1])
		})
	}
}
