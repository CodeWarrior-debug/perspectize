package directives_test

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Typed-input structs whose id field is not the first one, or is absent,
// exercise the field-scan loop in fieldByJSONTag (via Owner -> extractResourceID).

func TestOwner_TypedInput_IDIsNotFirstField(t *testing.T) {
	type input struct {
		Name string `json:"name"`
		ID   int    `json:"id"`
	}
	mockPersp := &mockPerspectiveService{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			assert.Equal(t, 7, id)
			return &domain.Perspective{ID: 7, UserID: 42}, nil
		},
	}
	d := directives.NewDirectiveRoot(nil, mockPersp)

	ctx := withUserID(context.Background(), 42)
	ctx = withFieldContext(ctx, "updatePerspective", map[string]interface{}{
		"input": input{Name: "x", ID: 7},
	})

	result, err := d.Owner(ctx, nil, successResolver, "id")
	require.NoError(t, err)
	assert.Equal(t, "success", result)
}

func TestOwner_TypedInput_WithoutIDFieldIsMissingArg(t *testing.T) {
	type input struct {
		Name  string `json:"name"`
		Other int    `json:"other,omitempty"`
	}
	d := directives.NewDirectiveRoot(nil, nil)

	ctx := withUserID(context.Background(), 42)
	ctx = withFieldContext(ctx, "updatePerspective", map[string]interface{}{
		"input": input{Name: "x", Other: 3},
	})

	_, err := d.Owner(ctx, nil, successResolver, "id")
	require.Error(t, err)
	assert.Contains(t, err.Error(), "missing id argument")
}
