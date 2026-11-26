package postgres

import "github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"

// This file renders domain.Audience as SQL. The rule itself lives in
// domain/audience.go; these functions are its SQL form, and audience_test.go
// checks that the two agree on every case. Adding an audience means one new
// case in each place, nowhere else.

// audienceColumns names the privacy and owner columns of one row type's table.
type audienceColumns struct {
	privacy string
	owner   string
}

var (
	perspectiveAudience = audienceColumns{privacy: "privacy", owner: "user_id"}
	todoAudience        = audienceColumns{privacy: "privacy", owner: "user_id"}
	contentAudience     = audienceColumns{privacy: "privacy", owner: "added_by_user_id"}
)

// readableSQL renders Audience.ReadableBy as a WHERE fragment over the table
// qualified by prefix ("" or "content."). A nil viewer is anonymous and reads
// public rows only. Callers wrap the fragment in parentheses when they AND it
// with other conditions.
func (c audienceColumns) readableSQL(prefix string, viewerID *int) (string, []any) {
	public := privacyToDBValue(domain.PrivacyPublic)
	if viewerID == nil {
		return prefix + c.privacy + " = ?", []any{public}
	}
	return prefix + c.privacy + " = ? OR " + prefix + c.owner + " = ?", []any{public, *viewerID}
}

// aggregateSQL renders Audience.CountsInAggregates as a WHERE fragment. Only
// public rows count, whoever is asking.
func (c audienceColumns) aggregateSQL(prefix string) (string, []any) {
	return prefix + c.privacy + " = ?", []any{privacyToDBValue(domain.PrivacyPublic)}
}

// statsScopeSQL is the scope a stats query counts over: public perspectives
// (the aggregate rule) whose content the viewer may read (the perspective
// content rule). A stats call on content the viewer cannot read matches no rows,
// the same as a content id that does not exist. alias is the perspectives table
// or its alias.
func statsScopeSQL(alias string, viewerID *int) (string, []any) {
	aggCond, aggArgs := perspectiveAudience.aggregateSQL(alias + ".")
	contentCond, contentArgs := perspectiveContentSQL(alias, viewerID)
	return aggCond + " AND " + contentCond, append(aggArgs, contentArgs...)
}

// perspectiveContentSQL renders the content check a perspective carries: a
// perspective with no content has nothing to dominate, so it passes; one on
// content passes only when that content is readable by the viewer. alias is the
// perspectives table or its alias in the enclosing query.
func perspectiveContentSQL(alias string, viewerID *int) (string, []any) {
	cond, args := contentAudience.readableSQL("c.", viewerID)
	return "(" + alias + ".content_id IS NULL OR EXISTS (SELECT 1 FROM content c WHERE c.id = " +
		alias + ".content_id AND (" + cond + ")))", args
}
