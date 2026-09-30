package appguide

import (
	"strings"
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

const sampleArea = "# Compare Perspectives\n\n" +
	"**Route:** /compare\n" +
	"**Summary:** Put two perspectives side by side.\n\n" +
	"## compare.pick-two\n" +
	"**Task:** Compare two perspectives\n" +
	"**Where:** Compare page → picker row\n" +
	"**Steps:**\n1. Open **Compare**.\n2. Pick two perspectives.\n" +
	"**Not supported:** More than two at once.\n" +
	"**Sign-in required:** yes\n" +
	"**Source:** `frontend/src/routes/compare/+page.svelte`\n"

func TestParseArea(t *testing.T) {
	a, err := ParseArea("compare", []byte(sampleArea))
	require.NoError(t, err)

	assert.Equal(t, "compare", a.Slug)
	assert.Equal(t, "Compare Perspectives", a.Title)
	assert.Equal(t, "/compare", a.Route)
	assert.Equal(t, "Put two perspectives side by side.", a.Summary)
	require.Len(t, a.Entries, 1)

	e := a.Entries[0]
	assert.Equal(t, "compare.pick-two", e.ID)
	assert.Equal(t, "Compare two perspectives", e.Task)
	assert.Equal(t, "Compare page → picker row", e.Where)
	assert.Equal(t, []string{"Open **Compare**.", "Pick two perspectives."}, e.Steps)
	assert.Equal(t, "More than two at once.", e.NotSupported)
	assert.Equal(t, "", e.Notes)
	assert.Equal(t, "yes", e.SignIn)
	assert.Equal(t, []string{"frontend/src/routes/compare/+page.svelte"}, e.Sources)
	assert.Empty(t, e.Unknown)
}

func TestParseArea_Variants(t *testing.T) {
	tests := []struct {
		name  string
		src   string
		check func(t *testing.T, a Area)
	}{
		{
			name: "multiple entries",
			src: sampleArea + "\n## compare.swap-sides\n" +
				"**Task:** Swap sides\n**Where:** Compare page\n" +
				"**Steps:**\n1. Click **Swap**.\n" +
				"**Sign-in required:** no\n" +
				"**Source:** `frontend/src/lib/components/Compare.svelte`\n",
			check: func(t *testing.T, a Area) {
				require.Len(t, a.Entries, 2)
				assert.Equal(t, "compare.swap-sides", a.Entries[1].ID)
				assert.Equal(t, []string{"Click **Swap**."}, a.Entries[1].Steps)
				// Steps of the first entry must not absorb the second entry's steps.
				assert.Len(t, a.Entries[0].Steps, 2)
			},
		},
		{
			name: "optional fields missing",
			src: "# X\n**Route:** /x\n**Summary:** S.\n## x.do\n" +
				"**Task:** Do\n**Where:** Here\n**Steps:**\n1. One.\n" +
				"**Sign-in required:** no\n**Source:** `a.go`\n",
			check: func(t *testing.T, a Area) {
				require.Len(t, a.Entries, 1)
				assert.Empty(t, a.Entries[0].NotSupported)
				assert.Empty(t, a.Entries[0].Notes)
			},
		},
		{
			name: "multi-path source and notes",
			src: "# X\n**Route:** /x\n**Summary:** S.\n## x.do\n" +
				"**Task:** Do\n**Where:** Here\n**Steps:**\n1. One.\n" +
				"**Notes:** Autosaves.\n**Sign-in required:** no\n" +
				"**Source:** `a/b.svelte`, `c/d.ts`\n",
			check: func(t *testing.T, a Area) {
				assert.Equal(t, []string{"a/b.svelte", "c/d.ts"}, a.Entries[0].Sources)
				assert.Equal(t, "Autosaves.", a.Entries[0].Notes)
			},
		},
		{
			name: "CRLF line endings",
			src:  strings.ReplaceAll(sampleArea, "\n", "\r\n"),
			check: func(t *testing.T, a Area) {
				assert.Equal(t, "/compare", a.Route)
				require.Len(t, a.Entries, 1)
				assert.Equal(t, []string{"Open **Compare**.", "Pick two perspectives."}, a.Entries[0].Steps)
			},
		},
		{
			name: "unknown field is kept for lint",
			src:  sampleArea + "**Colour:** blue\n",
			check: func(t *testing.T, a Area) {
				assert.Equal(t, []string{"Colour"}, a.Entries[0].Unknown)
			},
		},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			a, err := ParseArea("x", []byte(tt.src))
			require.NoError(t, err)
			tt.check(t, a)
		})
	}
}

func TestParseArea_NoTitleErrors(t *testing.T) {
	_, err := ParseArea("x", []byte("**Route:** /x\n"))
	assert.Error(t, err)
}

func TestLoad_SkipsREADMEs(t *testing.T) {
	areas, seeds, err := Load()
	require.NoError(t, err)
	for _, a := range areas {
		assert.NotEqual(t, "README", a.Slug)
	}
	for slug := range seeds {
		assert.NotEqual(t, "README", slug)
	}
}
