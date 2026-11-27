package domain_test

import (
	"encoding/json"
	"fmt"
	"strings"
	"testing"

	"github.com/CodeWarrior-debug/perspectize/backend/internal/core/domain"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// formulaPayload wraps an expression in the payload envelope.
func formulaPayload(expression string) json.RawMessage {
	return json.RawMessage(`{"expression":` + expression + `}`)
}

// nestedLog wraps a constant in the given number of log10 nodes. With the root as
// level 1, the constant sits at level wrappers+1.
func nestedLog(wrappers int) string {
	expr := `{"const":1}`
	for i := 0; i < wrappers; i++ {
		expr = `{"op":"log10","args":[` + expr + `]}`
	}
	return expr
}

// flatAdd builds an add over n constant operands: n+1 nodes in all.
func flatAdd(operands int) string {
	args := make([]string, operands)
	for i := range args {
		args[i] = `{"const":1}`
	}
	return `{"op":"add","args":[` + strings.Join(args, ",") + `]}`
}

func TestSavedFormulaPayload_FunctionArity(t *testing.T) {
	cases := []struct {
		name    string
		op      string
		args    int
		wantErr bool
	}{
		// Variadic functions take at least two arguments.
		{"add with two", "add", 2, false},
		{"add with five", "add", 5, false},
		{"add with one", "add", 1, true},
		{"mul with two", "mul", 2, false},
		{"mul with one", "mul", 1, true},
		{"min with two", "min", 2, false},
		{"min with one", "min", 1, true},
		{"max with two", "max", 2, false},
		{"max with one", "max", 1, true},
		{"coalesce with two", "coalesce", 2, false},
		{"coalesce with one", "coalesce", 1, true},
		// Binary functions take exactly two.
		{"sub with two", "sub", 2, false},
		{"sub with one", "sub", 1, true},
		{"sub with three", "sub", 3, true},
		{"div with two", "div", 2, false},
		{"div with one", "div", 1, true},
		{"div with three", "div", 3, true},
		// Unary functions take exactly one.
		{"log10 with one", "log10", 1, false},
		{"log10 with zero", "log10", 0, true},
		{"log10 with two", "log10", 2, true},
		{"sqrt with one", "sqrt", 1, false},
		{"sqrt with two", "sqrt", 2, true},
		{"zscore with one", "zscore", 1, false},
		{"zscore with zero", "zscore", 0, true},
		{"zscore with two", "zscore", 2, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			args := make([]string, tc.args)
			for i := range args {
				args[i] = `{"operand":"x"}`
			}
			expr := fmt.Sprintf(`{"op":%q,"args":[%s]}`, tc.op, strings.Join(args, ","))
			err := domain.ValidateSavedFormulaPayload(formulaPayload(expr))
			if tc.wantErr {
				assert.ErrorIs(t, err, domain.ErrInvalidInput)
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestSavedFormulaPayload_UnknownFunctionRejected(t *testing.T) {
	err := domain.ValidateSavedFormulaPayload(formulaPayload(`{"op":"pow","args":[{"const":2},{"const":3}]}`))
	assert.ErrorIs(t, err, domain.ErrInvalidInput)
}

func TestSavedFormulaPayload_Leaves(t *testing.T) {
	cases := []struct {
		name    string
		expr    string
		wantErr bool
	}{
		{"zero constant is a constant, not absent", `{"const":0}`, false},
		{"negative constant", `{"const":-12.5}`, false},
		{"operand key", `{"operand":"tmdb_score"}`, false},
		{"empty operand key", `{"operand":""}`, true},
		{"blank operand key", `{"operand":"   "}`, true},
		{"constant too large for a float64 is refused by the decoder", `{"const":1e400}`, true},
		{"NaN is not JSON", `{"const":NaN}`, true},
		{"constant with arguments", `{"const":1,"args":[{"const":2}]}`, true},
		{"operand with arguments", `{"operand":"x","args":[{"const":2}]}`, true},
		{"empty args on a constant is refused", `{"const":1,"args":[]}`, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := domain.ValidateSavedFormulaPayload(formulaPayload(tc.expr))
			if tc.wantErr {
				assert.ErrorIs(t, err, domain.ErrInvalidInput)
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestSavedFormulaPayload_ExactlyOneKindPerNode(t *testing.T) {
	cases := []struct {
		name string
		expr string
	}{
		{"empty node", `{}`},
		{"op and const", `{"op":"add","const":1,"args":[{"const":1},{"const":2}]}`},
		{"const and operand", `{"const":1,"operand":"x"}`},
		{"op and operand", `{"op":"log10","operand":"x","args":[{"const":1}]}`},
		{"all three", `{"op":"add","const":1,"operand":"x","args":[{"const":1},{"const":2}]}`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := domain.ValidateSavedFormulaPayload(formulaPayload(tc.expr))
			assert.ErrorIs(t, err, domain.ErrInvalidInput)
		})
	}
}

// The node cap counts every node, the root included: 200 is allowed, 201 is not.
func TestSavedFormulaPayload_NodeCap(t *testing.T) {
	cases := []struct {
		name    string
		nodes   int // total nodes, root included
		wantErr bool
	}{
		{"three nodes", 3, false},
		{"exactly 200 nodes", 200, false},
		{"201 nodes", 201, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			// The root add plus its constant operands makes nodes = operands + 1.
			err := domain.ValidateSavedFormulaPayload(formulaPayload(flatAdd(tc.nodes - 1)))
			if tc.wantErr {
				assert.ErrorIs(t, err, domain.ErrInvalidInput)
				return
			}
			assert.NoError(t, err)
		})
	}
}

// Depth is counted from the root as level 1. A constant under 19 log10 wrappers
// sits at level 20 (allowed); one more wrapper puts it at level 21 (refused).
func TestSavedFormulaPayload_DepthCap(t *testing.T) {
	cases := []struct {
		name    string
		wrapped int
		wantErr bool
	}{
		{"leaf at level 20", 19, false},
		{"leaf at level 21", 20, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := domain.ValidateSavedFormulaPayload(formulaPayload(nestedLog(tc.wrapped)))
			if tc.wantErr {
				assert.ErrorIs(t, err, domain.ErrInvalidInput)
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestSavedFormulaPayload_EnvelopeRejectsUnknownKeys(t *testing.T) {
	cases := []struct {
		name    string
		payload string
	}{
		{"unknown top-level key", `{"expression":{"const":1},"extra":true}`},
		{"unknown key inside a node", `{"expression":{"const":1,"extra":2}}`},
		{"unknown key inside an argument", `{"expression":{"op":"log10","args":[{"const":1,"extra":2}]}}`},
		{"trailing data after the object", `{"expression":{"const":1}}{}`},
		{"missing expression", `{"subtitle":"only a subtitle"}`},
		{"not an object", `[1,2,3]`},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := domain.ValidateSavedFormulaPayload(json.RawMessage(tc.payload))
			assert.ErrorIs(t, err, domain.ErrInvalidInput)
		})
	}
}

func TestSavedFormulaPayload_EmptyPayloadIsRequired(t *testing.T) {
	assert.ErrorIs(t, domain.ValidateSavedFormulaPayload(nil), domain.ErrInvalidInput)
	assert.ErrorIs(t, domain.ValidateSavedFormulaPayload(json.RawMessage{}), domain.ErrInvalidInput)
}

// Text limits count runes, not bytes: "é" is two bytes and one rune.
func TestSavedFormulaPayload_TextLimits(t *testing.T) {
	cases := []struct {
		name    string
		extra   string
		wantErr bool
	}{
		{"subtitle of 200 runes", `"subtitle":"` + strings.Repeat("é", 200) + `"`, false},
		{"subtitle of 201 runes", `"subtitle":"` + strings.Repeat("é", 201) + `"`, true},
		{"number format of 40 runes", `"numberFormat":"` + strings.Repeat("0", 40) + `"`, false},
		{"number format of 41 runes", `"numberFormat":"` + strings.Repeat("0", 41) + `"`, true},
		{"ten content types", `"contentTypes":["a","b","c","d","e","f","g","h","i","j"]`, false},
		{"eleven content types", `"contentTypes":["a","b","c","d","e","f","g","h","i","j","k"]`, true},
		{"content type of 40 runes", `"contentTypes":["` + strings.Repeat("é", 40) + `"]`, false},
		{"content type of 41 runes", `"contentTypes":["` + strings.Repeat("é", 41) + `"]`, true},
		{"blank content type", `"contentTypes":["   "]`, true},
		{"empty subtitle is allowed", `"subtitle":""`, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			err := domain.ValidateSavedFormulaPayload(json.RawMessage(`{"expression":{"const":1},` + tc.extra + `}`))
			if tc.wantErr {
				assert.ErrorIs(t, err, domain.ErrInvalidInput)
				return
			}
			assert.NoError(t, err)
		})
	}
}

func TestValidateSavedItemPayload_ByType(t *testing.T) {
	valid := formulaPayload(`{"operand":"tmdb_score"}`)

	require.NoError(t, domain.ValidateSavedItemPayload(domain.SavedItemTypeFormula, valid))

	for _, typ := range []domain.SavedItemType{domain.SavedItemTypeTheme, domain.SavedItemTypeView, domain.SavedItemTypeSetting} {
		t.Run(string(typ)+" takes no payload yet", func(t *testing.T) {
			assert.ErrorIs(t, domain.ValidateSavedItemPayload(typ, valid), domain.ErrInvalidInput)
		})
	}
}

func TestNormalizeSavedItemName(t *testing.T) {
	cases := []struct {
		name    string
		input   string
		want    string
		wantErr bool
	}{
		{"trims surrounding space", "  Bang for buck  ", "Bang for buck", false},
		{"empty is refused", "", "", true},
		{"whitespace only is refused", " \t ", "", true},
		{"100 runes is accepted", strings.Repeat("é", 100), strings.Repeat("é", 100), false},
		{"101 runes is refused", strings.Repeat("é", 101), "", true},
		{"padding does not count toward the limit", "  " + strings.Repeat("a", 100) + "  ", strings.Repeat("a", 100), false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got, err := domain.NormalizeSavedItemName(tc.input)
			if tc.wantErr {
				assert.ErrorIs(t, err, domain.ErrInvalidInput)
				return
			}
			require.NoError(t, err)
			assert.Equal(t, tc.want, got)
		})
	}
}

func TestSavedItemType_Valid(t *testing.T) {
	for _, typ := range []domain.SavedItemType{domain.SavedItemTypeFormula, domain.SavedItemTypeTheme, domain.SavedItemTypeView, domain.SavedItemTypeSetting} {
		assert.True(t, typ.Valid(), string(typ))
	}
	for _, typ := range []domain.SavedItemType{"", "formula", "BOGUS"} {
		assert.False(t, typ.Valid(), string(typ))
	}
}
