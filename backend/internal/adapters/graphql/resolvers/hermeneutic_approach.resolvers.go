package resolvers

// Hermeneutic approach resolver: the read-only lookup list backing the
// hermeneutic field on a BIBLE_PASSAGE perspective. See perspective.resolvers.go
// for why this survives `make graphql-gen`.

import (
	"context"
	"fmt"
	"log/slog"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
)

// HermeneuticApproaches is the resolver for the hermeneuticApproaches field.
func (r *queryResolver) HermeneuticApproaches(ctx context.Context) ([]*model.HermeneuticApproach, error) {
	approaches, err := r.HermeneuticApproachService.ListAll(ctx)
	if err != nil {
		slog.Error("listing hermeneutic approaches failed", "error", err)
		return nil, fmt.Errorf("failed to list hermeneutic approaches")
	}

	result := make([]*model.HermeneuticApproach, len(approaches))
	for i, a := range approaches {
		result[i] = hermeneuticApproachDomainToModel(a)
	}
	return result, nil
}
