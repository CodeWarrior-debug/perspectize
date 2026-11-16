package main

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

func TestCheckHost(t *testing.T) {
	tests := []struct {
		dsn         string
		allowRemote bool
		wantErr     bool
	}{
		{"postgres://u:p@localhost:5432/db?sslmode=disable", false, false},
		{"postgres://u:p@postgres:5432/db", false, false},
		{"postgres://u@127.0.0.1/db", false, false},
		{"host=localhost user=u dbname=db", false, false},
		{"postgres://u:p@us-east1-001.proxy.sevalla.app:5432/db", false, true},
		{"host=db.example.com user=u", false, true},
		{"postgres://u:p@us-east1-001.proxy.sevalla.app:5432/db", true, false},
	}
	for _, tt := range tests {
		if err := checkHost(tt.dsn, tt.allowRemote); (err != nil) != tt.wantErr {
			t.Errorf("checkHost(%q, %v) err = %v, wantErr %v", tt.dsn, tt.allowRemote, err, tt.wantErr)
		}
	}
}

// recordingContentRepo stands in for the content table. Only Create is
// implemented; any other repository call hits the nil embedded interface and
// panics, which keeps the test honest about what the seeder touches.
type recordingContentRepo struct {
	repositories.ContentRepository
	created []*domain.Content
}

func (r *recordingContentRepo) Create(_ context.Context, c *domain.Content) (*domain.Content, error) {
	row := *c
	row.ID = len(r.created) + 1
	r.created = append(r.created, &row)
	return &row, nil
}

// newClaimSeeder wires the real ContentService over the recording repo.
func newClaimSeeder(repo *recordingContentRepo, exists bool) *seeder {
	return &seeder{
		claims: services.NewContentService(repo, nil, nil),
		claimExists: func(context.Context, int, string) (bool, error) {
			return exists, nil
		},
		userIDs: map[string]int{"alice": 7, "ben": 8, "carmen": 9, "newbie": 10},
	}
}

func TestSeedClaimsCreatesDemoClaimThroughClaimPath(t *testing.T) {
	repo := &recordingContentRepo{}
	s := newClaimSeeder(repo, false)

	if err := s.seedClaims(context.Background()); err != nil {
		t.Fatalf("seedClaims: %v", err)
	}
	if len(repo.created) != 1 {
		t.Fatalf("created %d rows, want 1", len(repo.created))
	}
	got := repo.created[0]
	if got.ContentType != domain.ContentTypeClaim {
		t.Errorf("ContentType = %q, want %q", got.ContentType, domain.ContentTypeClaim)
	}
	if got.Privacy != domain.PrivacyPublic {
		t.Errorf("Privacy = %q, want %q", got.Privacy, domain.PrivacyPublic)
	}
	if got.AddedByUserID != 7 {
		t.Errorf("AddedByUserID = %d, want 7 (alice)", got.AddedByUserID)
	}
	if got.Name != "The glove did not fit O.J. Simpson" {
		t.Errorf("Name = %q", got.Name)
	}
	if want := `{"effectiveDate":"1995-10-03"}`; string(got.CustomFields) != want {
		t.Errorf("CustomFields = %s, want %s", got.CustomFields, want)
	}
	if s.created[2] != 1 {
		t.Errorf("claims counter = %d, want 1", s.created[2])
	}
}

func TestSeedClaimsSkipsClaimThatAlreadyExists(t *testing.T) {
	repo := &recordingContentRepo{}
	s := newClaimSeeder(repo, true)

	if err := s.seedClaims(context.Background()); err != nil {
		t.Fatalf("seedClaims: %v", err)
	}
	if len(repo.created) != 0 {
		t.Errorf("Create called %d times, want 0", len(repo.created))
	}
	if s.created[2] != 0 {
		t.Errorf("claims counter = %d, want 0", s.created[2])
	}
}
