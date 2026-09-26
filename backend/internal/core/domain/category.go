package domain

import "time"

// Category represents a Wikidata-backed grouping for content items.
// Categories are cached locally when users select a Wikidata entity.
type Category struct {
	ID           int
	WikidataQID  string
	Label        string
	Description  string
	EntityType   string
	WikipediaURL string
	CreatedAt    time.Time
	UpdatedAt    time.Time
}

// WikidataSearchResult represents a single result from the Wikidata Entity Search API.
// This is the API response shape, distinct from a stored Category.
type WikidataSearchResult struct {
	QID         string
	Label       string
	Description string
	EntityType  string
}
