package services_test

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	portservices "github.com/CodeWarrior-debug/perspectize/backend/internal/core/ports/services"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// mockContentRepository implements repositories.ContentRepository for testing
type mockContentRepository struct {
	createFn           func(ctx context.Context, content *domain.Content) (*domain.Content, error)
	getByIDFn          func(ctx context.Context, id int) (*domain.Content, error)
	getByURLFn         func(ctx context.Context, url string) (*domain.Content, error)
	getOrCreateByURLFn func(ctx context.Context, content *domain.Content, refreshOnConflict bool) (*domain.Content, bool, error)
	updateMetadataFn   func(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error)
	listFn             func(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error)
}

func (m *mockContentRepository) Create(ctx context.Context, content *domain.Content) (*domain.Content, error) {
	if m.createFn != nil {
		return m.createFn(ctx, content)
	}
	return content, nil
}

func (m *mockContentRepository) GetByID(ctx context.Context, id int) (*domain.Content, error) {
	if m.getByIDFn != nil {
		return m.getByIDFn(ctx, id)
	}
	return nil, domain.ErrNotFound
}

func (m *mockContentRepository) GetByURL(ctx context.Context, url string) (*domain.Content, error) {
	if m.getByURLFn != nil {
		return m.getByURLFn(ctx, url)
	}
	return nil, domain.ErrNotFound
}

func (m *mockContentRepository) GetOrCreateByURL(ctx context.Context, content *domain.Content, refreshOnConflict bool) (*domain.Content, bool, error) {
	if m.getOrCreateByURLFn != nil {
		return m.getOrCreateByURLFn(ctx, content, refreshOnConflict)
	}
	return content, false, nil
}

func (m *mockContentRepository) UpdateMetadata(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error) {
	if m.updateMetadataFn != nil {
		return m.updateMetadataFn(ctx, id, name, response, length)
	}
	return nil, domain.ErrNotFound
}

func (m *mockContentRepository) List(ctx context.Context, params domain.ContentListParams) (*domain.PaginatedContent, error) {
	if m.listFn != nil {
		return m.listFn(ctx, params)
	}
	return &domain.PaginatedContent{Items: []*domain.Content{}}, nil
}

func (m *mockContentRepository) ReassignByUser(ctx context.Context, fromUserID, toUserID int) error {
	return nil
}

func (m *mockContentRepository) UpdatePrimaryCategoryID(ctx context.Context, contentID int, categoryID *int) error {
	return nil
}

// mockYouTubeClient implements services.YouTubeClient for testing
type mockYouTubeClient struct {
	getVideoMetadataFn func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error)
	extractVideoIDFn   func(url string) (string, error)
}

func (m *mockYouTubeClient) GetVideoMetadata(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
	if m.getVideoMetadataFn != nil {
		return m.getVideoMetadataFn(ctx, videoID)
	}
	return nil, fmt.Errorf("not implemented")
}

func (m *mockYouTubeClient) ExtractVideoID(url string) (string, error) {
	if m.extractVideoIDFn != nil {
		return m.extractVideoIDFn(url)
	}
	return "", fmt.Errorf("could not extract video ID")
}

// --- GetByID Tests ---

func TestGetByID_Success(t *testing.T) {
	url := "https://youtube.com/watch?v=abc123"
	expected := &domain.Content{
		ID:          1,
		Name:        "Test Video",
		URL:         &url,
		ContentType: domain.ContentTypeYouTube,
	}

	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			assert.Equal(t, 1, id)
			return expected, nil
		},
	}

	svc := services.NewContentService(repo, &mockYouTubeClient{})
	result, err := svc.GetByID(context.Background(), 1)

	require.NoError(t, err)
	assert.Equal(t, expected, result)
}

func TestGetByID_NotFound(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
	}

	svc := services.NewContentService(repo, &mockYouTubeClient{})
	result, err := svc.GetByID(context.Background(), 999)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestGetByID_InvalidID_Zero(t *testing.T) {
	repo := &mockContentRepository{}
	svc := services.NewContentService(repo, &mockYouTubeClient{})

	result, err := svc.GetByID(context.Background(), 0)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
	assert.Contains(t, err.Error(), "content id must be a positive integer")
}

func TestGetByID_InvalidID_Negative(t *testing.T) {
	repo := &mockContentRepository{}
	svc := services.NewContentService(repo, &mockYouTubeClient{})

	result, err := svc.GetByID(context.Background(), -5)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestGetByID_RepositoryError(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return nil, fmt.Errorf("database connection failed")
		},
	}

	svc := services.NewContentService(repo, &mockYouTubeClient{})
	result, err := svc.GetByID(context.Background(), 1)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to get content")
}

// --- CreateFromYouTube Tests ---

func TestCreateFromYouTube_Success(t *testing.T) {
	canonicalURL := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	metadata := &portservices.VideoMetadata{
		Title:       "Test Video Title",
		Description: "A great video",
		Duration:    300,
		ChannelName: "Test Channel",
		Response:    json.RawMessage(`{"items":[]}`),
	}

	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			// Called with canonical URL — not found yet
			assert.Equal(t, canonicalURL, url)
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(ctx context.Context, content *domain.Content, refreshOnConflict bool) (*domain.Content, bool, error) {
			content.ID = 1
			return content, false, nil
		},
	}

	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(url string) (string, error) {
			return "dQw4w9WgXcQ", nil
		},
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			assert.Equal(t, "dQw4w9WgXcQ", videoID)
			return metadata, nil
		},
	}

	svc := services.NewContentService(repo, ytClient)

	result, err := svc.CreateFromYouTube(context.Background(), "https://youtu.be/dQw4w9WgXcQ", 42)

	require.NoError(t, err)
	assert.Equal(t, 1, result.ID)
	assert.Equal(t, "Test Video Title", result.Name)
	assert.Equal(t, domain.ContentTypeYouTube, result.ContentType)
	// URL stored is the canonical form, not the input URL
	assert.Equal(t, &canonicalURL, result.URL)
	assert.Equal(t, 42, result.AddedByUserID)
	require.NotNil(t, result.Length)
	assert.Equal(t, 300, *result.Length)
	require.NotNil(t, result.LengthUnits)
	assert.Equal(t, "seconds", *result.LengthUnits)
}

func TestCreateFromYouTube_ReturnExistingOnDuplicate(t *testing.T) {
	canonicalURL := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	existing := &domain.Content{
		ID:   1,
		Name: "Existing Video",
		URL:  &canonicalURL,
	}

	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			// Called with canonical URL — content already exists
			assert.Equal(t, canonicalURL, url)
			return existing, nil
		},
	}

	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(url string) (string, error) {
			return "dQw4w9WgXcQ", nil
		},
	}

	svc := services.NewContentService(repo, ytClient)

	result, err := svc.CreateFromYouTube(context.Background(), canonicalURL, 1)

	// Returns content (not nil) AND ErrAlreadyExists
	require.NotNil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrAlreadyExists))
	assert.Equal(t, "Existing Video", result.Name)
	assert.Equal(t, 1, result.ID)
}

func TestCreateFromYouTube_NormalizesURLVariants(t *testing.T) {
	canonicalURL := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	var capturedURL string

	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			capturedURL = url
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(ctx context.Context, content *domain.Content, refreshOnConflict bool) (*domain.Content, bool, error) {
			content.ID = 1
			return content, false, nil
		},
	}

	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(url string) (string, error) {
			return "dQw4w9WgXcQ", nil
		},
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			return &portservices.VideoMetadata{
				Title:    "Video",
				Duration: 60,
				Response: json.RawMessage(`{}`),
			}, nil
		},
	}

	svc := services.NewContentService(repo, ytClient)

	// Submit a youtu.be variant with ?si= param — should resolve to canonical
	_, err := svc.CreateFromYouTube(context.Background(), "https://youtu.be/dQw4w9WgXcQ?si=abc", 1)

	require.NoError(t, err)
	// GetByURL must be called with the canonical URL, not the raw input
	assert.Equal(t, canonicalURL, capturedURL)
}

func TestCreateFromYouTube_InvalidURL(t *testing.T) {
	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(url string) (string, error) {
			return "", fmt.Errorf("could not extract video ID")
		},
	}

	svc := services.NewContentService(&mockContentRepository{}, ytClient)

	result, err := svc.CreateFromYouTube(context.Background(), "not-a-valid-url", 1)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidURL))
}

func TestCreateFromYouTube_YouTubeAPIError(t *testing.T) {
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
	}

	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(url string) (string, error) {
			return "abc123", nil
		},
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			return nil, fmt.Errorf("%w: status 403", domain.ErrYouTubeAPI)
		},
	}

	svc := services.NewContentService(repo, ytClient)

	result, err := svc.CreateFromYouTube(context.Background(), "https://youtube.com/watch?v=abc123", 1)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to fetch video metadata")
}

func TestCreateFromYouTube_RepositoryCreateError(t *testing.T) {
	metadata := &portservices.VideoMetadata{
		Title:    "Video",
		Duration: 60,
		Response: json.RawMessage(`{}`),
	}

	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
		getOrCreateByURLFn: func(ctx context.Context, content *domain.Content, refreshOnConflict bool) (*domain.Content, bool, error) {
			return nil, false, fmt.Errorf("database write error")
		},
	}

	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(url string) (string, error) {
			return "abc123", nil
		},
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			return metadata, nil
		},
	}

	svc := services.NewContentService(repo, ytClient)

	result, err := svc.CreateFromYouTube(context.Background(), "https://youtube.com/watch?v=abc123", 1)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to save content")
}

func TestCreateFromYouTube_GetByURLUnexpectedError(t *testing.T) {
	repo := &mockContentRepository{
		getByURLFn: func(ctx context.Context, url string) (*domain.Content, error) {
			return nil, fmt.Errorf("unexpected database error")
		},
	}

	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(url string) (string, error) {
			return "abc123", nil
		},
	}

	svc := services.NewContentService(repo, ytClient)

	result, err := svc.CreateFromYouTube(context.Background(), "https://youtube.com/watch?v=abc123", 1)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to check existing content")
}

// --- NewContentService Tests ---

func TestNewContentService(t *testing.T) {
	repo := &mockContentRepository{}
	ytClient := &mockYouTubeClient{}

	svc := services.NewContentService(repo, ytClient)

	assert.NotNil(t, svc)
}

// --- UpdateSourceData Tests ---

func TestUpdateSourceData_Success(t *testing.T) {
	url := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	createdAt := time.Date(2020, 1, 1, 0, 0, 0, 0, time.UTC)
	existing := &domain.Content{
		ID:            1,
		Name:          "Old Title",
		URL:           &url,
		ContentType:   domain.ContentTypeYouTube,
		AddedByUserID: 7,
		CreatedAt:     createdAt,
	}
	freshResponse := json.RawMessage(`{"items":[{"snippet":{"title":"New Title"}}]}`)
	updated := &domain.Content{
		ID:            1,
		Name:          "New Title",
		URL:           &url,
		ContentType:   domain.ContentTypeYouTube,
		AddedByUserID: 7,
		CreatedAt:     createdAt, // unchanged
	}

	var capturedID int
	var capturedName string
	var capturedLength *int

	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			assert.Equal(t, 1, id)
			return existing, nil
		},
		updateMetadataFn: func(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error) {
			capturedID = id
			capturedName = name
			capturedLength = length
			return updated, nil
		},
	}

	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(u string) (string, error) {
			assert.Equal(t, url, u)
			return "dQw4w9WgXcQ", nil
		},
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			assert.Equal(t, "dQw4w9WgXcQ", videoID)
			return &portservices.VideoMetadata{
				Title:    "New Title",
				Duration: 400,
				Response: freshResponse,
			}, nil
		},
	}

	svc := services.NewContentService(repo, ytClient)
	result, err := svc.UpdateSourceData(context.Background(), 1)

	require.NoError(t, err)
	assert.Equal(t, "New Title", result.Name)
	assert.Equal(t, createdAt, result.CreatedAt) // created_at preserved
	assert.Equal(t, 7, result.AddedByUserID)     // added_by_user_id preserved

	// Repo called with the freshly fetched metadata, scoped to the known ID
	assert.Equal(t, 1, capturedID)
	assert.Equal(t, "New Title", capturedName)
	require.NotNil(t, capturedLength)
	assert.Equal(t, 400, *capturedLength)
}

func TestUpdateSourceData_InvalidID_Zero(t *testing.T) {
	repo := &mockContentRepository{}
	svc := services.NewContentService(repo, &mockYouTubeClient{})

	result, err := svc.UpdateSourceData(context.Background(), 0)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestUpdateSourceData_ContentNotFound(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return nil, domain.ErrNotFound
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{})

	result, err := svc.UpdateSourceData(context.Background(), 999)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrNotFound))
}

func TestUpdateSourceData_NoSourceURL(t *testing.T) {
	existing := &domain.Content{ID: 1, Name: "Claim", ContentType: domain.ContentTypeClaim, URL: nil}
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return existing, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{})

	result, err := svc.UpdateSourceData(context.Background(), 1)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.True(t, errors.Is(err, domain.ErrInvalidInput))
}

func TestUpdateSourceData_YouTubeAPIError(t *testing.T) {
	url := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	existing := &domain.Content{ID: 1, Name: "Old", URL: &url}
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return existing, nil
		},
	}
	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(u string) (string, error) {
			return "dQw4w9WgXcQ", nil
		},
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			return nil, fmt.Errorf("youtube api unavailable")
		},
	}
	svc := services.NewContentService(repo, ytClient)

	result, err := svc.UpdateSourceData(context.Background(), 1)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to fetch video metadata")
}

func TestUpdateSourceData_RepositoryUpdateError(t *testing.T) {
	url := "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
	existing := &domain.Content{ID: 1, Name: "Old", URL: &url}
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return existing, nil
		},
		updateMetadataFn: func(ctx context.Context, id int, name string, response json.RawMessage, length *int) (*domain.Content, error) {
			return nil, fmt.Errorf("db write failed")
		},
	}
	ytClient := &mockYouTubeClient{
		extractVideoIDFn: func(u string) (string, error) {
			return "dQw4w9WgXcQ", nil
		},
		getVideoMetadataFn: func(ctx context.Context, videoID string) (*portservices.VideoMetadata, error) {
			return &portservices.VideoMetadata{Title: "New", Duration: 1, Response: json.RawMessage(`{}`)}, nil
		},
	}
	svc := services.NewContentService(repo, ytClient)

	result, err := svc.UpdateSourceData(context.Background(), 1)

	assert.Nil(t, result)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "failed to update content metadata")
}

func (m *mockContentRepository) SetDisplayTitleIfEmpty(ctx context.Context, contentID int, title string) (string, error) {
	return title, nil
}

func (m *mockContentRepository) ClearDisplayTitle(ctx context.Context, contentID int) error {
	return nil
}

// mockBibleReferenceRepo implements repositories.BibleReferenceRepository for testing
type mockBibleReferenceRepo struct {
	books []domain.BibleBook
	err   error
}

func (m *mockBibleReferenceRepo) ListBooks(ctx context.Context) ([]domain.BibleBook, error) {
	return m.books, m.err
}

func testBibleBooks() []domain.BibleBook {
	return []domain.BibleBook{
		{ID: 1, Name: "Genesis", VersesPerChapter: []int{31, 25, 24}},
		{ID: 2, Name: "Exodus", VersesPerChapter: []int{22, 25}},
	}
}

func TestCreateFromPassage_NewRange_UsesCanonicalStringsAndComputedOrdinals(t *testing.T) {
	var got *domain.Content
	repo := &mockContentRepository{
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			got = c
			assert.False(t, refresh, "passages must not refresh on conflict")
			return c, false, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, services.WithBibleReference(&mockBibleReferenceRepo{books: testBibleBooks()}))

	// Exodus 1:1-2 → ordinals after Genesis's 80 verses: 81..82
	result, err := svc.CreateFromPassage(context.Background(), portservices.CreatePassageInput{
		BookID: 2, StartChapter: 1, StartVerse: 1, EndChapter: 1, EndVerse: 2, UserID: 42,
	})

	require.NoError(t, err)
	require.NotNil(t, result)
	assert.Equal(t, domain.ContentTypeBiblePassage, got.ContentType)
	assert.Equal(t, "Exodus 1:1-2", got.Name)
	require.NotNil(t, got.URL)
	assert.Equal(t, "https://www.biblegateway.com/passage/?search=Exodus+1%3A1-2", *got.URL)
	assert.Equal(t, 42, got.AddedByUserID)
	require.NotNil(t, got.VerseStartID)
	require.NotNil(t, got.VerseEndID)
	assert.Equal(t, 81, *got.VerseStartID)
	assert.Equal(t, 82, *got.VerseEndID)
}

func TestCreateFromPassage_ExistingRange_ReturnsContentAndErrAlreadyExists(t *testing.T) {
	existing := &domain.Content{ID: 5, ContentType: domain.ContentTypeBiblePassage}
	repo := &mockContentRepository{
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content, refresh bool) (*domain.Content, bool, error) {
			return existing, true, nil
		},
	}
	svc := services.NewContentService(repo, &mockYouTubeClient{}, services.WithBibleReference(&mockBibleReferenceRepo{books: testBibleBooks()}))

	result, err := svc.CreateFromPassage(context.Background(), portservices.CreatePassageInput{
		BookID: 1, StartChapter: 1, StartVerse: 1, EndChapter: 1, EndVerse: 3, UserID: 1,
	})

	assert.ErrorIs(t, err, domain.ErrAlreadyExists)
	assert.Same(t, existing, result)
}

func TestCreateFromPassage_Validation(t *testing.T) {
	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, services.WithBibleReference(&mockBibleReferenceRepo{books: testBibleBooks()}))

	cases := map[string]portservices.CreatePassageInput{
		"end verse before start":     {BookID: 1, StartChapter: 1, StartVerse: 5, EndChapter: 1, EndVerse: 2, UserID: 1},
		"end chapter before start":   {BookID: 1, StartChapter: 3, StartVerse: 1, EndChapter: 1, EndVerse: 1, UserID: 1},
		"unknown book":               {BookID: 99, StartChapter: 1, StartVerse: 1, EndChapter: 1, EndVerse: 1, UserID: 1},
		"chapter beyond book":        {BookID: 2, StartChapter: 3, StartVerse: 1, EndChapter: 3, EndVerse: 1, UserID: 1},
		"verse beyond chapter (end)": {BookID: 1, StartChapter: 1, StartVerse: 1, EndChapter: 1, EndVerse: 32, UserID: 1},
	}
	for name, input := range cases {
		t.Run(name, func(t *testing.T) {
			_, err := svc.CreateFromPassage(context.Background(), input)
			assert.ErrorIs(t, err, domain.ErrInvalidPassage)
			assert.ErrorIs(t, err, domain.ErrInvalidInput)
		})
	}
}

func TestCreateFromPassage_BibleRepoErrorAndMissingConfig(t *testing.T) {
	in := portservices.CreatePassageInput{BookID: 1, StartChapter: 1, StartVerse: 1, EndChapter: 1, EndVerse: 1, UserID: 1}

	svc := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{}, services.WithBibleReference(&mockBibleReferenceRepo{err: errors.New("db down")}))
	_, err := svc.CreateFromPassage(context.Background(), in)
	require.Error(t, err)
	assert.Contains(t, err.Error(), "db down")

	unconfigured := services.NewContentService(&mockContentRepository{}, &mockYouTubeClient{})
	_, err = unconfigured.CreateFromPassage(context.Background(), in)
	require.Error(t, err)
}
