package domain_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestContentType_YouTube(t *testing.T) {
	assert.Equal(t, domain.ContentType("YOUTUBE_VIDEO"), domain.ContentTypeYouTubeVideo)
}

func TestContent_RequiredFields(t *testing.T) {
	content := domain.Content{
		ID:          1,
		Name:        "Test Video",
		ContentType: domain.ContentTypeYouTubeVideo,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	assert.Equal(t, 1, content.ID)
	assert.Equal(t, "Test Video", content.Name)
	assert.Equal(t, domain.ContentTypeYouTubeVideo, content.ContentType)
	assert.Nil(t, content.URL)
	assert.Nil(t, content.Length)
	assert.Nil(t, content.LengthUnits)
	assert.Nil(t, content.Response)
}

func TestContent_OptionalFields(t *testing.T) {
	url := "https://youtube.com/watch?v=abc123"
	length := 300
	lengthUnits := "seconds"
	response := json.RawMessage(`{"items":[]}`)

	content := domain.Content{
		ID:          1,
		Name:        "Full Video",
		URL:         &url,
		ContentType: domain.ContentTypeYouTubeVideo,
		Length:      &length,
		LengthUnits: &lengthUnits,
		Response:    response,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	assert.NotNil(t, content.URL)
	assert.Equal(t, url, *content.URL)
	assert.NotNil(t, content.Length)
	assert.Equal(t, 300, *content.Length)
	assert.NotNil(t, content.LengthUnits)
	assert.Equal(t, "seconds", *content.LengthUnits)
	assert.NotNil(t, content.Response)
}

func TestContent_NilOptionalFields(t *testing.T) {
	content := domain.Content{
		ID:          1,
		Name:        "Minimal Content",
		ContentType: domain.ContentTypeYouTubeVideo,
	}

	assert.Nil(t, content.URL)
	assert.Nil(t, content.Length)
	assert.Nil(t, content.LengthUnits)
}

func TestContentType_BiblePassage(t *testing.T) {
	assert.Equal(t, domain.ContentType("BIBLE_PASSAGE"), domain.ContentTypeBiblePassage)
}

func TestContent_BiblePassageFields_OptionalAndNilByDefault(t *testing.T) {
	c := domain.Content{
		Name:          "Genesis 1:1-3",
		ContentType:   domain.ContentTypeBiblePassage,
		AddedByUserID: 1,
	}
	assert.Nil(t, c.VerseStartID)
	assert.Nil(t, c.VerseEndID)
	assert.Nil(t, c.DisplayTitle)
}

func TestMovieConstants(t *testing.T) {
	assert.Equal(t, domain.ContentType("MOVIE"), domain.ContentTypeMovie)
	assert.Equal(t, domain.ContentSearchField("CAST"), domain.ContentSearchFieldCast)
	assert.Equal(t, domain.ContentSearchField("DIRECTOR"), domain.ContentSearchFieldDirector)
	assert.Equal(t, domain.ContentSortBy("BOX_OFFICE"), domain.ContentSortByBoxOffice)
	assert.Equal(t, domain.ContentSortBy("VS_BUDGET"), domain.ContentSortByVsBudget)
	assert.Equal(t, domain.ContentSortBy("AGE_RATING"), domain.ContentSortByAgeRating)
	assert.Equal(t, domain.ContentSortBy("RELEASE_DATE"), domain.ContentSortByReleaseDate)
	assert.Equal(t, domain.ContentSortBy("TMDB_SCORE"), domain.ContentSortByTmdbScore)
	assert.Equal(t, domain.PersonRole("CAST"), domain.PersonRoleCast)
	assert.Equal(t, domain.PersonRole("DIRECTOR"), domain.PersonRoleDirector)
}

func TestBookConstants(t *testing.T) {
	assert.Equal(t, domain.ContentType("BOOK"), domain.ContentTypeBook)
	assert.Equal(t, domain.ContentSortBy("AUTHOR"), domain.ContentSortByAuthor)
}

func TestWebPageConstants(t *testing.T) {
	assert.Equal(t, domain.ContentType("WEB_PAGE"), domain.ContentTypeWebPage)
	assert.Equal(t, domain.WebPageRole("BLOG_POST"), domain.WebPageRoleBlogPost)
	assert.Equal(t, domain.WebPageRole("SESSION_TRANSCRIPT"), domain.WebPageRoleSessionTranscript)
	assert.Equal(t, domain.FetchStatus("OK"), domain.FetchStatusOK)
	assert.Equal(t, domain.FetchStatus("BLOCKED"), domain.FetchStatusBlocked)
	assert.Equal(t, domain.FetchStatus("ERROR"), domain.FetchStatusError)
	assert.Equal(t, domain.FetchStatus("TIMEOUT"), domain.FetchStatusTimeout)
	assert.Equal(t, domain.FetchStatus("NOT_HTML"), domain.FetchStatusNotHTML)
	assert.Equal(t, domain.FetchStatus("TOO_LARGE"), domain.FetchStatusTooLarge)
}

func TestWebPageRole_SchemaOrgMapping(t *testing.T) {
	assert.Equal(t, "BlogPosting", domain.WebPageRoleBlogPost.SchemaOrgType())
	assert.Equal(t, "Conversation", domain.WebPageRoleSessionTranscript.SchemaOrgType())
	assert.Equal(t, "", domain.WebPageRole("UNKNOWN").SchemaOrgType())
}

func TestWebPageMeta_JSONKeepsRoleOrder(t *testing.T) {
	meta := domain.WebPageMeta{
		SchemaVersion: 1,
		FinalURL:      "https://example.test/post",
		Domain:        "example.test",
		Roles:         []domain.WebPageRole{domain.WebPageRoleBlogPost, domain.WebPageRoleSessionTranscript},
		Fetch:         domain.WebPageFetch{Status: domain.FetchStatusOK},
	}
	raw, err := json.Marshal(meta)
	require.NoError(t, err)

	var generic map[string]any
	require.NoError(t, json.Unmarshal(raw, &generic))
	assert.Equal(t, []any{"BLOG_POST", "SESSION_TRANSCRIPT"}, generic["webPageRoles"])

	var back domain.WebPageMeta
	require.NoError(t, json.Unmarshal(raw, &back))
	assert.Equal(t, meta.Roles, back.Roles)
}

func TestWebPageMeta_NilRolesMarshalAsEmptyArray(t *testing.T) {
	raw, err := json.Marshal(domain.WebPageMeta{})
	require.NoError(t, err)
	assert.Contains(t, string(raw), `"webPageRoles":[]`)
	assert.NotContains(t, string(raw), `"webPageRoles":null`)
}

func TestWebPageMeta_MissingFieldsMarshalAsNull(t *testing.T) {
	raw, err := json.Marshal(domain.WebPageMeta{})
	require.NoError(t, err)
	assert.Contains(t, string(raw), `"title":null`)
	assert.Contains(t, string(raw), `"author":null`)
	assert.Contains(t, string(raw), `"schemaVersion":0`)
}

func TestContentType_AudioTrack(t *testing.T) {
	assert.Equal(t, domain.ContentType("AUDIO_TRACK"), domain.ContentTypeAudioTrack)
}
