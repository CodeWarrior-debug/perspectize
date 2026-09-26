package services_test

import (
	"context"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

func BenchmarkPerspectiveService_GetByID(b *testing.B) {
	perspective := &domain.Perspective{
		ID:      1,
		UserID:  1,
		Privacy: domain.PrivacyPublic,
	}

	repo := &mockPerspectiveRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Perspective, error) {
			return perspective, nil
		},
	}
	userRepo := &mockUserRepoForPerspective{}
	svc := services.NewPerspectiveService(repo, userRepo, nil)
	ctx := context.Background()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		svc.GetByID(ctx, 1)
	}
}

func BenchmarkPerspectiveService_ListPerspectives(b *testing.B) {
	items := make([]*domain.Perspective, 10)
	for i := range items {
		items[i] = &domain.Perspective{
			ID:      i + 1,
			UserID:  1,
			Privacy: domain.PrivacyPublic,
		}
	}
	result := &domain.PaginatedPerspectives{
		Items:   items,
		HasNext: true,
		HasPrev: false,
	}

	repo := &mockPerspectiveRepository{
		listFn: func(ctx context.Context, params domain.PerspectiveListParams) (*domain.PaginatedPerspectives, error) {
			return result, nil
		},
	}
	userRepo := &mockUserRepoForPerspective{}
	svc := services.NewPerspectiveService(repo, userRepo, nil)
	ctx := context.Background()
	first := 10

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		svc.ListPerspectives(ctx, domain.PerspectiveListParams{
			First:     &first,
			SortBy:    domain.PerspectiveSortByCreatedAt,
			SortOrder: domain.SortOrderDesc,
		})
	}
}
