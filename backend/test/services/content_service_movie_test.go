package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

type mockMovieClient struct {
	getMovieFn func(ctx context.Context, id int) (*portservices.MovieMetadata, error)
	findFn     func(ctx context.Context, imdbID string) (int, error)
	getCalls   int
}

func (m *mockMovieClient) GetMovie(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
	m.getCalls++
	return m.getMovieFn(ctx, id)
}

func (m *mockMovieClient) FindMovieByIMDbID(ctx context.Context, imdbID string) (int, error) {
	return m.findFn(ctx, imdbID)
}

func movieMeta(runtime *int) *portservices.MovieMetadata {
	return &portservices.MovieMetadata{TMDBID: 603, Title: "The Matrix", Response: json.RawMessage(`{"id":603}`), RuntimeSeconds: runtime}
}

func TestCreateFromMovie_Success(t *testing.T) {
	rt := 8160
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		assert.Equal(t, 603, id)
		return movieMeta(&rt), nil
	}}
	var saved *domain.Content
	repo := &mockContentRepository{getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
		assert.True(t, refresh)
		saved = c
		return c, false, nil
	}}
	svc := services.NewContentService(repo, nil, mc)

	got, err := svc.CreateFromMovie(context.Background(), "https://www.themoviedb.org/movie/603-the-matrix", 7)
	require.NoError(t, err)
	assert.Equal(t, domain.ContentTypeMovie, got.ContentType)
	assert.Equal(t, "The Matrix", got.Name)
	assert.Equal(t, 7, saved.AddedByUserID)
	require.NotNil(t, saved.URL)
	assert.Equal(t, "https://www.themoviedb.org/movie/603", *saved.URL)
	require.NotNil(t, saved.Length)
	assert.Equal(t, 8160, *saved.Length)
	require.NotNil(t, saved.LengthUnits)
	assert.Equal(t, "seconds", *saved.LengthUnits)
}

func TestCreateFromMovie_NilRuntime(t *testing.T) {
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return movieMeta(nil), nil
	}}
	svc := services.NewContentService(&mockContentRepository{}, nil, mc)
	got, err := svc.CreateFromMovie(context.Background(), "https://www.themoviedb.org/movie/603", 1)
	require.NoError(t, err)
	assert.Nil(t, got.Length)
	assert.Nil(t, got.LengthUnits)
}

func TestCreateFromMovie_DuplicateSkipsFetch(t *testing.T) {
	existing := &domain.Content{ID: 5, Name: "The Matrix"}
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		t.Fatal("must not fetch metadata for existing movie")
		return nil, nil
	}}
	repo := &mockContentRepository{getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
		assert.Equal(t, "https://www.themoviedb.org/movie/603", url)
		return existing, nil
	}}
	svc := services.NewContentService(repo, nil, mc)
	got, err := svc.CreateFromMovie(context.Background(), "https://www.themoviedb.org/movie/603", 1)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Same(t, existing, got)
}

func TestCreateFromMovie_RepoReportsAlreadyExisted(t *testing.T) {
	existing := &domain.Content{ID: 9}
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return movieMeta(nil), nil
	}}
	repo := &mockContentRepository{getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, r bool) (*domain.Content, bool, error) {
		return existing, true, nil
	}}
	svc := services.NewContentService(repo, nil, mc)
	got, err := svc.CreateFromMovie(context.Background(), "https://www.themoviedb.org/movie/603", 1)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Same(t, existing, got)
}

func TestCreateFromMovie_IMDbResolvedThenDeduped(t *testing.T) {
	existing := &domain.Content{ID: 5}
	mc := &mockMovieClient{
		findFn: func(ctx context.Context, imdbID string) (int, error) {
			assert.Equal(t, "tt0133093", imdbID)
			return 603, nil
		},
		getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
			t.Fatal("must not fetch metadata for existing movie")
			return nil, nil
		},
	}
	repo := &mockContentRepository{getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
		assert.Equal(t, "https://www.themoviedb.org/movie/603", url)
		return existing, nil
	}}
	svc := services.NewContentService(repo, nil, mc)
	got, err := svc.CreateFromMovie(context.Background(), "https://www.imdb.com/title/tt0133093/", 1)
	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Same(t, existing, got)
	assert.Equal(t, 0, mc.getCalls)
}

func TestCreateFromMovie_IMDbNotFound(t *testing.T) {
	mc := &mockMovieClient{findFn: func(ctx context.Context, imdbID string) (int, error) { return 0, domain.ErrNotFound }}
	svc := services.NewContentService(&mockContentRepository{}, nil, mc)
	_, err := svc.CreateFromMovie(context.Background(), "tt0133093", 1)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestCreateFromMovie_InvalidInput(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, &mockMovieClient{})
	_, err := svc.CreateFromMovie(context.Background(), "https://example.com/nope", 1)
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestCreateFromMovie_AdapterErrorIsGeneric(t *testing.T) {
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return nil, errors.New("secret upstream detail Bearer abc")
	}}
	svc := services.NewContentService(&mockContentRepository{}, nil, mc)
	_, err := svc.CreateFromMovie(context.Background(), "https://www.themoviedb.org/movie/603", 1)
	require.Error(t, err)
	assert.Equal(t, "failed to fetch movie metadata", err.Error())
}

func TestCreateFromMovie_AdapterNotFound(t *testing.T) {
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return nil, domain.ErrNotFound
	}}
	svc := services.NewContentService(&mockContentRepository{}, nil, mc)
	_, err := svc.CreateFromMovie(context.Background(), "https://www.themoviedb.org/movie/603", 1)
	assert.ErrorIs(t, err, domain.ErrNotFound)
}

func TestCreateFromMovie_RepoErrorsWrapped(t *testing.T) {
	boom := errors.New("db down")
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return movieMeta(nil), nil
	}}
	repo := &mockContentRepository{getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, r bool) (*domain.Content, bool, error) {
		return nil, false, boom
	}}
	svc := services.NewContentService(repo, nil, mc)
	_, err := svc.CreateFromMovie(context.Background(), "https://www.themoviedb.org/movie/603", 1)
	assert.ErrorIs(t, err, boom)

	repo2 := &mockContentRepository{getByURLFn: func(ctx context.Context, u string) (*domain.Content, error) { return nil, boom }}
	svc2 := services.NewContentService(repo2, nil, mc)
	_, err = svc2.CreateFromMovie(context.Background(), "https://www.themoviedb.org/movie/603", 1)
	assert.ErrorIs(t, err, boom)
}

func TestCreateFromMovie_NilMovieClient(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, nil, nil)
	_, err := svc.CreateFromMovie(context.Background(), "https://www.themoviedb.org/movie/603", 1)
	require.Error(t, err)
	assert.ErrorIs(t, err, services.ErrMovieClientUnavailable)
	assert.NotEqual(t, "failed to fetch movie metadata", err.Error())
}
