package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func claimIntPtr(v int) *int { return &v }

func TestCreateClaim_NoParent_IsPrivateAndOmitsParent(t *testing.T) {
	var saved *domain.Content
	repo := &mockContentRepository{
		createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
			saved = c
			return c, nil
		},
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			t.Fatalf("GetByID must not be called without a parent")
			return nil, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{})

	got, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
		Text:   "  Water boils at 100C at sea level  ",
		UserID: 7,
	})

	require.NoError(t, err)
	require.NotNil(t, got)
	assert.Equal(t, domain.ContentTypeClaim, saved.ContentType)
	assert.Equal(t, domain.PrivacyPrivate, saved.Privacy)
	assert.Equal(t, 7, saved.AddedByUserID)
	assert.Equal(t, "Water boils at 100C at sea level", saved.Name)

	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(saved.Response, &resp))
	assert.Equal(t, "Water boils at 100C at sea level", resp["text"])
	_, hasParent := resp["parentContentId"]
	assert.False(t, hasParent)
}

func TestCreateClaim_WithParent_RecordsParent(t *testing.T) {
	var saved *domain.Content
	repo := &mockContentRepository{
		createFn: func(ctx context.Context, c *domain.Content) (*domain.Content, error) {
			saved = c
			return c, nil
		},
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			assert.Equal(t, 3, id)
			return &domain.Content{ID: 3}, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{})

	_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
		Text: "A claim about it", UserID: 7, ParentContentID: claimIntPtr(3),
	})

	require.NoError(t, err)
	var resp map[string]interface{}
	require.NoError(t, json.Unmarshal(saved.Response, &resp))
	assert.EqualValues(t, 3, resp["parentContentId"])
	assert.Equal(t, domain.PrivacyPrivate, saved.Privacy)
}

func TestCreateClaim_MissingParent_NotFound(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{})

	_, err := svc.CreateClaim(context.Background(), portservices.CreateClaimInput{
		Text: "A claim", UserID: 7, ParentContentID: claimIntPtr(99),
	})

	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestCreateClaim_InvalidInput(t *testing.T) {
	tests := []struct {
		name  string
		input portservices.CreateClaimInput
	}{
		{"empty text", portservices.CreateClaimInput{Text: "   ", UserID: 7}},
		{"no user", portservices.CreateClaimInput{Text: "A claim"}},
		{"non-positive parent", portservices.CreateClaimInput{Text: "A claim", UserID: 7, ParentContentID: claimIntPtr(0)}},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{})
			_, err := svc.CreateClaim(context.Background(), tt.input)
			assert.True(t, errors.Is(err, domain.ErrInvalidInput))
		})
	}
}
