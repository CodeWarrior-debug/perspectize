package services_test

import (
	"context"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// pipelineCase runs one content create through its public method. Every
// importable and every user-created content type appears here, so the
// pipeline's shared behaviour (import stamping, duplicate outcome) is checked
// for each of them.
type pipelineCase struct {
	name   string
	create func(t *testing.T, ctx context.Context, repo *mockContentRepository) (*domain.Content, error)
}

const pipelineExistingID = 99

func pipelineCases() []pipelineCase {
	return []pipelineCase{
		{"youtube", func(t *testing.T, ctx context.Context, repo *mockContentRepository) (*domain.Content, error) {
			svc := services.NewContentService(repo, importTestYouTubeClient(), nil)
			return svc.CreateFromYouTube(ctx, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", 1)
		}},
		{"movie", func(t *testing.T, ctx context.Context, repo *mockContentRepository) (*domain.Content, error) {
			mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
				return movieMeta(nil), nil
			}}
			svc := services.NewContentService(repo, nil, mc)
			return svc.CreateFromMovie(ctx, "https://www.themoviedb.org/movie/603", 1)
		}},
		{"book", func(t *testing.T, ctx context.Context, repo *mockContentRepository) (*domain.Content, error) {
			bs := singleResultSearch(t, "OL23166W", eastOfEden())
			svc := services.NewContentService(repo, nil, nil, services.WithBookSearch(bs))
			return svc.CreateFromBook(ctx, "https://openlibrary.org/works/OL23166W", 1)
		}},
		{"passage", func(t *testing.T, ctx context.Context, repo *mockContentRepository) (*domain.Content, error) {
			svc := services.NewContentService(repo, &mockYouTubeClient{}, nil,
				services.WithBibleReference(&mockBibleReferenceRepo{books: testBibleBooks()}))
			return svc.CreateFromPassage(ctx, portservices.CreatePassageInput{
				BookID: 2, StartChapter: 1, StartVerse: 1, EndChapter: 1, EndVerse: 2, UserID: 1,
			})
		}},
		{"webpage", func(t *testing.T, ctx context.Context, repo *mockContentRepository) (*domain.Content, error) {
			svc := newWebPageService(repo, okSite(t))
			return svc.CreateFromWebPage(ctx, portservices.CreateWebPageInput{URL: "https://example.com/post/1"}, 1)
		}},
		{"website", func(t *testing.T, ctx context.Context, repo *mockContentRepository) (*domain.Content, error) {
			svc := newWebPageService(repo, okSite(t))
			return svc.CreateFromWebsite(ctx, "https://example.com/post/1", 1)
		}},
	}
}

// freshRepo accepts every create and records the row it was given.
func freshRepo(saved **domain.Content) *mockContentRepository {
	return &mockContentRepository{
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			*saved = c
			return c, false, nil
		},
	}
}

// duplicateRepo reports a row that already exists, both when it is found by URL
// before the fetch and when the upsert loses the race.
func duplicateRepo() *mockContentRepository {
	existing := &domain.Content{ID: pipelineExistingID, Name: "saved"}
	return &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) { return existing, nil },
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			return existing, true, nil
		},
	}
}

func TestPipelineStampsImportJobForEveryType(t *testing.T) {
	for _, tc := range pipelineCases() {
		t.Run(tc.name, func(t *testing.T) {
			var saved *domain.Content
			ctx := services.WithImportJobID(context.Background(), 77)
			_, err := tc.create(t, ctx, freshRepo(&saved))
			require.NoError(t, err)
			require.NotNil(t, saved)
			require.NotNil(t, saved.ImportJobID, "a row created under an import records the job")
			assert.Equal(t, 77, *saved.ImportJobID)
		})
	}
}

func TestPipelineLeavesImportJobNullOutsideAnImport(t *testing.T) {
	for _, tc := range pipelineCases() {
		t.Run(tc.name, func(t *testing.T) {
			var saved *domain.Content
			_, err := tc.create(t, context.Background(), freshRepo(&saved))
			require.NoError(t, err)
			require.NotNil(t, saved)
			assert.Nil(t, saved.ImportJobID)
		})
	}
}

func TestPipelineDuplicateReturnsExistingRowWithAlreadyExists(t *testing.T) {
	for _, tc := range pipelineCases() {
		t.Run(tc.name, func(t *testing.T) {
			got, err := tc.create(t, context.Background(), duplicateRepo())
			require.ErrorIs(t, err, domain.ErrAlreadyExists)
			require.NotNil(t, got)
			assert.Equal(t, pipelineExistingID, got.ID)
		})
	}
}
