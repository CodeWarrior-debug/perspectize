package postgres

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// benchPage is a realistic perspective list page: 50 rows, each with five
// categorized ratings and three feelings, the JSON-heavy fields the mappers
// marshal one element at a time.
func benchPage() []*domain.Perspective {
	note := "rewatched it twice; the ending still lands"
	page := make([]*domain.Perspective, 50)
	for i := range page {
		page[i] = &domain.Perspective{
			ID:      i + 1,
			UserID:  1,
			Privacy: domain.PrivacyPublic,
			CategorizedRatings: []domain.CategorizedRating{
				{Category: "Acting", Rating: 8200},
				{Category: "Story", Rating: 7400},
				{Category: "Cinematography", Rating: 9100},
				{Category: "Soundtrack", Rating: 6600},
				{Category: "Pacing, \"tightness\"", Rating: 5000},
			},
			Feelings: []domain.FeelingEntry{
				{Emoji: "🥰", Label: "Loving", Intensity: 8000, Note: &note},
				{Emoji: "😮", Label: "Surprised", Intensity: 5500},
				{Emoji: "😢", Intensity: 3000},
			},
			CustomFields: []byte(`{"rewatch":true,"platform":"Netflix"}`),
		}
	}
	return page
}

// BenchmarkPerspectiveMapper_Write measures the save path: domain -> GORM model
// (json.Marshal per rating/feeling) -> the jsonb[] literals the driver sends.
func BenchmarkPerspectiveMapper_Write(b *testing.B) {
	page := benchPage()
	b.ReportAllocs()
	for b.Loop() {
		for _, p := range page {
			m := perspectiveDomainToModel(p)
			if _, err := m.CategorizedRatings.Value(); err != nil {
				b.Fatal(err)
			}
			if _, err := m.Feelings.Value(); err != nil {
				b.Fatal(err)
			}
		}
	}
}

// BenchmarkPerspectiveMapper_Read measures the list path: GORM model ->
// domain (json.Unmarshal per rating/feeling) for one page.
func BenchmarkPerspectiveMapper_Read(b *testing.B) {
	page := benchPage()
	models := make([]*PerspectiveModel, len(page))
	for i, p := range page {
		models[i] = perspectiveDomainToModel(p)
	}
	b.ReportAllocs()
	for b.Loop() {
		for _, m := range models {
			_ = perspectiveModelToDomain(m)
		}
	}
}
