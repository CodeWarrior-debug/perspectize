package resolvers

import (
	"context"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
)

// failingImportService fails the one call Content.importedFrom makes.
type failingImportService struct {
	portservices.ImportService
}

func (failingImportService) GetImportJobsByIDs(context.Context, []int) (map[int]*domain.ImportJob, error) {
	return nil, errors.New("pq: connection refused at 10.0.0.5")
}

// importedFrom is a nullable field: a failed load logs and resolves null, and
// never hands the database error text to the client.
func TestContentImportedFrom_LoadFailureResolvesNullWithoutRawError(t *testing.T) {
	r := &Resolver{ImportService: failingImportService{}}
	jobID := 7

	ref, err := r.Content().ImportedFrom(context.Background(), &model.Content{ID: "1", ImportJobID: &jobID})

	require.NoError(t, err)
	assert.Nil(t, ref)
}
