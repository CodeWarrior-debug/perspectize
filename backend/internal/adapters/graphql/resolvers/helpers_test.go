package resolvers

import (
	"testing"

	"github.com/99designs/gqlgen/graphql"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Gap #2 in the UI gap audit: gqlgen only tells "omitted" and "explicit null"
// apart when a field is declared omittable (graphql.Omittable[T]) — these
// tests prove modelToUpdatePerspectiveInput reads that tri-state correctly
// and turns it into the ClearX flags perspective_service.go's Update() acts
// on. Internal (package resolvers, not resolvers_test) because
// modelToUpdatePerspectiveInput and omittablePtr are unexported.

func TestOmittablePtr(t *testing.T) {
	t.Run("unset -> nil value, not cleared", func(t *testing.T) {
		v, clear := omittablePtr(graphql.Omittable[*int]{})
		assert.Nil(t, v)
		assert.False(t, clear)
	})

	t.Run("explicit null -> nil value, cleared", func(t *testing.T) {
		v, clear := omittablePtr(graphql.OmittableOf[*int](nil))
		assert.Nil(t, v)
		assert.True(t, clear)
	})

	t.Run("a value -> that value, not cleared", func(t *testing.T) {
		n := 5000
		v, clear := omittablePtr(graphql.OmittableOf(&n))
		require.NotNil(t, v)
		assert.Equal(t, 5000, *v)
		assert.False(t, clear)
	})
}

func TestModelToUpdatePerspectiveInput(t *testing.T) {
	t.Run("omitted quality leaves value nil and Clear false", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{ID: 1})
		assert.Nil(t, out.Quality)
		assert.False(t, out.ClearQuality)
	})

	t.Run("explicit null quality sets Clear true", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{
			ID:      1,
			Quality: graphql.OmittableOf[*int](nil),
		})
		assert.Nil(t, out.Quality)
		assert.True(t, out.ClearQuality)
	})

	t.Run("a provided quality is passed through with Clear false", func(t *testing.T) {
		n := 7500
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{
			ID:      1,
			Quality: graphql.OmittableOf(&n),
		})
		require.NotNil(t, out.Quality)
		assert.Equal(t, 7500, *out.Quality)
		assert.False(t, out.ClearQuality)
	})

	t.Run("every rating field maps independently", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{
			ID:         1,
			Agreement:  graphql.OmittableOf[*int](nil),
			Importance: graphql.OmittableOf[*int](nil),
			Confidence: graphql.OmittableOf[*int](nil),
		})
		assert.True(t, out.ClearAgreement)
		assert.True(t, out.ClearImportance)
		assert.True(t, out.ClearConfidence)
		assert.False(t, out.ClearQuality) // untouched in this input
	})

	t.Run("explicit null like sets ClearLike", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{
			ID:   1,
			Like: graphql.OmittableOf[*string](nil),
		})
		assert.Nil(t, out.Like)
		assert.True(t, out.ClearLike)
	})

	t.Run("explicit null review sets ClearReview", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{
			ID:     1,
			Review: graphql.OmittableOf[*string](nil),
		})
		assert.True(t, out.ClearReview)
	})

	t.Run("an empty feelings list clears rather than sets an empty slice", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{
			ID:       1,
			Feelings: graphql.OmittableOf([]*model.FeelingInput{}),
		})
		assert.True(t, out.ClearFeelings)
		assert.Nil(t, out.Feelings)
	})

	t.Run("a non-empty feelings list maps to domain entries, not cleared", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{
			ID:       1,
			Feelings: graphql.OmittableOf([]*model.FeelingInput{{Emoji: "😀", Intensity: 3}}),
		})
		assert.False(t, out.ClearFeelings)
		require.Len(t, out.Feelings, 1)
		assert.Equal(t, "😀", out.Feelings[0].Emoji)
	})

	t.Run("omitted feelings leaves both value and Clear untouched", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{ID: 1})
		assert.False(t, out.ClearFeelings)
		assert.Nil(t, out.Feelings)
	})

	t.Run("an empty customFields object clears rather than sets {}", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{
			ID:           1,
			CustomFields: graphql.OmittableOf(map[string]any{}),
		})
		assert.True(t, out.ClearCustomFields)
		assert.Nil(t, out.CustomFields)
	})

	t.Run("explicit null customFields also clears", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{
			ID:           1,
			CustomFields: graphql.OmittableOf[map[string]any](nil),
		})
		assert.True(t, out.ClearCustomFields)
	})

	t.Run("a non-empty customFields object marshals to JSON, not cleared", func(t *testing.T) {
		out := modelToUpdatePerspectiveInput(model.UpdatePerspectiveInput{
			ID:           1,
			CustomFields: graphql.OmittableOf(map[string]any{"depth": float64(8000)}),
		})
		assert.False(t, out.ClearCustomFields)
		assert.JSONEq(t, `{"depth":8000}`, string(out.CustomFields))
	})
}
