package assistant

import (
	"context"
	"errors"
	"fmt"
	"sort"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves"
	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves/datacontract"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portrepos "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/repositories"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// memRepo is an in-memory perspective repository. List applies filters and
// RestrictToPublicOrOwner the way the SQL does; the SQL predicate itself is
// covered by the sqlmock test in repositories/postgres. Methods this test
// doesn't need fall through to the nil embedded interface and would panic.
type memRepo struct {
	portrepos.PerspectiveRepository
	rows []*domain.Perspective
}

func (m *memRepo) List(_ context.Context, p domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
	var out []*domain.Perspective
	for _, r := range m.rows {
		if f := p.Filter; f != nil {
			if f.UserID != nil && r.UserID != *f.UserID {
				continue
			}
			if f.ContentID != nil && (r.ContentID == nil || *r.ContentID != *f.ContentID) {
				continue
			}
		}
		if p.RestrictToPublicOrOwner && r.Privacy != domain.PrivacyPublic &&
			(p.ViewerID == nil || r.UserID != *p.ViewerID) {
			continue
		}
		out = append(out, r)
	}
	sort.SliceStable(out, func(i, j int) bool { return out[i].CreatedAt.After(out[j].CreatedAt) })
	if p.First != nil && len(out) > *p.First {
		out = out[:*p.First]
	}
	return &domain.PaginatedPerspectives{Items: out}, nil
}

// stubContent names content "Content <id>".
type stubContent struct{ portservices.ContentService }

func (stubContent) GetByID(_ context.Context, id int) (*domain.Content, error) {
	return &domain.Content{ID: id, Name: fmt.Sprintf("Content %d", id)}, nil
}

func toDomain(rows []datacontract.Row) []*domain.Perspective {
	out := make([]*domain.Perspective, len(rows))
	for i, r := range rows {
		c := r.ContentID
		review := r.Review
		privacy := domain.PrivacyPublic
		if r.Private {
			privacy = domain.PrivacyPrivate
		}
		out[i] = &domain.Perspective{ID: r.ID, UserID: r.OwnerID, ContentID: &c, Privacy: privacy, Review: &review, CreatedAt: r.CreatedAt}
	}
	return out
}

// TestPerspectiveData_Contract runs the shared privacy contract (TOOLS-03)
// against the adapter over the real PerspectiveService.
func TestPerspectiveData_Contract(t *testing.T) {
	datacontract.Run(t, func(_ *testing.T, rows []datacontract.Row) jeeves.PerspectizeData {
		svc := services.NewPerspectiveService(&memRepo{rows: toDomain(rows)}, nil)
		return NewPerspectiveData(svc, stubContent{})
	})
}

// leakyService ignores visibility, standing in for a future service bug.
type leakyService struct {
	portservices.PerspectiveService
	rows []*domain.Perspective
}

func (l leakyService) ListPerspectives(context.Context, domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
	return &domain.PaginatedPerspectives{Items: l.rows}, nil
}

// TestPerspectiveData_DropsPrivateRowsTheServiceLeaks proves the adapter's
// own check: with a service that returns every row, no one else's private
// perspective gets through.
func TestPerspectiveData_DropsPrivateRowsTheServiceLeaks(t *testing.T) {
	rows := toDomain(datacontract.Seed())
	d := NewPerspectiveData(leakyService{rows: rows}, nil)
	got, err := d.ListPerspectives(context.Background(), jeeves.Viewer{UserID: 1}, jeeves.PerspectiveQuery{ContentID: 10})
	require.NoError(t, err)
	require.NotEmpty(t, got)
	for _, p := range got {
		assert.False(t, p.Private && !p.Mine, "perspective %d is someone else's private perspective", p.ID)
	}
}

func TestPerspectiveData_MapsFields(t *testing.T) {
	q, like, review := 8500, "up", "Loved it"
	c := 42
	rows := []*domain.Perspective{{ID: 5, UserID: 3, ContentID: &c, Quality: &q, Like: &like, Review: &review,
		Labels: []string{"film"}, Privacy: domain.PrivacyPublic}}
	svc := services.NewPerspectiveService(&memRepo{rows: rows}, nil)
	got, err := NewPerspectiveData(svc, stubContent{}).ListPerspectives(context.Background(),
		jeeves.Viewer{UserID: 3}, jeeves.PerspectiveQuery{Mine: true})
	require.NoError(t, err)
	require.Len(t, got, 1)
	p := got[0]
	require.NotNil(t, p.Quality)
	assert.InDelta(t, 8.5, *p.Quality, 1e-9, "stored 0-10000 becomes the 0-10 display scale")
	assert.Nil(t, p.Agreement)
	assert.Equal(t, "up", p.Like)
	assert.Equal(t, "Loved it", p.Review)
	assert.Equal(t, 42, p.ContentID)
	assert.Equal(t, "Content 42", p.ContentTitle)
	assert.True(t, p.Mine)
}

func TestPerspectiveData_Errors(t *testing.T) {
	d := NewPerspectiveData(errService{}, nil)
	_, err := d.ListPerspectives(context.Background(), jeeves.Viewer{UserID: 1}, jeeves.PerspectiveQuery{ContentID: 1})
	require.Error(t, err)
	assert.NotContains(t, err.Error(), "db down", "backend error details never reach the model")
	_, err = d.ListPerspectives(context.Background(), jeeves.Viewer{UserID: 1}, jeeves.PerspectiveQuery{})
	assert.Error(t, err, "neither Mine nor a content id")
	got, err := d.ListPerspectives(context.Background(), jeeves.Viewer{}, jeeves.PerspectiveQuery{Mine: true})
	assert.NoError(t, err)
	assert.Empty(t, got, "anonymous has no perspectives of their own")
}

type errService struct {
	portservices.PerspectiveService
}

func (errService) ListPerspectives(context.Context, domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
	return nil, errors.New("db down")
}
