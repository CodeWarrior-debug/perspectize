package repositories

import (
	"context"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// BuildInfoRepository reads the database facts served at GET /version:
// golang-migrate's schema_migrations version/dirty flag (mapped to the
// matching migration filename) and the optional bible_data_version row.
type BuildInfoRepository interface {
	GetDBFacts(ctx context.Context) (domain.DBFacts, error)
}
