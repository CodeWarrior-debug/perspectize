package postgres

import (
	"context"
	"fmt"
	"os"
	"path/filepath"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"gorm.io/gorm"
)

// migrationsDirCandidates covers where the backend can find its own
// /migrations directory: the Dockerfile COPYs it to the image root, while
// `make dev`/`make run` and CI both run with the process cwd at backend/.
var migrationsDirCandidates = []string{"/migrations", "migrations"}

// GormBuildInfoRepository reads schema_migrations and, when present,
// bible_data_version, for the /version endpoint.
type GormBuildInfoRepository struct {
	db            *gorm.DB
	migrationsDir string
}

var _ repositories.BuildInfoRepository = (*GormBuildInfoRepository)(nil)

// NewGormBuildInfoRepository creates a new build-info repository. It picks
// the first existing directory from migrationsDirCandidates; if none exist,
// migration filename lookups simply come back empty rather than failing.
func NewGormBuildInfoRepository(db *gorm.DB) *GormBuildInfoRepository {
	dir := ""
	for _, candidate := range migrationsDirCandidates {
		if info, err := os.Stat(candidate); err == nil && info.IsDir() {
			dir = candidate
			break
		}
	}
	return &GormBuildInfoRepository{db: db, migrationsDir: dir}
}

// GetDBFacts reads the current migration version/dirty flag and, if the
// table exists and has a row, the seeded bible data version. A missing or
// empty bible_data_version table is not an error — it's skipped quietly,
// since not every environment runs cmd/seed-bible.
func (r *GormBuildInfoRepository) GetDBFacts(ctx context.Context) (domain.DBFacts, error) {
	var facts domain.DBFacts

	var migration struct {
		Version uint64
		Dirty   bool
	}
	if err := r.db.WithContext(ctx).Raw("SELECT version, dirty FROM schema_migrations LIMIT 1").
		Scan(&migration).Error; err != nil {
		return facts, fmt.Errorf("read schema_migrations: %w", err)
	}
	facts.MigrationVersion = migration.Version
	facts.Dirty = migration.Dirty
	facts.MigrationFile = findMigrationFile(r.migrationsDir, migration.Version)

	var bibleData struct {
		ManifestVersion int
		LoadedAt        time.Time
	}
	err := r.db.WithContext(ctx).
		Raw("SELECT manifest_version, loaded_at FROM bible_data_version WHERE id = 1").
		Scan(&bibleData).Error
	if err == nil && !bibleData.LoadedAt.IsZero() {
		facts.BibleData = &domain.BibleDataVersion{
			ManifestVersion: bibleData.ManifestVersion,
			LoadedAt:        bibleData.LoadedAt,
		}
	}

	return facts, nil
}

// findMigrationFile returns the up-migration filename for version in dir
// (e.g. "000027_add_category_wikipedia_url.up.sql"), or "" if dir is unset
// or no matching file exists.
func findMigrationFile(dir string, version uint64) string {
	if dir == "" {
		return ""
	}
	matches, err := filepath.Glob(filepath.Join(dir, fmt.Sprintf("%06d_*.up.sql", version)))
	if err != nil || len(matches) == 0 {
		return ""
	}
	return filepath.Base(matches[0])
}
