package resolvers_test

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/99designs/gqlgen/graphql/handler"
	auth "github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/auth"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/directives"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/generated"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/resolvers"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

type stubBibleRepo struct{}

func (stubBibleRepo) GetInterlinearWords(ctx context.Context, startID, endID int) ([]domain.InterlinearWordRow, error) {
	one, two, three := 1, 2, 3
	all := []domain.InterlinearWordRow{
		{VerseID: 1, BSBSort: 100, Language: "heb", SourceSort: &one, Source: "רֵאשִׁית", Translit: "re.shit", ParseFull: "Noun", Strongs: "H7225G", StrongsSource: "tagged", SpanHead: &[]int{100}[0], ChunkText: "In the beginning", Gloss: "first: beginning"},
		{VerseID: 1, BSBSort: 101, Language: "heb", SourceSort: &three, Source: "אֱלֹהִים", Translit: "'E.lo.Him", Strongs: "H0430G", StrongsSource: "tagged", SpanHead: &[]int{101}[0], ChunkText: "God", SpaceBefore: true, Gloss: "God"},
		{VerseID: 1, BSBSort: 103, Language: "heb", SourceSort: &two, Source: "בָּרָא", Translit: "ba.Ra'", Strongs: "H1254A", StrongsSource: "tagged", SpanHead: &[]int{103}[0], ChunkText: "created", SpaceBefore: true, Gloss: "to create"},
	}
	var out []domain.InterlinearWordRow
	for _, r := range all {
		if r.VerseID >= startID && r.VerseID <= endID {
			out = append(out, r)
		}
	}
	return out, nil
}

func (stubBibleRepo) GetVerseTexts(ctx context.Context, translation string, startID, endID int) ([]domain.BibleVerseText, error) {
	var out []domain.BibleVerseText
	for id := startID; id <= endID && id <= 3; id++ {
		out = append(out, domain.BibleVerseText{VerseID: id, Text: fmt.Sprintf("verse %d", id)})
	}
	return out, nil
}

func (stubBibleRepo) ListBooks(ctx context.Context) ([]domain.BibleBook, error) {
	return []domain.BibleBook{
		{ID: 1, Name: "Genesis", VersesPerChapter: []int{31, 25, 24}},
		{ID: 2, Name: "Exodus", VersesPerChapter: []int{22, 25}},
	}, nil
}

// setupPassageTestServer is setupTestServer with Bible reference data wired and
// a caller-chosen role for the injected session user.
func setupPassageTestServer(repo *mockContentRepository, role domain.UserRole) *httptest.Server {
	contentService := services.NewContentService(repo, &mockYouTubeClient{}, services.WithBibleReference(stubBibleRepo{}))
	userService := services.NewUserService(&mockUserRepository{}, repo, &mockPerspectiveRepository{})
	perspectiveService := services.NewPerspectiveService(&mockPerspectiveRepository{}, &mockUserRepository{}, nil)
	categoryService := services.NewCategoryService(&mockCategoryRepository{}, repo, &mockWikidataClient{})
	resolver := resolvers.NewResolver(contentService, userService, perspectiveService, categoryService, nil, nil, nil, nil)
	directiveRoot := directives.NewDirectiveRoot(contentService, perspectiveService)
	srv := handler.NewDefaultServer(generated.NewExecutableSchema(generated.Config{
		Resolvers:  resolver,
		Directives: generated.DirectiveRoot{Auth: directiveRoot.Auth, Owner: directiveRoot.Owner},
	}))
	return httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		ctx := auth.WithAuthenticatedUser(r.Context(), &domain.AuthenticatedUser{
			ID: 1, ClerkID: "clerk_test_user", Username: "testuser", Email: "test@example.com", Role: role,
		})
		srv.ServeHTTP(w, r.WithContext(ctx))
	}))
}

func passageRow(id int, title *string) *domain.Content {
	url := "https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3"
	return &domain.Content{ID: id, Name: "Genesis 1:1-3", URL: &url, ContentType: domain.ContentTypeBiblePassage, DisplayTitle: title}
}

func TestCreateContentFromPassage_Success(t *testing.T) {
	repo := &mockContentRepository{
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
			c.ID = 77
			return c, false, nil
		},
	}
	server := setupPassageTestServer(repo, domain.UserRoleDefault)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromPassage(input: { bookID: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3, userID: 1 }) { id name url contentType verseStartID verseEndID displayTitle } }`)
	require.Empty(t, result.Errors)

	var data struct {
		CreateContentFromPassage struct {
			ID           string  `json:"id"`
			Name         string  `json:"name"`
			URL          string  `json:"url"`
			ContentType  string  `json:"contentType"`
			VerseStartID int     `json:"verseStartID"`
			VerseEndID   int     `json:"verseEndID"`
			DisplayTitle *string `json:"displayTitle"`
		} `json:"createContentFromPassage"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	got := data.CreateContentFromPassage
	assert.Equal(t, "77", got.ID)
	assert.Equal(t, "Genesis 1:1-3", got.Name)
	assert.Equal(t, "https://www.biblegateway.com/passage/?search=Genesis+1%3A1-3", got.URL)
	assert.Equal(t, "BIBLE_PASSAGE", got.ContentType)
	assert.Equal(t, 1, got.VerseStartID)
	assert.Equal(t, 3, got.VerseEndID)
	assert.Nil(t, got.DisplayTitle)
}

func TestCreateContentFromPassage_ExistingRangeIsIdempotent(t *testing.T) {
	repo := &mockContentRepository{
		getOrCreateByURLFn: func(ctx context.Context, c *domain.Content) (*domain.Content, bool, error) {
			return passageRow(5, nil), true, nil
		},
	}
	server := setupPassageTestServer(repo, domain.UserRoleDefault)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { createContentFromPassage(input: { bookID: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3, userID: 1 }) { id } }`)
	require.Empty(t, result.Errors)
	assert.Contains(t, string(result.Data), `"5"`)
}

func TestCreateContentFromPassage_RejectsBadInput(t *testing.T) {
	server := setupPassageTestServer(&mockContentRepository{}, domain.UserRoleDefault)
	defer server.Close()

	t.Run("out-of-range verse", func(t *testing.T) {
		result := executeGraphQL(t, server, `mutation { createContentFromPassage(input: { bookID: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 99, userID: 1 }) { id } }`)
		require.NotEmpty(t, result.Errors)
		assert.Contains(t, result.Errors[0].Message, "invalid Bible passage")
	})

	t.Run("spoofed user id", func(t *testing.T) {
		result := executeGraphQL(t, server, `mutation { createContentFromPassage(input: { bookID: 1, startChapter: 1, startVerse: 1, endChapter: 1, endVerse: 3, userID: 999 }) { id } }`)
		require.NotEmpty(t, result.Errors)
		assert.Contains(t, result.Errors[0].Message, "another user")
	})
}

func TestSetPassageDisplayTitle_FirstWriterWins(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) { return passageRow(id, nil), nil },
		// Simulates losing the race: the repo reports the title that already won.
		setDisplayTitleFn: func(ctx context.Context, id int, title string) (string, error) { return "Creation", nil },
	}
	server := setupPassageTestServer(repo, domain.UserRoleDefault)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { setPassageDisplayTitle(input: { contentID: 5, title: "The Beginning" }) { id displayTitle } }`)
	require.Empty(t, result.Errors)

	var data struct {
		SetPassageDisplayTitle struct {
			DisplayTitle string `json:"displayTitle"`
		} `json:"setPassageDisplayTitle"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	assert.Equal(t, "Creation", data.SetPassageDisplayTitle.DisplayTitle, "a losing writer must see the winning title, not an error or their own")
}

func TestSetPassageDisplayTitle_RejectsNonPassageAndBlank(t *testing.T) {
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			return &domain.Content{ID: id, ContentType: domain.ContentTypeYouTube}, nil
		},
	}
	server := setupPassageTestServer(repo, domain.UserRoleDefault)
	defer server.Close()

	result := executeGraphQL(t, server, `mutation { setPassageDisplayTitle(input: { contentID: 5, title: "x" }) { id } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "not a Bible passage")

	result = executeGraphQL(t, server, `mutation { setPassageDisplayTitle(input: { contentID: 5, title: "   " }) { id } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "must not be empty")
}

func TestClearPassageDisplayTitle_AdminOnly(t *testing.T) {
	cleared := false
	repo := &mockContentRepository{
		getByIDFn: func(ctx context.Context, id int) (*domain.Content, error) {
			title := "Creation"
			return passageRow(id, &title), nil
		},
		clearDisplayTitleFn: func(ctx context.Context, id int) error { cleared = true; return nil },
	}

	t.Run("non-admin is denied and nothing is cleared", func(t *testing.T) {
		server := setupPassageTestServer(repo, domain.UserRoleDefault)
		defer server.Close()
		result := executeGraphQL(t, server, `mutation { clearPassageDisplayTitle(contentId: 5) { id } }`)
		require.NotEmpty(t, result.Errors)
		assert.Contains(t, result.Errors[0].Message, "admin only")
		assert.False(t, cleared)
	})

	t.Run("admin clears the title", func(t *testing.T) {
		server := setupPassageTestServer(repo, domain.UserRoleAdmin)
		defer server.Close()
		result := executeGraphQL(t, server, `mutation { clearPassageDisplayTitle(contentId: 5) { id displayTitle } }`)
		require.Empty(t, result.Errors)
		assert.True(t, cleared)
		assert.Contains(t, string(result.Data), `"displayTitle":null`)
	})
}

func TestPassageText_Query(t *testing.T) {
	server := setupPassageTestServer(&mockContentRepository{}, domain.UserRoleDefault)
	defer server.Close()

	result := executeGraphQL(t, server, `query { passageText(startVerseId: 1, endVerseId: 3) { translation copyright verses { verseId chapter verse text } } }`)
	require.Empty(t, result.Errors)

	var data struct {
		PassageText struct {
			Translation string `json:"translation"`
			Copyright   string `json:"copyright"`
			Verses      []struct {
				VerseID int    `json:"verseId"`
				Chapter int    `json:"chapter"`
				Verse   int    `json:"verse"`
				Text    string `json:"text"`
			} `json:"verses"`
		} `json:"passageText"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	assert.Equal(t, "BSB", data.PassageText.Translation)
	assert.Contains(t, data.PassageText.Copyright, "public domain")
	require.Len(t, data.PassageText.Verses, 3)
	assert.Equal(t, 1, data.PassageText.Verses[0].Chapter)
	assert.Equal(t, 3, data.PassageText.Verses[2].Verse)
	assert.Equal(t, "verse 3", data.PassageText.Verses[2].Text)
}

func TestPassageText_Query_RejectsBadRange(t *testing.T) {
	server := setupPassageTestServer(&mockContentRepository{}, domain.UserRoleDefault)
	defer server.Close()

	result := executeGraphQL(t, server, `query { passageText(startVerseId: 5, endVerseId: 2) { translation } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid Bible passage")
}

func TestPassageInterlinear_Query(t *testing.T) {
	server := setupPassageTestServer(&mockContentRepository{}, domain.UserRoleDefault)
	defer server.Close()

	result := executeGraphQL(t, server, `query { passageInterlinear(startVerseId: 1, endVerseId: 3) { verses { verseId chapter verse segments { text spaceBefore } words { id language source strongs gloss tagSource sourceOrder segment } } } }`)
	require.Empty(t, result.Errors)

	var data struct {
		PassageInterlinear struct {
			Verses []struct {
				VerseID  int `json:"verseId"`
				Chapter  int `json:"chapter"`
				Verse    int `json:"verse"`
				Segments []struct {
					Text        string `json:"text"`
					SpaceBefore bool   `json:"spaceBefore"`
				} `json:"segments"`
				Words []struct {
					ID          int    `json:"id"`
					Language    string `json:"language"`
					Source      string `json:"source"`
					Strongs     string `json:"strongs"`
					Gloss       string `json:"gloss"`
					TagSource   string `json:"tagSource"`
					SourceOrder int    `json:"sourceOrder"`
					Segment     *int   `json:"segment"`
				} `json:"words"`
			} `json:"verses"`
		} `json:"passageInterlinear"`
	}
	require.NoError(t, json.Unmarshal(result.Data, &data))
	require.Len(t, data.PassageInterlinear.Verses, 1) // only verse 1 has data; verses 2-3 are simply absent
	v := data.PassageInterlinear.Verses[0]
	assert.Equal(t, 1, v.Verse)
	require.Len(t, v.Segments, 3)
	assert.Equal(t, "God", v.Segments[1].Text)
	require.Len(t, v.Words, 3)
	assert.Equal(t, []string{"H7225G", "H1254A", "H0430G"}, []string{v.Words[0].Strongs, v.Words[1].Strongs, v.Words[2].Strongs})
	assert.Equal(t, "to create", v.Words[1].Gloss)
	require.NotNil(t, v.Words[1].Segment)
	assert.Equal(t, 2, *v.Words[1].Segment) // created -> 3rd English phrase
	require.NotNil(t, v.Words[2].Segment)
	assert.Equal(t, 1, *v.Words[2].Segment) // God -> 2nd English phrase
}

func TestPassageInterlinear_Query_NoDataIsAnEmptyList(t *testing.T) {
	server := setupPassageTestServer(&mockContentRepository{}, domain.UserRoleDefault)
	defer server.Close()
	result := executeGraphQL(t, server, `query { passageInterlinear(startVerseId: 2, endVerseId: 3) { verses { verseId } } }`)
	require.Empty(t, result.Errors)
	assert.Contains(t, string(result.Data), `"verses":[]`)
}

func TestPassageInterlinear_Query_RejectsBadRange(t *testing.T) {
	server := setupPassageTestServer(&mockContentRepository{}, domain.UserRoleDefault)
	defer server.Close()
	result := executeGraphQL(t, server, `query { passageInterlinear(startVerseId: 5, endVerseId: 2) { verses { verseId } } }`)
	require.NotEmpty(t, result.Errors)
	assert.Contains(t, result.Errors[0].Message, "invalid")
}
