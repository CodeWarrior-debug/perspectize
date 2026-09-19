package services_test

import (
	"context"
	"encoding/json"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

func BenchmarkContentService_GetByID(b *testing.B) {
	url := "https://youtube.com/watch?v=abc123"
	content := &domain.Content{
		ID:          1,
		Name:        "Benchmark Video",
		URL:         &url,
		ContentType: domain.ContentTypeYouTubeVideo,
	}

	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return content, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{})
	ctx := context.Background()

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		svc.GetByID(ctx, 1)
	}
}

func BenchmarkContentService_ListContent(b *testing.B) {
	items := make([]*domain.Content, 10)
	for i := range items {
		url := "https://youtube.com/watch?v=video" + string(rune('0'+i))
		items[i] = &domain.Content{
			ID:          i + 1,
			Name:        "Video",
			URL:         &url,
			ContentType: domain.ContentTypeYouTubeVideo,
			Response:    json.RawMessage(`{}`),
		}
	}
	result := &domain.PaginatedContent{
		Items:   items,
		HasNext: true,
		HasPrev: false,
	}

	repo := &mockContentRepository{
		listFn: func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
			return result, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{})
	ctx := context.Background()
	first := 10

	b.ResetTimer()
	for i := 0; i < b.N; i++ {
		svc.ListContent(ctx, domain.ContentListParams{
			First:     &first,
			SortBy:    domain.ContentSortByCreatedAt,
			SortOrder: domain.SortOrderDesc,
		})
	}
}
