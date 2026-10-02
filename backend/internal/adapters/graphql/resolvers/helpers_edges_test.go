package resolvers

import (
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Internal tests (helpers are unexported) for the optional-field branches of
// the domain -> model mappers and the page-size clamp.

func TestDomainToModel_SnippetFields(t *testing.T) {
	tests := []struct {
		name        string
		response    string
		wantChannel *string
		wantPub     *string
		wantDesc    *string
		wantTags    []string
	}{
		{
			name:        "all snippet fields present",
			response:    `{"items":[{"snippet":{"channelTitle":"Chan","publishedAt":"2024-01-02T03:04:05Z","description":"Desc","tags":["a","b"]}}]}`,
			wantChannel: strPtr("Chan"),
			wantPub:     strPtr("2024-01-02T03:04:05Z"),
			wantDesc:    strPtr("Desc"),
			wantTags:    []string{"a", "b"},
		},
		{
			name:     "empty snippet leaves optional fields nil",
			response: `{"items":[{"snippet":{"channelTitle":"","publishedAt":"","description":"","tags":[]}}]}`,
		},
		{
			name:        "only channelTitle",
			response:    `{"items":[{"snippet":{"channelTitle":"Only"}}]}`,
			wantChannel: strPtr("Only"),
		},
		{
			name:     "only publishedAt",
			response: `{"items":[{"snippet":{"publishedAt":"2020-05-05T00:00:00Z"}}]}`,
			wantPub:  strPtr("2020-05-05T00:00:00Z"),
		},
		{
			name:     "only description",
			response: `{"items":[{"snippet":{"description":"Just desc"}}]}`,
			wantDesc: strPtr("Just desc"),
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			m := domainToModel(&domain.Content{ID: 1, Response: json.RawMessage(tt.response)})
			assert.Equal(t, tt.wantChannel, m.ChannelTitle)
			assert.Equal(t, tt.wantPub, m.PublishedAt)
			assert.Equal(t, tt.wantDesc, m.Description)
			if tt.wantTags == nil {
				assert.Nil(t, m.Tags)
			} else {
				assert.Equal(t, tt.wantTags, m.Tags)
			}
		})
	}
}

func TestDomainToModel_EmptyResponseLeavesResponseFieldsUnset(t *testing.T) {
	m := domainToModel(&domain.Content{ID: 1, Response: json.RawMessage{}})
	assert.Nil(t, m.Response)
	assert.Nil(t, m.ViewCount)
	assert.Nil(t, m.LikeCount)
	assert.Nil(t, m.CommentCount)
}

func TestPerspectiveDomainToModel_EmptyCollectionsStayNil(t *testing.T) {
	p := &domain.Perspective{
		ID:                    1,
		UserID:                2,
		CategorizedRatings:    []domain.CategorizedRating{},
		Feelings:              []domain.FeelingEntry{},
		RelatedPerspectiveIDs: []int{},
		CustomFields:          json.RawMessage{},
	}
	m := perspectiveDomainToModel(p)
	assert.Nil(t, m.CategorizedRatings)
	assert.Nil(t, m.Feelings)
	assert.Nil(t, m.RelatedPerspectiveIDs)
	assert.Nil(t, m.CustomFields)
}

func TestPerspectiveDomainToModel_PopulatedCollectionsMapped(t *testing.T) {
	note := "n"
	p := &domain.Perspective{
		ID:                    1,
		UserID:                2,
		CategorizedRatings:    []domain.CategorizedRating{{Category: "clarity", Rating: 7}},
		Feelings:              []domain.FeelingEntry{{Emoji: "x", Label: "joy", Intensity: 3, Note: &note}, {Emoji: "y", Intensity: 1}},
		RelatedPerspectiveIDs: []int{4, 5},
		CustomFields:          json.RawMessage(`{"k":"v"}`),
	}
	m := perspectiveDomainToModel(p)

	require.Len(t, m.CategorizedRatings, 1)
	assert.Equal(t, "clarity", m.CategorizedRatings[0].Category)
	assert.Equal(t, 7, m.CategorizedRatings[0].Rating)

	require.Len(t, m.Feelings, 2)
	assert.Equal(t, "x", m.Feelings[0].Emoji)
	require.NotNil(t, m.Feelings[0].Label)
	assert.Equal(t, "joy", *m.Feelings[0].Label)
	assert.Equal(t, 3, m.Feelings[0].Intensity)
	assert.Equal(t, &note, m.Feelings[0].Note)
	assert.Nil(t, m.Feelings[1].Label, "empty label maps to nil")

	assert.Equal(t, []int{4, 5}, m.RelatedPerspectiveIDs)
	assert.Equal(t, "v", m.CustomFields["k"])
}

func TestPageLimit(t *testing.T) {
	ptr := func(n int) *int { return &n }
	tests := []struct {
		name  string
		first *int
		want  int
	}{
		{"nil uses default", nil, defaultPageSize},
		{"zero uses default", ptr(0), defaultPageSize},
		{"negative uses default", ptr(-1), defaultPageSize},
		{"one is honoured", ptr(1), 1},
		{"mid value honoured", ptr(30), 30},
		{"exactly max", ptr(maxPageSize), maxPageSize},
		{"above max clamps", ptr(maxPageSize + 1), maxPageSize},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, pageLimit(tt.first))
		})
	}
}

func TestModelToCreatePerspectiveInput_CustomFields(t *testing.T) {
	t.Run("nil custom fields stay nil", func(t *testing.T) {
		in := modelToCreatePerspectiveInput(1, model.CreatePerspectiveInput{})
		assert.Nil(t, in.CustomFields)
	})

	t.Run("custom fields are marshaled to JSON", func(t *testing.T) {
		in := modelToCreatePerspectiveInput(1, model.CreatePerspectiveInput{
			CustomFields: map[string]any{"mood": "calm"},
		})
		assert.JSONEq(t, `{"mood":"calm"}`, string(in.CustomFields))
	})
}

func TestCategorizedRatingInputsToDomain(t *testing.T) {
	assert.Nil(t, categorizedRatingInputsToDomain(nil))
	assert.Nil(t, categorizedRatingInputsToDomain([]*model.CategorizedRatingInput{}))

	out := categorizedRatingInputsToDomain([]*model.CategorizedRatingInput{
		{Category: "a", Rating: 1},
		{Category: "b", Rating: 2},
	})
	assert.Equal(t, []domain.CategorizedRating{{Category: "a", Rating: 1}, {Category: "b", Rating: 2}}, out)
}

func strPtr(s string) *string { return &s }
