package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

func TestWebPageRoleValid(t *testing.T) {
	assert.True(t, domain.WebPageRoleBlogPost.Valid())
	assert.True(t, domain.WebPageRoleSessionTranscript.Valid())
	for _, bad := range []domain.WebPageRole{"", "NEWS", "blog_post"} {
		assert.False(t, bad.Valid(), "%q must be invalid", bad)
	}
}

func TestContentTypeWebsiteValue(t *testing.T) {
	assert.Equal(t, domain.ContentType("WEBSITE"), domain.ContentTypeWebsite)
}

func TestFetchStatusImportedValue(t *testing.T) {
	assert.Equal(t, domain.FetchStatus("IMPORTED"), domain.FetchStatusImported)
}
