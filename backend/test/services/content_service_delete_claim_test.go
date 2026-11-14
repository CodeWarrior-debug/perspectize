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

func TestDeleteClaim_OwnerDeletesWhenNoOneElseEngaged(t *testing.T) {
	var gotID, gotOwner int
	repo := &mockContentRepository{
		deleteClaimFn: func(ctx context.Context, id, ownerID int) error {
			gotID, gotOwner = id, ownerID
			return nil
		},
		anonymizeClaimFn: func(ctx context.Context, id, ownerID int) error {
			t.Fatal("anonymize must not run for a plain delete")
			return nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	err := svc.DeleteClaim(context.Background(), portservices.DeleteClaimInput{ContentID: 5, ActorUserID: 7})

	require.NoError(t, err)
	assert.Equal(t, 5, gotID)
	assert.Equal(t, 7, gotOwner)
}

func TestDeleteClaim_KeepAnonymousReassignsInsteadOfDeleting(t *testing.T) {
	var gotID, gotOwner int
	repo := &mockContentRepository{
		deleteClaimFn: func(ctx context.Context, id, ownerID int) error {
			t.Fatal("delete must not run when keeping the claim anonymous")
			return nil
		},
		anonymizeClaimFn: func(ctx context.Context, id, ownerID int) error {
			gotID, gotOwner = id, ownerID
			return nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	err := svc.DeleteClaim(context.Background(), portservices.DeleteClaimInput{
		ContentID: 5, ActorUserID: 7, KeepAnonymous: true,
	})

	require.NoError(t, err)
	assert.Equal(t, 5, gotID)
	assert.Equal(t, 7, gotOwner)
}

func TestDeleteClaim_BlockedByOthersIsReportedAsSuch(t *testing.T) {
	repo := &mockContentRepository{
		deleteClaimFn: func(ctx context.Context, id, ownerID int) error {
			return domain.ErrClaimHasOthers
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	err := svc.DeleteClaim(context.Background(), portservices.DeleteClaimInput{ContentID: 5, ActorUserID: 7})

	require.ErrorIs(t, err, domain.ErrClaimHasOthers)
}

func TestDeleteClaim_NotOwnedIsNotFound(t *testing.T) {
	repo := &mockContentRepository{
		deleteClaimFn: func(ctx context.Context, id, ownerID int) error {
			return domain.ErrNotFound
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	err := svc.DeleteClaim(context.Background(), portservices.DeleteClaimInput{ContentID: 5, ActorUserID: 9})

	require.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestDeleteClaim_InvalidIDsNeverReachRepo(t *testing.T) {
	tests := []struct {
		name  string
		input portservices.DeleteClaimInput
	}{
		{"zero content id", portservices.DeleteClaimInput{ContentID: 0, ActorUserID: 7}},
		{"zero actor id", portservices.DeleteClaimInput{ContentID: 5, ActorUserID: 0}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			repo := &mockContentRepository{
				deleteClaimFn: func(ctx context.Context, id, ownerID int) error {
					t.Fatal("repo must not be called for invalid input")
					return nil
				},
			}
			svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

			err := svc.DeleteClaim(context.Background(), tt.input)

			require.ErrorIs(t, err, domain.ErrInvalidInput)
		})
	}
}
