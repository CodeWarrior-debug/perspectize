package services_test

import (
	"context"
	"errors"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// Perspective writes that name a content row must not attach a perspective to
// a row the acting user can't see. Not visible answers exactly like missing:
// domain.ErrContentNotFound, which wraps domain.ErrNotFound.

const (
	privacyOwnerID = 7
	privacyOtherID = 8
	privacyClaimID = 3
)

func pvInt(i int) *int       { return &i }
func pvStr(s string) *string { return &s }

// contentFixture returns a content repo whose GetByID serves one row and counts lookups.
func contentFixture(row *domain.Content, lookups *int) *mockContentRepository {
	return &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			*lookups++
			if row == nil || id != row.ID {
				return nil, domain.ErrNotFound
			}
			return row, nil
		},
	}
}

func privateClaim() *domain.Content {
	return &domain.Content{ID: privacyClaimID, ContentType: domain.ContentTypeClaim, AddedByUserID: privacyOwnerID, Privacy: domain.PrivacyPrivate}
}

func publicContent() *domain.Content {
	return &domain.Content{ID: privacyClaimID, ContentType: domain.ContentTypeYouTubeVideo, AddedByUserID: privacyOwnerID, Privacy: domain.PrivacyPublic}
}

func TestPerspectiveCreate_ContentPrivacy(t *testing.T) {
	tests := []struct {
		name        string
		row         *domain.Content
		actor       int
		wantErr     bool
		wantNotFnd  bool
		wantCreated bool
	}{
		{"owner attaches own private claim", privateClaim(), privacyOwnerID, false, false, true},
		{"other user refused for private claim (not found)", privateClaim(), privacyOtherID, true, true, false},
		{"other user may attach public content", publicContent(), privacyOtherID, false, false, true},
		{"missing content is not found", nil, privacyOwnerID, true, true, false},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			lookups := 0
			created := false
			repo := &mockPerspectiveRepository{
				createFn: func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
					created = true
					p.ID = 1
					return p, nil
				},
			}
			svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{},
				services.WithContentRepository(contentFixture(tc.row, &lookups)))

			_, err := svc.Create(context.Background(), portservices.CreatePerspectiveInput{
				UserID:      tc.actor,
				ContentID:   pvInt(privacyClaimID),
				Description: pvStr("a view"),
			})

			assert.Equal(t, 1, lookups, "content is looked up exactly once")
			assert.Equal(t, tc.wantCreated, created, "perspective repo write")
			if tc.wantErr {
				require.Error(t, err)
				assert.Equal(t, tc.wantNotFnd, errors.Is(err, domain.ErrContentNotFound))
				assert.True(t, errors.Is(err, domain.ErrNotFound), "not visible must answer as not found")
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestPerspectiveCreate_AnonymousCannotAttachPrivateContent(t *testing.T) {
	lookups := 0
	created := false
	repo := &mockPerspectiveRepository{
		createFn: func(ctx context.Context, p *domain.Perspective) (*domain.Perspective, error) {
			created = true
			return p, nil
		},
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{},
		services.WithContentRepository(contentFixture(privateClaim(), &lookups)))

	_, err := svc.Create(context.Background(), portservices.CreatePerspectiveInput{
		UserID:      0,
		ContentID:   pvInt(privacyClaimID),
		Description: pvStr("a view"),
	})

	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput), "viewer 0 is rejected before any content lookup")
	assert.False(t, created)
}

func TestPerspectiveCreate_NoContentIDSkipsLookup(t *testing.T) {
	lookups := 0
	repo := &mockPerspectiveRepository{}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{},
		services.WithContentRepository(contentFixture(privateClaim(), &lookups)))

	_, err := svc.Create(context.Background(), portservices.CreatePerspectiveInput{
		UserID:      privacyOtherID,
		Description: pvStr("a view"),
	})

	require.NoError(t, err)
	assert.Equal(t, 0, lookups, "no content id means no content lookup")
}

// Without a content repository configured the check is skipped (tests that
// don't care about content privacy); production always wires one.
func TestPerspectiveCreate_NoContentRepositorySkipsCheck(t *testing.T) {
	repo := &mockPerspectiveRepository{}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{})

	_, err := svc.Create(context.Background(), portservices.CreatePerspectiveInput{
		UserID:      privacyOtherID,
		ContentID:   pvInt(privacyClaimID),
		Description: pvStr("a view"),
	})

	require.NoError(t, err)
}

func TestPerspectiveUpdate_ContentPrivacy(t *testing.T) {
	// The perspective belongs to the actor in every case, so only the content
	// being attached varies.
	ownPerspective := func(actor int) *domain.Perspective {
		return &domain.Perspective{ID: 5, UserID: actor, Privacy: domain.PrivacyPublic}
	}

	tests := []struct {
		name        string
		actor       int
		row         *domain.Content
		wantErr     bool
		wantNotFnd  bool
		wantUpdated bool
	}{
		{"owner attaches own private claim", privacyOwnerID, privateClaim(), false, false, true},
		{"other user's private claim is not found", privacyOtherID, privateClaim(), true, true, false},
		{"other user may attach public content", privacyOtherID, publicContent(), false, false, true},
	}
	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			lookups := 0
			updated := false
			repo := &mockPerspectiveRepository{
				getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
					return ownPerspective(tc.actor), nil
				},
				updateFn: func(ctx context.Context, p *domain.Perspective, ownerUserID int) (*domain.Perspective, error) {
					updated = true
					return p, nil
				},
			}
			svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{},
				services.WithContentRepository(contentFixture(tc.row, &lookups)))

			_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{
				ID:        5,
				ContentID: pvInt(privacyClaimID),
			}, tc.actor)

			assert.Equal(t, 1, lookups, "content is looked up exactly once")
			assert.Equal(t, tc.wantUpdated, updated, "perspective repo write")
			if tc.wantErr {
				require.Error(t, err)
				assert.Equal(t, tc.wantNotFnd, errors.Is(err, domain.ErrContentNotFound))
				assert.True(t, errors.Is(err, domain.ErrNotFound))
			} else {
				require.NoError(t, err)
			}
		})
	}
}

func TestPerspectiveUpdate_AnonymousRefused(t *testing.T) {
	lookups := 0
	updated := false
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return &domain.Perspective{ID: 5, UserID: privacyOwnerID}, nil
		},
		updateFn: func(ctx context.Context, p *domain.Perspective, ownerUserID int) (*domain.Perspective, error) {
			updated = true
			return p, nil
		},
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{},
		services.WithContentRepository(contentFixture(privateClaim(), &lookups)))

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{
		ID:        5,
		ContentID: pvInt(privacyClaimID),
	}, 0)

	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrForbidden))
	assert.False(t, updated)
}

func TestPerspectiveUpdate_NoContentIDSkipsLookup(t *testing.T) {
	lookups := 0
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return &domain.Perspective{ID: 5, UserID: privacyOtherID}, nil
		},
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{},
		services.WithContentRepository(contentFixture(privateClaim(), &lookups)))

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{
		ID:          5,
		Description: pvStr("edited"),
	}, privacyOtherID)

	require.NoError(t, err)
	assert.Equal(t, 0, lookups, "no content id in the update means no content lookup")
}

// Re-sending the content id a perspective already points at is not a change of
// content, so it is not re-checked.
func TestPerspectiveUpdate_UnchangedContentIDSkipsLookup(t *testing.T) {
	lookups := 0
	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return &domain.Perspective{ID: 5, UserID: privacyOtherID, ContentID: pvInt(privacyClaimID)}, nil
		},
	}
	svc := services.NewPerspectiveService(repo, &mockUserRepoForPerspective{},
		services.WithContentRepository(contentFixture(privateClaim(), &lookups)))

	_, err := svc.Update(context.Background(), portservices.UpdatePerspectiveInput{
		ID:        5,
		ContentID: pvInt(privacyClaimID),
	}, privacyOtherID)

	require.NoError(t, err)
	assert.Equal(t, 0, lookups)
}
