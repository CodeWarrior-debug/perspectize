package services_test

import (
	"context"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func intPtrLimits(n int) *int { return &n }

// bigBibleBooks has a single chapter large enough that every ordinal used in
// the limit tests resolves to a real verse.
func bigBibleBooks() []domain.BibleBook {
	return []domain.BibleBook{{ID: 1, Name: "Big", VersesPerChapter: []int{3000}}}
}

func TestListContent_PageSizeBoundaries(t *testing.T) {
	tests := []struct {
		name    string
		first   *int
		last    *int
		wantErr bool
	}{
		{name: "first at lower bound", first: intPtrLimits(1)},
		{name: "first at upper bound", first: intPtrLimits(100)},
		{name: "first below lower bound", first: intPtrLimits(0), wantErr: true},
		{name: "first above upper bound", first: intPtrLimits(101), wantErr: true},
		{name: "last at lower bound", last: intPtrLimits(1)},
		{name: "last at upper bound", last: intPtrLimits(100)},
		{name: "last below lower bound", last: intPtrLimits(0), wantErr: true},
		{name: "last above upper bound", last: intPtrLimits(101), wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil)

			_, err := svc.ListContent(context.Background(), domain.ContentListParams{First: tt.first, Last: tt.last})

			if tt.wantErr {
				assert.ErrorIs(t, err, domain.ErrInvalidInput)
			} else {
				assert.NoError(t, err)
			}
		})
	}
}

func TestSetPassageDisplayTitle_LengthBoundary(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{ID: id, ContentType: domain.ContentTypeBiblePassage}, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, nil)

	t.Run("exactly the max in characters is accepted", func(t *testing.T) {
		// Multi-byte runes: the limit counts characters, not bytes.
		title := strings.Repeat("é", services.MaxPassageDisplayTitleLength)

		got, err := svc.SetPassageDisplayTitle(context.Background(), 1, title)

		require.NoError(t, err)
		require.NotNil(t, got.DisplayTitle)
		assert.Equal(t, title, *got.DisplayTitle)
	})

	t.Run("one character over the max is rejected", func(t *testing.T) {
		title := strings.Repeat("é", services.MaxPassageDisplayTitleLength+1)

		_, err := svc.SetPassageDisplayTitle(context.Background(), 1, title)

		assert.ErrorIs(t, err, domain.ErrInvalidInput)
	})
}

func TestPassageText_RangeBoundaries(t *testing.T) {
	ctx := context.Background()
	texts := make([]domain.BibleVerseText, 3000)
	for i := range texts {
		texts[i] = domain.BibleVerseText{VerseID: i + 1, Text: "v"}
	}
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil,
		services.WithBibleReference(&mockBibleReferenceRepo{books: bigBibleBooks(), texts: texts}))

	t.Run("first verse ordinal is valid", func(t *testing.T) {
		got, err := svc.PassageText(ctx, 1, 1)
		require.NoError(t, err)
		require.Len(t, got.Verses, 1)
		assert.Equal(t, 1, got.Verses[0].VerseID)
	})

	t.Run("exactly the max verse count is allowed", func(t *testing.T) {
		got, err := svc.PassageText(ctx, 1, services.MaxPassageTextVerses)
		require.NoError(t, err)
		assert.Len(t, got.Verses, services.MaxPassageTextVerses)
	})

	t.Run("one verse over the max is rejected", func(t *testing.T) {
		_, err := svc.PassageText(ctx, 1, services.MaxPassageTextVerses+1)
		assert.ErrorIs(t, err, domain.ErrInvalidPassage)
	})

	t.Run("start of zero is rejected", func(t *testing.T) {
		_, err := svc.PassageText(ctx, 0, 1)
		assert.ErrorIs(t, err, domain.ErrInvalidPassage)
	})
}

func TestPassageInterlinear_RangeBoundaries(t *testing.T) {
	ctx := context.Background()
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, nil,
		services.WithBibleReference(&mockBibleReferenceRepo{books: bigBibleBooks()}))

	tests := []struct {
		name       string
		start, end int
		wantErr    bool
	}{
		{name: "first verse ordinal is valid", start: 1, end: 1},
		{name: "exactly the max verse count is allowed", start: 1, end: services.MaxPassageTextVerses},
		{name: "one verse over the max is rejected", start: 1, end: services.MaxPassageTextVerses + 1, wantErr: true},
		{name: "small range at a high ordinal is allowed", start: 2000, end: 2010},
		{name: "max-size window at a high ordinal is allowed", start: 100, end: 100 + services.MaxPassageTextVerses - 1},
		{name: "start of zero is rejected", start: 0, end: 1, wantErr: true},
		{name: "end before start is rejected", start: 5, end: 4, wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := svc.PassageInterlinear(ctx, tt.start, tt.end)

			if tt.wantErr {
				assert.ErrorIs(t, err, domain.ErrInvalidPassage)
				return
			}
			require.NoError(t, err)
			assert.NotNil(t, got)
		})
	}
}
