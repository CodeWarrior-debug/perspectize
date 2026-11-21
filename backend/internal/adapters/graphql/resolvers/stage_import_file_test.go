package resolvers

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/adapters/graphql/model"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
)

func stageInput(facts, details map[string]any) model.StageImportFromFileInput {
	return model.StageImportFromFileInput{
		Name: "Blog",
		Items: []*model.StageImportItemInput{{
			ExternalID: "a", URL: "https://example.com/a", Title: "A", Position: 0, Facts: facts, Details: details,
		}},
	}
}

func TestModelToStageImportFileInput_DecodesFactsAndDetails(t *testing.T) {
	in, err := modelToStageImportFileInput(stageInput(
		map[string]any{"kind": "PAGE", "webPageRoles": []any{"BLOG_POST"}, "wordCount": 812, "publishedAt": "2026-05-01T00:00:00Z"},
		map[string]any{"tags": []any{"x"}, "people": []any{map[string]any{"name": "Jo", "role": "author"}}},
	))
	require.NoError(t, err)
	f := in.Items[0].Facts
	assert.Equal(t, domain.ImportItemKindPage, f.Kind)
	assert.Equal(t, []string{"BLOG_POST"}, f.WebPageRoles)
	require.NotNil(t, f.WordCount)
	assert.Equal(t, 812, *f.WordCount)
	require.NotNil(t, f.PublishedAt)
	assert.Equal(t, []string{"x"}, in.Items[0].Details.Tags)
	assert.Equal(t, "Jo", in.Items[0].Details.People[0].Name)
}

func TestModelToStageImportFileInput_RejectsUnknownKeys(t *testing.T) {
	_, err := modelToStageImportFileInput(stageInput(map[string]any{"kind": "PAGE", "wordCnt": 3}, nil))
	require.ErrorIs(t, err, domain.ErrInvalidInput)
	assert.Contains(t, err.Error(), "row 1")

	_, err = modelToStageImportFileInput(stageInput(map[string]any{"kind": "PAGE"}, map[string]any{"bogus": true}))
	require.ErrorIs(t, err, domain.ErrInvalidInput)

	_, err = modelToStageImportFileInput(stageInput(map[string]any{"wordCount": "many"}, nil))
	require.ErrorIs(t, err, domain.ErrInvalidInput)
}
