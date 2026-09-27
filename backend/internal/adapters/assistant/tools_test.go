package assistant

import (
	"context"
	"encoding/json"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/ai-tooling/jeeves/datacontract"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/services"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func newTestRunner(t *testing.T) *ToolRunner {
	t.Helper()
	svc := services.NewPerspectiveService(&memRepo{rows: toDomain(datacontract.Seed())}, nil)
	r, err := NewToolRunner(NewPerspectiveData(svc, stubContent{}))
	require.NoError(t, err)
	return r
}

func TestToolRunner_Disabled(t *testing.T) {
	var r *ToolRunner
	assert.Nil(t, r.Specs())
	_, err := r.Run(context.Background(), 1, "read_guide", `{"area":"compare"}`)
	assert.ErrorIs(t, err, domain.ErrAssistantToolsDisabled)
}

func TestToolRunner_Specs(t *testing.T) {
	specs := newTestRunner(t).Specs()
	require.Len(t, specs, 2)
	assert.Equal(t, "read_guide", specs[0].Name)
	assert.False(t, specs[0].UntrustedContent)
	assert.Equal(t, "list_perspectives", specs[1].Name)
	assert.True(t, specs[1].UntrustedContent, "results hold user-written text")
	for _, s := range specs {
		assert.True(t, json.Valid([]byte(s.InputSchema)), "%s schema is JSON", s.Name)
		assert.NotEmpty(t, s.Description)
	}
}

func TestToolRunner_Run(t *testing.T) {
	r := newTestRunner(t)
	ctx := context.Background()

	t.Run("read_guide", func(t *testing.T) {
		out, err := r.Run(ctx, 1, "read_guide", `{"area":"compare"}`)
		require.NoError(t, err)
		assert.Contains(t, out, "## compare.pick-two")
	})

	t.Run("list_perspectives is bound to the signed-in user", func(t *testing.T) {
		out, err := r.Run(ctx, 1, "list_perspectives", `{"scope":"content","content_id":10}`)
		require.NoError(t, err)
		_, body, _ := strings.Cut(out, "\n")
		var got struct {
			Data []struct {
				ID      int  `json:"id"`
				Mine    bool `json:"mine"`
				Private bool `json:"private"`
			}
		}
		require.NoError(t, json.Unmarshal([]byte(body), &got))
		require.NotEmpty(t, got.Data)
		for _, p := range got.Data {
			assert.False(t, p.Private && !p.Mine, "perspective %d is someone else's private perspective", p.ID)
		}
	})

	t.Run("the input can't choose the viewer", func(t *testing.T) {
		_, err := r.Run(ctx, 1, "list_perspectives", `{"scope":"mine","user_id":2}`)
		assert.ErrorIs(t, err, domain.ErrInvalidInput)
	})

	tests := []struct {
		name, tool, input string
		user              int
		want              error
	}{
		{"unknown tool", "delete_everything", `{}`, 1, domain.ErrAssistantToolUnknown},
		{"signed out", "read_guide", `{"area":"compare"}`, 0, domain.ErrInvalidInput},
		{"not JSON", "read_guide", `{area`, 1, domain.ErrInvalidInput},
		{"too long", "read_guide", `{"area":"` + strings.Repeat("x", maxToolInputBytes) + `"}`, 1, domain.ErrInvalidInput},
		{"tool error", "read_guide", `{"area":"nope"}`, 1, domain.ErrInvalidInput},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			_, err := r.Run(ctx, tt.user, tt.tool, tt.input)
			assert.ErrorIs(t, err, tt.want)
		})
	}
}
