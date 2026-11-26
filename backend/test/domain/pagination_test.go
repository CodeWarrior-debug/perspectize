package domain_test

import (
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func pageInt(n int) *int       { return &n }
func pageStr(s string) *string { return &s }

func TestResolvePage(t *testing.T) {
	cursor := "Y3Vyc29y"

	tests := []struct {
		name      string
		first     *int
		last      *int
		after     *string
		before    *string
		wantLimit int
		wantErr   bool
		wantAfter bool
		wantBack  bool
	}{
		{name: "no arguments reads the default page", wantLimit: domain.DefaultPageSize},
		{name: "first alone is the forward size", first: pageInt(7), wantLimit: 7},
		{name: "after moves forward at first's size", first: pageInt(3), after: pageStr(cursor), wantLimit: 3, wantAfter: true},
		{name: "before alone moves backward at first's size", first: pageInt(4), before: pageStr(cursor), wantLimit: 4, wantBack: true},
		{name: "last with before is the backward size", first: pageInt(10), last: pageInt(5), before: pageStr(cursor), wantLimit: 5, wantBack: true},
		{name: "last at the floor with before", last: pageInt(1), before: pageStr(cursor), wantLimit: 1, wantBack: true},
		{name: "last at the cap with before", last: pageInt(100), before: pageStr(cursor), wantLimit: 100, wantBack: true},
		{name: "first at the floor", first: pageInt(1), wantLimit: 1},
		{name: "first at the cap", first: pageInt(100), wantLimit: 100},
		{name: "first above the cap", first: pageInt(101), wantErr: true},
		{name: "first below the floor", first: pageInt(0), wantErr: true},
		{name: "last above the cap", last: pageInt(101), before: pageStr(cursor), wantErr: true},
		{name: "last below the floor", last: pageInt(0), before: pageStr(cursor), wantErr: true},
		{name: "last without before is refused", last: pageInt(5), wantErr: true},
		{name: "after and before together are refused", after: pageStr(cursor), before: pageStr(cursor), wantErr: true},
	}
	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := domain.ResolvePage(tt.first, tt.last, tt.after, tt.before)

			if tt.wantErr {
				require.Error(t, err)
				assert.ErrorIs(t, err, domain.ErrInvalidInput)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tt.wantLimit, got.Limit)
			assert.Equal(t, tt.wantAfter, got.After != nil)
			assert.Equal(t, tt.wantBack, got.Before != nil)
		})
	}
}
