package jeeves

import (
	"testing"

	"github.com/stretchr/testify/assert"
)

func TestCitations(t *testing.T) {
	assert.Equal(t, []string{"a.b", "c.d-e"}, Citations("x [a.b] y [c.d-e] z [a.b] [Not.An.ID] [nope]"))
	assert.Nil(t, Citations("no citations here"))
}
