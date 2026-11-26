package postgres

import (
	"fmt"
	"sort"
	"strconv"
	"strings"

	"gorm.io/gorm"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// factText returns the SQL expression that reads fact from a content row. Sort,
// the list filters and any other reader of a fact all use this one expression, so
// a fact is sorted and filtered over the same value.
//
// A fact carried by one content type reads that type's path directly. A fact
// carried by several types picks the path by content_type: every type but the
// last gets a WHEN branch, and the last type's path is the ELSE. Types are ordered
// by their stored name, so the output is stable.
func factText(fact domain.ContentFact) string {
	paths := domain.ContentFactPaths(fact)
	types := make([]domain.ContentType, 0, len(paths))
	for typ := range paths {
		types = append(types, typ)
	}
	sort.Slice(types, func(i, j int) bool { return storedContentType(types[i]) < storedContentType(types[j]) })

	if len(types) == 1 {
		return jsonPathText(paths[types[0]])
	}
	var b strings.Builder
	b.WriteString("CASE")
	for _, typ := range types[:len(types)-1] {
		fmt.Fprintf(&b, " WHEN content_type = '%s' THEN %s", storedContentType(typ), jsonPathText(paths[typ]))
	}
	last := types[len(types)-1]
	fmt.Fprintf(&b, " ELSE %s END", jsonPathText(paths[last]))
	return b.String()
}

// storedContentType is the content_type column value for typ.
func storedContentType(typ domain.ContentType) string {
	return strings.ToLower(string(typ))
}

// jsonPathText renders a key path as the JSONB text accessor on response: -> for
// every step, ->> for the last, with an integer step as an array index. The keys
// come from the fact definition in the domain, never from request input.
func jsonPathText(path domain.ContentFactPath) string {
	var b strings.Builder
	b.WriteString("response")
	for i, key := range path {
		op := "->"
		if i == len(path)-1 {
			op = "->>"
		}
		if _, err := strconv.Atoi(key); err == nil {
			fmt.Fprintf(&b, "%s%s", op, key)
		} else {
			fmt.Fprintf(&b, "%s'%s'", op, key)
		}
	}
	return b.String()
}

// applyFactFilters adds the fact-based list filters: published date (YouTube
// videos and web pages) and the web page site and author. Each reads its fact
// through factText, the expression the sort reads too.
func applyFactFilters(query *gorm.DB, f *domain.ContentFilter) *gorm.DB {
	if f.PublishedAfter != nil {
		query = query.Where(factText(domain.ContentFactPublishedAt)+" >= ?", *f.PublishedAfter)
	}
	if f.PublishedBefore != nil {
		query = query.Where(factText(domain.ContentFactPublishedAt)+" <= ?", *f.PublishedBefore)
	}
	if f.WebPageSiteContains != nil {
		query = query.Where(factText(domain.ContentFactSiteName)+" ILIKE ?", "%"+*f.WebPageSiteContains+"%")
	}
	if f.WebPageAuthorContains != nil {
		query = query.Where(factText(domain.ContentFactAuthor)+" ILIKE ?", "%"+*f.WebPageAuthorContains+"%")
	}
	return query
}
