package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/tmdb"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
)

// movieRefreshRepo serves one MOVIE row and records what a refresh read and wrote.
// Its UpdateMetadata returns a MOVIE row, so the refreshed type is observable.
func movieRefreshRepo(row *domain.Content, w *metadataWrite) *mockContentRepository {
	return &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			w.getByIDCalls++
			return row, nil
		},
		updateMetadataFn: func(ctx context.Context, id int, name string, response json.RawMessage, length *int, lengthUnits *string, lengthDisplay *domain.LengthDisplay) (*domain.Content, error) {
			w.calls++
			w.id = id
			w.name = name
			w.response = response
			w.length = length
			w.lengthUnits = lengthUnits
			w.lengthDisplay = lengthDisplay
			return &domain.Content{ID: id, Name: name, ContentType: domain.ContentTypeMovie, Response: response, Length: length, LengthUnits: lengthUnits, LengthDisplay: lengthDisplay}, nil
		},
	}
}

// movieRow is a stored TMDB movie (The Matrix) with the given stored length.
func movieRow(length *int) *domain.Content {
	url := "https://www.themoviedb.org/movie/603"
	return &domain.Content{
		ID:            9,
		Name:          "Old Title",
		URL:           &url,
		ContentType:   domain.ContentTypeMovie,
		AddedByUserID: 7,
		Length:        length,
	}
}

// movieMetaWith is the TMDB metadata a refresh receives.
func movieMetaWith(response string, runtime *int) *portservices.MovieMetadata {
	return &portservices.MovieMetadata{TMDBID: 603, Title: "The Matrix", Response: json.RawMessage(response), RuntimeSeconds: runtime}
}

func TestUpdateSourceData_MovieRefreshReplacesTitleResponseAndLength(t *testing.T) {
	stored, rt := 5000, 8160
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		assert.Equal(t, 603, id, "the TMDB id comes from the stored URL")
		return movieMetaWith(`{"id":603,"certification":"R"}`, &rt), nil
	}}
	w := &metadataWrite{}
	svc := services.NewContentService(movieRefreshRepo(movieRow(&stored), w), nil, mc)

	got, err := svc.UpdateSourceData(context.Background(), 9, 7)
	require.NoError(t, err)
	assert.Equal(t, domain.ContentTypeMovie, got.ContentType)
	assert.Equal(t, "The Matrix", got.Name)
	assert.Equal(t, 9, w.id)
	assert.Equal(t, "The Matrix", w.name)
	assert.JSONEq(t, `{"id":603,"certification":"R"}`, string(w.response))
	require.NotNil(t, w.length)
	assert.Equal(t, 8160, *w.length, "runtime is written as seconds, as CreateFromMovie stores it")

	// DB cost: one read, one write.
	assert.Equal(t, 1, w.getByIDCalls)
	assert.Equal(t, 1, w.calls)
}

func TestUpdateSourceData_MovieRefreshLengthRules(t *testing.T) {
	stored, rt := 5000, 8160
	tests := []struct {
		name    string
		stored  *int
		runtime *int
		want    *int
	}{
		{"runtime replaces the stored length", &stored, &rt, &rt},
		{"missing runtime keeps the stored length", &stored, nil, &stored},
		{"missing runtime with nothing stored stays unset", nil, nil, nil},
		{"runtime added to a row without one", nil, &rt, &rt},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
				return movieMetaWith(`{"id":603}`, tt.runtime), nil
			}}
			w := &metadataWrite{}
			svc := services.NewContentService(movieRefreshRepo(movieRow(tt.stored), w), nil, mc)

			_, err := svc.UpdateSourceData(context.Background(), 9, 7)
			require.NoError(t, err)
			assert.Equal(t, tt.want, w.length)
		})
	}
}

// A movie added without a runtime (unreleased titles, say) gets length, units and display
// together once TMDB reports one, exactly as CreateFromMovie sets them.
func TestUpdateSourceData_MovieAddedWithoutRuntimeGetsAllLengthFieldsOnRefresh(t *testing.T) {
	rt := 8160
	row := movieRow(nil)
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return movieMetaWith(`{"id":603}`, &rt), nil
	}}
	w := &metadataWrite{}
	svc := services.NewContentService(movieRefreshRepo(row, w), nil, mc)

	got, err := svc.UpdateSourceData(context.Background(), 9, 7)
	require.NoError(t, err)

	require.NotNil(t, w.length)
	assert.Equal(t, 8160, *w.length)
	require.NotNil(t, w.lengthUnits)
	assert.Equal(t, "seconds", *w.lengthUnits)
	assert.Equal(t, domain.TMDBLengthDisplay(), w.lengthDisplay)

	require.NotNil(t, got.LengthUnits)
	assert.Equal(t, "seconds", *got.LengthUnits)
	assert.Equal(t, domain.TMDBLengthDisplay(), got.LengthDisplay)
	assert.Equal(t, 1, w.calls)
}

// A refresh with no TMDB runtime keeps the stored length, units and display: it passes
// the stored length back and leaves units and display nil, so the repository does not
// touch those columns.
func TestUpdateSourceData_MovieRefreshWithoutRuntimeKeepsStoredLengthFields(t *testing.T) {
	stored := 8160
	units := "seconds"
	row := movieRow(&stored)
	row.LengthUnits = &units
	row.LengthDisplay = domain.TMDBLengthDisplay()
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return movieMetaWith(`{"id":603}`, nil), nil
	}}
	w := &metadataWrite{}
	svc := services.NewContentService(movieRefreshRepo(row, w), nil, mc)

	_, err := svc.UpdateSourceData(context.Background(), 9, 7)
	require.NoError(t, err)

	require.NotNil(t, w.length)
	assert.Equal(t, 8160, *w.length, "the stored length is carried over")
	assert.Nil(t, w.lengthUnits, "units are not rewritten when TMDB reports no runtime")
	assert.Nil(t, w.lengthDisplay, "display is not rewritten when TMDB reports no runtime")
	assert.Equal(t, 1, w.calls)
}

func TestUpdateSourceData_MovieUpstreamErrorIsGenericAndWritesNothing(t *testing.T) {
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return nil, errors.New("secret upstream detail Bearer abc")
	}}
	w := &metadataWrite{}
	svc := services.NewContentService(movieRefreshRepo(movieRow(nil), w), nil, mc)

	got, err := svc.UpdateSourceData(context.Background(), 9, 7)
	assert.Nil(t, got)
	require.Error(t, err)
	assert.Equal(t, "failed to fetch movie metadata", err.Error())
	assert.Equal(t, 0, w.calls, "a failed fetch writes nothing")
}

func TestUpdateSourceData_MovieUpstreamNotFoundWritesNothing(t *testing.T) {
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		return nil, domain.ErrNotFound
	}}
	w := &metadataWrite{}
	svc := services.NewContentService(movieRefreshRepo(movieRow(nil), w), nil, mc)

	got, err := svc.UpdateSourceData(context.Background(), 9, 7)
	assert.Nil(t, got)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.Equal(t, 0, w.calls)
}

func TestUpdateSourceData_MovieNotConfiguredWritesNothing(t *testing.T) {
	tests := []struct {
		name   string
		client portservices.MovieClient
		want   error
	}{
		{"nil movie client", nil, services.ErrMovieClientUnavailable},
		{"unconfigured TMDB client", tmdb.UnconfiguredClient{}, tmdb.ErrNotConfigured},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			w := &metadataWrite{}
			svc := services.NewContentService(movieRefreshRepo(movieRow(nil), w), nil, tt.client)

			got, err := svc.UpdateSourceData(context.Background(), 9, 7)
			assert.Nil(t, got)
			assert.ErrorIs(t, err, tt.want)
			assert.Equal(t, 0, w.calls)
		})
	}
}

// A refreshed payload that is now NC-17 or adult is refused before the write, and
// the stored row is left as it was.
func TestUpdateSourceData_MovieNowDisallowedIsRejectedWithoutWrite(t *testing.T) {
	stored, rt := 5000, 8160
	tests := []struct {
		name     string
		response string
	}{
		{"NC-17 certification", `{"certification":"NC-17"}`},
		{"TMDB adult flag", `{"adult":true}`},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
				return movieMetaWith(tt.response, &rt), nil
			}}
			w := &metadataWrite{}
			svc := services.NewContentService(movieRefreshRepo(movieRow(&stored), w), nil, mc)

			got, err := svc.UpdateSourceData(context.Background(), 9, 7)
			assert.Nil(t, got)
			assert.ErrorIs(t, err, domain.ErrContentNotAllowed)
			assert.Equal(t, 1, w.getByIDCalls, "the row is read to find its URL")
			assert.Equal(t, 0, w.calls, "a disallowed refresh must not write")
		})
	}
}

// A private movie another user cannot see is not-found before any TMDB call.
func TestUpdateSourceData_MovieInvisibleIsNotFoundBeforeFetch(t *testing.T) {
	row := movieRow(nil)
	row.Privacy = domain.PrivacyPrivate
	mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
		t.Fatal("must not fetch metadata for a row the viewer cannot see")
		return nil, nil
	}}
	w := &metadataWrite{}
	svc := services.NewContentService(movieRefreshRepo(row, w), nil, mc)

	got, err := svc.UpdateSourceData(context.Background(), 9, 8)
	assert.Nil(t, got)
	assert.ErrorIs(t, err, domain.ErrNotFound)
	assert.False(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Equal(t, 0, mc.getCalls)
	assert.Equal(t, 0, w.calls)
}

func TestUpdateSourceData_MovieWithoutTMDBURLIsInvalidInput(t *testing.T) {
	tests := []struct {
		name string
		url  *string
	}{
		{"no URL", nil},
		{"non-TMDB URL", movieRefreshURL("https://example.com/nope")},
		{"TMDB URL without an id", movieRefreshURL("https://www.themoviedb.org/movie/")},
		{"IMDb-only URL has no TMDB id to refresh", movieRefreshURL("https://www.imdb.com/title/tt0133093/")},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			row := movieRow(nil)
			row.URL = tt.url
			mc := &mockMovieClient{getMovieFn: func(ctx context.Context, id int) (*portservices.MovieMetadata, error) {
				t.Fatal("a row without a TMDB id must not reach TMDB")
				return nil, nil
			}}
			w := &metadataWrite{}
			svc := services.NewContentService(movieRefreshRepo(row, w), nil, mc)

			got, err := svc.UpdateSourceData(context.Background(), 9, 7)
			assert.Nil(t, got)
			assert.ErrorIs(t, err, domain.ErrInvalidInput)
			assert.Equal(t, 0, mc.getCalls)
			assert.Equal(t, 0, w.calls)
		})
	}
}

func movieRefreshURL(s string) *string { return &s }
