package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
)

func TestTodoAction_IsPreset(t *testing.T) {
	owner := 42
	tests := []struct {
		name   string
		action domain.TodoAction
		want   bool
	}{
		{name: "preset has nil user", action: domain.TodoAction{Key: "consume"}, want: true},
		{name: "user-entered action has owner", action: domain.TodoAction{Key: "watch-again", UserID: &owner}, want: false},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			assert.Equal(t, tt.want, tt.action.IsPreset())
		})
	}
}

func TestUserTodoEnums_AreUpperCase(t *testing.T) {
	assert.Equal(t, "NOT_STARTED", string(domain.UserTodoStatusNotStarted))
	assert.Equal(t, "IN_PROGRESS", string(domain.UserTodoStatusInProgress))
	assert.Equal(t, "DONE", string(domain.UserTodoStatusDone))
	assert.Equal(t, "DROPPED", string(domain.UserTodoStatusDropped))

	assert.Equal(t, "PRIORITY", string(domain.UserTodoSortByPriority))
	assert.Equal(t, "DUE_DATE", string(domain.UserTodoSortByDueDate))
	assert.Equal(t, "CREATED_AT", string(domain.UserTodoSortByCreatedAt))
	assert.Equal(t, "UPDATED_AT", string(domain.UserTodoSortByUpdatedAt))
	assert.Equal(t, "LIST_POSITION", string(domain.UserTodoSortByListPosition))
}

func TestDomainErrors_InvalidPercentMessage(t *testing.T) {
	assert.Equal(t, "percent complete must be between 0 and 100", domain.ErrInvalidPercent.Error())
}
