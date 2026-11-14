package postgres

import (
	"testing"

	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

func TestStringArray_Scan(t *testing.T) {
	tests := []struct {
		name    string
		src     interface{}
		want    StringArray
		wantNil bool
		errMsg  string
	}{
		{name: "nil source yields nil slice", src: nil, wantNil: true},
		{name: "empty array literal", src: "{}", want: StringArray{}},
		{name: "simple elements", src: "{a,b,c}", want: StringArray{"a", "b", "c"}},
		{name: "byte slice source", src: []byte("{x,y}"), want: StringArray{"x", "y"}},
		{name: "single element", src: "{solo}", want: StringArray{"solo"}},
		{name: "quoted element containing comma", src: `{"hello, world",b}`, want: StringArray{"hello, world", "b"}},
		{name: "escaped double quote inside quoted element", src: `{"a\"b"}`, want: StringArray{`a"b`}},
		{name: "escaped backslash inside quoted element", src: `{"a\\b"}`, want: StringArray{`a\b`}},
		{name: "NULL element becomes empty string", src: "{NULL,a}", want: StringArray{"", "a"}},
		{name: "trailing NULL element becomes empty string", src: "{a,NULL}", want: StringArray{"a", ""}},
		{name: "empty elements around comma", src: "{,}", want: StringArray{"", ""}},
		{name: "missing braces is an error", src: "a,b", errMsg: "StringArray.Scan: invalid array format: a,b"},
		{name: "missing closing brace is an error", src: "{a,b", errMsg: "StringArray.Scan: invalid array format: {a,b"},
		{name: "unsupported source type is an error", src: 42, errMsg: "StringArray.Scan: expected []byte or string, got int"},
		{name: "float source type is an error", src: 3.5, errMsg: "StringArray.Scan: expected []byte or string, got float64"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			// Pre-seed with a non-nil value so we can prove Scan overwrites it.
			got := StringArray{"pre-existing"}
			err := got.Scan(tt.src)

			if tt.errMsg != "" {
				require.Error(t, err)
				assert.Equal(t, tt.errMsg, err.Error())
				return
			}

			require.NoError(t, err)
			if tt.wantNil {
				assert.Nil(t, got)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}
}

func TestStringArray_Value(t *testing.T) {
	t.Run("nil slice yields nil driver value", func(t *testing.T) {
		var a StringArray
		v, err := a.Value()
		require.NoError(t, err)
		assert.Nil(t, v)
	})

	tests := []struct {
		name string
		in   StringArray
		want string
	}{
		{name: "empty non-nil slice", in: StringArray{}, want: "{}"},
		{name: "plain elements need no quoting", in: StringArray{"a", "b"}, want: "{a,b}"},
		{name: "element with comma is quoted", in: StringArray{"hello, world"}, want: `{"hello, world"}`},
		{name: "element with double quote is quoted and escaped", in: StringArray{`a"b`}, want: `{"a\"b"}`},
		{name: "element with backslash is quoted and escaped", in: StringArray{`a\b`}, want: `{"a\\b"}`},
		{name: "element with braces is quoted", in: StringArray{"{x}"}, want: `{"{x}"}`},
		{name: "mixed quoted and unquoted", in: StringArray{"plain", "with,comma"}, want: `{plain,"with,comma"}`},
		{name: "empty string element", in: StringArray{""}, want: "{}"},
		{name: "multibyte runes pass through unescaped", in: StringArray{"🥰 café"}, want: "{🥰 café}"},
		{name: "jsonb element is quoted and escaped", in: StringArray{`{"emoji":"🥰","note":"a \"b\""}`}, want: `{"{\"emoji\":\"🥰\",\"note\":\"a \\\"b\\\"\"}"}`},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v, err := tt.in.Value()
			require.NoError(t, err)
			assert.Equal(t, tt.want, v)
		})
	}
}

func TestStringArray_RoundTrip(t *testing.T) {
	original := StringArray{"plain", "with, comma", `with "quote"`, `with\backslash`}

	encoded, err := original.Value()
	require.NoError(t, err)

	var decoded StringArray
	require.NoError(t, decoded.Scan(encoded.(string)))
	assert.Equal(t, original, decoded)
}

func TestInt64Array_Scan(t *testing.T) {
	tests := []struct {
		name    string
		src     interface{}
		want    Int64Array
		wantNil bool
		errMsg  string
	}{
		{name: "nil source yields nil slice", src: nil, wantNil: true},
		{name: "empty array literal", src: "{}", want: Int64Array{}},
		{name: "simple elements", src: "{1,2,3}", want: Int64Array{1, 2, 3}},
		{name: "byte slice source", src: []byte("{10,20}"), want: Int64Array{10, 20}},
		{name: "negative values", src: "{-1,0,5}", want: Int64Array{-1, 0, 5}},
		{name: "surrounding whitespace is trimmed", src: "{ 1 , 2 }", want: Int64Array{1, 2}},
		{name: "NULL element becomes zero", src: "{NULL,5}", want: Int64Array{0, 5}},
		{name: "missing braces is an error", src: "1,2", errMsg: "Int64Array.Scan: invalid array format: 1,2"},
		{name: "unsupported source type is an error", src: 42, errMsg: "Int64Array.Scan: expected []byte or string, got int"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := Int64Array{99}
			err := got.Scan(tt.src)

			if tt.errMsg != "" {
				require.Error(t, err)
				assert.Equal(t, tt.errMsg, err.Error())
				return
			}

			require.NoError(t, err)
			if tt.wantNil {
				assert.Nil(t, got)
				return
			}
			assert.Equal(t, tt.want, got)
		})
	}

	t.Run("non-numeric element is a wrapped parse error", func(t *testing.T) {
		var got Int64Array
		err := got.Scan("{abc}")
		require.Error(t, err)
		assert.Contains(t, err.Error(), "Int64Array.Scan: failed to parse int64")
		assert.Contains(t, err.Error(), "abc")
	})
}

func TestInt64Array_Value(t *testing.T) {
	t.Run("nil slice yields nil driver value", func(t *testing.T) {
		var a Int64Array
		v, err := a.Value()
		require.NoError(t, err)
		assert.Nil(t, v)
	})

	tests := []struct {
		name string
		in   Int64Array
		want string
	}{
		{name: "empty non-nil slice", in: Int64Array{}, want: "{}"},
		{name: "single value", in: Int64Array{7}, want: "{7}"},
		{name: "multiple values including negative", in: Int64Array{1, -2, 3}, want: "{1,-2,3}"},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			v, err := tt.in.Value()
			require.NoError(t, err)
			assert.Equal(t, tt.want, v)
		})
	}
}

func TestInt64Array_RoundTrip(t *testing.T) {
	original := Int64Array{-5, 0, 12345}

	encoded, err := original.Value()
	require.NoError(t, err)

	var decoded Int64Array
	require.NoError(t, decoded.Scan(encoded.(string)))
	assert.Equal(t, original, decoded)
}
