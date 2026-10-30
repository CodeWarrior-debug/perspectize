package resolvers

// The todo update mapping is where an explicit null from the client becomes a
// clear and an omitted key stays a no-op. These tests pin that split, since a
// mix-up here silently drops a user's edit.

import (
	"testing"
	"time"

	"github.com/99designs/gqlgen/graphql"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func TestModelToUpdateUserTodoInput_OmittedLeavesFieldsAlone(t *testing.T) {
	got, err := modelToUpdateUserTodoInput(model.UpdateUserTodoInput{ID: 3})
	require.NoError(t, err)

	assert.Equal(t, 3, got.ID)
	assert.Nil(t, got.ContentID)
	assert.False(t, got.ClearContentID)
	assert.Nil(t, got.Name)
	assert.False(t, got.ClearName)
	assert.Nil(t, got.Priority)
	assert.False(t, got.ClearPriority)
	assert.Nil(t, got.StartDate)
	assert.False(t, got.ClearStartDate)
	assert.Nil(t, got.EndDate)
	assert.False(t, got.ClearEndDate)
	assert.Nil(t, got.DueDate)
	assert.False(t, got.ClearDueDate)
	assert.Nil(t, got.Comments)
	assert.False(t, got.ClearComments)
	assert.Nil(t, got.ListID)
	assert.False(t, got.ClearListID)
}

func TestModelToUpdateUserTodoInput_ExplicitNullClears(t *testing.T) {
	got, err := modelToUpdateUserTodoInput(model.UpdateUserTodoInput{
		ID:        3,
		ContentID: graphql.OmittableOf[*int](nil),
		Name:      graphql.OmittableOf[*string](nil),
		Priority:  graphql.OmittableOf[*int](nil),
		StartDate: graphql.OmittableOf[*string](nil),
		EndDate:   graphql.OmittableOf[*string](nil),
		DueDate:   graphql.OmittableOf[*string](nil),
		Comments:  graphql.OmittableOf[*string](nil),
		ListID:    graphql.OmittableOf[*int](nil),
	})
	require.NoError(t, err)

	assert.True(t, got.ClearContentID)
	assert.True(t, got.ClearName)
	assert.True(t, got.ClearPriority)
	assert.True(t, got.ClearStartDate)
	assert.True(t, got.ClearEndDate)
	assert.True(t, got.ClearDueDate)
	assert.True(t, got.ClearComments)
	assert.True(t, got.ClearListID)
	assert.Nil(t, got.ContentID)
	assert.Nil(t, got.Priority)
	assert.Nil(t, got.StartDate)
}

func TestModelToUpdateUserTodoInput_ValuesSet(t *testing.T) {
	contentID, priority, listID := 5, 7500, 9
	name, comments, due := "Read it", "<p>later</p>", "2026-11-01"

	got, err := modelToUpdateUserTodoInput(model.UpdateUserTodoInput{
		ID:        3,
		ContentID: graphql.OmittableOf(&contentID),
		Name:      graphql.OmittableOf(&name),
		Priority:  graphql.OmittableOf(&priority),
		Comments:  graphql.OmittableOf(&comments),
		DueDate:   graphql.OmittableOf(&due),
		ListID:    graphql.OmittableOf(&listID),
	})
	require.NoError(t, err)

	assert.False(t, got.ClearContentID)
	require.NotNil(t, got.ContentID)
	assert.Equal(t, 5, *got.ContentID)
	require.NotNil(t, got.Name)
	assert.Equal(t, "Read it", *got.Name)
	require.NotNil(t, got.Priority)
	assert.Equal(t, 7500, *got.Priority)
	require.NotNil(t, got.Comments)
	assert.Equal(t, "<p>later</p>", *got.Comments)
	require.NotNil(t, got.DueDate)
	assert.Equal(t, time.Date(2026, 11, 1, 0, 0, 0, 0, time.UTC), *got.DueDate)
	require.NotNil(t, got.ListID)
	assert.Equal(t, 9, *got.ListID)
}

func TestModelToUpdateUserTodoInput_MalformedDateIsInvalidInput(t *testing.T) {
	bad := "2026-13-45"
	_, err := modelToUpdateUserTodoInput(model.UpdateUserTodoInput{
		ID:        3,
		StartDate: graphql.OmittableOf(&bad),
	})
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestModelToUpdateUserTodoListInput_NullDescriptionClears(t *testing.T) {
	cleared := modelToUpdateUserTodoListInput(model.UpdateUserTodoListInput{
		ID:          5,
		Description: graphql.OmittableOf[*string](nil),
	})
	assert.True(t, cleared.ClearDescription)
	assert.Nil(t, cleared.Description)

	omitted := modelToUpdateUserTodoListInput(model.UpdateUserTodoListInput{ID: 5})
	assert.False(t, omitted.ClearDescription)
	assert.Nil(t, omitted.Description)
}

func TestModelToCreateUserTodoInput_ParsesDates(t *testing.T) {
	start := "2026-10-02"
	got, err := modelToCreateUserTodoInput(model.CreateUserTodoInput{ActionID: 1, StartDate: &start})
	require.NoError(t, err)
	require.NotNil(t, got.StartDate)
	assert.Equal(t, time.Date(2026, 10, 2, 0, 0, 0, 0, time.UTC), *got.StartDate)
	assert.Nil(t, got.EndDate)

	bad := "10/02/2026"
	_, err = modelToCreateUserTodoInput(model.CreateUserTodoInput{ActionID: 1, EndDate: &bad})
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}
