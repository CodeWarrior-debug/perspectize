package postgres

import (
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

// addedBySortExpr is the ADDED_BY sort key: the adder's lowercased username, as a
// correlated scalar subquery rather than a JOIN (the paginator splices it into ORDER BY
// and the cursor WHERE, and the list query stays single-table). It is listed in
// computedSortColumns, so List selects it AS added_by for the cursor.
const addedBySortExpr = "LOWER((SELECT u.username FROM users u WHERE u.id = content.added_by_user_id))"

// computedSortColumns maps a content sort rule Key whose value is computed (no real
// column) to the alias List selects it under. Each alias is the column tag of the
// matching read-only ContentModel field, which is how gorm-cursor-paginator reads the
// real sort value back when encoding the cursor.
var computedSortColumns = map[string]string{
	"ViewCount":    "view_count",
	"LikeCount":    "like_count",
	"PublishedAt":  "published_at_sort",
	"ChannelTitle": "channel_title_sort",
	"BoxOffice":    "box_office",
	"VsBudget":     "vs_budget",
	"AgeRating":    "age_rating",
	"AddedBy":      "added_by",
	"ReleaseDate":  "release_date_sort",
	"TmdbScore":    "tmdb_score",
	"Author":       "author_sort",
}

// computedSortSelects returns the ", (expr) AS alias" select-list suffix for every
// computed sort rule (empty when all rules sort on real columns). Must run on the rules
// before they reach the paginator, which rewrites SQLRepr with its COALESCE wrapper.
func computedSortSelects(rules []paginator.Rule) string {
	var b strings.Builder
	for _, r := range rules {
		alias, ok := computedSortColumns[r.Key]
		if !ok || r.SQLRepr == "" {
			continue
		}
		b.WriteString(", (" + r.SQLRepr + ") AS " + alias)
	}
	return b.String()
}

// Sort-key NULL replacements. The paginator wraps each computed expression in
// COALESCE(expr, replacement), so unknowns (NULL) sort LAST: ASC needs a high value and
// DESC a low one. Values stay exactly representable as float64 because cursors
// round-trip through JSON numbers (math.MaxInt64 would lose precision).
const (
	// nullBoxOfficeAsc is 2^53, the largest integer float64 holds exactly; real revenues are far below.
	nullBoxOfficeAsc  int64 = 1 << 53
	nullBoxOfficeDesc int64 = 0
	// nullVsBudgetAsc exceeds any real revenue/budget multiple; DESC uses -1 (real multiples are >= 0).
	nullVsBudgetAsc  float64 = 1e18
	nullVsBudgetDesc float64 = -1
	// nullAgeRatingAsc is above every rank (real ranks are 1-5).
	nullAgeRatingAsc  int64 = 99
	nullAgeRatingDesc int64 = 0
	// Release dates are ISO strings: ASC needs one after every real date, DESC "" (before all).
	nullReleaseDateAsc  = "9999-12-31"
	nullReleaseDateDesc = ""
	// TMDB vote averages are 0-10.
	nullTmdbScoreAsc  float64 = 99
	nullTmdbScoreDesc float64 = -1
	// Author names: ASC needs a value after every plausible real name; DESC uses
	// "" (before all), so a missing/empty author sorts last in either direction.
	nullAuthorAsc  = "￿￿￿￿"
	nullAuthorDesc = ""
	// Published dates (ISO strings, date or timestamp): ASC needs a value after
	// every real one; DESC uses "" (before all). A row with no date sorts last in
	// either direction.
	// ASC uses 9999-99-99 rather than a code point above all text: real dates start
	// with 1 or 2, and digits sort the same in any collation.
	nullPublishedAtAsc  = "9999-99-99"
	nullPublishedAtDesc = ""
)

// statCountExpr returns a SQL expression for one YouTube statistics count as a BIGINT.
// A stored count can be an empty string (hidden likes) or otherwise non-numeric, and a
// bare ::BIGINT cast fails the whole query on it. Only all-digit values are cast; anything
// else is NULL, which sorts as 0 and never matches a min/max filter.
func statCountExpr(key string) string {
	raw := "(response->'items'->0->'statistics'->>'" + key + "')"
	return "(CASE WHEN " + raw + " ~ '^[0-9]+$' THEN " + raw + "::BIGINT ELSE NULL END)"
}

// contentSortRule builds a single paginator.Rule for one content sort column.
func contentSortRule(sortBy domain.ContentSortBy, order domain.SortOrder) paginator.Rule {
	boxOfficeNull, vsBudgetNull, ageRatingNull := nullBoxOfficeDesc, nullVsBudgetDesc, nullAgeRatingDesc
	releaseDateNull, tmdbScoreNull := nullReleaseDateDesc, nullTmdbScoreDesc
	authorNull := nullAuthorDesc
	if order == domain.SortOrderAsc {
		boxOfficeNull, vsBudgetNull, ageRatingNull = nullBoxOfficeAsc, nullVsBudgetAsc, nullAgeRatingAsc
		releaseDateNull, tmdbScoreNull = nullReleaseDateAsc, nullTmdbScoreAsc
		authorNull = nullAuthorAsc
	}
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
			SQLRepr:         statCountExpr("viewCount"),
			NULLReplacement: int64(0),
		}
	case domain.ContentSortByLikeCount:
		return paginator.Rule{
			Key:             "LikeCount",
			Order:           paginatorOrder,
			SQLRepr:         statCountExpr("likeCount"),
			NULLReplacement: int64(0),
		}
	case domain.ContentSortByBoxOffice:
		return paginator.Rule{
			Key:             "BoxOffice",
			Order:           paginatorOrder,
			SQLRepr:         "(response->>'revenue')::BIGINT",
			NULLReplacement: boxOfficeNull,
		}
	case domain.ContentSortByVsBudget:
		// Revenue as a multiple of budget; NULL when either is unknown or budget is 0.
		return paginator.Rule{
			Key:   "VsBudget",
			Order: paginatorOrder,
			SQLRepr: "CASE WHEN response->>'budget' IS NULL OR response->>'revenue' IS NULL " +
				"OR (response->>'budget')::BIGINT = 0 THEN NULL " +
				"ELSE (response->>'revenue')::FLOAT8 / NULLIF((response->>'budget')::BIGINT,0) END",
			NULLReplacement: vsBudgetNull,
		}
	case domain.ContentSortByAgeRating:
		return paginator.Rule{
			Key:   "AgeRating",
			Order: paginatorOrder,
			SQLRepr: "CASE response->>'certification' WHEN 'G' THEN 1 WHEN 'PG' THEN 2 " +
				"WHEN 'PG-13' THEN 3 WHEN 'R' THEN 4 WHEN 'NC-17' THEN 5 ELSE NULL END",
			NULLReplacement: ageRatingNull,
		}
	case domain.ContentSortByAuthor:
		// Book authors; a missing/empty author counts as unknown and sorts last.
		return paginator.Rule{
			Key:   "Author",
			Order: paginatorOrder,
			SQLRepr: "CASE WHEN response->'authors'->0->>'name' IS NULL OR response->'authors'->0->>'name' = '' " +
				"THEN NULL ELSE response->'authors'->0->>'name' END",
			NULLReplacement: authorNull,
		}
	case domain.ContentSortByReleaseDate:
		// ISO YYYY-MM-DD, so string order is date order; an empty date counts as unknown.
		return paginator.Rule{
			Key:             "ReleaseDate",
			Order:           paginatorOrder,
			SQLRepr:         "NULLIF(response->>'releaseDate', '')",
			NULLReplacement: releaseDateNull,
		}
	case domain.ContentSortByTmdbScore:
		return paginator.Rule{
			Key:             "TmdbScore",
			Order:           paginatorOrder,
			SQLRepr:         "(response->>'voteAverage')::FLOAT8",
			NULLReplacement: tmdbScoreNull,
		}
	case domain.ContentSortByPublishedAt:
		// A webpage keeps its own publishedAt (YYYY-MM-DD); a YouTube video keeps it in
		// the snippet. Each row reads only the branch for its type.
		publishedNull := nullPublishedAtDesc
		if order == domain.SortOrderAsc {
			publishedNull = nullPublishedAtAsc
		}
		return paginator.Rule{
			Key:             "PublishedAt",
			Order:           paginatorOrder,
			SQLRepr:         factText(domain.ContentFactPublishedAt),
			NULLReplacement: publishedNull,
		}
	case domain.ContentSortByChannelTitle:
		return paginator.Rule{
			Key:             "ChannelTitle",
			Order:           paginatorOrder,
			SQLRepr:         "response->'items'->0->'snippet'->>'channelTitle'",
			NULLReplacement: "",
		}
	case domain.ContentSortByAddedBy:
		return paginator.Rule{
			Key:             "AddedBy",
			Order:           paginatorOrder,
			SQLRepr:         addedBySortExpr,
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

// userTodoStatusToDBValue converts domain UserTodoStatus to lowercase for database storage
func userTodoStatusToDBValue(s domain.UserTodoStatus) string {
	return strings.ToLower(string(s))
}

// userTodoStatusFromDBValue converts lowercase database value to domain UserTodoStatus
func userTodoStatusFromDBValue(s string) domain.UserTodoStatus {
	return domain.UserTodoStatus(strings.ToUpper(s))
}

// NULL sort-key replacements for user todos. The paginator wraps a nullable
// key in COALESCE(column, replacement), so a NULL sorts after every real value
// for ASC and before every real value for DESC: NULLs always land last.
const (
	// Priority is 0..RatingMax.
	userTodoPriorityNullAsc  = domain.RatingMax + 1
	userTodoPriorityNullDesc = -1
	// Dates: 9999-12-31 is after any real date; 0001-01-01 is before any.
	userTodoDueDateNullAsc  = "9999-12-31"
	userTodoDueDateNullDesc = "0001-01-01"
	// list_position is a positive int4.
	userTodoListPositionNullAsc  = 2147483647
	userTodoListPositionNullDesc = -1
)

// buildUserTodoSortRules builds paginator rules for user todo sorting: the
// requested column, then an ID tie-breaker in the same direction. Only the
// whitelisted sort columns below reach SQL (no caller-supplied column names).
// An unknown sortBy falls back to CreatedAt DESC.
func buildUserTodoSortRules(sortBy domain.UserTodoSortBy, order domain.SortOrder) []paginator.Rule {
	asc := order == domain.SortOrderAsc
	paginatorOrder := paginator.DESC
	if asc {
		paginatorOrder = paginator.ASC
	}

	var primaryRule paginator.Rule
	switch sortBy {
	case domain.UserTodoSortByPriority:
		primaryRule = paginator.Rule{Key: "Priority", Order: paginatorOrder, NULLReplacement: userTodoPriorityNullDesc}
		if asc {
			primaryRule.NULLReplacement = userTodoPriorityNullAsc
		}
	case domain.UserTodoSortByDueDate:
		primaryRule = paginator.Rule{Key: "DueDate", Order: paginatorOrder, NULLReplacement: userTodoDueDateNullDesc}
		if asc {
			primaryRule.NULLReplacement = userTodoDueDateNullAsc
		}
	case domain.UserTodoSortByUpdatedAt:
		primaryRule = paginator.Rule{Key: "UpdatedAt", Order: paginatorOrder}
	case domain.UserTodoSortByListPosition:
		primaryRule = paginator.Rule{Key: "ListPosition", Order: paginatorOrder, NULLReplacement: userTodoListPositionNullDesc}
		if asc {
			primaryRule.NULLReplacement = userTodoListPositionNullAsc
		}
	case domain.UserTodoSortByCreatedAt:
		primaryRule = paginator.Rule{Key: "CreatedAt", Order: paginatorOrder}
	default:
		primaryRule = paginator.Rule{Key: "CreatedAt", Order: paginator.DESC}
	}

	return []paginator.Rule{primaryRule, {Key: "ID", Order: paginatorOrder}}
}

// savedItemTypeToDBValue converts a domain SavedItemType to lowercase for database storage
func savedItemTypeToDBValue(t domain.SavedItemType) string {
	return strings.ToLower(string(t))
}

// savedItemTypeFromDBValue converts a lowercase database value to a domain SavedItemType
func savedItemTypeFromDBValue(s string) domain.SavedItemType {
	return domain.SavedItemType(strings.ToUpper(s))
}

// savedItemOriginToDBValue converts a domain SavedItemOrigin to lowercase for database storage
func savedItemOriginToDBValue(o domain.SavedItemOrigin) string {
	return strings.ToLower(string(o))
}

// savedItemOriginFromDBValue converts a lowercase database value to a domain SavedItemOrigin
func savedItemOriginFromDBValue(s string) domain.SavedItemOrigin {
	return domain.SavedItemOrigin(strings.ToUpper(s))
}

// buildSavedItemSortRules builds paginator rules for saved item lists: the
// requested column, then an ID tie-breaker in the same direction. Each rule
// names its column with the s. alias, because the read joins the source
// (src) and an unqualified name would be ambiguous. An unknown sortBy falls
// back to CreatedAt DESC.
func buildSavedItemSortRules(sortBy domain.SavedItemSortBy, order domain.SortOrder) []paginator.Rule {
	paginatorOrder := paginator.DESC
	if order == domain.SortOrderAsc {
		paginatorOrder = paginator.ASC
	}

	var primaryRule paginator.Rule
	switch sortBy {
	case domain.SavedItemSortByName:
		primaryRule = paginator.Rule{Key: "Name", Order: paginatorOrder, SQLRepr: "s.name"}
	case domain.SavedItemSortByUpdatedAt:
		primaryRule = paginator.Rule{Key: "UpdatedAt", Order: paginatorOrder, SQLRepr: "s.updated_at"}
	case domain.SavedItemSortByCreatedAt:
		primaryRule = paginator.Rule{Key: "CreatedAt", Order: paginatorOrder, SQLRepr: "s.created_at"}
	default:
		primaryRule = paginator.Rule{Key: "CreatedAt", Order: paginator.DESC, SQLRepr: "s.created_at"}
	}

	return []paginator.Rule{primaryRule, {Key: "ID", Order: paginatorOrder, SQLRepr: "s.id"}}
}
