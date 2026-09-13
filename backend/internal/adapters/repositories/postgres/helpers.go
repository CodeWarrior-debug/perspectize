package postgres

import (
	"database/sql"
	"database/sql/driver"
	"strings"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	paginator "github.com/pilagod/gorm-cursor-paginator/v2/paginator"
)

// JSONBArray is a custom type for PostgreSQL jsonb[] columns.
// It stores JSON data as strings and properly handles NULL values.
type JSONBArray []string

// Scan implements the sql.Scanner interface for reading jsonb[] from PostgreSQL
func (a *JSONBArray) Scan(src interface{}) error {
	if src == nil {
		*a = nil
		return nil
	}

	// PostgreSQL returns jsonb[] as []byte containing array of bytea
	// We need to scan through StringArray
	var strArray StringArray
	if err := strArray.Scan(src); err != nil {
		return err
	}
	*a = JSONBArray(strArray)
	return nil
}

// Value implements the driver.Valuer interface for writing jsonb[] to PostgreSQL
func (a JSONBArray) Value() (driver.Value, error) {
	if len(a) == 0 {
		return nil, nil
	}
	return StringArray(a).Value()
}

// contentTypeToDBValue converts domain ContentType to lowercase for database storage
func contentTypeToDBValue(ct domain.ContentType) string {
	return strings.ToLower(string(ct))
}

// contentTypeFromDBValue converts lowercase database value to domain ContentType
func contentTypeFromDBValue(s string) domain.ContentType {
	return domain.ContentType(strings.ToUpper(s))
}

// privacyToDBValue converts domain Privacy to lowercase for database storage
func privacyToDBValue(p domain.Privacy) string {
	return strings.ToLower(string(p))
}

// privacyFromDBValue converts lowercase database value to domain Privacy
func privacyFromDBValue(s string) domain.Privacy {
	return domain.Privacy(strings.ToUpper(s))
}

// reviewStatusToDBValue converts domain ReviewStatus to lowercase for database storage
func reviewStatusToDBValue(rs *domain.ReviewStatus) sql.NullString {
	if rs == nil {
		return sql.NullString{}
	}
	return sql.NullString{String: strings.ToLower(string(*rs)), Valid: true}
}

// reviewStatusFromDBValue converts lowercase database value to domain ReviewStatus
func reviewStatusFromDBValue(s sql.NullString) *domain.ReviewStatus {
	if !s.Valid {
		return nil
	}
	rs := domain.ReviewStatus(strings.ToUpper(s.String))
	return &rs
}

// intSliceToInt64Array converts []int to Int64Array for database storage
func intSliceToInt64Array(ints []int) Int64Array {
	if ints == nil {
		return nil
	}
	result := make(Int64Array, len(ints))
	for i, v := range ints {
		result[i] = int64(v)
	}
	return result
}

// contentSortRule builds a single paginator.Rule for one content sort column.
func contentSortRule(sortBy domain.ContentSortBy, order domain.SortOrder) paginator.Rule {
	// Map domain.SortOrder to paginator.Order
	var paginatorOrder paginator.Order
	if order == domain.SortOrderAsc {
		paginatorOrder = paginator.ASC
	} else {
		paginatorOrder = paginator.DESC
	}

	switch sortBy {
	case domain.ContentSortByViewCount:
		return paginator.Rule{
			Key:             "ViewCount",
			Order:           paginatorOrder,
			SQLRepr:         "(response->'items'->0->'statistics'->>'viewCount')::BIGINT",
			NULLReplacement: int64(0),
		}
	case domain.ContentSortByLikeCount:
		return paginator.Rule{
			Key:             "LikeCount",
			Order:           paginatorOrder,
			SQLRepr:         "(response->'items'->0->'statistics'->>'likeCount')::BIGINT",
			NULLReplacement: int64(0),
		}
	case domain.ContentSortByPublishedAt:
		return paginator.Rule{
			Key:             "PublishedAt",
			Order:           paginatorOrder,
			SQLRepr:         "response->'items'->0->'snippet'->>'publishedAt'",
			NULLReplacement: "",
		}
	case domain.ContentSortByChannelTitle:
		return paginator.Rule{
			Key:             "ChannelTitle",
			Order:           paginatorOrder,
			SQLRepr:         "response->'items'->0->'snippet'->>'channelTitle'",
			NULLReplacement: "",
		}
	case domain.ContentSortByLength:
		return paginator.Rule{
			Key:             "Length",
			Order:           paginatorOrder,
			NULLReplacement: int64(0),
		}
	case domain.ContentSortByUpdatedAt:
		return paginator.Rule{
			Key:   "UpdatedAt",
			Order: paginatorOrder,
		}
	case domain.ContentSortByName:
		return paginator.Rule{
			Key:   "Name",
			Order: paginatorOrder,
		}
	case domain.ContentSortByCreatedAt:
		return paginator.Rule{
			Key:   "CreatedAt",
			Order: paginatorOrder,
		}
	default:
		// Default to CreatedAt DESC
		return paginator.Rule{
			Key:   "CreatedAt",
			Order: paginator.DESC,
		}
	}
}

// buildContentSortRules builds paginator rules for a single-column content sort.
// Returns slice with primary sort rule + ID tie-breaker rule.
func buildContentSortRules(sortBy domain.ContentSortBy, order domain.SortOrder) []paginator.Rule {
	primaryRule := contentSortRule(sortBy, order)

	// Tie-breaker: ID using the requested order (not necessarily primaryRule.Order —
	// an unrecognized sortBy falls back to a hardcoded CreatedAt DESC primary rule
	// while the tie-breaker still honors what the caller asked for).
	var paginatorOrder paginator.Order
	if order == domain.SortOrderAsc {
		paginatorOrder = paginator.ASC
	} else {
		paginatorOrder = paginator.DESC
	}
	tieBreaker := paginator.Rule{
		Key:   "ID",
		Order: paginatorOrder,
	}

	return []paginator.Rule{primaryRule, tieBreaker}
}

// buildContentSortRulesMulti builds paginator rules for a multi-column content sort.
// Each entry in sorts becomes a rule in priority order (first entry is primary,
// later entries break ties left-to-right), followed by an ID tie-breaker using the
// last column's direction. Duplicate fields (a column listed twice) are collapsed
// to their first occurrence. Falls back to CreatedAt DESC when sorts is empty.
func buildContentSortRulesMulti(sorts []domain.ContentSortRule) []paginator.Rule {
	if len(sorts) == 0 {
		return buildContentSortRules(domain.ContentSortByCreatedAt, domain.SortOrderDesc)
	}

	seen := make(map[domain.ContentSortBy]bool, len(sorts))
	rules := make([]paginator.Rule, 0, len(sorts)+1)
	var lastOrder paginator.Order

	for _, s := range sorts {
		if seen[s.Field] {
			continue
		}
		seen[s.Field] = true
		rule := contentSortRule(s.Field, s.Order)
		rules = append(rules, rule)
		lastOrder = rule.Order
	}

	rules = append(rules, paginator.Rule{Key: "ID", Order: lastOrder})
	return rules
}

// buildPerspectiveSortRules builds paginator rules for perspective sorting
// Returns slice with primary sort rule + ID tie-breaker rule
func buildPerspectiveSortRules(sortBy domain.PerspectiveSortBy, order domain.SortOrder) []paginator.Rule {
	// Map domain.SortOrder to paginator.Order
	var paginatorOrder paginator.Order
	if order == domain.SortOrderAsc {
		paginatorOrder = paginator.ASC
	} else {
		paginatorOrder = paginator.DESC
	}

	var primaryRule paginator.Rule

	switch sortBy {
	case domain.PerspectiveSortByUpdatedAt:
		primaryRule = paginator.Rule{
			Key:   "UpdatedAt",
			Order: paginatorOrder,
		}
	case domain.PerspectiveSortByCreatedAt:
		primaryRule = paginator.Rule{
			Key:   "CreatedAt",
			Order: paginatorOrder,
		}
	default:
		// Default to CreatedAt DESC
		primaryRule = paginator.Rule{
			Key:   "CreatedAt",
			Order: paginator.DESC,
		}
	}

	// Tie-breaker: ID with same sort direction as primary
	tieBreaker := paginator.Rule{
		Key:   "ID",
		Order: paginatorOrder,
	}

	return []paginator.Rule{primaryRule, tieBreaker}
}
