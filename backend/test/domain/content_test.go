package domain_test

import (
	"encoding/json"
	"testing"
	"time"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

func TestContentType_YouTube(t *testing.T) {
	assert.Equal(t, domain.ContentType("YOUTUBE"), domain.ContentTypeYouTube)
}

func TestContent_RequiredFields(t *testing.T) {
	content := domain.Content{
		ID:          1,
		Name:        "Test Video",
		ContentType: domain.ContentTypeYouTube,
		CreatedAt:   time.Now(),
		UpdatedAt:   time.Now(),
	}

	assert.Equal(t, 1, content.ID)
	assert.Equal(t, "Test Video", content.Name)
	assert.Equal(t, domain.ContentTypeYouTube, content.ContentType)
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
		ContentType: domain.ContentTypeYouTube,
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
		ContentType: domain.ContentTypeYouTube,
	}

	assert.Nil(t, content.URL)
	assert.Nil(t, content.Length)
	assert.Nil(t, content.LengthUnits)
}
