package postgres

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/DATA-DOG/go-sqlmock"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// --- Content List: Sorts vs SortBy/SortOrder selection ---

func TestGormContentRepository_List_SortSelection(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name    string
		params  domain.ContentListParams
		orderRe string
	}{
		{
			name: "no Sorts falls back to SortBy/SortOrder",
			params: domain.ContentListParams{
				SortBy:    domain.ContentSortByName,
				SortOrder: domain.SortOrderAsc,
			},
			orderRe: `ORDER BY .*name.* ASC`,
		},
		{
			name: "Sorts take priority over SortBy/SortOrder",
			params: domain.ContentListParams{
				SortBy:    domain.ContentSortByCreatedAt,
				SortOrder: domain.SortOrderDesc,
				Sorts: []domain.ContentSortRule{
					{Field: domain.ContentSortByName, Order: domain.SortOrderAsc},
				},
			},
			orderRe: `ORDER BY .*name.* ASC`,
		},
		{
			name: "single Sorts entry is honoured (not treated as empty)",
			params: domain.ContentListParams{
				Sorts: []domain.ContentSortRule{
					{Field: domain.ContentSortByName, Order: domain.SortOrderDesc},
				},
			},
			orderRe: `ORDER BY .*name.* DESC`,
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(tt.orderRe).WillReturnRows(contentRows())

			_, err := NewGormContentRepository(db).List(ctx, tt.params)
			require.NoError(t, err)
			assertAllExpectationsMet(t, mock)
		})
	}
}

// --- Perspective FeelingStats: stddev nil threshold ---

func TestGormPerspectiveRepository_FeelingStats_StddevThreshold(t *testing.T) {
	ctx := context.Background()

	tests := []struct {
		name       string
		count      int
		wantStddev bool
	}{
		{"count 0 has no stddev", 0, false},
		{"count 1 has no stddev", 1, false},
		{"count 2 keeps stddev", 2, true},
		{"count 3 keeps stddev", 3, true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			db, mock := newMockDB(t)
			mock.ExpectQuery(`COUNT\(DISTINCT p\.id\)`).
				WillReturnRows(sqlmock.NewRows([]string{"count", "avg_intensity", "stddev_intensity"}).
					AddRow(tt.count, 5000.0, 250.0))
			mock.ExpectQuery(`SELECT count\(\*\) FROM "perspectives"$`).
				WillReturnRows(sqlmock.NewRows([]string{"count"}).AddRow(10))

			got, err := NewGormPerspectiveRepository(db).FeelingStats(ctx, nil, "x", nil)
			require.NoError(t, err)
			if tt.wantStddev {
				require.NotNil(t, got.StdDevIntensity)
				assert.Equal(t, 250.0, *got.StdDevIntensity)
			} else {
				assert.Nil(t, got.StdDevIntensity)
			}
			assertAllExpectationsMet(t, mock)
		})
	}
}

// --- User UpdateByClerkID: empty email binds NULL, non-empty binds the value ---

func TestGormUserRepository_UpdateByClerkID_EmailBinding(t *testing.T) {
	ctx := context.Background()

	t.Run("non-empty email is bound as the value", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "users" SET`).
			WithArgs("a@example.com", sqlmock.AnyArg(), sqlmock.AnyArg(), "user_abc").
			WillReturnResult(sqlmock.NewResult(0, 1))

		require.NoError(t, NewGormUserRepository(db).UpdateByClerkID(ctx, "user_abc", "alice", "a@example.com"))
		assertAllExpectationsMet(t, mock)
	})

	t.Run("empty email is bound as NULL", func(t *testing.T) {
		db, mock := newMockDB(t)
		mock.ExpectExec(`UPDATE "users" SET`).
			WithArgs(nil, sqlmock.AnyArg(), sqlmock.AnyArg(), "user_abc").
			WillReturnResult(sqlmock.NewResult(0, 1))

		require.NoError(t, NewGormUserRepository(db).UpdateByClerkID(ctx, "user_abc", "alice", ""))
		assertAllExpectationsMet(t, mock)
	})
}

// --- Onboarding JSON ---

func TestOnboardingFromJSON_Cases(t *testing.T) {
	done := "2026-01-02T03:04:05Z"
	tests := []struct {
		name string
		raw  json.RawMessage
		want domain.UserOnboarding
	}{
		{"nil", nil, domain.DefaultUserOnboarding()},
		{"empty", json.RawMessage(``), domain.DefaultUserOnboarding()},
		{"null literal", json.RawMessage(`null`), domain.DefaultUserOnboarding()},
		{"empty object", json.RawMessage(`{}`), domain.DefaultUserOnboarding()},
		{"invalid json falls back to default", json.RawMessage(`{not json`), domain.DefaultUserOnboarding()},
		{
			"valid non-default is returned as stored",
			json.RawMessage(`{"version":3,"displayNextSession":false,"completedAt":"2026-01-02T03:04:05Z"}`),
			domain.UserOnboarding{Version: 3, DisplayNextSession: false, CompletedAt: &done},
		},
		{
			"valid partial object keeps zero values rather than defaults",
			json.RawMessage(`{"version":1}`),
			domain.UserOnboarding{Version: 1, DisplayNextSession: false},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, onboardingFromJSON(tt.raw))
		})
	}
}

func TestOnboardingToJSON_PreservesValue(t *testing.T) {
	done := "2026-01-02T03:04:05Z"
	in := domain.UserOnboarding{Version: 7, DisplayNextSession: false, CompletedAt: &done}

	raw := onboardingToJSON(in)

	assert.JSONEq(t, `{"version":7,"displayNextSession":false,"completedAt":"2026-01-02T03:04:05Z"}`, string(raw))
	assert.Equal(t, in, onboardingFromJSON(raw))
}

// --- Perspective mappers: empty vs populated slice fields ---

func TestPerspectiveModelToDomain_SliceFields(t *testing.T) {
	t.Run("empty non-nil slices map to nil", func(t *testing.T) {
		got := perspectiveModelToDomain(&PerspectiveModel{
			Parts:                 Int64Array{},
			Labels:                StringArray{},
			CategorizedRatings:    JSONBArray{},
			Feelings:              JSONBArray{},
			RelatedPerspectiveIDs: Int64Array{},
		})
		assert.Nil(t, got.Parts)
		assert.Nil(t, got.Labels)
		assert.Nil(t, got.CategorizedRatings)
		assert.Nil(t, got.Feelings)
		assert.Nil(t, got.RelatedPerspectiveIDs)
	})

	t.Run("populated slices are all mapped", func(t *testing.T) {
		got := perspectiveModelToDomain(&PerspectiveModel{
			Parts:                 Int64Array{1, 2},
			Labels:                StringArray{"a", "b"},
			CategorizedRatings:    JSONBArray{`{"category":"c","rating":4}`},
			Feelings:              JSONBArray{`{"emoji":"x","label":"Joy","intensity":7}`, `not json`, `{"emoji":"y","label":"Sad","intensity":1}`},
			RelatedPerspectiveIDs: Int64Array{9, 8},
		})
		assert.Equal(t, []int{1, 2}, got.Parts)
		assert.Equal(t, StringArray{"a", "b"}, StringArray(got.Labels))
		require.Len(t, got.CategorizedRatings, 1)
		assert.Equal(t, "c", got.CategorizedRatings[0].Category)
		require.Len(t, got.Feelings, 2, "invalid JSON entries are skipped")
		assert.Equal(t, "x", got.Feelings[0].Emoji)
		assert.Equal(t, "y", got.Feelings[1].Emoji)
		assert.Equal(t, []int{9, 8}, got.RelatedPerspectiveIDs)
	})
}

func TestPerspectiveDomainToModel_SliceFields(t *testing.T) {
	t.Run("empty non-nil slices map to nil", func(t *testing.T) {
		got := perspectiveDomainToModel(&domain.Perspective{
			Parts:                 []int{},
			Labels:                []string{},
			CategorizedRatings:    []domain.CategorizedRating{},
			Feelings:              []domain.FeelingEntry{},
			RelatedPerspectiveIDs: []int{},
		})
		assert.Nil(t, got.Parts)
		assert.Nil(t, got.Labels)
		assert.Nil(t, got.CategorizedRatings)
		assert.Nil(t, got.Feelings)
		assert.Nil(t, got.RelatedPerspectiveIDs)
	})

	t.Run("populated slices are all mapped", func(t *testing.T) {
		got := perspectiveDomainToModel(&domain.Perspective{
			Parts:                 []int{1, 2},
			Labels:                []string{"a", "b"},
			CategorizedRatings:    []domain.CategorizedRating{{Category: "c"}},
			Feelings:              []domain.FeelingEntry{{Emoji: "x"}, {Emoji: "y"}},
			RelatedPerspectiveIDs: []int{9, 8},
		})
		assert.Equal(t, Int64Array{1, 2}, got.Parts)
		assert.Equal(t, []string{"a", "b"}, []string(got.Labels))
		require.Len(t, got.CategorizedRatings, 1)
		assert.Contains(t, got.CategorizedRatings[0], `"c"`)
		require.Len(t, got.Feelings, 2)
		assert.Contains(t, got.Feelings[0], `"x"`)
		assert.Contains(t, got.Feelings[1], `"y"`)
		assert.Equal(t, Int64Array{9, 8}, got.RelatedPerspectiveIDs)
	})
}
