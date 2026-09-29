// Package handlers holds small, dependency-free HTTP handlers wired
// directly in cmd/server/main.go, alongside /health and /ready.
package handlers

import (
	"context"
	"encoding/json"
	"net/http"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

// buildInfoGetter is the slice of *services.BuildInfoService this handler
// needs, kept as a local interface so the handler test doesn't have to wire
// a real repository/database.
type buildInfoGetter interface {
	Get(ctx context.Context) domain.BuildInfo
}

// dbFactsTimeout bounds the live schema_migrations/bible_data_version
// lookup so a slow database can't hang the unauthenticated /version route.
const dbFactsTimeout = 3 * time.Second

type versionResponse struct {
	Commit    string          `json:"commit"`
	Branch    string          `json:"branch"`
	Tag       string          `json:"tag"`
	StartedAt time.Time       `json:"startedAt"`
	DB        dbFactsResponse `json:"db"`
}

type dbFactsResponse struct {
	MigrationVersion uint64             `json:"migrationVersion"`
	Dirty            bool               `json:"dirty"`
	MigrationFile    string             `json:"migrationFile,omitempty"`
	BibleData        *bibleDataResponse `json:"bibleData,omitempty"`
}

type bibleDataResponse struct {
	ManifestVersion int       `json:"manifestVersion"`
	LoadedAt        time.Time `json:"loadedAt"`
}

// Version returns a GET handler for /version: unauthenticated, like
// /health and /ready. It deliberately never includes the Postgres server
// version string, the DSN, or any host information (see .docs/SECURITY.md).
func Version(svc buildInfoGetter) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		ctx, cancel := context.WithTimeout(r.Context(), dbFactsTimeout)
		defer cancel()

		info := svc.Get(ctx)

		resp := versionResponse{
			Commit:    info.Commit,
			Branch:    info.Branch,
			Tag:       info.Tag,
			StartedAt: info.StartedAt,
			DB: dbFactsResponse{
				MigrationVersion: info.DB.MigrationVersion,
				Dirty:            info.DB.Dirty,
				MigrationFile:    info.DB.MigrationFile,
			},
		}
		if info.DB.BibleData != nil {
			resp.DB.BibleData = &bibleDataResponse{
				ManifestVersion: info.DB.BibleData.ManifestVersion,
				LoadedAt:        info.DB.BibleData.LoadedAt,
			}
		}

		w.Header().Set("Content-Type", "application/json")
		_ = json.NewEncoder(w).Encode(resp)
	}
}
