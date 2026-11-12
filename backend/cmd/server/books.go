package main

import (
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/openlibrary"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// bookServiceOptions wires the Open Library adapter into ContentService. One
// client backs search, the cached trending feed and ISBN resolution. Open
// Library needs no API key, so this is unconditional (no config gate).
func bookServiceOptions() []services.ContentServiceOption {
	client := openlibrary.NewClient()
	return []services.ContentServiceOption{
		services.WithBookSearch(client),
		services.WithBookTrending(openlibrary.NewTrendingCache(client, openlibrary.DefaultTrendingTTL)),
		services.WithBookISBN(client),
	}
}
