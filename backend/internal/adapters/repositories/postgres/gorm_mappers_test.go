package postgres

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func strPtr(s string) *string { return &s }
func intPtr(i int) *int       { return &i }

var mapperFixedTime = time.Date(2026, 3, 14, 15, 9, 26, 0, time.UTC)

// --- User ---

func TestUserModelToDomain(t *testing.T) {
	t.Run("nil model yields nil domain", func(t *testing.T) {
		assert.Nil(t, userModelToDomain(nil))
	})

	t.Run("all fields populated, role uppercased", func(t *testing.T) {
		got := userModelToDomain(&UserModel{
			ID:          7,
			ClerkUserID: strPtr("user_abc"),
			Username:    "alice",
			Email:       strPtr("alice@example.com"),
			Role:        "admin",
			Active:      true,
			CreatedAt:   mapperFixedTime,
			UpdatedAt:   mapperFixedTime,
		})
		require.NotNil(t, got)
		assert.Equal(t, &domain.User{
			ID:          7,
			ClerkUserID: "user_abc",
			Username:    "alice",
			Email:       "alice@example.com",
			Role:        domain.UserRoleAdmin,
			Active:      true,
			// Zero-value UserModel.Onboarding (no row data) maps to new-user
			// defaults — displayNextSession true — not the Go zero value.
			Onboarding: domain.UserOnboarding{Version: 0, DisplayNextSession: true, CompletedAt: nil},
			CreatedAt:  mapperFixedTime,
			UpdatedAt:  mapperFixedTime,
		}, got)
	})

	t.Run("nil email and clerk id become empty strings", func(t *testing.T) {
		got := userModelToDomain(&UserModel{ID: 1, Username: "bob", Role: "default", Active: false})
		require.NotNil(t, got)
		assert.Equal(t, "", got.Email)
		assert.Equal(t, "", got.ClerkUserID)
		assert.Equal(t, domain.UserRoleDefault, got.Role)
		assert.False(t, got.Active)
	})
}

func TestUserDomainToModel(t *testing.T) {
	t.Run("nil domain yields nil model", func(t *testing.T) {
		assert.Nil(t, userDomainToModel(nil))
	})

	t.Run("all fields populated, role lowercased, timestamps left to GORM", func(t *testing.T) {
		got := userDomainToModel(&domain.User{
			ID:          7,
			ClerkUserID: "user_abc",
			Username:    "alice",
			Email:       "alice@example.com",
			Role:        domain.UserRoleSentinel,
			Active:      true,
			CreatedAt:   mapperFixedTime,
			UpdatedAt:   mapperFixedTime,
		})
		require.NotNil(t, got)
		assert.Equal(t, 7, got.ID)
		require.NotNil(t, got.ClerkUserID)
		assert.Equal(t, "user_abc", *got.ClerkUserID)
		require.NotNil(t, got.Email)
		assert.Equal(t, "alice@example.com", *got.Email)
		assert.Equal(t, "sentinel", got.Role)
		assert.True(t, got.Active)
		assert.True(t, got.CreatedAt.IsZero(), "CreatedAt must be left for GORM to populate")
		assert.True(t, got.UpdatedAt.IsZero(), "UpdatedAt must be left for GORM to populate")
	})

	t.Run("empty email and clerk id become nil pointers", func(t *testing.T) {
		got := userDomainToModel(&domain.User{ID: 2, Username: "bob", Role: domain.UserRoleDefault})
		require.NotNil(t, got)
		assert.Nil(t, got.Email)
		assert.Nil(t, got.ClerkUserID)
		assert.Equal(t, "default", got.Role)
	})
}

// --- Category ---

func TestCategoryMappers(t *testing.T) {
	assert.Nil(t, categoryModelToDomain(nil))
	assert.Nil(t, categoryDomainToModel(nil))

	model := &CategoryModel{
		ID:          3,
		WikidataQID: "Q42",
		Label:       "Douglas Adams",
		Description: "English author",
		EntityType:  "human",
		CreatedAt:   mapperFixedTime,
		UpdatedAt:   mapperFixedTime,
	}
	gotDomain := categoryModelToDomain(model)
	require.NotNil(t, gotDomain)
	assert.Equal(t, &domain.Category{
		ID:          3,
		WikidataQID: "Q42",
		Label:       "Douglas Adams",
		Description: "English author",
		EntityType:  "human",
		CreatedAt:   mapperFixedTime,
		UpdatedAt:   mapperFixedTime,
	}, gotDomain)

	gotModel := categoryDomainToModel(gotDomain)
	require.NotNil(t, gotModel)
	assert.Equal(t, 3, gotModel.ID)
	assert.Equal(t, "Q42", gotModel.WikidataQID)
	assert.Equal(t, "Douglas Adams", gotModel.Label)
	assert.Equal(t, "English author", gotModel.Description)
	assert.Equal(t, "human", gotModel.EntityType)
	assert.True(t, gotModel.CreatedAt.IsZero(), "CreatedAt must be left for GORM to populate")
	assert.True(t, gotModel.UpdatedAt.IsZero(), "UpdatedAt must be left for GORM to populate")
}

// --- Content ---

func TestContentModelToDomain(t *testing.T) {
	assert.Nil(t, contentModelToDomain(nil))

	got := contentModelToDomain(&ContentModel{
		ID:                11,
		Name:              "Some Video",
		URL:               strPtr("https://youtube.com/watch?v=abc"),
		ContentType:       "youtube",
		AddedByUserID:     4,
		Length:            intPtr(300),
		LengthUnits:       strPtr("seconds"),
		Response:          json.RawMessage(`{"items":[]}`),
		PrimaryCategoryID: intPtr(9),
		CreatedAt:         mapperFixedTime,
		UpdatedAt:         mapperFixedTime,
	})
	require.NotNil(t, got)
	assert.Equal(t, 11, got.ID)
	assert.Equal(t, "Some Video", got.Name)
	assert.Equal(t, domain.ContentTypeYouTube, got.ContentType, "content_type must be uppercased into the domain enum")
	assert.Equal(t, 4, got.AddedByUserID)
	assert.Equal(t, json.RawMessage(`{"items":[]}`), got.Response)
	require.NotNil(t, got.PrimaryCategoryID)
	assert.Equal(t, 9, *got.PrimaryCategoryID)
	assert.Equal(t, mapperFixedTime, got.CreatedAt)
}

func TestContentDomainToModel(t *testing.T) {
	assert.Nil(t, contentDomainToModel(nil))

	got := contentDomainToModel(&domain.Content{
		ID:            11,
		Name:          "Some Video",
		ContentType:   domain.ContentTypeClaim,
		AddedByUserID: 4,
		CreatedAt:     mapperFixedTime,
		UpdatedAt:     mapperFixedTime,
	})
	require.NotNil(t, got)
	assert.Equal(t, "claim", got.ContentType, "content type must be lowercased for storage")
	assert.Nil(t, got.URL)
	assert.Nil(t, got.Length)
	assert.True(t, got.CreatedAt.IsZero(), "CreatedAt must be left for GORM to populate")
	assert.True(t, got.UpdatedAt.IsZero(), "UpdatedAt must be left for GORM to populate")
}

// --- Perspective ---

func TestPerspectiveModelToDomain(t *testing.T) {
	t.Run("nil model yields nil domain", func(t *testing.T) {
		assert.Nil(t, perspectiveModelToDomain(nil))
	})

	t.Run("nil privacy defaults to PUBLIC", func(t *testing.T) {
		got := perspectiveModelToDomain(&PerspectiveModel{ID: 1, UserID: 2})
		require.NotNil(t, got)
		assert.Equal(t, domain.PrivacyPublic, got.Privacy)
		assert.Nil(t, got.ReviewStatus)
		assert.Nil(t, got.Parts)
		assert.Nil(t, got.Labels)
		assert.Nil(t, got.CategorizedRatings)
		assert.Nil(t, got.RelatedPerspectiveIDs)
	})

	t.Run("full model maps every field with case conversion", func(t *testing.T) {
		got := perspectiveModelToDomain(&PerspectiveModel{
			ID:                    5,
			UserID:                2,
			ContentID:             intPtr(11),
			Like:                  strPtr("loved it"),
			Quality:               intPtr(9000),
			Agreement:             intPtr(8000),
			Importance:            intPtr(7000),
			Confidence:            intPtr(6000),
			Privacy:               strPtr("public"),
			Parts:                 Int64Array{1, 2, 3},
			Category:              strPtr("film"),
			Labels:                StringArray{"a", "b"},
			Description:           strPtr("desc"),
			ReviewStatus:          strPtr("approved"),
			CategorizedRatings:    JSONBArray{`{"category":"acting","rating":7}`},
			PrimaryPerspectiveID:  intPtr(4),
			RelatedPerspectiveIDs: Int64Array{10, 20},
			CustomFields:          json.RawMessage(`{"k":"v"}`),
			Review:                strPtr("review text"),
			CreatedAt:             mapperFixedTime,
			UpdatedAt:             mapperFixedTime,
		})
		require.NotNil(t, got)
		assert.Equal(t, domain.PrivacyPublic, got.Privacy)
		require.NotNil(t, got.ReviewStatus)
		assert.Equal(t, domain.ReviewStatusApproved, *got.ReviewStatus)
		assert.Equal(t, []int{1, 2, 3}, got.Parts)
		assert.Equal(t, []string{"a", "b"}, got.Labels)
		assert.Equal(t, []domain.CategorizedRating{{Category: "acting", Rating: 7}}, got.CategorizedRatings)
		require.NotNil(t, got.PrimaryPerspectiveID)
		assert.Equal(t, 4, *got.PrimaryPerspectiveID)
		assert.Equal(t, []int{10, 20}, got.RelatedPerspectiveIDs)
		assert.Equal(t, json.RawMessage(`{"k":"v"}`), got.CustomFields)
		require.NotNil(t, got.Review)
		assert.Equal(t, "review text", *got.Review)
		assert.Equal(t, mapperFixedTime, got.CreatedAt)
	})

	t.Run("invalid categorized rating json is skipped, valid entries survive", func(t *testing.T) {
		got := perspectiveModelToDomain(&PerspectiveModel{
			ID:     6,
			UserID: 2,
			CategorizedRatings: JSONBArray{
				`not json at all`,
				`{"category":"plot","rating":3}`,
			},
		})
		require.NotNil(t, got)
		assert.Equal(t, []domain.CategorizedRating{{Category: "plot", Rating: 3}}, got.CategorizedRatings)
	})
}

func TestPerspectiveDomainToModel(t *testing.T) {
	t.Run("nil domain yields nil model", func(t *testing.T) {
		assert.Nil(t, perspectiveDomainToModel(nil))
	})

	t.Run("privacy is always written as a non-nil lowercase pointer", func(t *testing.T) {
		got := perspectiveDomainToModel(&domain.Perspective{ID: 1, UserID: 2, Privacy: domain.PrivacyPublic})
		require.NotNil(t, got)
		require.NotNil(t, got.Privacy)
		assert.Equal(t, "public", *got.Privacy)

		empty := perspectiveDomainToModel(&domain.Perspective{ID: 1, UserID: 2})
		require.NotNil(t, empty.Privacy, "Privacy pointer is set unconditionally, even for the zero value")
		assert.Equal(t, "", *empty.Privacy)
	})

	t.Run("full domain maps every field with case conversion", func(t *testing.T) {
		rs := domain.ReviewStatusPending
		got := perspectiveDomainToModel(&domain.Perspective{
			ID:                    5,
			UserID:                2,
			ContentID:             intPtr(11),
			Like:                  strPtr("loved it"),
			Quality:               intPtr(9000),
			Agreement:             intPtr(8000),
			Importance:            intPtr(7000),
			Confidence:            intPtr(6000),
			Privacy:               domain.PrivacyPublic,
			Description:           strPtr("desc"),
			Category:              strPtr("film"),
			ReviewStatus:          &rs,
			Parts:                 []int{1, 2, 3},
			Labels:                []string{"a", "b"},
			CategorizedRatings:    []domain.CategorizedRating{{Category: "acting", Rating: 7}},
			PrimaryPerspectiveID:  intPtr(4),
			RelatedPerspectiveIDs: []int{10, 20},
			CustomFields:          json.RawMessage(`{"k":"v"}`),
			Review:                strPtr("review text"),
			CreatedAt:             mapperFixedTime,
			UpdatedAt:             mapperFixedTime,
		})
		require.NotNil(t, got)
		require.NotNil(t, got.ReviewStatus)
		assert.Equal(t, "pending", *got.ReviewStatus)
		assert.Equal(t, Int64Array{1, 2, 3}, got.Parts)
		assert.Equal(t, StringArray{"a", "b"}, got.Labels)
		assert.Equal(t, JSONBArray{`{"category":"acting","rating":7}`}, got.CategorizedRatings)
		assert.Equal(t, Int64Array{10, 20}, got.RelatedPerspectiveIDs)
		assert.Equal(t, json.RawMessage(`{"k":"v"}`), got.CustomFields)
		assert.True(t, got.CreatedAt.IsZero(), "CreatedAt must be left for GORM to populate")
		assert.True(t, got.UpdatedAt.IsZero(), "UpdatedAt must be left for GORM to populate")
	})
}

func TestPerspectiveMappers_RoundTrip(t *testing.T) {
	rs := domain.ReviewStatusRejected
	original := &domain.Perspective{
		ID:                    5,
		UserID:                2,
		ContentID:             intPtr(11),
		Privacy:               domain.PrivacyPublic,
		ReviewStatus:          &rs,
		Parts:                 []int{1, 2},
		Labels:                []string{"x"},
		CategorizedRatings:    []domain.CategorizedRating{{Category: "pace", Rating: 4}},
		RelatedPerspectiveIDs: []int{3},
		CustomFields:          json.RawMessage(`{"a":1}`),
	}

	roundTripped := perspectiveModelToDomain(perspectiveDomainToModel(original))
	require.NotNil(t, roundTripped)

	assert.Equal(t, original.ID, roundTripped.ID)
	assert.Equal(t, original.UserID, roundTripped.UserID)
	assert.Equal(t, original.Privacy, roundTripped.Privacy)
	require.NotNil(t, roundTripped.ReviewStatus)
	assert.Equal(t, *original.ReviewStatus, *roundTripped.ReviewStatus)
	assert.Equal(t, original.Parts, roundTripped.Parts)
	assert.Equal(t, original.Labels, roundTripped.Labels)
	assert.Equal(t, original.CategorizedRatings, roundTripped.CategorizedRatings)
	assert.Equal(t, original.RelatedPerspectiveIDs, roundTripped.RelatedPerspectiveIDs)
}
